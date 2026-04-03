/**
 * Tests for embedding.service.ts — chunkAndEmbed and similaritySearch.
 *
 * Covers the full pipeline: document fetch, atomic detection, two-pass
 * chunking, heading generation, embedding via Voyage AI, vector upsert,
 * and similarity search with parent context.
 *
 * The chunking internals (chunkText, countTokens) are tested separately
 * in chunking.test.ts. This file focuses on the orchestration layer.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup — must be before imports
// ---------------------------------------------------------------------------

const mockDocumentFindUnique = vi.fn();
const mockDocumentChunkFindMany = vi.fn();
const mockDocumentChunkDeleteMany = vi.fn();
const mockDocumentChunkCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args) as unknown,
    },
    documentChunk: {
      findMany: (...args: unknown[]) => mockDocumentChunkFindMany(...args) as unknown,
      deleteMany: (...args: unknown[]) => mockDocumentChunkDeleteMany(...args) as unknown,
      create: (...args: unknown[]) => mockDocumentChunkCreate(...args) as unknown,
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args) as unknown,
  },
}));

const mockUpsertEmbeddings = vi.fn();
const mockRemoveEmbeddings = vi.fn();
const mockQueryEmbeddings = vi.fn();

vi.mock('../../server/services/vector-search.service.js', () => ({
  upsertEmbeddings: (...args: unknown[]) => mockUpsertEmbeddings(...args) as unknown,
  removeEmbeddings: (...args: unknown[]) => mockRemoveEmbeddings(...args) as unknown,
  queryEmbeddings: (...args: unknown[]) => mockQueryEmbeddings(...args) as unknown,
}));

const mockGenerateHeadings = vi.fn();

vi.mock('../../server/services/chunk-headings.service.js', () => ({
  generateHeadings: (...args: unknown[]) => mockGenerateHeadings(...args) as unknown,
}));

const mockDetectAtomicBlocks = vi.fn();
const mockAssignChunkFlags = vi.fn();

vi.mock('../../server/services/chunk-atomic.service.js', () => ({
  detectAtomicBlocks: (...args: unknown[]) => mockDetectAtomicBlocks(...args) as unknown,
  assignChunkFlags: (...args: unknown[]) => mockAssignChunkFlags(...args) as unknown,
}));

// Mock global fetch for Voyage AI API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { chunkAndEmbed, similaritySearch } from '../../server/services/embedding.service.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const DOCUMENT_ID = 'doc-test-001';
const CLAIM_ID = 'claim-test-001';

const SAMPLE_TEXT =
  'QUALIFIED MEDICAL EVALUATOR REPORT\n\n' +
  'Patient: Jane Smith\n' +
  'Date of Injury: 03/15/2026\n\n' +
  'DIAGNOSES:\n' +
  '1. Cervical strain (M54.2)\n' +
  '2. Right shoulder rotator cuff tear (M75.110)\n\n' +
  'WPI Rating: 8% for the cervical spine, 4% for the right shoulder.\n' +
  'Combined WPI: 12%\n\n' +
  'WORK RESTRICTIONS:\n' +
  'No lifting over 20 pounds. No overhead reaching.';

const MOCK_DOCUMENT = {
  id: DOCUMENT_ID,
  extractedText: SAMPLE_TEXT,
  documentType: 'AME_QME_REPORT',
  documentSubtype: null,
  fileName: 'qme-report.pdf',
  extractedFields: [
    { fieldName: 'patientName', fieldValue: 'Jane Smith' },
    { fieldName: 'dateOfInjury', fieldValue: '03/15/2026' },
  ],
};

function makeHeadings(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    l1: 'QME Report — Jane Smith',
    l2: `Section ${i + 1}`,
    l3: `Topic ${i + 1}`,
    combined: `[L1] QME Report — Jane Smith\n[L2] Section ${i + 1}\n[L3] Topic ${i + 1}`,
  }));
}

function makeChunkFlags(count: number) {
  return Array.from({ length: count }, () => ({
    containsTable: false,
    containsProcedure: false,
    isContinuation: false,
    hasContinuation: false,
  }));
}

/** Build a mock Voyage API success response. */
function voyageResponse(count: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: Array.from({ length: count }, () => ({
        embedding: Array.from({ length: 1024 }, () => Math.random()),
      })),
    }),
    text: async () => '',
  };
}

