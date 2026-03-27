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

import { prisma } from '../db.js';
import { upsertEmbeddings, removeEmbeddings, queryEmbeddings } from './vector-search.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target chunk size in characters (~500 tokens at ~4 chars/token). */
const MIN_CHUNK_CHARS = 2000;

/** Maximum chunk size in characters (~1000 tokens at ~4 chars/token). */
const MAX_CHUNK_CHARS = 4000;

/** Overlap between consecutive chunks in characters (~100 tokens). */
const OVERLAP_CHARS = 400;

/**
 * Voyage Large embedding model identifier.
 * Used via Voyage AI API. Dimensions TBD — defaults to 1024.
 */
const EMBEDDING_MODEL = 'voyage-large-2';

/** Embedding dimensionality produced by Voyage Large. */
const EMBEDDING_DIMENSIONS = 1024;

/** Maximum texts per single Voyage API call. */
const VOYAGE_BATCH_SIZE = 128;

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
  /** The text content of the chunk. */
  content: string;
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
 * Split text into overlapping chunks, preferring paragraph then sentence
 * boundaries.
 *
 * Strategy:
 *   1. Split on paragraph boundaries (double newline).
 *   2. Accumulate paragraphs until the chunk reaches MIN_CHUNK_CHARS.
 *   3. If a single paragraph exceeds MAX_CHUNK_CHARS, split it on sentence
 *      boundaries (". ") and accumulate sentences instead.
 *   4. Apply OVERLAP_CHARS of trailing text from the previous chunk as a
 *      prefix to the next chunk.
 */
export function chunkText(text: string): string[] {
  if (!text.trim()) {
    return [];
  }

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';
  let overlapPrefix = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }

    // If a single paragraph is larger than MAX_CHUNK_CHARS, break it into
    // sentence-level fragments and process each as if it were a paragraph.
    if (trimmed.length > MAX_CHUNK_CHARS) {
      const sentences = splitSentences(trimmed);
      for (const sentence of sentences) {
        const candidate = currentChunk
          ? currentChunk + ' ' + sentence
          : overlapPrefix + sentence;

        if (candidate.length > MAX_CHUNK_CHARS && currentChunk.length >= MIN_CHUNK_CHARS) {
          chunks.push(currentChunk);
          overlapPrefix = currentChunk.slice(-OVERLAP_CHARS);
          currentChunk = overlapPrefix + sentence;
        } else if (candidate.length > MAX_CHUNK_CHARS && currentChunk.length < MIN_CHUNK_CHARS) {
          if (currentChunk) {
            chunks.push(currentChunk);
            overlapPrefix = currentChunk.slice(-OVERLAP_CHARS);
          }
          currentChunk = overlapPrefix + sentence;
          if (currentChunk.length > MAX_CHUNK_CHARS) {
            chunks.push(currentChunk);
            overlapPrefix = currentChunk.slice(-OVERLAP_CHARS);
            currentChunk = '';
          }
        } else {
          currentChunk = candidate;
        }
      }
      continue;
    }

    const candidate = currentChunk
      ? currentChunk + '\n\n' + trimmed
      : overlapPrefix + trimmed;

    if (candidate.length > MAX_CHUNK_CHARS && currentChunk.length >= MIN_CHUNK_CHARS) {
      chunks.push(currentChunk);
      overlapPrefix = currentChunk.slice(-OVERLAP_CHARS);
      currentChunk = overlapPrefix + trimmed;
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
 * 1. Reads the document's extractedText from the database.
 * 2. Splits into overlapping chunks.
 * 3. Generates embeddings via Voyage Large (or skips if not configured).
 * 4. Stores chunks in PlanetScale (text only, no embedding column).
 * 5. Upserts embedding vectors to Vertex AI Vector Search index.
 *
 * @param documentId - ID of the document to chunk and embed.
 * @returns Number of chunks created.
 */
export async function chunkAndEmbed(documentId: string): Promise<number> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, extractedText: true },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    return 0;
  }

  const chunks = chunkText(document.extractedText);
  if (chunks.length === 0) {
    return 0;
  }

  // Generate embeddings (returns null when Voyage AI is not configured).
  const embeddings = await generateEmbeddings(chunks);

  // Delete old chunks for this document.
  await prisma.documentChunk.deleteMany({
    where: { documentId },
  });

  // Remove old embeddings from Vector Search index.
  const oldChunks = await prisma.documentChunk.findMany({
    where: { documentId },
    select: { id: true },
  });
  if (oldChunks.length > 0) {
    await removeEmbeddings(oldChunks.map((c) => `chunk:${c.id}`));
  }

  // Insert new chunks via Prisma (no raw SQL needed — no embedding column).
  const createdChunks = await prisma.$transaction(async (tx) => {
    const created: Array<{ id: string }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i] ?? '';
      if (!content) continue;
      const chunk = await tx.documentChunk.create({
        data: {
          documentId,
          content,
          chunkIndex: i,
        },
        select: { id: true },
      });
      created.push(chunk);
    }
    return created;
  });

  // Upsert embeddings to Vertex AI Vector Search.
  if (embeddings) {
    const datapoints = createdChunks
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

  return createdChunks.length;
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

  // Fetch chunk content from PlanetScale, scoped to the claim.
  const dbChunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: chunkIds },
      document: { claimId },
    },
    select: {
      id: true,
      documentId: true,
      content: true,
    },
  });

  // Build a lookup for ordering by vector distance.
  const distanceMap = new Map(vectorResults.map((r) => [r.id.replace('chunk:', ''), r.distance]));

  // Map and sort by similarity (1 - distance).
  const results: SearchResult[] = dbChunks
    .map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      similarity: 1 - (distanceMap.get(chunk.id) ?? 1.0),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}
