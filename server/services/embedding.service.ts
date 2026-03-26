/**
 * Document chunking and vector embedding service for RAG retrieval.
 *
 * Splits document extracted text into overlapping chunks and generates
 * vector embeddings via Vertex AI text-embedding-005 (768 dimensions).
 *
 * When Vertex AI is not configured (missing VERTEX_AI_PROJECT), chunks
 * are stored without embeddings so the document pipeline is not broken
 * in local development.
 */

import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target chunk size in characters (~500 tokens at ~4 chars/token). */
const MIN_CHUNK_CHARS = 2000;

/** Maximum chunk size in characters (~1000 tokens at ~4 chars/token). */
const MAX_CHUNK_CHARS = 4000;

/** Overlap between consecutive chunks in characters (~100 tokens). */
const OVERLAP_CHARS = 400;

/** Vertex AI embedding model identifier. */
const EMBEDDING_MODEL = 'text-embedding-005';

/**
 * Embedding dimensionality produced by text-embedding-005.
 *
 * 768 dimensions is the native output size of Google's text-embedding-005 model.
 * This matches the pgvector column definition: `embedding vector(768)`.
 * Using the model's native dimensionality avoids the accuracy loss from
 * truncation while keeping storage and search costs reasonable.
 */
const EMBEDDING_DIMENSIONS = 768;

/** Maximum texts per single Vertex AI predict call. */
const VERTEX_BATCH_SIZE = 250;

/** Default number of results for similarity search. */
const DEFAULT_TOP_K = 5;

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
// Vertex AI client (lazy singleton)
// ---------------------------------------------------------------------------

let predictionClient: PredictionServiceClient | null = null;

function getVertexConfig(): { project: string; location: string; endpoint: string } | null {
  const project = process.env['VERTEX_AI_PROJECT'];
  if (!project) {
    return null;
  }
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'us-central1';
  const endpoint = `${location}-aiplatform.googleapis.com`;
  return { project, location, endpoint };
}

function getPredictionClient(): PredictionServiceClient | null {
  const config = getVertexConfig();
  if (!config) {
    return null;
  }
  if (!predictionClient) {
    predictionClient = new PredictionServiceClient({
      apiEndpoint: config.endpoint,
    });
  }
  return predictionClient;
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
          // Edge case: even a single sentence plus overlap exceeds max.
          // Flush whatever we have and start fresh.
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
      // Flush the current chunk and start a new one with overlap.
      chunks.push(currentChunk);
      overlapPrefix = currentChunk.slice(-OVERLAP_CHARS);
      currentChunk = overlapPrefix + trimmed;
    } else {
      currentChunk = candidate;
    }
  }

  // Flush any remaining content.
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
// Embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for an array of text strings via Vertex AI.
 * Returns null if Vertex AI is not configured.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  const client = getPredictionClient();
  const config = getVertexConfig();
  if (!client || !config) {
    return null;
  }

  try {
    const allEmbeddings: number[][] = [];

    // Process in batches to respect API limits.
    for (let i = 0; i < texts.length; i += VERTEX_BATCH_SIZE) {
      const batch = texts.slice(i, i + VERTEX_BATCH_SIZE);

      const instances = batch.map((content) =>
        helpers.toValue({ content }),
      );

      const parameters = helpers.toValue({
        outputDimensionality: EMBEDDING_DIMENSIONS,
      });

      const endpoint = `projects/${config.project}/locations/${config.location}/publishers/google/models/${EMBEDDING_MODEL}`;

      const predictResult = await client.predict({
        endpoint,
        instances: instances as { [key: string]: unknown }[],
        parameters: parameters as { [key: string]: unknown },
      });

      const response = predictResult[0];

      if (!response.predictions) {
        throw new Error(
          `Vertex AI returned no predictions for batch starting at index ${String(i)}`,
        );
      }

      for (const prediction of response.predictions) {
        const parsed = helpers.fromValue(prediction as { kind?: string; [key: string]: unknown }) as {
          embeddings?: { values?: number[] };
        } | null;

        const values = parsed?.embeddings?.values;
        if (!values || values.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Vertex AI returned embedding with unexpected dimensions: ${String(values?.length ?? 0)} (expected ${String(EMBEDDING_DIMENSIONS)})`,
          );
        }

        allEmbeddings.push(values);
      }
    }

    return allEmbeddings;
  } catch {
    // Vertex AI call failed (auth error, quota, network, etc.).
    // Return null so chunks are stored without embeddings rather than
    // crashing the entire document pipeline.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Chunk a document's extracted text and generate vector embeddings.
 *
 * 1. Reads the document's extractedText from the database.
 * 2. Splits into overlapping chunks.
 * 3. Generates embeddings via Vertex AI (or stores null if not configured).
 * 4. Upserts chunk rows into document_chunks (deletes old chunks first).
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
    // Nothing to chunk -- document has no extracted text yet.
    return 0;
  }

  const chunks = chunkText(document.extractedText);
  if (chunks.length === 0) {
    return 0;
  }

  // Generate embeddings (returns null when Vertex AI is not configured).
  const embeddings = await generateEmbeddings(chunks);

  // Replace any existing chunks for this document in a transaction.
  await prisma.$transaction(async (tx) => {
    // Delete old chunks.
    await tx.documentChunk.deleteMany({
      where: { documentId },
    });

    // Insert new chunks. We use raw SQL for the embedding column because
    // Prisma does not natively support the pgvector type.
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i] ?? '';
      if (!content) continue;
      const embedding = embeddings?.[i] ?? null;

      if (embedding) {
        await tx.$executeRaw`
          INSERT INTO document_chunks (id, document_id, content, chunk_index, embedding)
          VALUES (
            gen_random_uuid()::text,
            ${documentId},
            ${content},
            ${i},
            ${vectorLiteral(embedding)}::vector(768)
          )
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO document_chunks (id, document_id, content, chunk_index, embedding)
          VALUES (
            gen_random_uuid()::text,
            ${documentId},
            ${content},
            ${i},
            NULL
          )
        `;
      }
    }
  });

  return chunks.length;
}

/**
 * Search document chunks by cosine similarity to a query, scoped to a claim.
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
  const embeddings = await generateEmbeddings([query]);

  if (!embeddings || embeddings.length === 0) {
    // Vertex AI not configured -- cannot perform vector search.
    // Fall back to returning an empty result set.
    return [];
  }

  const queryEmbedding = embeddings[0];
  if (!queryEmbedding) {
    return [];
  }

  const results = await prisma.$queryRaw<
    Array<{
      chunk_id: string;
      document_id: string;
      content: string;
      similarity: number;
    }>
  >`
    SELECT
      dc.id AS chunk_id,
      dc.document_id,
      dc.content,
      1 - (dc.embedding <=> ${vectorLiteral(queryEmbedding)}::vector(768)) AS similarity
    FROM document_chunks dc
    INNER JOIN documents d ON d.id = dc.document_id
    WHERE d.claim_id = ${claimId}
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> ${vectorLiteral(queryEmbedding)}::vector(768) ASC
    LIMIT ${topK}
  `;

  return results.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    content: row.content,
    similarity: row.similarity,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a number array to a pgvector-compatible string literal: "[1,2,3]".
 */
function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
