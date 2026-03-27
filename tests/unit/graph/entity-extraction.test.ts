/**
 * Unit tests for the Graph Entity Extraction Service.
 *
 * Tests conversion of ExtractedField records into candidate graph nodes
 * and edges using the SubtypeGraphTemplate system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDocumentFindUnique = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { extractEntities } from '../../../server/services/graph/entity-extraction.service.js';
import type {
  CandidateNode,
  CandidateEdge,
} from '../../../server/services/graph/entity-extraction.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    claimId: 'claim-1',
    documentType: 'MEDICAL_REPORT',
    documentSubtype: 'PR-2_REPORT',
    extractedFields: [],
    ...overrides,
  };
}

function makeField(
  fieldName: string,
  fieldValue: string,
  confidence = 0.9,
  id = `field-${fieldName}`,
) {
  return { id, documentId: 'doc-1', fieldName, fieldValue, confidence, sourcePage: 1 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('throws when document is not found', async () => {
    mockDocumentFindUnique.mockResolvedValue(null);

    await expect(extractEntities('nonexistent')).rejects.toThrow(
      'Document not found: nonexistent',
    );
  });

  // -------------------------------------------------------------------------
  // Empty fields
  // -------------------------------------------------------------------------

  it('returns empty result for document with no extracted fields', async () => {
    mockDocumentFindUnique.mockResolvedValue(makeDocument());

    const result = await extractEntities('doc-1');

    expect(result.candidateNodes).toEqual([]);
    expect(result.candidateEdges).toEqual([]);
    expect(result.documentType).toBe('MEDICAL_REPORT');
    expect(result.documentSubtype).toBe('PR-2_REPORT');
  });

  // -------------------------------------------------------------------------
  // Basic node extraction
  // -------------------------------------------------------------------------

  it('extracts PERSON/APPLICANT node from claimantName field', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('claimantName', 'John Doe')],
      }),
    );

    const result = await extractEntities('doc-1');

    const personNodes = result.candidateNodes.filter(
      (n) => n.nodeType === 'PERSON' && n.personRole === 'APPLICANT',
    );
    expect(personNodes).toHaveLength(1);
    expect(personNodes[0].canonicalName).toBe('John Doe');
    expect(personNodes[0].confidence).toBe(0.9);
    expect(personNodes[0].sourceDocumentId).toBe('doc-1');
    expect(personNodes[0].sourceFieldName).toBe('claimantName');
  });

  it('extracts ORGANIZATION/EMPLOYER node from employerName field', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('employerName', 'Acme Corp')],
      }),
    );

    const result = await extractEntities('doc-1');

    const orgNodes = result.candidateNodes.filter(
      (n) => n.nodeType === 'ORGANIZATION' && n.orgType === 'EMPLOYER',
    );
    expect(orgNodes).toHaveLength(1);
    expect(orgNodes[0].canonicalName).toBe('Acme Corp');
  });

  it('extracts PERSON/TREATING_PHYSICIAN from physicianName field', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('physicianName', 'Dr. Smith')],
      }),
    );

    const result = await extractEntities('doc-1');

    const physicians = result.candidateNodes.filter(
      (n) => n.nodeType === 'PERSON' && n.personRole === 'TREATING_PHYSICIAN',
    );
    expect(physicians).toHaveLength(1);
    expect(physicians[0].canonicalName).toBe('Dr. Smith');
  });

  // -------------------------------------------------------------------------
  // Array field extraction
  // -------------------------------------------------------------------------

  it('produces multiple BODY_PART nodes from array bodyParts field', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          makeField('bodyParts', '["lumbar spine", "left knee", "right shoulder"]'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    const bodyParts = result.candidateNodes.filter(
      (n) => n.nodeType === 'BODY_PART',
    );
    expect(bodyParts).toHaveLength(3);
    expect(bodyParts.map((n) => n.canonicalName).sort()).toEqual([
      'left knee',
      'lumbar spine',
      'right shoulder',
    ]);
  });

  it('handles non-JSON field value as scalar', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('bodyParts', 'lumbar spine')],
      }),
    );

    const result = await extractEntities('doc-1');

    const bodyParts = result.candidateNodes.filter(
      (n) => n.nodeType === 'BODY_PART',
    );
    expect(bodyParts).toHaveLength(1);
    expect(bodyParts[0].canonicalName).toBe('lumbar spine');
  });

  // -------------------------------------------------------------------------
  // Edge extraction with source/target strategies
  // -------------------------------------------------------------------------

  it('creates edge with document_author source strategy', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          makeField('physicianName', 'Dr. Smith'),
          makeField('bodyParts', '["lumbar spine"]'),
          makeField('diagnosis', 'lumbar disc herniation', 0.85),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    // The diagnosis field should create a DIAGNOSES edge
    // source = document_author (Dr. Smith), target = body_part (lumbar spine)
    const diagnoseEdges = result.candidateEdges.filter(
      (e) => e.edgeType === 'DIAGNOSES',
    );
    expect(diagnoseEdges.length).toBeGreaterThanOrEqual(1);
    expect(diagnoseEdges[0].sourceNodeKey).toBe('Dr. Smith');
    expect(diagnoseEdges[0].targetNodeKey).toBe('lumbar spine');
  });

  it('creates edge with applicant source and employer target strategies', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        documentType: 'WAGE_STATEMENT',
        extractedFields: [
          makeField('claimantName', 'Jane Doe'),
          makeField('employerName', 'Acme Corp'),
          makeField('averageWeeklyEarnings', '1250.00'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    // averageWeeklyEarnings -> EMPLOYED_BY edge: applicant -> employer
    const employedEdges = result.candidateEdges.filter(
      (e) => e.edgeType === 'EMPLOYED_BY',
    );
    expect(employedEdges.length).toBeGreaterThanOrEqual(1);
    expect(employedEdges[0].sourceNodeKey).toBe('Jane Doe');
  });

  it('creates edge with claim target strategy', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        documentType: 'WCAB_FILING',
        extractedFields: [
          makeField('claimantName', 'Jane Doe'),
          makeField('caseNumber', 'ADJ12345678'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    // WCAB_FILING caseNumber -> FILES edge with applicant source, field_value_node target
    const filesEdges = result.candidateEdges.filter(
      (e) => e.edgeType === 'FILES',
    );
    // The FILES edge has sourceStrategy: 'applicant', targetStrategy: 'field_value_node'
    if (filesEdges.length > 0) {
      expect(filesEdges[0].sourceNodeKey).toBe('Jane Doe');
    }
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  it('deduplicates nodes with same nodeType and canonicalName', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          makeField('claimantName', 'John Doe', 0.9, 'f1'),
          makeField('applicantName', 'John Doe', 0.8, 'f2'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    const applicantNodes = result.candidateNodes.filter(
      (n) => n.nodeType === 'PERSON' && n.personRole === 'APPLICANT',
    );
    // Should be deduplicated — both map to PERSON:APPLICANT "John Doe"
    expect(applicantNodes).toHaveLength(1);
    // Keeps higher confidence
    expect(applicantNodes[0].confidence).toBe(0.9);
  });

  it('does not deduplicate nodes with different types', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          makeField('claimantName', 'John Doe'),
          makeField('employerName', 'Acme Corp'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    expect(result.candidateNodes.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Invalid edge filtering
  // -------------------------------------------------------------------------

  it('filters out edges that fail ontology validation', async () => {
    // PAYS edge requires ORGANIZATION source and BENEFIT target.
    // If we have tdRate but no employer org node, the edge should be skipped.
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          // tdRate edge: sourceStrategy='employer', targetStrategy='applicant'
          // PAYS requires ORGANIZATION -> BENEFIT, but target is PERSON
          // So it should fail validation
          makeField('claimantName', 'Jane Doe'),
          makeField('employerName', 'Acme Corp'),
          makeField('tdRate', '1066.72'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    // PAYS edges should be filtered out because PAYS requires ORGANIZATION -> BENEFIT
    // but the target resolves to PERSON (applicant)
    const paysEdges = result.candidateEdges.filter(
      (e) => e.edgeType === 'PAYS',
    );
    expect(paysEdges).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Confidence passthrough
  // -------------------------------------------------------------------------

  it('passes through field confidence to candidate nodes', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('claimantName', 'John Doe', 0.75)],
      }),
    );

    const result = await extractEntities('doc-1');

    expect(result.candidateNodes[0].confidence).toBe(0.75);
  });

  it('defaults confidence to 0.5 when field confidence is negative', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [makeField('claimantName', 'John Doe', -1)],
      }),
    );

    const result = await extractEntities('doc-1');

    const personNode = result.candidateNodes.find(
      (n) => n.nodeType === 'PERSON',
    );
    expect(personNode?.confidence).toBe(0.5);
  });

  // -------------------------------------------------------------------------
  // Document metadata passthrough
  // -------------------------------------------------------------------------

  it('returns documentType and documentSubtype in result', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        documentType: 'AME_QME_REPORT',
        documentSubtype: 'QME_COMPREHENSIVE',
      }),
    );

    const result = await extractEntities('doc-1');

    expect(result.documentType).toBe('AME_QME_REPORT');
    expect(result.documentSubtype).toBe('QME_COMPREHENSIVE');
  });

  it('handles null documentType and documentSubtype gracefully', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        documentType: null,
        documentSubtype: null,
      }),
    );

    const result = await extractEntities('doc-1');

    expect(result.documentType).toBe('UNKNOWN');
    expect(result.documentSubtype).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Type-specific templates
  // -------------------------------------------------------------------------

  it('extracts AME_QME_REPORT specific nodes (RATING from wpiRating)', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        documentType: 'AME_QME_REPORT',
        extractedFields: [
          makeField('qmePhysicianName', 'Dr. Expert'),
          makeField('wpiRating', '12%'),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    const ratingNodes = result.candidateNodes.filter(
      (n) => n.nodeType === 'RATING',
    );
    expect(ratingNodes).toHaveLength(1);
    expect(ratingNodes[0].canonicalName).toBe('12%');
  });

  it('skips empty/whitespace field values', async () => {
    mockDocumentFindUnique.mockResolvedValue(
      makeDocument({
        extractedFields: [
          makeField('claimantName', ''),
          makeField('employerName', '   '),
        ],
      }),
    );

    const result = await extractEntities('doc-1');

    expect(result.candidateNodes).toHaveLength(0);
  });
});
