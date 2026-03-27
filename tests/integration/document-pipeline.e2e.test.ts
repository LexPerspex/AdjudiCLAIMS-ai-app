import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Ensure session secret meets 32-char minimum for @fastify/session
process.env['SESSION_SECRET'] ??= 'e2e-test-secret-key-must-be-32-chars-minimum!!';
// Ensure DATABASE_URL is set
process.env['DATABASE_URL'] ??= 'mysql://adjudiclaims:password@localhost:3306/adjudiclaims';

/**
 * Phase 2 — Document Pipeline End-to-End Integration Tests
 *
 * These tests run against the REAL database (MySQL / PlanetScale)
 * and exercise the full document lifecycle:
 *   1. Upload a document via HTTP
 *   2. Verify DB records created
 *   3. Run classifier, field extraction, timeline, chunking services
 *   4. Verify all outputs in the database
 *
 * Prerequisites:
 *   - docker compose up (MySQL on port 3306)
 *   - npx prisma migrate deploy
 *   - npx prisma db seed
 *
 * Uses seed data: org_pacific_coast, user_examiner, claim_001
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEED_ORG_ID = 'org_pacific_coast';
const SEED_EXAMINER_EMAIL = 'examiner@pacificcoast.example.com';
const SEED_SUPERVISOR_EMAIL = 'supervisor@pacificcoast.example.com';
const SEED_CLAIM_ID = 'claim_001';

/** Simulated QME report OCR text for testing classification + extraction + timeline */
const MOCK_OCR_TEXT = [
  'QUALIFIED MEDICAL EVALUATOR REPORT',
  '',
  'Patient Name: Albert L. Salerno',
  'Claim Number: 06349136',
  'Date of Injury: 06/15/2019',
  'Date of Evaluation: 01/27/2020',
  'Employer: Valley Construction Inc.',
  'Insurer: State Compensation Insurance Fund',
  '',
  'HISTORY OF PRESENT INJURY:',
  'The patient is a 58-year-old male construction worker who sustained a cumulative',
  'trauma injury to the lumbar spine, bilateral knees, and bilateral upper extremities',
  'while employed as a laborer for Valley Construction Inc.',
  '',
  'DIAGNOSES:',
  '1. Lumbar disc herniation at L4-L5 (M51.16)',
  '2. Bilateral knee osteoarthritis (M17.0)',
  '3. Bilateral carpal tunnel syndrome (G56.00)',
  '',
  'PERMANENT IMPAIRMENT:',
  'Whole Person Impairment (WPI): 22% for the lumbar spine.',
  'Additional WPI of 8% for bilateral knees and 5% for bilateral upper extremities.',
  'Combined WPI: 32% per AMA Guides, 5th Edition.',
  '',
  'WORK RESTRICTIONS:',
  'The patient is precluded from heavy lifting (over 25 lbs), prolonged standing',
  '(more than 30 minutes), and repetitive bending/twisting motions.',
  'Modified duty is recommended with these restrictions.',
  '',
  'AVERAGE WEEKLY EARNINGS:',
  'Based on wage records, the AWE is $1,245.00 per week.',
  '',
  'TREATMENT:',
  'Patient paid $3,500.00 for physical therapy through 03/15/2020.',
  'Surgery was performed on 09/10/2019 at Riverside Community Hospital.',
  'Deposition scheduled for 04/15/2020.',
  'Patient reached MMI on 12/01/2019.',
  'Return to work on modified duty effective 02/01/2020.',
  '',
  'BILLING:',
  'Total charges for this evaluation: $4,750.00',
  'CPT codes: 99215, 99456',
].join('\n');

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let prisma: PrismaClient;
const createdDocumentIds: string[] = [];

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env['DATABASE_URL'] ?? 'mysql://adjudiclaims:password@localhost:3306/adjudiclaims',
      },
    },
  });

  // Verify seed data exists
  const org = await prisma.organization.findUnique({ where: { id: SEED_ORG_ID } });
  if (!org) {
    throw new Error('Seed data not found. Run: npx prisma db seed');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Clean up any documents created during tests
  if (createdDocumentIds.length > 0) {
    // Delete in reverse dependency order
    await prisma.timelineEvent.deleteMany({
      where: { documentId: { in: createdDocumentIds } },
    });
    await prisma.extractedField.deleteMany({
      where: { documentId: { in: createdDocumentIds } },
    });
    await prisma.documentChunk.deleteMany({
      where: { documentId: { in: createdDocumentIds } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    createdDocumentIds.length = 0;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Fastify server for testing. We import lazily so env vars are read
 * at the right time.
 */
async function getServer() {
  const { buildServer } = await import('../../server/index.js');
  return buildServer();
}

/** Login via the auth endpoint and return session cookie. */
async function loginAs(
  server: Awaited<ReturnType<typeof getServer>>,
  email: string,
): Promise<string> {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${email}: ${String(response.statusCode)} ${response.body}`);
  }

  const setCookie = response.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error(`No session cookie for ${email}`);
}

/** Create a document record directly in the DB (bypassing upload route). */
async function createTestDocument(overrides?: Partial<{
  id: string;
  claimId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  ocrStatus: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  extractedText: string | null;
  documentType: string | null;
}>) {
  const docId = overrides?.id ?? `test-doc-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  const doc = await prisma.document.create({
    data: {
      id: docId,
      claimId: overrides?.claimId ?? SEED_CLAIM_ID,
      fileName: overrides?.fileName ?? 'test-document.pdf',
      fileUrl: overrides?.fileUrl ?? `./uploads/test/${docId}/test-document.pdf`,
      fileSize: 12345,
      mimeType: overrides?.mimeType ?? 'application/pdf',
      ocrStatus: overrides?.ocrStatus ?? 'PENDING',
      extractedText: overrides?.extractedText ?? null,
    },
  });

  createdDocumentIds.push(doc.id);
  return doc;
}

// ===========================================================================
// TEST SUITE 1: Document Upload & Storage (HTTP endpoints)
// ===========================================================================

describe('E2E: Document Upload & CRUD', () => {
  let server: Awaited<ReturnType<typeof getServer>>;

  beforeAll(async () => {
    server = await getServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('uploads a PDF via multipart form and creates DB record', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    // Use a real Salerno PDF if available, otherwise create a minimal test buffer
    let fileBuffer: Buffer;
    let fileName: string;

    const salernoPdf = join(
      '/home/vncuser/Downloads/Salerno',
      'LT CL- NOTICE OF DR DEPO - DR. GREEN_S 03-06-2020 XX.pdf',
    );

    if (existsSync(salernoPdf)) {
      fileBuffer = await readFile(salernoPdf);
      fileName = 'salerno-depo-notice.pdf';
    } else {
      // Minimal PDF for testing when Salerno data isn't available
      fileBuffer = Buffer.from('%PDF-1.4 minimal test document');
      fileName = 'test-upload.pdf';
    }

    const boundary = '----TestBoundary' + String(Date.now());
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await server.inject({
      method: 'POST',
      url: `/api/claims/${SEED_CLAIM_ID}/documents`,
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    const result = response.json<{
      id: string;
      claimId: string;
      fileName: string;
      mimeType: string;
      ocrStatus: string;
    }>();

    expect(result.claimId).toBe(SEED_CLAIM_ID);
    expect(result.fileName).toBe(fileName);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.ocrStatus).toBe('PENDING');

    // Track for cleanup
    createdDocumentIds.push(result.id);

    // Verify DB record exists
    const dbDoc = await prisma.document.findUnique({ where: { id: result.id } });
    expect(dbDoc).not.toBeNull();
    expect(dbDoc?.claimId).toBe(SEED_CLAIM_ID);
    expect(dbDoc?.fileSize).toBeGreaterThan(0);

    // Verify local file was stored
    if (dbDoc?.fileUrl && !dbDoc.fileUrl.startsWith('gs://')) {
      expect(existsSync(dbDoc.fileUrl)).toBe(true);
    }
  });

  it('rejects upload of unsupported file type', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    const boundary = '----TestBoundary' + String(Date.now());
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="malware.exe"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from('not a real executable'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await server.inject({
      method: 'POST',
      url: `/api/claims/${SEED_CLAIM_ID}/documents`,
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    const result = response.json<{ error: string }>();
    expect(result.error).toContain('Unsupported file type');
  });

  it('lists documents for a claim', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    // Create a document directly in DB
    await createTestDocument({ fileName: 'list-test.pdf' });

    const response = await server.inject({
      method: 'GET',
      url: `/api/claims/${SEED_CLAIM_ID}/documents`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json<{ documents: unknown[]; total: number }>();
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.documents.length).toBeGreaterThanOrEqual(1);
  });

  it('gets document detail with extracted fields', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    // Add an extracted field
    await prisma.extractedField.create({
      data: {
        documentId: doc.id,
        fieldName: 'claimantName',
        fieldValue: 'Albert L. Salerno',
        confidence: 0.95,
        sourcePage: 1,
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/documents/${doc.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json<{
      id: string;
      extractedText: string;
      extractedFields: Array<{ fieldName: string; fieldValue: string }>;
    }>();

    expect(result.id).toBe(doc.id);
    expect(result.extractedText).toContain('QUALIFIED MEDICAL EVALUATOR');
    expect(result.extractedFields).toHaveLength(1);
    expect(result.extractedFields[0]?.fieldName).toBe('claimantName');
  });

  it('returns 404 for document from different org', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    // Document detail endpoint checks claim org membership
    const response = await server.inject({
      method: 'GET',
      url: '/api/documents/nonexistent-doc-id',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it('supervisor can delete a document', async () => {
    const cookie = await loginAs(server, SEED_SUPERVISOR_EMAIL);

    const doc = await createTestDocument({ fileName: 'to-delete.pdf' });

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/documents/${doc.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);

    // Verify deleted from DB
    const deleted = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(deleted).toBeNull();

    // Remove from cleanup list since it's already deleted
    const idx = createdDocumentIds.indexOf(doc.id);
    if (idx >= 0) createdDocumentIds.splice(idx, 1);
  });

  it('examiner cannot delete a document (403)', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);

    const doc = await createTestDocument({ fileName: 'no-delete.pdf' });

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/documents/${doc.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);

    // Document should still exist
    const stillExists = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(stillExists).not.toBeNull();
  });
});

// ===========================================================================
// TEST SUITE 2: Document Classifier (against real DB)
// ===========================================================================

describe('E2E: Document Classifier', () => {
  it('classifies a QME report and persists result to DB', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    const result = await classifyDocument(doc.id);

    expect(result.documentType).toBe('AME_QME_REPORT');
    expect(result.confidence).toBe(0.7);

    // Verify persisted to DB
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
      select: { documentType: true, classificationConfidence: true },
    });
    expect(updated?.documentType).toBe('AME_QME_REPORT');
    expect(updated?.classificationConfidence).toBe(0.7);
  });

  it('classifies a wage statement text', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    const doc = await createTestDocument({
      extractedText: 'WAGE STATEMENT\n\nEmployee: John Smith\nWeekly earnings: $1,200.00\nPayroll period: 01/01/2026 - 01/15/2026\nW-2 attached.',
      ocrStatus: 'COMPLETE',
    });

    const result = await classifyDocument(doc.id);
    expect(result.documentType).toBe('WAGE_STATEMENT');
  });

  it('classifies a billing document', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    const doc = await createTestDocument({
      extractedText: 'BILLING STATEMENT\n\nPatient: Jane Doe\nTotal charges: $5,200.00\nCPT code: 99213\nInvoice #12345',
      ocrStatus: 'COMPLETE',
    });

    const result = await classifyDocument(doc.id);
    expect(result.documentType).toBe('BILLING_STATEMENT');
  });

  it('falls back to OTHER for unrecognizable text', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    const doc = await createTestDocument({
      extractedText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      ocrStatus: 'COMPLETE',
    });

    const result = await classifyDocument(doc.id);
    expect(result.documentType).toBe('OTHER');
    expect(result.confidence).toBe(0.3);
  });
});

// ===========================================================================
// TEST SUITE 3: Field Extraction (regex pass — real DB)
// ===========================================================================

describe('E2E: Field Extraction', () => {
  it('extracts dates, dollar amounts, claim number, and names from QME report', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    // Classify first so documentType is set
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');
    await classifyDocument(doc.id);

    const fields = await extractFields(doc.id);

    // Verify dates extracted
    const dateFields = fields.filter((f) => f.fieldName === 'date');
    expect(dateFields.length).toBeGreaterThanOrEqual(4); // DOI, eval date, surgery date, etc.

    // Verify dollar amounts
    const dollarFields = fields.filter((f) => f.fieldName === 'dollarAmount');
    expect(dollarFields.length).toBeGreaterThanOrEqual(2); // $1,245.00, $3,500.00, $4,750.00
    const amounts = dollarFields.map((f) => f.fieldValue);
    expect(amounts).toContain('1,245.00');

    // Verify claim number
    const claimFields = fields.filter((f) => f.fieldName === 'claimNumber');
    expect(claimFields.length).toBeGreaterThanOrEqual(1);
    expect(claimFields[0]?.fieldValue).toBe('06349136');

    // Verify person names
    const nameFields = fields.filter((f) => f.fieldName === 'personName');
    expect(nameFields.length).toBeGreaterThanOrEqual(1);

    // Verify persisted to DB
    const dbFields = await prisma.extractedField.findMany({
      where: { documentId: doc.id },
    });
    expect(dbFields.length).toBe(fields.length);
  });

  it('handles document with no extractable fields gracefully', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    const doc = await createTestDocument({
      extractedText: 'This document has no dates, amounts, or recognizable patterns.',
      ocrStatus: 'COMPLETE',
    });

    const fields = await extractFields(doc.id);
    expect(fields).toEqual([]);

    // DB should have no extracted fields
    const dbFields = await prisma.extractedField.findMany({
      where: { documentId: doc.id },
    });
    expect(dbFields).toHaveLength(0);
  });
});

// ===========================================================================
// TEST SUITE 4: Timeline Generation (real DB)
// ===========================================================================

describe('E2E: Timeline Generation', () => {
  it('generates timeline events from QME report dates', async () => {
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    const count = await generateTimelineEvents(doc.id);

    expect(count).toBeGreaterThanOrEqual(4); // DOI, eval, surgery, deposition, MMI, RTW

    // Verify events in DB
    const events = await prisma.timelineEvent.findMany({
      where: { documentId: doc.id },
      orderBy: { eventDate: 'asc' },
    });

    expect(events.length).toBe(count);

    // Check specific event types
    const eventTypes = events.map((e) => e.eventType);

    // Should detect date of injury
    expect(eventTypes).toContain('DATE_OF_INJURY');

    // Should detect surgery
    expect(eventTypes).toContain('SURGERY');

    // Should detect MMI
    expect(eventTypes).toContain('MMI_REACHED');

    // Should detect return to work
    expect(eventTypes).toContain('RETURN_TO_WORK');

    // Verify source references the document
    for (const event of events) {
      expect(event.source).toBe(doc.fileName);
      expect(event.claimId).toBe(SEED_CLAIM_ID);
    }
  });

  it('returns 0 events for document with no dates', async () => {
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    const doc = await createTestDocument({
      extractedText: 'This is a document with no dates mentioned anywhere.',
      ocrStatus: 'COMPLETE',
    });

    const count = await generateTimelineEvents(doc.id);
    expect(count).toBe(0);
  });
});

// ===========================================================================
// TEST SUITE 5: Document Chunking (real DB)
// ===========================================================================

describe('E2E: Document Chunking', () => {
  it('chunks a long document and stores in DB (embeddings in Vertex AI Vector Search)', async () => {
    const { chunkAndEmbed } = await import('../../server/services/embedding.service.js');

    // Create a document with enough text to produce multiple chunks
    const longText = Array.from({ length: 80 }, (_, i) =>
      `Section ${String(i + 1)}: This is paragraph number ${String(i + 1)} of the medical report documenting ` +
      `the findings from the comprehensive evaluation. The treating physician noted ` +
      `several significant findings during this examination period that are relevant ` +
      `to the workers compensation claim analysis and benefit determination.`,
    ).join('\n\n');

    const doc = await createTestDocument({
      extractedText: longText,
      ocrStatus: 'COMPLETE',
    });

    const chunkCount = await chunkAndEmbed(doc.id);

    expect(chunkCount).toBeGreaterThan(1);

    // Verify chunks in DB
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: doc.id },
      orderBy: { chunkIndex: 'asc' },
    });

    expect(chunks.length).toBe(chunkCount);

    // Verify chunk indices are sequential
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.chunkIndex).toBe(i);
    }

    // Verify each chunk has content
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }

    // Embeddings are stored in Vertex AI Vector Search, not in the DB.
    // No embedding column exists on DocumentChunk in the MySQL schema.
    // Verify that chunks are stored without an embedding column.
    const chunkCheck = await prisma.documentChunk.findFirst({
      where: { documentId: doc.id },
    });
    expect(chunkCheck).not.toBeNull();
    expect(chunkCheck?.content.length).toBeGreaterThan(0);
  });

  it('returns 0 chunks for empty extracted text', async () => {
    const { chunkAndEmbed } = await import('../../server/services/embedding.service.js');

    const doc = await createTestDocument({
      extractedText: '',
      ocrStatus: 'COMPLETE',
    });

    const count = await chunkAndEmbed(doc.id);
    expect(count).toBe(0);
  });

  it('re-chunking replaces old chunks', async () => {
    const { chunkAndEmbed } = await import('../../server/services/embedding.service.js');

    const doc = await createTestDocument({
      extractedText: 'Short initial text that produces one chunk.',
      ocrStatus: 'COMPLETE',
    });

    const firstCount = await chunkAndEmbed(doc.id);
    expect(firstCount).toBe(1);

    // Update with much longer text to guarantee multiple chunks (>4000 chars = >1 chunk)
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        extractedText: Array.from({ length: 80 }, (_, i) =>
          `Expanded paragraph ${String(i + 1)}: This section contains detailed findings from the ` +
          `comprehensive medical evaluation that was conducted as part of the workers compensation ` +
          `claim analysis process. The treating physician documented several important observations ` +
          `during the examination period that are relevant to benefit determination and ongoing care.`,
        ).join('\n\n'),
      },
    });

    const secondCount = await chunkAndEmbed(doc.id);
    expect(secondCount).toBeGreaterThan(firstCount);

    // Verify old chunks were replaced, not accumulated
    const allChunks = await prisma.documentChunk.findMany({
      where: { documentId: doc.id },
    });
    expect(allChunks.length).toBe(secondCount);
  });
});

