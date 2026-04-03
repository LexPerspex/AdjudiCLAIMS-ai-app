/**
 * Document chunking and vector embedding service for RAG retrieval.
 *
 * Splits document extracted text into overlapping chunks and generates
 * vector embeddings via Voyage Large (through Vertex AI or direct API).
 *
 * Embeddings are stored in Vertex AI Vector Search (managed index), not
 * in-database. PlanetScale (MySQL) has no native vector type.
 *
 * When Voyage/Vector Search is not configured, chunks are stored in the
 * database without embeddings so the document pipeline is not broken
 * in local development.
 */

import { encode } from 'gpt-tokenizer';
import { prisma } from '../db.js';
import { upsertEmbeddings, removeEmbeddings, queryEmbeddings } from './vector-search.service.js';
import { generateHeadings, type DocumentContext } from './chunk-headings.service.js';
import { detectAtomicBlocks, assignChunkFlags } from './chunk-atomic.service.js';

// ---------------------------------------------------------------------------
// Token counting
// ---------------------------------------------------------------------------

/** Count tokens using cl100k_base encoding (compatible with Voyage/OpenAI). */
export function countTokens(text: string): number {
  return encode(text).length;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target chunk size in tokens. */
const TARGET_CHUNK_TOKENS = 512;

/** Maximum chunk size in tokens (small buffer for heading prepend). */
const MAX_CHUNK_TOKENS = 600;

/** Overlap between consecutive chunks in tokens. */
const OVERLAP_TOKENS = 60;

/** Legal-aware separators ordered from strongest to weakest boundary. */
const LEGAL_SEPARATORS = [
  '\n\n\n',     // Major section breaks
  '\n\n',       // Paragraph breaks
  '\n',         // Line breaks
  '. ',         // Sentence boundaries
  '; ',         // Clause boundaries
  ', ',         // Phrase boundaries
  ' ',          // Word boundaries
];

/**
 * Voyage Large embedding model identifier.
 * Used via Voyage AI API. Dimensions: 1024.
 */
const EMBEDDING_MODEL = 'voyage-large-4';

/** Embedding dimensionality produced by Voyage Large. */
const EMBEDDING_DIMENSIONS = 1024;

/** Maximum texts per single Voyage API call. */
const VOYAGE_BATCH_SIZE = 128;

/** Target parent chunk size in tokens (broader context for LLM). */
const PARENT_CHUNK_TOKENS = 2048;

/** Default number of results for similarity search. */
const DEFAULT_TOP_K = 5;

/**
 * Number of candidates to retrieve from Vector Search before re-ranking.
 * Re-ranking narrows these to topK for the final result.
 */
const RERANK_CANDIDATE_COUNT = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single result from vector similarity search.
 *
 * Similarity is computed as 1 - cosine_distance, where 1.0 indicates
 * identical vectors and 0.0 indicates orthogonal vectors. Results are
 * ranked by descending similarity, limited to topK (default 5).
 */
export interface SearchResult {
  /** Unique ID of the document chunk. */
  chunkId: string;
  /** ID of the parent document this chunk belongs to. */
  documentId: string;
  /** The text content of the chunk (child content for precise matching). */
  content: string;
  /** Parent chunk content for broader LLM context (null if no parent). */
  parentContent: string | null;
  /** 3-level heading breadcrumb for source attribution. */
  headingBreadcrumb: string | null;
  /** Cosine similarity score (0-1, higher = more relevant). */
  similarity: number;
}

// ---------------------------------------------------------------------------
// Voyage AI client
// ---------------------------------------------------------------------------

/**
 * Generate embeddings via Voyage AI API.
 * Returns null if not configured (missing VOYAGE_API_KEY).
 */
async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env['VOYAGE_API_KEY'];
  if (!apiKey) {
    return null;
  }

  try {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
      const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);

      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch,
          input_type: 'document',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Voyage AI API error (${String(response.status)}): ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      if (!data.data) {
        throw new Error(
          `Voyage AI returned no data for batch starting at index ${String(i)}`,
        );
      }

      for (const item of data.data) {
        const values = item.embedding;
        if (!values || values.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Voyage AI returned embedding with unexpected dimensions: ${String(values?.length ?? 0)} (expected ${String(EMBEDDING_DIMENSIONS)})`,
          );
        }
        allEmbeddings.push(values);
      }
    }

    return allEmbeddings;
  } catch (err) {
    console.error(
      '[embedding] Voyage AI call failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Generate a query embedding (uses "query" input_type for asymmetric search).
 */
async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const apiKey = process.env['VOYAGE_API_KEY'];
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [query],
        input_type: 'query',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping token-based chunks, respecting legal document
 * structure by preferring the strongest available separator.
 *
 * Strategy (recursive):
 *   1. If text fits in TARGET_CHUNK_TOKENS, return it as a single chunk.
 *   2. Try splitting on the strongest separator that produces segments.
 *   3. Accumulate segments until reaching TARGET_CHUNK_TOKENS.
 *   4. When a segment would exceed MAX_CHUNK_TOKENS, flush the current chunk
 *      and start a new one with OVERLAP_TOKENS of trailing text.
 *   5. If no separator works, fall back to word-level splitting.
 */
export function chunkText(text: string): string[] {
  if (!text.trim()) {
    return [];
  }

  if (countTokens(text) <= TARGET_CHUNK_TOKENS) {
    return [text];
  }

  return recursiveChunk(text);
}

/**
 * Recursive token-based chunking implementation.
 * Tries each legal separator in order from strongest to weakest, then
 * falls back to word-level splitting.
 */
function recursiveChunk(text: string): string[] {
  const textTokens = countTokens(text);

  // Base case: text fits in a single chunk.
  if (textTokens <= TARGET_CHUNK_TOKENS) {
    return text.trim() ? [text] : [];
  }

  // Try each separator in order of strength.
  for (const separator of LEGAL_SEPARATORS) {
    const segments = text.split(separator);
    if (segments.length <= 1) {
      continue; // This separator doesn't split the text.
    }

    // Accumulate segments into chunks.
    return accumulateSegments(segments, separator);
  }

  // Last resort: no separators worked, force-split by words.
  return forceWordSplit(text);
}

/**
 * Accumulate text segments into chunks of approximately TARGET_CHUNK_TOKENS,
 * adding OVERLAP_TOKENS of trailing context between consecutive chunks.
 */
function accumulateSegments(segments: string[], separator: string): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  for (const segment of segments) {
    if (!segment) continue;

    const candidate = currentChunk
      ? currentChunk + separator + segment
      : segment;

    const candidateTokens = countTokens(candidate);

    if (candidateTokens > MAX_CHUNK_TOKENS) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk);
      }

      // Build overlap from the end of the previous chunk.
      const overlap = getTrailingOverlap(currentChunk);

      // If the segment itself is too large, recurse into it.
      const segmentWithOverlap = overlap ? overlap + separator + segment : segment;
      if (countTokens(segmentWithOverlap) > MAX_CHUNK_TOKENS) {
        // Recurse: the segment (possibly with overlap) needs further splitting.
        const subChunks = recursiveChunk(segment);
        if (subChunks.length > 0) {
          // Prepend overlap to the first sub-chunk if it fits.
          if (overlap) {
            const firstWithOverlap = overlap + separator + subChunks[0]!;
            if (countTokens(firstWithOverlap) <= MAX_CHUNK_TOKENS) {
              subChunks[0] = firstWithOverlap;
            }
          }
          chunks.push(...subChunks);
          // Set currentChunk to empty; the last sub-chunk serves as context.
          currentChunk = '';
        }
      } else {
        currentChunk = segmentWithOverlap;
      }
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Extract trailing text from a chunk that is approximately OVERLAP_TOKENS long.
 * Splits on word boundaries to avoid cutting mid-word.
 */
function getTrailingOverlap(text: string): string {
  if (!text) return '';

  const words = text.split(/\s+/);
  let overlap = '';

  // Build from the end, word by word.
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = i < words.length - 1
      ? words[i]! + ' ' + overlap
      : words[i]!;
    if (countTokens(candidate) > OVERLAP_TOKENS) {
      break;
    }
    overlap = candidate;
  }

  return overlap;
}

/**
 * Force-split text by words when no structural separator is available.
 * Produces chunks of approximately TARGET_CHUNK_TOKENS with word-boundary
 * overlap between them.
 */
function forceWordSplit(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let currentWords: string[] = [];
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = countTokens(word);
    const spaceToken = currentWords.length > 0 ? 1 : 0;

    if (currentTokens + wordTokens + spaceToken > TARGET_CHUNK_TOKENS && currentWords.length > 0) {
      chunks.push(currentWords.join(' '));

      // Start new chunk with overlap from the tail of the current words.
      const overlapWords: string[] = [];
      let overlapTokenCount = 0;
      for (let i = currentWords.length - 1; i >= 0; i--) {
        const wt = countTokens(currentWords[i]!);
        if (overlapTokenCount + wt + (overlapWords.length > 0 ? 1 : 0) > OVERLAP_TOKENS) {
          break;
        }
        overlapWords.unshift(currentWords[i]!);
        overlapTokenCount += wt + (overlapWords.length > 1 ? 1 : 0);
      }

      currentWords = [...overlapWords, word];
      currentTokens = countTokens(currentWords.join(' '));
    } else {
      currentWords.push(word);
      currentTokens += wordTokens + spaceToken;
    }
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

/**
 * Split a string on sentence boundaries. Uses ". " as the primary
 * delimiter, preserving the period with the preceding sentence.
 */
function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=\.)\s+/);
  const result: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed) {
      result.push(trimmed);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Chunk a document's extracted text and generate vector embeddings.
 *
 * Full pipeline (6 upgrades integrated):
 *   1. Reads the document's extractedText + classification metadata.
 *   2. Detects atomic blocks (tables, numbered steps, legal citations).
 *   3. Two-pass chunking: parent chunks (2048 tokens) + child chunks (512 tokens).
 *   4. Generates 3-level headings (L1 document, L2 section, L3 topic).
 *   5. Builds contextual prefix from headings for embedding quality.
 *   6. Embeds child chunks only (parents stored for LLM context, not indexed).
 *   7. Stores all chunks with metadata in PlanetScale.
 *   8. Upserts child embedding vectors to Vertex AI Vector Search.
 *
 * @param documentId - ID of the document to chunk and embed.
 * @returns Number of child chunks created (excludes parent chunks).
 */
export async function chunkAndEmbed(documentId: string): Promise<number> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      extractedText: true,
      documentType: true,
      documentSubtype: true,
      fileName: true,
      extractedFields: {
        select: { fieldName: true, fieldValue: true },
      },
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    return 0;
  }

  const text = document.extractedText;

  // --- Step 1: Detect atomic blocks ---
  const atomicBlocks = detectAtomicBlocks(text);

  // --- Step 2: Two-pass chunking (parent + child) ---
  const parentChunks = chunkTextWithTarget(text, PARENT_CHUNK_TOKENS);
  const childChunks = chunkText(text);

  if (childChunks.length === 0) {
    return 0;
  }

  // --- Step 3: Generate headings for child chunks ---
  const docContext: DocumentContext = {
    documentType: document.documentType,
    documentSubtype: document.documentSubtype,
    fileName: document.fileName,
    extractedFields: document.extractedFields,
  };

  const headings = await generateHeadings(childChunks, docContext);

  // --- Step 4: Assign atomic flags to child chunks ---
  const chunkFlags = assignChunkFlags(childChunks, text, atomicBlocks);

  // --- Step 5: Build embedding text (context prefix + chunk content) ---
  const embeddingTexts = childChunks.map((chunk, i) => {
    const heading = headings[i];
    const prefix = heading?.combined ?? '';
    return prefix ? `${prefix}\n\n${chunk}` : chunk;
  });

  // --- Step 6: Generate embeddings for child chunks only ---
  const embeddings = await generateEmbeddings(embeddingTexts);

  // --- Step 7: Clean up old chunks and embeddings ---
  const oldChunks = await prisma.documentChunk.findMany({
    where: { documentId },
    select: { id: true, isParent: true },
  });
  if (oldChunks.length > 0) {
    const childIds = oldChunks.filter((c) => !c.isParent).map((c) => `chunk:${c.id}`);
    if (childIds.length > 0) {
      await removeEmbeddings(childIds);
    }
  }
  await prisma.documentChunk.deleteMany({
    where: { documentId },
  });

  // --- Step 8: Insert parent chunks ---
  const createdParents = await prisma.$transaction(async (tx) => {
    const created: Array<{ id: string }> = [];
    for (let i = 0; i < parentChunks.length; i++) {
      const content = parentChunks[i] ?? '';
      if (!content) continue;
      const chunk = await tx.documentChunk.create({
        data: {
          documentId,
          content,
          chunkIndex: i,
          isParent: true,
          tokenCount: countTokens(content),
        },
        select: { id: true },
      });
      created.push(chunk);
    }
    return created;
  });

  // --- Step 9: Link children to parents by text overlap ---
  const parentTextMap = parentChunks.map((text, i) => ({
    id: createdParents[i]?.id ?? '',
    text,
  }));

  function findParentId(childText: string): string | null {
    // Find the parent whose text contains the largest overlap with the child
    let bestParentId: string | null = null;
    let bestOverlap = 0;
    for (const parent of parentTextMap) {
      if (!parent.id) continue;
      // Check if child text appears within parent text
      if (parent.text.includes(childText)) {
        return parent.id;
      }
      // Approximate overlap by checking first 100 chars of child in parent
      const probe = childText.substring(0, 100);
      const idx = parent.text.indexOf(probe);
      if (idx !== -1 && probe.length > bestOverlap) {
        bestOverlap = probe.length;
        bestParentId = parent.id;
      }
    }
    return bestParentId;
  }

  // --- Step 10: Insert child chunks with metadata ---
  const createdChildren = await prisma.$transaction(async (tx) => {
    const created: Array<{ id: string }> = [];
    for (let i = 0; i < childChunks.length; i++) {
      const content = childChunks[i] ?? '';
      if (!content) continue;
      const heading = headings[i];
      const flags = chunkFlags[i];
      const parentId = findParentId(content);

      const chunk = await tx.documentChunk.create({
        data: {
          documentId,
          content,
          chunkIndex: i,
          isParent: false,
          parentChunkId: parentId,
          headingL1: heading?.l1 ?? null,
          headingL2: heading?.l2 ?? null,
          headingL3: heading?.l3 ?? null,
          contextPrefix: heading?.combined ?? null,
          tokenCount: countTokens(content),
          containsTable: flags?.containsTable ?? false,
          containsProcedure: flags?.containsProcedure ?? false,
          isContinuation: flags?.isContinuation ?? false,
          hasContinuation: flags?.hasContinuation ?? false,
        },
        select: { id: true },
      });
      created.push(chunk);
    }
    return created;
  });

  // --- Step 11: Upsert child embeddings to Vector Search ---
  if (embeddings) {
    const datapoints = createdChildren
      .map((chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding) return null;
        return { id: `chunk:${chunk.id}`, embedding };
      })
      .filter((dp): dp is { id: string; embedding: number[] } => dp !== null);

    if (datapoints.length > 0) {
      await upsertEmbeddings(datapoints);
    }
  }

  return createdChildren.length;
}

/**
 * Chunk text with a custom target token count.
 * Used for parent chunks (2048 tokens) vs child chunks (512 tokens).
 */
function chunkTextWithTarget(text: string, targetTokens: number): string[] {
  if (!text.trim()) return [];
  if (countTokens(text) <= targetTokens) return [text];

  const maxTokens = Math.ceil(targetTokens * 1.15);
  const overlapTokens = Math.ceil(targetTokens * 0.1);
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const candidate = currentChunk
      ? currentChunk + '\n\n' + paragraph
      : paragraph;

    if (countTokens(candidate) > maxTokens && currentChunk.trim()) {
      chunks.push(currentChunk);
      const overlap = getTrailingOverlapTokens(currentChunk, overlapTokens);
      currentChunk = overlap ? overlap + '\n\n' + paragraph : paragraph;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Get trailing overlap of approximately the specified token count.
 */
function getTrailingOverlapTokens(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  let overlap = '';
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = i < words.length - 1 ? words[i]! + ' ' + overlap : words[i]!;
    if (countTokens(candidate) > overlapTokens) break;
    overlap = candidate;
  }
  return overlap;
}

/**
 * Search document chunks by cosine similarity to a query, scoped to a claim.
 *
 * Flow: Query → Voyage embed → Vector Search (top-N) → DB lookup → results.
 * Re-ranking integration point: caller can pass results through reranker.service.ts.
 *
 * @param query - Natural language query to search for.
 * @param claimId - Claim ID to scope the search to.
 * @param topK - Maximum number of results to return (default 5).
 * @returns Ranked search results with similarity scores.
 */
export async function similaritySearch(
  query: string,
  claimId: string,
  topK: number = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  const queryEmbedding = await generateQueryEmbedding(query);
  if (!queryEmbedding) {
    return [];
  }

  // Query Vector Search for top-N candidates (more than topK for re-ranking).
  const candidateCount = Math.max(topK, RERANK_CANDIDATE_COUNT);
  const vectorResults = await queryEmbeddings(queryEmbedding, candidateCount);
  if (vectorResults.length === 0) {
    return [];
  }

  // Extract chunk IDs from vector results (format: "chunk:{chunkId}").
  const chunkIds = vectorResults
    .map((r) => r.id.replace('chunk:', ''))
    .filter((id) => id.length > 0);

  if (chunkIds.length === 0) {
    return [];
  }

  // Fetch child chunk content + parent reference, scoped to the claim.
  const dbChunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: chunkIds },
      isParent: false,
      document: { claimId },
    },
    select: {
      id: true,
      documentId: true,
      content: true,
      parentChunkId: true,
      headingL1: true,
      headingL2: true,
      headingL3: true,
    },
  });

  // Fetch parent chunks for broader LLM context.
  const parentIds = [...new Set(
    dbChunks
      .map((c) => c.parentChunkId)
      .filter((id): id is string => id !== null),
  )];
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

  // Build a lookup for ordering by vector distance.
  const distanceMap = new Map(vectorResults.map((r) => [r.id.replace('chunk:', ''), r.distance]));

  // Map and sort by similarity (1 - distance).
  const results: SearchResult[] = dbChunks
    .map((chunk) => {
      const breadcrumbParts = [chunk.headingL1, chunk.headingL2, chunk.headingL3].filter(Boolean);
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        parentContent: chunk.parentChunkId ? (parentMap.get(chunk.parentChunkId) ?? null) : null,
        headingBreadcrumb: breadcrumbParts.length > 0 ? breadcrumbParts.join(' > ') : null,
        similarity: 1 - (distanceMap.get(chunk.id) ?? 1.0),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}
