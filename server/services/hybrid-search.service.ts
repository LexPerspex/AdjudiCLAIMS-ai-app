/**
 * Hybrid search service combining vector similarity and MySQL FULLTEXT keyword search.
 *
 * Uses Reciprocal Rank Fusion (RRF) to merge ranked result lists from two
 * independent retrieval signals:
 *   1. **Vector search** — semantic similarity via Voyage Large embeddings
 *      (from embedding.service.ts → Vertex AI Vector Search).
 *   2. **Keyword search** — MySQL FULLTEXT MATCH AGAINST in natural language mode
 *      (on the document_chunks.content column).
 *
 * RRF formula:  fusedScore = Σ weight_i * (1 / (k + rank_i))
 * where k is a constant (default 60) that dampens the influence of high ranks.
 *
 * Access control mirrors retrieveContext() in examiner-chat.service.ts:
 * documents marked ATTORNEY_ONLY, containsLegalAnalysis, containsWorkProduct,
 * or containsPrivileged are excluded from all searches.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { similaritySearch, type SearchResult } from './embedding.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single result from hybrid search with scores from both signals.
 */
export interface HybridSearchResult {
  /** Unique ID of the document chunk. */
  chunkId: string;
  /** ID of the parent document this chunk belongs to. */
  documentId: string;
  /** The text content of the chunk. */
  content: string;
  /** Parent chunk content for broader LLM context (null if no parent). */
  parentContent: string | null;
  /** 3-level heading breadcrumb for source attribution. */
  headingBreadcrumb: string | null;
  /** Cosine similarity score 0-1 from vector search (0 if not in vector results). */
  vectorScore: number;
  /** Normalized FULLTEXT relevance score 0-1 (0 if not in keyword results). */
  keywordScore: number;
  /** RRF combined score. */
  fusedScore: number;
  /** Which query terms matched in the keyword search. */
  matchedKeywords: string[];
}

/**
 * Configuration options for hybrid search.
 */
export interface HybridSearchOptions {
  /** Weight for the vector search signal in RRF (default 0.6). */
  vectorWeight?: number;
  /** Weight for the keyword search signal in RRF (default 0.4). */
  keywordWeight?: number;
  /** Number of candidate results from vector search (default 50). */
  vectorTopK?: number;
  /** Number of candidate results from keyword search (default 50). */
  keywordTopK?: number;
  /** Number of final results to return (default 5). */
  finalTopK?: number;
  /** RRF rank dampening constant (default 60). */
  rrf_k?: number;
}

// ---------------------------------------------------------------------------
// Keyword search
// ---------------------------------------------------------------------------

interface KeywordResult {
  chunkId: string;
  documentId: string;
  content: string;
  relevance: number;
}

/**
 * Search document chunks using MySQL FULLTEXT index (MATCH AGAINST).
 *
 * Scoped to a single claim via a join to the documents table. Excludes
 * parent chunks and documents restricted by access control.
 *
 * @param query - Natural language search query.
 * @param claimId - Claim ID to scope the search to.
 * @param topK - Maximum number of results to return.
 * @returns Keyword search results ordered by relevance descending.
 */
export async function keywordSearch(
  query: string,
  claimId: string,
  topK: number,
): Promise<KeywordResult[]> {
  // Guard: empty or very short queries produce no meaningful FULLTEXT results.
  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        document_id: string;
        content: string;
        relevance: number;
      }>
    >(
      Prisma.sql`
        SELECT
          dc.id,
          dc.document_id,
          dc.content,
          MATCH(dc.content) AGAINST(${query} IN NATURAL LANGUAGE MODE) AS relevance
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE d.claim_id = ${claimId}
          AND dc.is_parent = false
          AND d.access_level != 'ATTORNEY_ONLY'
          AND d.contains_legal_analysis = false
          AND d.contains_work_product = false
          AND d.contains_privileged = false
          AND MATCH(dc.content) AGAINST(${query} IN NATURAL LANGUAGE MODE) > 0
        ORDER BY relevance DESC
        LIMIT ${topK}
      `,
    );

    return rows.map((row) => ({
      chunkId: row.id,
      documentId: row.document_id,
      content: row.content,
      relevance: Number(row.relevance),
    }));
  } catch (err: unknown) {
    // Handle the case where the FULLTEXT index does not exist (MySQL error 1191)
    // or any other query error. Degrade gracefully to empty results.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      '[hybrid-search] Keyword search failed (FULLTEXT index may not exist):',
      message,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hybrid search (RRF fusion)
// ---------------------------------------------------------------------------

/**
 * Extract query terms for keyword matching analysis.
 * Splits the query into individual words (lowercased, 3+ chars).
 */
function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .map((term) => term.replace(/[^\w]/g, ''))
    .filter(Boolean);
}

/**
 * Determine which query terms appear in a chunk's content.
 */
function findMatchedKeywords(content: string, queryTerms: string[]): string[] {
  const lowerContent = content.toLowerCase();
  return queryTerms.filter((term) => lowerContent.includes(term));
}

/**
 * Perform hybrid search combining vector similarity and keyword search
 * using Reciprocal Rank Fusion (RRF).
 *
 * Both retrieval signals run in parallel. Their ranked result lists are
 * merged using the RRF formula, and the top results are enriched with
 * parent chunk content for LLM context.
 *
 * @param query - Natural language search query.
 * @param claimId - Claim ID to scope the search to.
 * @param options - Optional search configuration.
 * @returns Hybrid search results sorted by fused score descending.
 */