/** Build a mock Voyage API error response. */
function voyageErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  // Default: no VOYAGE_API_KEY
  delete process.env['VOYAGE_API_KEY'];

  // Default mock implementations
  mockDetectAtomicBlocks.mockReturnValue([]);
  mockAssignChunkFlags.mockReturnValue([]);
  mockGenerateHeadings.mockReturnValue([]);
  mockUpsertEmbeddings.mockResolvedValue(0);
  mockRemoveEmbeddings.mockResolvedValue(undefined);
  mockQueryEmbeddings.mockResolvedValue([]);
  mockDocumentChunkFindMany.mockResolvedValue([]);
  mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });
});

// ---------------------------------------------------------------------------
// chunkAndEmbed
// ---------------------------------------------------------------------------

describe('chunkAndEmbed', () => {
  describe('error and edge cases', () => {
    it('throws when document is not found', async () => {
      mockDocumentFindUnique.mockResolvedValue(null);

      await expect(chunkAndEmbed('nonexistent-doc')).rejects.toThrow(
        'Document not found: nonexistent-doc',
      );
    });

    it('returns 0 when document has no extracted text', async () => {
      mockDocumentFindUnique.mockResolvedValue({
        ...MOCK_DOCUMENT,
        extractedText: null,
      });

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBe(0);
    });

    it('returns 0 when document has empty extracted text', async () => {
      mockDocumentFindUnique.mockResolvedValue({
        ...MOCK_DOCUMENT,
        extractedText: '',
      });

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBe(0);
    });

    it('returns 0 when all child chunks are empty after chunking', async () => {
      // extractedText is whitespace-only, chunkText returns []
      mockDocumentFindUnique.mockResolvedValue({
        ...MOCK_DOCUMENT,
        extractedText: '   \n\n   ',
      });

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBe(0);
    });
  });

  describe('successful pipeline', () => {
    let parentCreateCalls: Array<{ data: Record<string, unknown> }>;
    let childCreateCalls: Array<{ data: Record<string, unknown> }>;

    beforeEach(() => {
      parentCreateCalls = [];
      childCreateCalls = [];

      mockDocumentFindUnique.mockResolvedValue(MOCK_DOCUMENT);

      // Headings and flags will be set per-test or use defaults
      mockDetectAtomicBlocks.mockReturnValue([]);

      // No old chunks by default
      mockDocumentChunkFindMany.mockResolvedValue([]);
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });

      // Transaction mock: captures create calls and returns IDs
      let parentIndex = 0;
      let childIndex = 0;
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          documentChunk: {
            create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
              if (args.data.isParent) {
                parentCreateCalls.push(args);
                const id = `parent-${parentIndex++}`;
                return { id };
              } else {
                childCreateCalls.push(args);
                const id = `child-${childIndex++}`;
                return { id };
              }
            }),
          },
        };
        return fn(tx);
      });
    });

    it('creates parent chunks with isParent=true', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      const result = await chunkAndEmbed(DOCUMENT_ID);

      expect(result).toBeGreaterThan(0);
      // Verify parent chunks were created
      expect(parentCreateCalls.length).toBeGreaterThan(0);
      for (const call of parentCreateCalls) {
        expect(call.data.isParent).toBe(true);
        expect(call.data.documentId).toBe(DOCUMENT_ID);
        expect(call.data.tokenCount).toBeGreaterThan(0);
      }
    });

    it('creates child chunks with isParent=false and parentChunkId set', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      const result = await chunkAndEmbed(DOCUMENT_ID);

      expect(result).toBeGreaterThan(0);
      for (const call of childCreateCalls) {
        expect(call.data.isParent).toBe(false);
        expect(call.data.documentId).toBe(DOCUMENT_ID);
      }
    });

    it('stores heading L1/L2/L3 and contextPrefix on child chunks', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(childCreateCalls.length).toBeGreaterThan(0);
      const firstChild = childCreateCalls[0]!;
      expect(firstChild.data.headingL1).toBe('QME Report — Jane Smith');
      expect(firstChild.data.headingL2).toBe('Section 1');
      expect(firstChild.data.headingL3).toBe('Topic 1');
      expect(firstChild.data.contextPrefix).toBe(headings[0]!.combined);
    });

    it('stores atomic flags on child chunks', async () => {
      const headings = makeHeadings(1);
      const flags = [
        {
          containsTable: true,
          containsProcedure: true,
          isContinuation: false,
          hasContinuation: true,
        },
      ];
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(childCreateCalls.length).toBeGreaterThan(0);
      const firstChild = childCreateCalls[0]!;
      expect(firstChild.data.containsTable).toBe(true);
      expect(firstChild.data.containsProcedure).toBe(true);
      expect(firstChild.data.isContinuation).toBe(false);
      expect(firstChild.data.hasContinuation).toBe(true);
    });

    it('deletes old chunks before creating new ones', async () => {
      const oldChunks = [
        { id: 'old-child-1', isParent: false },
        { id: 'old-child-2', isParent: false },
        { id: 'old-parent-1', isParent: true },
      ];
      mockDocumentChunkFindMany.mockResolvedValue(oldChunks);

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      // Should remove old child embeddings from vector search
      expect(mockRemoveEmbeddings).toHaveBeenCalledWith([
        'chunk:old-child-1',
        'chunk:old-child-2',
      ]);
      // Should delete all old chunks from database
      expect(mockDocumentChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: DOCUMENT_ID },
      });
    });

    it('skips removeEmbeddings when no old child chunks exist', async () => {
      // Only parent chunks existed before
      mockDocumentChunkFindMany.mockResolvedValue([
        { id: 'old-parent-1', isParent: true },
      ]);

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      // No child IDs to remove
      expect(mockRemoveEmbeddings).not.toHaveBeenCalled();
    });

    it('skips removeEmbeddings when no old chunks at all', async () => {
      mockDocumentChunkFindMany.mockResolvedValue([]);

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(mockRemoveEmbeddings).not.toHaveBeenCalled();
    });

    it('calls detectAtomicBlocks with the document text', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(mockDetectAtomicBlocks).toHaveBeenCalledWith(SAMPLE_TEXT);
    });

    it('calls generateHeadings with child chunks and document context', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(mockGenerateHeadings).toHaveBeenCalledTimes(1);
      const [chunks, context] = mockGenerateHeadings.mock.calls[0] as [string[], unknown];
      expect(chunks.length).toBeGreaterThan(0);
      expect(context).toEqual({
        documentType: 'AME_QME_REPORT',
        documentSubtype: null,
        fileName: 'qme-report.pdf',
        extractedFields: MOCK_DOCUMENT.extractedFields,
      });
    });

    it('calls assignChunkFlags with child chunks, text, and atomic blocks', async () => {
      const atomicBlocks = [
        { type: 'table', startOffset: 0, endOffset: 50, text: 'table text' },
      ];
      mockDetectAtomicBlocks.mockReturnValue(atomicBlocks);

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(mockAssignChunkFlags).toHaveBeenCalledTimes(1);
      const [chunks, originalText, blocks] = mockAssignChunkFlags.mock.calls[0] as [
        string[],
        string,
        unknown[],
      ];
      expect(chunks.length).toBeGreaterThan(0);
      expect(originalText).toBe(SAMPLE_TEXT);
      expect(blocks).toBe(atomicBlocks);
    });

    it('stores chunks without embeddings when VOYAGE_API_KEY is missing', async () => {
      delete process.env['VOYAGE_API_KEY'];

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      const result = await chunkAndEmbed(DOCUMENT_ID);

      expect(result).toBeGreaterThan(0);
      // No embeddings generated, so upsertEmbeddings should not be called
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
      // fetch should not have been called (no Voyage API call)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('generates embeddings and upserts when VOYAGE_API_KEY is set', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);
      mockFetch.mockResolvedValue(voyageResponse(1));

      const result = await chunkAndEmbed(DOCUMENT_ID);

      expect(result).toBeGreaterThan(0);
      // Voyage API should have been called
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(fetchCall[0]).toBe('https://api.voyageai.com/v1/embeddings');
      const fetchBody = JSON.parse(fetchCall[1]!.body as string) as Record<string, unknown>;
      expect(fetchBody.model).toBe('voyage-large-4');
      expect(fetchBody.input_type).toBe('document');

      // Embeddings should be upserted to vector search
      expect(mockUpsertEmbeddings).toHaveBeenCalledTimes(1);
      const upsertArgs = mockUpsertEmbeddings.mock.calls[0] as [
        Array<{ id: string; embedding: number[] }>,
      ];
      expect(upsertArgs[0]!.length).toBeGreaterThan(0);
      for (const dp of upsertArgs[0]!) {
        expect(dp.id).toMatch(/^chunk:child-\d+$/);
        expect(dp.embedding).toHaveLength(1024);
      }
    });

    it('prepends heading combined text to embedding input', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);
      mockFetch.mockResolvedValue(voyageResponse(1));

      await chunkAndEmbed(DOCUMENT_ID);

      // Check that the embedding input contains the heading prefix
      const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
      const fetchBody = JSON.parse(fetchCall[1]!.body as string) as {
        input: string[];
      };
      const firstInput = fetchBody.input[0]!;
      expect(firstInput).toContain('[L1] QME Report — Jane Smith');
      expect(firstInput).toContain('[L2] Section 1');
      expect(firstInput).toContain('[L3] Topic 1');
    });

    it('skips upsertEmbeddings when Voyage API returns null (error)', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      // Voyage returns a non-ok response — generateEmbeddings catches and returns null
      mockFetch.mockResolvedValue(voyageErrorResponse(500, 'Internal Server Error'));

      const result = await chunkAndEmbed(DOCUMENT_ID);

      // Chunks still stored, but no embeddings
      expect(result).toBeGreaterThan(0);
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
    });

    it('handles missing heading gracefully (no prefix)', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';

      // Return empty headings
      mockGenerateHeadings.mockReturnValue([]);
      mockAssignChunkFlags.mockReturnValue([]);
      mockFetch.mockResolvedValue(voyageResponse(1));

      await chunkAndEmbed(DOCUMENT_ID);

      // The embedding text should just be the chunk content without prefix
      const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
      const fetchBody = JSON.parse(fetchCall[1]!.body as string) as {
        input: string[];
      };
      // Should not contain heading markers when headings are absent
      const firstInput = fetchBody.input[0]!;
      expect(firstInput).not.toContain('[L1]');
    });

    it('handles null flags gracefully (defaults to false)', async () => {
      const headings = makeHeadings(1);
      // Return no flags
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue([]);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(childCreateCalls.length).toBeGreaterThan(0);
      const firstChild = childCreateCalls[0]!;
      expect(firstChild.data.containsTable).toBe(false);
      expect(firstChild.data.containsProcedure).toBe(false);
      expect(firstChild.data.isContinuation).toBe(false);
      expect(firstChild.data.hasContinuation).toBe(false);
    });

    it('handles null heading fields gracefully', async () => {
      // headings that exist but have undefined fields
      mockGenerateHeadings.mockReturnValue([
        { l1: undefined, l2: undefined, l3: undefined, combined: undefined },
      ]);
      mockAssignChunkFlags.mockReturnValue(makeChunkFlags(1));

      await chunkAndEmbed(DOCUMENT_ID);

      expect(childCreateCalls.length).toBeGreaterThan(0);
      const firstChild = childCreateCalls[0]!;
      expect(firstChild.data.headingL1).toBeNull();
      expect(firstChild.data.headingL2).toBeNull();
      expect(firstChild.data.headingL3).toBeNull();
      expect(firstChild.data.contextPrefix).toBeNull();
    });

    it('returns the count of child chunks created', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      const result = await chunkAndEmbed(DOCUMENT_ID);

      expect(result).toBe(childCreateCalls.length);
    });

    it('calls $transaction twice (once for parents, once for children)', async () => {
      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);

      await chunkAndEmbed(DOCUMENT_ID);

      expect(mockTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('Voyage API edge cases', () => {
    beforeEach(() => {
      mockDocumentFindUnique.mockResolvedValue(MOCK_DOCUMENT);
      mockDocumentChunkFindMany.mockResolvedValue([]);
      mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });

      let parentIndex = 0;
      let childIndex = 0;
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          documentChunk: {
            create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
              if (args.data.isParent) {
                return { id: `parent-${parentIndex++}` };
              }
              return { id: `child-${childIndex++}` };
            }),
          },
        };
        return fn(tx);
      });

      const headings = makeHeadings(1);
      const flags = makeChunkFlags(1);
      mockGenerateHeadings.mockReturnValue(headings);
      mockAssignChunkFlags.mockReturnValue(flags);
    });

    it('handles Voyage API returning no data field', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}), // no data field
        text: async () => '',
      });

      // generateEmbeddings will throw, catch, and return null
      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBeGreaterThan(0);
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
    });

    it('handles Voyage API returning wrong embedding dimensions', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2] }], // wrong dimensions
        }),
        text: async () => '',
      });

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBeGreaterThan(0);
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
    });

    it('handles Voyage API network error', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBeGreaterThan(0);
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
    });

    it('handles Voyage API returning embedding with null values', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ embedding: null }],
        }),
        text: async () => '',
      });

      const result = await chunkAndEmbed(DOCUMENT_ID);
      expect(result).toBeGreaterThan(0);
      expect(mockUpsertEmbeddings).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// similaritySearch
