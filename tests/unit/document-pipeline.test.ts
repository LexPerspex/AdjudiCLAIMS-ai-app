import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Document pipeline service tests.
 *
 * Tests the individual services (classifier, timeline, field extraction, chunking)
 * and the pipeline orchestrator with mocked Prisma and external dependencies.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_DOCUMENT_OCR_COMPLETE = {
  id: 'doc-1',
  claimId: 'claim-1',
  fileName: 'qme-report.pdf',
  fileUrl: './uploads/org-1/claim-1/doc-1/qme-report.pdf',
  fileSize: 50000,
  mimeType: 'application/pdf',
  documentType: null,
  documentSubtype: null,
  classificationConfidence: null,
  ocrStatus: 'COMPLETE' as const,
  extractedText:
    'QUALIFIED MEDICAL EVALUATOR REPORT\n\n' +
    'Patient: John Doe\n' +
    'Date of Injury: 01/15/2026\n' +
    'Date of Evaluation: 02/20/2026\n' +
    'Employer: Acme Corporation\n\n' +
    'DIAGNOSES:\n' +
    '1. Lumbar strain (M54.5)\n' +
    '2. Left knee meniscus tear (S83.209A)\n\n' +
    'WPI Rating: 12% for the lumbar spine, 5% for the left knee.\n' +
    'Combined WPI: 16%\n\n' +
    'WORK RESTRICTIONS:\n' +
    'No lifting over 25 pounds. No prolonged standing.\n' +
    'Patient paid $1,500.00 for the evaluation on 02/20/2026.\n' +
    'Claim #06349136 filed on 01/20/2026.\n' +
    'Surgery scheduled for March 15, 2026.',
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockDocumentFindUnique = vi.fn();
const mockDocumentUpdate = vi.fn();
const mockExtractedFieldDeleteMany = vi.fn();
const mockExtractedFieldCreateMany = vi.fn();
const mockTimelineEventCreateMany = vi.fn();
const mockDocumentChunkDeleteMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args) as unknown,
      update: (...args: unknown[]) => mockDocumentUpdate(...args) as unknown,
    },
    extractedField: {
      deleteMany: (...args: unknown[]) => mockExtractedFieldDeleteMany(...args) as unknown,
      createMany: (...args: unknown[]) => mockExtractedFieldCreateMany(...args) as unknown,
    },
    timelineEvent: {
      createMany: (...args: unknown[]) => mockTimelineEventCreateMany(...args) as unknown,
    },
    documentChunk: {
      deleteMany: (...args: unknown[]) => mockDocumentChunkDeleteMany(...args) as unknown,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        documentChunk: {
          deleteMany: (...args: unknown[]) => mockDocumentChunkDeleteMany(...args) as unknown,
          create: vi.fn().mockResolvedValue({ id: 'chunk-1' }),
        },
      });
    }),
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'ep-1', userId: 'user-1', dismissedTerms: [], trainingModulesCompleted: null, isTrainingComplete: true, learningModeExpiry: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/test'),
    download: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Vector Search (Vertex AI Vector Search — replaces pgvector)
vi.mock('../../server/services/vector-search.service.js', () => ({
  upsertEmbeddings: vi.fn().mockResolvedValue(undefined),
  removeEmbeddings: vi.fn().mockResolvedValue(undefined),
  queryEmbeddings: vi.fn().mockResolvedValue([]),
}));

// Mock Document AI
vi.mock('@google-cloud/documentai', () => ({
  DocumentProcessorServiceClient: vi.fn().mockImplementation(() => ({
    processDocument: vi.fn().mockResolvedValue([{
      document: { text: 'Extracted OCR text from Document AI' },
    }]),
  })),
}));

// ---------------------------------------------------------------------------
// Tests: Document Classifier
// ---------------------------------------------------------------------------