export async function hybridSearch(
  query: string,
  claimId: string,
  options?: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const vectorWeight = options?.vectorWeight ?? 0.6;
  const keywordWeight = options?.keywordWeight ?? 0.4;
  const vectorTopK = options?.vectorTopK ?? 50;
  const keywordTopK = options?.keywordTopK ?? 50;
  const finalTopK = options?.finalTopK ?? 5;
  const k = options?.rrf_k ?? 60;

  // --- Step 1: Run both searches in parallel ---
  const [vectorResults, keywordResults] = await Promise.all([
    similaritySearch(query, claimId, vectorTopK),
    keywordSearch(query, claimId, keywordTopK),
  ]);

  // --- Step 2: Build per-chunk records with rank information ---
  // Map: chunkId → merged data
  const mergedMap = new Map<
    string,
    {
      chunkId: string;
      documentId: string;
      content: string;
      parentContent: string | null;
      headingBreadcrumb: string | null;
      vectorRank: number | null;
      keywordRank: number | null;
      vectorScore: number;
      keywordRelevance: number;
    }
  >();

  // Insert vector results (already sorted by similarity descending).
  for (let i = 0; i < vectorResults.length; i++) {
    const r = vectorResults[i]!;
    mergedMap.set(r.chunkId, {
      chunkId: r.chunkId,
      documentId: r.documentId,
      content: r.content,
      parentContent: r.parentContent,
      headingBreadcrumb: r.headingBreadcrumb,
      vectorRank: i + 1, // 1-indexed
      keywordRank: null,
      vectorScore: r.similarity,
      keywordRelevance: 0,
    });
  }

  // Normalize keyword relevance scores to 0-1 range.
  const maxKeywordRelevance =
    keywordResults.length > 0
      ? Math.max(...keywordResults.map((r) => r.relevance))
      : 1;

  // Insert/merge keyword results (already sorted by relevance descending).
  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i]!;
    const normalizedRelevance =
      maxKeywordRelevance > 0 ? r.relevance / maxKeywordRelevance : 0;

    const existing = mergedMap.get(r.chunkId);
    if (existing) {
      existing.keywordRank = i + 1;
      existing.keywordRelevance = normalizedRelevance;
    } else {
      mergedMap.set(r.chunkId, {
        chunkId: r.chunkId,
        documentId: r.documentId,
        content: r.content,
        parentContent: null, // Will be fetched below if needed
        headingBreadcrumb: null, // Will be fetched below if needed
        vectorRank: null,
        keywordRank: i + 1,
        vectorScore: 0,
        keywordRelevance: normalizedRelevance,
      });
    }
  }

  // --- Step 3: Compute RRF fused scores ---
  const queryTerms = extractQueryTerms(query);

  const fusedResults: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    parentContent: string | null;
    headingBreadcrumb: string | null;
    vectorScore: number;
    keywordScore: number;
    fusedScore: number;
    matchedKeywords: string[];
  }> = [];

  for (const entry of mergedMap.values()) {
    const vectorContribution =
      entry.vectorRank !== null
        ? vectorWeight * (1 / (k + entry.vectorRank))
        : 0;
    const keywordContribution =
      entry.keywordRank !== null
        ? keywordWeight * (1 / (k + entry.keywordRank))
        : 0;

    fusedResults.push({
      chunkId: entry.chunkId,
      documentId: entry.documentId,
      content: entry.content,
      parentContent: entry.parentContent,
      headingBreadcrumb: entry.headingBreadcrumb,
      vectorScore: entry.vectorScore,
      keywordScore: entry.keywordRelevance,
      fusedScore: vectorContribution + keywordContribution,
      matchedKeywords: findMatchedKeywords(entry.content, queryTerms),
    });
  }

  // --- Step 4: Sort by fused score descending, take top finalTopK ---
  fusedResults.sort((a, b) => b.fusedScore - a.fusedScore);
  const topResults = fusedResults.slice(0, finalTopK);

  // --- Step 5: Fetch parent content for results that don't have it ---
  const chunkIdsNeedingParent = topResults
    .filter((r) => r.parentContent === null)
    .map((r) => r.chunkId);

  if (chunkIdsNeedingParent.length > 0) {
    const chunksWithParent = await prisma.documentChunk.findMany({
      where: {
        id: { in: chunkIdsNeedingParent },
        parentChunkId: { not: null },
      },
      select: {
        id: true,
        parentChunkId: true,
        headingL1: true,
        headingL2: true,
        headingL3: true,
      },
    });

    const parentIds = [
      ...new Set(
        chunksWithParent
          .map((c) => c.parentChunkId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const parentMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const parents = await prisma.documentChunk.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, content: true },
      });
      for (const p of parents) {
        parentMap.set(p.id, p.content);
      }
    }

    // Build a map from child chunk ID → parent content and headings.
    const childToParentContent = new Map<string, string>();
    const childToHeading = new Map<string, string>();
    for (const chunk of chunksWithParent) {
      if (chunk.parentChunkId) {
        const parentContent = parentMap.get(chunk.parentChunkId);
        if (parentContent) {
          childToParentContent.set(chunk.id, parentContent);
        }
      }
      const breadcrumbParts = [
        chunk.headingL1,
        chunk.headingL2,
        chunk.headingL3,
      ].filter(Boolean);
      if (breadcrumbParts.length > 0) {
        childToHeading.set(chunk.id, breadcrumbParts.join(' > '));
      }
    }

    // Enrich top results with parent content and heading breadcrumbs.
    for (const result of topResults) {
      if (result.parentContent === null) {
        result.parentContent = childToParentContent.get(result.chunkId) ?? null;
      }
      if (result.headingBreadcrumb === null) {
        result.headingBreadcrumb = childToHeading.get(result.chunkId) ?? null;
      }
    }
  }

  return topResults;
}