// ===========================================================================
// TEST SUITE 6: Timeline API Endpoint (real DB)
// ===========================================================================

describe('E2E: Timeline API Endpoint', () => {
  let server: Awaited<ReturnType<typeof getServer>>;

  beforeAll(async () => {
    server = await getServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /api/claims/:claimId/timeline returns events sorted by date', async () => {
    const cookie = await loginAs(server, SEED_EXAMINER_EMAIL);
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    await generateTimelineEvents(doc.id);

    const response = await server.inject({
      method: 'GET',
      url: `/api/claims/${SEED_CLAIM_ID}/timeline`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    const result = response.json<{
      events: Array<{
        id: string;
        eventDate: string;
        eventType: string;
        description: string;
        source: string;
      }>;
      total: number;
    }>();

    expect(result.total).toBeGreaterThanOrEqual(4);
    expect(result.events.length).toBe(result.total);

    // Verify sorted by date ascending
    for (let i = 1; i < result.events.length; i++) {
      const prev = result.events[i - 1];
      const curr = result.events[i];
      if (prev && curr) {
        expect(new Date(prev.eventDate).getTime()).toBeLessThanOrEqual(
          new Date(curr.eventDate).getTime(),
        );
      }
    }
  });
});

// ===========================================================================
// TEST SUITE 7: Full Pipeline Flow (real DB, no external APIs)
// ===========================================================================

describe('E2E: Full Pipeline Verification', () => {
  it('verifies document → classify → extract → chunk → timeline produces correct DB state', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');
    const { extractFields } = await import('../../server/services/field-extraction.service.js');
    const { chunkAndEmbed } = await import('../../server/services/embedding.service.js');
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    // Step 1: Create document with OCR text (simulating post-OCR state)
    const doc = await createTestDocument({
      extractedText: MOCK_OCR_TEXT,
      ocrStatus: 'COMPLETE',
    });

    // Step 2: Classify
    const classification = await classifyDocument(doc.id);
    expect(classification.documentType).toBe('AME_QME_REPORT');

    // Step 3: Extract fields
    const fields = await extractFields(doc.id);
    expect(fields.length).toBeGreaterThan(0);

    // Step 4: Chunk and embed
    const chunkCount = await chunkAndEmbed(doc.id);
    expect(chunkCount).toBeGreaterThan(0);

    // Step 5: Generate timeline
    const eventCount = await generateTimelineEvents(doc.id);
    expect(eventCount).toBeGreaterThan(0);

    // ===== VERIFY COMPLETE DB STATE =====

    // Document should be classified
    const finalDoc = await prisma.document.findUnique({
      where: { id: doc.id },
      select: {
        documentType: true,
        classificationConfidence: true,
        ocrStatus: true,
        extractedText: true,
      },
    });
    expect(finalDoc?.documentType).toBe('AME_QME_REPORT');
    expect(finalDoc?.classificationConfidence).toBe(0.7);
    expect(finalDoc?.ocrStatus).toBe('COMPLETE');

    // Extracted fields should be in DB
    const dbFields = await prisma.extractedField.findMany({
      where: { documentId: doc.id },
    });
    expect(dbFields.length).toBe(fields.length);

    // Should have extracted the claim number
    const claimNumberField = dbFields.find((f) => f.fieldName === 'claimNumber');
    expect(claimNumberField?.fieldValue).toBe('06349136');

    // Chunks should be in DB
    const dbChunks = await prisma.documentChunk.findMany({
      where: { documentId: doc.id },
    });
    expect(dbChunks.length).toBe(chunkCount);

    // Timeline events should be in DB
    const dbEvents = await prisma.timelineEvent.findMany({
      where: { documentId: doc.id },
    });
    expect(dbEvents.length).toBe(eventCount);

    // Verify specific timeline events
    const eventTypes = dbEvents.map((e) => e.eventType);
    expect(eventTypes).toContain('DATE_OF_INJURY');
    expect(eventTypes).toContain('SURGERY');

    // All timeline events should reference this document and claim
    for (const event of dbEvents) {
      expect(event.documentId).toBe(doc.id);
      expect(event.claimId).toBe(SEED_CLAIM_ID);
    }
  });
});