describe('Document Classifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure no API key so LLM fallback is skipped — tests are keyword-only
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('classifies a QME report by keyword', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-1',
      fileName: 'qme-report.pdf',
      extractedText: 'This is a QME evaluation report for the injured worker.',
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-1');

    expect(result.documentType).toBe('AME_QME_REPORT');
    expect(result.confidence).toBe(0.55);
    expect(result.classificationMethod).toBe('keyword');
  });

  it('classifies a DWC-1 form by keyword with high confidence (3+ keywords)', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-2',
      fileName: 'dwc1.pdf',
      extractedText: "This is a DWC-1 Workers' Compensation Claim Form for the claim form filing.",
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-2');

    expect(result.documentType).toBe('DWC1_CLAIM_FORM');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies with medium confidence when 2 keywords match', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-2b',
      fileName: 'claim.pdf',
      extractedText: "This is a DWC-1 claim form document.",
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-2b');

    expect(result.documentType).toBe('DWC1_CLAIM_FORM');
    expect(result.confidence).toBe(0.7);
  });

  it('falls back to OTHER with low confidence when no keywords match', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-3',
      fileName: 'unknown.pdf',
      extractedText: 'Random text with no recognizable keywords for classification.',
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-3');

    expect(result.documentType).toBe('OTHER');
    expect(result.confidence).toBe(0.3);
  });

  it('throws when document has no extracted text', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-4',
      fileName: 'empty.pdf',
      extractedText: null,
    });

    await expect(classifyDocument('doc-4')).rejects.toThrow('no extracted text');
  });

  it('throws when document not found', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce(null);

    await expect(classifyDocument('nonexistent')).rejects.toThrow('Document not found');
  });

  it('detects attorney-only content from text patterns', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-5',
      fileName: 'privileged.pdf',
      extractedText: 'This document contains attorney-client privilege material and legal analysis of liability.',
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-5');

    expect(result.accessLevel).toBe('ATTORNEY_ONLY');
    expect(result.containsLegalAnalysis).toBe(true);
    expect(result.containsPrivileged).toBe(true);
  });

  it('sets EXAMINER_ONLY access for standard medical reports', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-6',
      fileName: 'medical.pdf',
      extractedText: 'Medical report: diagnosis of lumbar strain, treatment plan includes physical therapy.',
    });
    mockDocumentUpdate.mockResolvedValueOnce({});

    const result = await classifyDocument('doc-6');

    expect(result.documentType).toBe('MEDICAL_REPORT');
    expect(result.accessLevel).toBe('EXAMINER_ONLY');
    expect(result.containsLegalAnalysis).toBe(false);
  });

  it('classifies all 24 non-OTHER document types by keyword', async () => {
    const { classifyDocument } = await import('../../server/services/document-classifier.service.js');

    const testCases: Array<{ text: string; expectedType: string }> = [
      { text: 'DWC-1 claim form filing', expectedType: 'DWC1_CLAIM_FORM' },
      { text: 'QME qualified medical evaluator report', expectedType: 'AME_QME_REPORT' },
      { text: 'utilization review MTUS treatment guideline', expectedType: 'UTILIZATION_REVIEW' },
      { text: 'application for adjudication declaration of readiness WCAB order', expectedType: 'WCAB_FILING' },
      { text: 'lien claim lien claimant medical provider lien', expectedType: 'LIEN_CLAIM' },
      { text: 'subpoena duces tecum deposition notice records subpoena', expectedType: 'DISCOVERY_REQUEST' },
      { text: 'deposition transcript sworn testimony', expectedType: 'DEPOSITION_TRANSCRIPT' },
      { text: 'offer of modified work SJDB voucher supplemental job displacement', expectedType: 'RETURN_TO_WORK' },
      { text: 'trial brief case analysis memo settlement valuation', expectedType: 'WORK_PRODUCT' },
      { text: 'medical chronology medical timeline vocational expert report', expectedType: 'MEDICAL_CHRONOLOGY' },
      { text: 'radiology report diagnostic imaging MRI report', expectedType: 'IMAGING_REPORT' },
      { text: 'compromise and release settlement agreement C&R', expectedType: 'SETTLEMENT_DOCUMENT' },
      { text: 'DEU rating request MPN authorization first fill pharmacy', expectedType: 'DWC_OFFICIAL_FORM' },
      { text: 'PD payment record TD payment log expense reimbursement', expectedType: 'PAYMENT_RECORD' },
      { text: 'diagnosis treatment plan medical report', expectedType: 'MEDICAL_REPORT' },
      { text: 'pharmacy record prescription history medication list', expectedType: 'PHARMACY_RECORD' },
      { text: 'wage statement earnings record payroll record', expectedType: 'WAGE_STATEMENT' },
      { text: 'billing statement itemized charges invoice total', expectedType: 'BILLING_STATEMENT' },
      { text: 'notice of representation defense counsel law firm', expectedType: 'LEGAL_CORRESPONDENCE' },
      { text: 'employer report incident report supervisor report', expectedType: 'EMPLOYER_REPORT' },
      { text: 'investigation report surveillance report sub rosa', expectedType: 'INVESTIGATION_REPORT' },
      { text: 'benefit notice notice of benefits claim acceptance', expectedType: 'BENEFIT_NOTICE' },
      { text: 'claim notes reserve worksheet three-point contact', expectedType: 'CLAIM_ADMINISTRATION' },
      { text: 'Dear Sir, Re: status update, Sincerely', expectedType: 'CORRESPONDENCE' },
    ];

    for (const { text, expectedType } of testCases) {
      vi.clearAllMocks();
      mockDocumentFindUnique.mockResolvedValueOnce({
        id: 'doc-type-test',
        fileName: 'test.pdf',
        extractedText: text,
      });
      mockDocumentUpdate.mockResolvedValueOnce({});

      const result = await classifyDocument('doc-type-test');
      expect(result.documentType).toBe(expectedType);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Field Extraction (regex pass only — no API key in test)
// ---------------------------------------------------------------------------

describe('Field Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure no API key is set so we only test regex extraction
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('extracts dates from document text', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      extractedText: 'Date of Injury: 01/15/2026. Evaluation on 02/20/2026.',
      documentType: 'MEDICAL_REPORT',
    });
    mockExtractedFieldDeleteMany.mockResolvedValueOnce({});
    mockExtractedFieldCreateMany.mockResolvedValueOnce({ count: 2 });

    const fields = await extractFields('doc-1');

    const dateFields = fields.filter((f) => f.fieldName === 'date');
    expect(dateFields.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts dollar amounts', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      extractedText: 'Patient paid $1,500.00 for the evaluation.',
      documentType: 'BILLING_STATEMENT',
    });
    mockExtractedFieldDeleteMany.mockResolvedValueOnce({});
    mockExtractedFieldCreateMany.mockResolvedValueOnce({ count: 1 });

    const fields = await extractFields('doc-1');

    const dollarFields = fields.filter((f) => f.fieldName === 'dollarAmount');
    expect(dollarFields.length).toBeGreaterThanOrEqual(1);
    expect(dollarFields[0]?.fieldValue).toContain('1,500.00');
  });

  it('extracts claim numbers', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      extractedText: 'Claim #06349136 filed on 01/20/2026.',
      documentType: null,
    });
    mockExtractedFieldDeleteMany.mockResolvedValueOnce({});
    mockExtractedFieldCreateMany.mockResolvedValueOnce({ count: 1 });

    const fields = await extractFields('doc-1');

    const claimFields = fields.filter((f) => f.fieldName === 'claimNumber');
    expect(claimFields.length).toBeGreaterThanOrEqual(1);
    expect(claimFields[0]?.fieldValue).toBe('06349136');
  });

  it('masks SSN in extraction output', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      extractedText: 'SSN: 123-45-6789',
      documentType: null,
    });
    mockExtractedFieldDeleteMany.mockResolvedValueOnce({});
    mockExtractedFieldCreateMany.mockResolvedValueOnce({ count: 1 });

    const fields = await extractFields('doc-1');

    const ssnFields = fields.filter((f) => f.fieldName === 'ssnMasked');
    expect(ssnFields.length).toBe(1);
    expect(ssnFields[0]?.fieldValue).toBe('XXX-XX-6789');
  });

  it('throws when document has no extracted text', async () => {
    const { extractFields } = await import('../../server/services/field-extraction.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      extractedText: null,
      documentType: null,
    });

    await expect(extractFields('doc-1')).rejects.toThrow('no extracted text');
  });
});

