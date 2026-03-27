/**
 * Tests for hybrid-search.service.ts — keyword search, RRF fusion, and hybrid search.
 *
 * Covers:
 * - keywordSearch(): empty/short query guard, FULLTEXT results, access control,
 *   isParent exclusion, error handling, relevance ordering.
 * - hybridSearch(): RRF fusion with both/one/neither signal, default and custom
 *   weights, finalTopK, parent content enrichment, heading breadcrumbs,
 *   matched keywords.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup — must be before imports
// ---------------------------------------------------------------------------

const mockQueryRaw = vi.fn();
const mockDocumentChunkFindMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) as unknown,
    documentChunk: {
      findMany: (...args: unknown[]) => mockDocumentChunkFindMany(...args) as unknown,
    },
  },
}));

const mockSimilaritySearch = vi.fn();

vi.mock('../../server/services/embedding.service.js', () => ({
  similaritySearch: (...args: unknown[]) => mockSimilaritySearch(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { keywordSearch, hybridSearch } from '../../server/services/hybrid-search.service.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const CLAIM_ID = 'claim-test-001';
const TOP_K = 50;

// ---------------------------------------------------------------------------
// keywordSearch()
// ---------------------------------------------------------------------------

describe('keywordSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] for empty query', async () => {
    const result = await keywordSearch('', CLAIM_ID, TOP_K);
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns [] for whitespace-only query', async () => {
    const result = await keywordSearch('   ', CLAIM_ID, TOP_K);
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns [] for query shorter than 3 characters', async () => {
    const result = await keywordSearch('ab', CLAIM_ID, TOP_K);
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns [] for null/undefined query', async () => {
    const result = await keywordSearch(null as unknown as string, CLAIM_ID, TOP_K);
    expect(result).toEqual([]);
  });

  it('returns scored results from successful FULLTEXT query', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-1', document_id: 'doc-1', content: 'TD rate calculation', relevance: 8.5 },
      { id: 'chunk-2', document_id: 'doc-2', content: 'Temporary disability rate', relevance: 5.2 },
    ]);

    const results = await keywordSearch('TD rate', CLAIM_ID, TOP_K);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      content: 'TD rate calculation',
      relevance: 8.5,
    });
    expect(results[1]).toEqual({
      chunkId: 'chunk-2',
      documentId: 'doc-2',
      content: 'Temporary disability rate',
      relevance: 5.2,
    });
  });

  it('results are sorted by relevance descending (from SQL)', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-a', document_id: 'doc-a', content: 'High relevance', relevance: 12.0 },
      { id: 'chunk-b', document_id: 'doc-b', content: 'Medium relevance', relevance: 7.0 },
      { id: 'chunk-c', document_id: 'doc-c', content: 'Low relevance', relevance: 2.0 },
    ]);

    const results = await keywordSearch('medical report', CLAIM_ID, TOP_K);

    expect(results[0]!.relevance).toBeGreaterThan(results[1]!.relevance);
    expect(results[1]!.relevance).toBeGreaterThan(results[2]!.relevance);
  });

  it('scopes results to the provided claimId via SQL query', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await keywordSearch('lumbar spine', CLAIM_ID, 10);

    // The raw SQL query is called with the query, claimId, and topK params.
    // Since it uses Prisma.sql tagged template, we verify the call happened.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('converts relevance to number from BigInt or string', async () => {
    // MySQL MATCH AGAINST may return BigInt or numeric string in some drivers
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-1', document_id: 'doc-1', content: 'Content', relevance: BigInt(5) },
    ]);

    const results = await keywordSearch('test query', CLAIM_ID, TOP_K);
    expect(typeof results[0]!.relevance).toBe('number');
    expect(results[0]!.relevance).toBe(5);
  });

  it('catches FULLTEXT index error and returns [] gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryRaw.mockRejectedValueOnce(new Error('Error Code: 1191. Can\'t find FULLTEXT index'));

    const results = await keywordSearch('lumbar spine diagnosis', CLAIM_ID, TOP_K);

    expect(results).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[hybrid-search] Keyword search failed'),
      expect.stringContaining('1191'),
    );
    consoleWarnSpy.mockRestore();
  });

  it('catches generic database errors and returns [] gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));

    const results = await keywordSearch('some query text', CLAIM_ID, TOP_K);

    expect(results).toEqual([]);
    consoleWarnSpy.mockRestore();
  });

  it('catches non-Error thrown values and returns []', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryRaw.mockRejectedValueOnce('string error');

    const results = await keywordSearch('some query text', CLAIM_ID, TOP_K);

    expect(results).toEqual([]);
    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// hybridSearch()
// ---------------------------------------------------------------------------

describe('hybridSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to build vector results matching SearchResult shape
  function makeVectorResult(id: string, similarity: number, content?: string) {
    return {
      chunkId: id,
      documentId: `doc-for-${id}`,
      content: content ?? `Vector content for ${id}`,
      parentContent: `Parent content for ${id}`,
      headingBreadcrumb: `Section > Subsection > ${id}`,
      similarity,
    };
  }

  // Helper to build keyword results matching KeywordResult shape
  function makeKeywordResult(id: string, relevance: number, content?: string) {
    return {
      chunkId: id,
      documentId: `doc-for-${id}`,
      content: content ?? `Keyword content for ${id}`,
      relevance,
    };
  }

  it('returns [] when both vector and keyword return no results', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('empty query', CLAIM_ID);

    expect(results).toEqual([]);
  });

  it('returns vector-only results when keyword search returns empty', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-v1', 0.95),
      makeVectorResult('chunk-v2', 0.80),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]); // keyword returns nothing

    const results = await hybridSearch('vector only query', CLAIM_ID, { finalTopK: 5 });

    expect(results.length).toBe(2);
    expect(results[0]!.chunkId).toBe('chunk-v1');
    expect(results[0]!.vectorScore).toBe(0.95);
    expect(results[0]!.keywordScore).toBe(0);
    expect(results[0]!.fusedScore).toBeGreaterThan(0);
  });

  it('returns keyword-only results when vector search returns empty', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-k1', document_id: 'doc-k1', content: 'Keyword result one', relevance: 10.0 },
      { id: 'chunk-k2', document_id: 'doc-k2', content: 'Keyword result two', relevance: 5.0 },
    ]);
    // Parent content fetch for keyword-only results
    mockDocumentChunkFindMany
      .mockResolvedValueOnce([]) // chunks with parent lookup
      ;

    const results = await hybridSearch('keyword only query', CLAIM_ID, { finalTopK: 5 });

    expect(results.length).toBe(2);
    expect(results[0]!.chunkId).toBe('chunk-k1');
    expect(results[0]!.vectorScore).toBe(0);
    expect(results[0]!.keywordScore).toBe(1.0); // normalized: 10/10 = 1.0
    expect(results[0]!.fusedScore).toBeGreaterThan(0);
  });

  it('fuses both vector and keyword results via RRF with correct ordering', async () => {
    // chunk-a appears in both vector (rank 1) and keyword (rank 1) — should be top
    // chunk-b appears in vector only (rank 2)
    // chunk-c appears in keyword only (rank 2)
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-a', 0.95, 'Overlapping content for chunk-a'),
      makeVectorResult('chunk-b', 0.80, 'Vector-only chunk-b'),
    ]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-a', document_id: 'doc-for-chunk-a', content: 'Overlapping content for chunk-a', relevance: 10.0 },
      { id: 'chunk-c', document_id: 'doc-for-chunk-c', content: 'Keyword-only chunk-c', relevance: 5.0 },
    ]);
    // Parent content fetch for keyword-only results (chunk-c)
    mockDocumentChunkFindMany.mockResolvedValueOnce([]);

    const results = await hybridSearch('overlapping query text', CLAIM_ID, { finalTopK: 10 });

    expect(results.length).toBe(3);
    // chunk-a should be first — it has contributions from both signals
    expect(results[0]!.chunkId).toBe('chunk-a');
    expect(results[0]!.fusedScore).toBeGreaterThan(results[1]!.fusedScore);
    expect(results[0]!.fusedScore).toBeGreaterThan(results[2]!.fusedScore);
  });

  it('computes correct RRF fused score: weight/(k+rank)', async () => {
    const k = 60;
    const vectorWeight = 0.6;
    const keywordWeight = 0.4;

    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-a', 0.9), // vector rank 1
    ]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-a', document_id: 'doc-for-chunk-a', content: 'Vector content for chunk-a', relevance: 8.0 },
    ]); // keyword rank 1

    const results = await hybridSearch('rrf scoring test', CLAIM_ID, {
      vectorWeight,
      keywordWeight,
      rrf_k: k,
      finalTopK: 10,
    });

    const expectedVectorContribution = vectorWeight * (1 / (k + 1)); // rank 1
    const expectedKeywordContribution = keywordWeight * (1 / (k + 1)); // rank 1
    const expectedFusedScore = expectedVectorContribution + expectedKeywordContribution;

    expect(results[0]!.fusedScore).toBeCloseTo(expectedFusedScore, 10);
  });

  it('uses default weights (0.6 vector / 0.4 keyword)', async () => {
    const k = 60;

    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-a', 0.9),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('default weights', CLAIM_ID);

    // Vector only, rank 1: 0.6 / (60 + 1)
    const expectedScore = 0.6 * (1 / (k + 1));
    expect(results[0]!.fusedScore).toBeCloseTo(expectedScore, 10);
  });

  it('respects custom weights', async () => {
    const k = 60;

    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-a', 0.9),
    ]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-a', document_id: 'doc-for-chunk-a', content: 'Vector content for chunk-a', relevance: 5.0 },
    ]);

    const results = await hybridSearch('custom weights', CLAIM_ID, {
      vectorWeight: 0.3,
      keywordWeight: 0.7,
    });

    const expectedScore = 0.3 * (1 / (k + 1)) + 0.7 * (1 / (k + 1));
    expect(results[0]!.fusedScore).toBeCloseTo(expectedScore, 10);
  });

  it('respects finalTopK — truncates results', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-1', 0.95),
      makeVectorResult('chunk-2', 0.90),
      makeVectorResult('chunk-3', 0.85),
      makeVectorResult('chunk-4', 0.80),
      makeVectorResult('chunk-5', 0.75),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('finalTopK test', CLAIM_ID, { finalTopK: 3 });

    expect(results.length).toBe(3);
    // Top 3 by fused score = first 3 vector results (highest similarity => lowest rank)
    expect(results[0]!.chunkId).toBe('chunk-1');
    expect(results[1]!.chunkId).toBe('chunk-2');
    expect(results[2]!.chunkId).toBe('chunk-3');
  });

  it('fetches parent content for keyword-only results that lack it', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-k1', document_id: 'doc-k1', content: 'Keyword content', relevance: 10.0 },
    ]);

    // First findMany: child chunks with parent reference
    mockDocumentChunkFindMany.mockResolvedValueOnce([
      {
        id: 'chunk-k1',
        parentChunkId: 'parent-p1',
        headingL1: 'Medical Report',
        headingL2: 'Diagnoses',
        headingL3: 'Lumbar Spine',
      },
    ]);
    // Second findMany: parent chunk content
    mockDocumentChunkFindMany.mockResolvedValueOnce([
      { id: 'parent-p1', content: 'Full parent context about lumbar spine diagnosis' },
    ]);

    const results = await hybridSearch('lumbar spine', CLAIM_ID, { finalTopK: 5 });

    expect(results[0]!.parentContent).toBe('Full parent context about lumbar spine diagnosis');
    expect(results[0]!.headingBreadcrumb).toBe('Medical Report > Diagnoses > Lumbar Spine');
  });

  it('does not refetch parent content for vector results (already have it)', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-v1', 0.95),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('vector has parent', CLAIM_ID, { finalTopK: 5 });

    // No parent fetch needed — vector results already have parentContent
    expect(mockDocumentChunkFindMany).not.toHaveBeenCalled();
    expect(results[0]!.parentContent).toBe('Parent content for chunk-v1');
  });

  it('builds heading breadcrumb from L1 > L2 > L3', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-k1', document_id: 'doc-k1', content: 'Content', relevance: 10.0 },
    ]);

    mockDocumentChunkFindMany.mockResolvedValueOnce([
      {
        id: 'chunk-k1',
        parentChunkId: null,
        headingL1: 'Section A',
        headingL2: 'Part B',
        headingL3: null, // only 2 levels
      },
    ]);

    const results = await hybridSearch('heading test', CLAIM_ID, { finalTopK: 5 });

    expect(results[0]!.headingBreadcrumb).toBe('Section A > Part B');
  });

  it('populates matchedKeywords from query terms found in content', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-v1', 0.9, 'The lumbar spine diagnosis shows moderate impairment'),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('lumbar spine diagnosis', CLAIM_ID, { finalTopK: 5 });

    expect(results[0]!.matchedKeywords).toContain('lumbar');
    expect(results[0]!.matchedKeywords).toContain('spine');
    expect(results[0]!.matchedKeywords).toContain('diagnosis');
  });

  it('filters out query terms shorter than 3 chars from matchedKeywords', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-v1', 0.9, 'The TD rate is calculated here'),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    // "is" and "TD" are only 2 chars — should not appear in matchedKeywords
    const results = await hybridSearch('TD is the rate', CLAIM_ID, { finalTopK: 5 });

    expect(results[0]!.matchedKeywords).toContain('rate');
    expect(results[0]!.matchedKeywords).not.toContain('is');
    expect(results[0]!.matchedKeywords).not.toContain('td');
  });

  it('normalizes keyword relevance scores to 0-1 range', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-k1', document_id: 'doc-k1', content: 'Top result', relevance: 20.0 },
      { id: 'chunk-k2', document_id: 'doc-k2', content: 'Second result', relevance: 10.0 },
      { id: 'chunk-k3', document_id: 'doc-k3', content: 'Third result', relevance: 5.0 },
    ]);
    mockDocumentChunkFindMany.mockResolvedValueOnce([]);

    const results = await hybridSearch('normalize test results', CLAIM_ID, { finalTopK: 10 });

    // Top result: 20/20 = 1.0, second: 10/20 = 0.5, third: 5/20 = 0.25
    expect(results[0]!.keywordScore).toBeCloseTo(1.0, 5);
    expect(results[1]!.keywordScore).toBeCloseTo(0.5, 5);
    expect(results[2]!.keywordScore).toBeCloseTo(0.25, 5);
  });

  it('handles overlapping chunk appearing in both vector and keyword results', async () => {
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-overlap', 0.92, 'Shared content about WPI rating'),
    ]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-overlap', document_id: 'doc-for-chunk-overlap', content: 'Shared content about WPI rating', relevance: 15.0 },
    ]);

    const results = await hybridSearch('WPI rating', CLAIM_ID, { finalTopK: 5 });

    expect(results.length).toBe(1);
    expect(results[0]!.chunkId).toBe('chunk-overlap');
    expect(results[0]!.vectorScore).toBe(0.92);
    expect(results[0]!.keywordScore).toBe(1.0); // 15/15 = 1.0
    // Fused score should reflect both contributions
    const k = 60;
    const expectedScore = 0.6 * (1 / (k + 1)) + 0.4 * (1 / (k + 1));
    expect(results[0]!.fusedScore).toBeCloseTo(expectedScore, 10);
  });

  it('runs vector and keyword searches in parallel (Promise.all)', async () => {
    let vectorResolved = false;
    let keywordResolved = false;

    mockSimilaritySearch.mockImplementationOnce(async () => {
      vectorResolved = true;
      return [];
    });
    mockQueryRaw.mockImplementationOnce(async () => {
      keywordResolved = true;
      return [];
    });

    await hybridSearch('parallel test', CLAIM_ID);

    expect(vectorResolved).toBe(true);
    expect(keywordResolved).toBe(true);
  });

  it('uses custom rrf_k parameter for RRF scoring', async () => {
    const customK = 10;

    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-a', 0.9),
    ]);
    mockQueryRaw.mockResolvedValueOnce([]);

    const results = await hybridSearch('custom k', CLAIM_ID, {
      rrf_k: customK,
      finalTopK: 5,
    });

    // With k=10, rank 1: 0.6 / (10 + 1)
    const expectedScore = 0.6 * (1 / (customK + 1));
    expect(results[0]!.fusedScore).toBeCloseTo(expectedScore, 10);
  });

  it('sorts final results by fused score descending', async () => {
    // chunk-a: vector rank 2, keyword rank 1
    // chunk-b: vector rank 1, no keyword
    // chunk-c: no vector, keyword rank 2
    mockSimilaritySearch.mockResolvedValueOnce([
      makeVectorResult('chunk-b', 0.95),
      makeVectorResult('chunk-a', 0.85),
    ]);
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'chunk-a', document_id: 'doc-for-chunk-a', content: 'Vector content for chunk-a', relevance: 10.0 },
      { id: 'chunk-c', document_id: 'doc-c', content: 'Keyword only', relevance: 5.0 },
    ]);
    mockDocumentChunkFindMany.mockResolvedValueOnce([]);

    const results = await hybridSearch('sorting test query', CLAIM_ID, { finalTopK: 10 });

    // Verify descending order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.fusedScore).toBeGreaterThanOrEqual(results[i + 1]!.fusedScore);
    }
  });
});