// ---------------------------------------------------------------------------

describe('similaritySearch', () => {
  describe('early returns', () => {
    it('returns empty array when VOYAGE_API_KEY is missing', async () => {
      delete process.env['VOYAGE_API_KEY'];

      const results = await similaritySearch('test query', CLAIM_ID);
      expect(results).toEqual([]);
    });

    it('returns empty array when query embedding fails', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'error',
      });

      const results = await similaritySearch('test query', CLAIM_ID);
      expect(results).toEqual([]);
    });

    it('returns empty array when vector search returns no results', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      const queryEmbed = Array.from({ length: 1024 }, () => 0.1);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: queryEmbed }] }),
        text: async () => '',
      });
      mockQueryEmbeddings.mockResolvedValue([]);

      const results = await similaritySearch('test query', CLAIM_ID);
      expect(results).toEqual([]);
    });

    it('returns empty array when vector results have no valid chunk IDs', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      const queryEmbed = Array.from({ length: 1024 }, () => 0.1);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: queryEmbed }] }),
        text: async () => '',
      });
      // Vector result has ID "chunk:" with empty chunk ID after stripping prefix
      mockQueryEmbeddings.mockResolvedValue([{ id: 'chunk:', distance: 0.1 }]);

      const results = await similaritySearch('test query', CLAIM_ID);
      expect(results).toEqual([]);
    });
  });

  describe('successful search', () => {
    const queryEmbed = Array.from({ length: 1024 }, () => 0.1);

    beforeEach(() => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: queryEmbed }] }),
        text: async () => '',
      });
    });

    it('returns results with parent content and heading breadcrumb', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.1 },
        { id: 'chunk:child-2', distance: 0.3 },
      ]);

      // DB returns child chunks scoped to the claim
      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-1',
            documentId: DOCUMENT_ID,
            content: 'Chunk 1 content about cervical strain.',
            parentChunkId: 'parent-1',
            headingL1: 'QME Report',
            headingL2: 'Diagnoses',
            headingL3: 'Cervical Strain',
          },
          {
            id: 'child-2',
            documentId: DOCUMENT_ID,
            content: 'Chunk 2 content about WPI rating.',
            parentChunkId: 'parent-1',
            headingL1: 'QME Report',
            headingL2: 'WPI',
            headingL3: null,
          },
        ])
        // Second call: fetch parent chunks
        .mockResolvedValueOnce([
          { id: 'parent-1', content: 'Full parent context with both chunks.' },
        ]);

      const results = await similaritySearch('cervical strain diagnosis', CLAIM_ID);

      expect(results).toHaveLength(2);

      // Results sorted by similarity descending (lower distance = higher similarity)
      expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);

      // First result (child-1, distance 0.1 → similarity 0.9)
      expect(results[0]!.chunkId).toBe('child-1');
      expect(results[0]!.content).toBe('Chunk 1 content about cervical strain.');
      expect(results[0]!.parentContent).toBe('Full parent context with both chunks.');
      expect(results[0]!.headingBreadcrumb).toBe('QME Report > Diagnoses > Cervical Strain');
      expect(results[0]!.similarity).toBeCloseTo(0.9, 5);

      // Second result (child-2, distance 0.3 → similarity 0.7)
      expect(results[1]!.chunkId).toBe('child-2');
      expect(results[1]!.headingBreadcrumb).toBe('QME Report > WPI');
      expect(results[1]!.similarity).toBeCloseTo(0.7, 5);
    });

    it('uses query input_type for embedding', async () => {
      mockQueryEmbeddings.mockResolvedValue([]);

      await similaritySearch('test query', CLAIM_ID);

      const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchCall[1]!.body as string) as Record<string, unknown>;
      expect(body.input_type).toBe('query');
    });

    it('requests RERANK_CANDIDATE_COUNT candidates from vector search', async () => {
      mockQueryEmbeddings.mockResolvedValue([]);

      await similaritySearch('test query', CLAIM_ID, 5);

      expect(mockQueryEmbeddings).toHaveBeenCalledWith(queryEmbed, 50);
    });

    it('requests at least topK candidates when topK > RERANK_CANDIDATE_COUNT', async () => {
      mockQueryEmbeddings.mockResolvedValue([]);

      await similaritySearch('test query', CLAIM_ID, 100);

      expect(mockQueryEmbeddings).toHaveBeenCalledWith(queryEmbed, 100);
    });

    it('respects topK limit on returned results', async () => {
      // Return 5 vector results
      mockQueryEmbeddings.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `chunk:child-${i}`,
          distance: 0.1 * (i + 1),
        })),
      );

      mockDocumentChunkFindMany
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({
            id: `child-${i}`,
            documentId: DOCUMENT_ID,
            content: `Chunk ${i} content`,
            parentChunkId: null,
            headingL1: null,
            headingL2: null,
            headingL3: null,
          })),
        )
        .mockResolvedValueOnce([]); // no parents

      const results = await similaritySearch('test query', CLAIM_ID, 3);

      expect(results).toHaveLength(3);
    });

    it('returns null parentContent when chunk has no parent', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.2 },
      ]);

      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-1',
            documentId: DOCUMENT_ID,
            content: 'Orphan chunk content',
            parentChunkId: null,
            headingL1: null,
            headingL2: null,
            headingL3: null,
          },
        ])
        .mockResolvedValueOnce([]); // no parents to fetch

      const results = await similaritySearch('query', CLAIM_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.parentContent).toBeNull();
      expect(results[0]!.headingBreadcrumb).toBeNull();
    });

    it('returns null headingBreadcrumb when all heading levels are null', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.15 },
      ]);

      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-1',
            documentId: DOCUMENT_ID,
            content: 'Content',
            parentChunkId: null,
            headingL1: null,
            headingL2: null,
            headingL3: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const results = await similaritySearch('query', CLAIM_ID);

      expect(results[0]!.headingBreadcrumb).toBeNull();
    });

    it('builds partial breadcrumb when only some heading levels exist', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.15 },
      ]);

      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-1',
            documentId: DOCUMENT_ID,
            content: 'Content',
            parentChunkId: null,
            headingL1: 'QME Report',
            headingL2: null,
            headingL3: 'Topic',
          },
        ])
        .mockResolvedValueOnce([]);

      const results = await similaritySearch('query', CLAIM_ID);

      expect(results[0]!.headingBreadcrumb).toBe('QME Report > Topic');
    });

    it('uses default topK of 5', async () => {
      mockQueryEmbeddings.mockResolvedValue([]);

      await similaritySearch('test query', CLAIM_ID);

      // Should use RERANK_CANDIDATE_COUNT (50) since max(5, 50) = 50
      expect(mockQueryEmbeddings).toHaveBeenCalledWith(queryEmbed, 50);
    });

    it('handles distance map missing entry (defaults to distance 1.0)', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.2 },
      ]);

      // DB returns a chunk whose ID is NOT in the vector results map
      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-999',
            documentId: DOCUMENT_ID,
            content: 'Unknown chunk',
            parentChunkId: null,
            headingL1: null,
            headingL2: null,
            headingL3: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const results = await similaritySearch('query', CLAIM_ID);

      // Distance defaults to 1.0, so similarity = 1 - 1.0 = 0.0
      expect(results[0]!.similarity).toBe(0);
    });

    it('handles parentChunkId pointing to non-existent parent', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.1 },
      ]);

      mockDocumentChunkFindMany
        .mockResolvedValueOnce([
          {
            id: 'child-1',
            documentId: DOCUMENT_ID,
            content: 'Child content',
            parentChunkId: 'deleted-parent',
            headingL1: null,
            headingL2: null,
            headingL3: null,
          },
        ])
        // Parent lookup returns empty
        .mockResolvedValueOnce([]);

      const results = await similaritySearch('query', CLAIM_ID);

      expect(results[0]!.parentContent).toBeNull();
    });

    it('scopes DB query to the specified claimId', async () => {
      mockQueryEmbeddings.mockResolvedValue([
        { id: 'chunk:child-1', distance: 0.2 },
      ]);
      mockDocumentChunkFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await similaritySearch('test query', 'claim-specific-id');

      const findManyArgs = mockDocumentChunkFindMany.mock.calls[0]![0] as {
        where: { document: { claimId: string } };
      };
      expect(findManyArgs.where.document.claimId).toBe('claim-specific-id');
    });
  });

  describe('fetch error handling', () => {
    it('returns empty when fetch throws (network error)', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-voyage-key';
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const results = await similaritySearch('query', CLAIM_ID);
      expect(results).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings internal (tested via chunkAndEmbed)
// ---------------------------------------------------------------------------

describe('generateEmbeddings (via chunkAndEmbed)', () => {
  let childCreateCalls: Array<{ data: Record<string, unknown> }>;

  beforeEach(() => {
    childCreateCalls = [];
    mockDocumentFindUnique.mockResolvedValue(MOCK_DOCUMENT);
    mockDocumentChunkFindMany.mockResolvedValue([]);
    mockDocumentChunkDeleteMany.mockResolvedValue({ count: 0 });

    let parentIndex = 0;
    let childIndex = 0;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        documentChunk: {
          create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
            if (args.data.isParent) {
              return { id: `parent-${parentIndex++}` };
            }
            childCreateCalls.push(args);
            return { id: `child-${childIndex++}` };
          }),
        },
      };
      return fn(tx);
    });

    mockGenerateHeadings.mockReturnValue(makeHeadings(1));
    mockAssignChunkFlags.mockReturnValue(makeChunkFlags(1));
  });

  it('batches requests in groups of 128', async () => {
    process.env['VOYAGE_API_KEY'] = 'test-voyage-key';

    // Generate a very long document that produces many child chunks
    const longText = Array.from({ length: 500 }, (_, i) =>
      `Paragraph ${i}. ` + 'The injured worker reported symptoms including persistent pain. '.repeat(10),
    ).join('\n\n');

    mockDocumentFindUnique.mockResolvedValue({
      ...MOCK_DOCUMENT,
      extractedText: longText,
    });

    const manyHeadings = makeHeadings(200);
    const manyFlags = makeChunkFlags(200);
    mockGenerateHeadings.mockReturnValue(manyHeadings);
    mockAssignChunkFlags.mockReturnValue(manyFlags);

    // Each batch call returns the right number of embeddings
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      const count = body.input.length;
      return voyageResponse(count);
    });

    await chunkAndEmbed(DOCUMENT_ID);

    // Should have called fetch at least once
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Each batch should have at most 128 items
    for (const call of mockFetch.mock.calls) {
      const body = JSON.parse((call as [string, RequestInit])[1]!.body as string) as {
        input: string[];
      };
      expect(body.input.length).toBeLessThanOrEqual(128);
    }
  });

  it('sends Authorization header with bearer token', async () => {
    process.env['VOYAGE_API_KEY'] = 'test-voyage-key-123';
    mockFetch.mockResolvedValue(voyageResponse(1));

    await chunkAndEmbed(DOCUMENT_ID);

    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = fetchCall[1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-voyage-key-123');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