// ---------------------------------------------------------------------------
// Tests: Timeline Generation
// ---------------------------------------------------------------------------

describe('Timeline Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts date-based events from document text', async () => {
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT_OCR_COMPLETE);
    mockTimelineEventCreateMany.mockResolvedValueOnce({ count: 4 });

    const count = await generateTimelineEvents('doc-1');

    expect(count).toBe(4);
    expect(mockTimelineEventCreateMany).toHaveBeenCalledOnce();

    // Verify the records passed to createMany
    const callArg = mockTimelineEventCreateMany.mock.calls[0]?.[0] as { data: Array<{ eventType: string }> };
    expect(callArg.data.length).toBeGreaterThan(0);

    // Should have at least one DATE_OF_INJURY event from "Date of Injury: 01/15/2026"
    const doiEvents = callArg.data.filter((d) => d.eventType === 'DATE_OF_INJURY');
    expect(doiEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 when document has no dates', async () => {
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({
      id: 'doc-2',
      claimId: 'claim-1',
      fileName: 'no-dates.pdf',
      extractedText: 'This document contains no date references at all.',
    });

    const count = await generateTimelineEvents('doc-2');
    expect(count).toBe(0);
  });

  it('throws when document not found', async () => {
    const { generateTimelineEvents } = await import('../../server/services/timeline.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce(null);

    await expect(generateTimelineEvents('nonexistent')).rejects.toThrow('Document not found');
  });
});

// ---------------------------------------------------------------------------
// Tests: Document Chunking
// ---------------------------------------------------------------------------

describe('Document Chunking', () => {
  it('splits text into chunks with correct boundaries', async () => {
    const { chunkText } = await import('../../server/services/embedding.service.js');

    const longText = Array.from({ length: 50 }, (_, i) =>
      `Paragraph ${String(i + 1)}: This is a test paragraph with enough text to test the chunking logic. It contains multiple sentences.`,
    ).join('\n\n');

    const chunks = chunkText(longText);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be non-empty
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for empty text', async () => {
    const { chunkText } = await import('../../server/services/embedding.service.js');

    const chunks = chunkText('');
    expect(chunks).toEqual([]);
  });

  it('returns single chunk for short text', async () => {
    const { chunkText } = await import('../../server/services/embedding.service.js');

    const chunks = chunkText('This is a short document.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('This is a short document.');
  });
});

// ---------------------------------------------------------------------------
// Tests: Pipeline Orchestrator
// ---------------------------------------------------------------------------

describe('Document Pipeline Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all pipeline steps and returns summary', async () => {
    // Mock OCR service
    vi.doMock('../../server/services/ocr.service.js', () => ({
      processDocument: vi.fn().mockResolvedValue('Extracted text from OCR'),
    }));

    // Mock classifier
    vi.doMock('../../server/services/document-classifier.service.js', () => ({
      classifyDocument: vi.fn().mockResolvedValue({
        documentType: 'MEDICAL_REPORT',
        documentSubtype: null,
        confidence: 0.7,
      }),
    }));

    // Mock field extraction
    vi.doMock('../../server/services/field-extraction.service.js', () => ({
      extractFields: vi.fn().mockResolvedValue([
        { fieldName: 'diagnosis', fieldValue: 'lumbar strain', confidence: 0.85, sourcePage: 1 },
      ]),
    }));

    // Mock embedding
    vi.doMock('../../server/services/embedding.service.js', () => ({
      chunkAndEmbed: vi.fn().mockResolvedValue(5),
    }));

    // Mock timeline
    vi.doMock('../../server/services/timeline.service.js', () => ({
      generateTimelineEvents: vi.fn().mockResolvedValue(3),
    }));

    // Re-import pipeline after mocking its dependencies
    const { processDocumentPipeline } = await import('../../server/services/document-pipeline.service.js');

    mockDocumentFindUnique.mockResolvedValueOnce({ claimId: 'claim-1' });

    const result = await processDocumentPipeline('doc-1');

    expect(result.documentId).toBe('doc-1');
    expect(result.ocrSuccess).toBe(true);
    expect(result.classificationSuccess).toBe(true);
    expect(result.extractionSuccess).toBe(true);
    expect(result.embeddingSuccess).toBe(true);
    expect(result.timelineSuccess).toBe(true);
    expect(result.fieldsExtracted).toBe(1);
    expect(result.chunksCreated).toBe(5);
    expect(result.timelineEventsCreated).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it('returns early when OCR fails (subsequent steps depend on text)', async () => {
    vi.resetModules();

    // Re-apply db mock after reset
    vi.doMock('../../server/db.js', () => ({
      prisma: {
        document: {
          findUnique: vi.fn().mockResolvedValue({ claimId: 'claim-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      },
    }));

    vi.doMock('../../server/services/ocr.service.js', () => ({
      processDocument: vi.fn().mockRejectedValue(new Error('Document AI unavailable')),
    }));
    vi.doMock('../../server/services/document-classifier.service.js', () => ({
      classifyDocument: vi.fn(),
    }));
    vi.doMock('../../server/services/field-extraction.service.js', () => ({
      extractFields: vi.fn(),
    }));
    vi.doMock('../../server/services/embedding.service.js', () => ({
      chunkAndEmbed: vi.fn(),
    }));
    vi.doMock('../../server/services/timeline.service.js', () => ({
      generateTimelineEvents: vi.fn(),
    }));

    const { processDocumentPipeline } = await import('../../server/services/document-pipeline.service.js');

    const result = await processDocumentPipeline('doc-1');

    expect(result.ocrSuccess).toBe(false);
    expect(result.classificationSuccess).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('OCR failed');
  });
});
