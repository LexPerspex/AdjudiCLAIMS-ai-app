/**
 * Temporal activities for the document processing pipeline.
 *
 * Each activity wraps an existing service function. Activities run in normal
 * Node.js (not the V8 workflow sandbox) so they CAN import Prisma, services,
 * and any other Node.js modules.
 *
 * Error strategy:
 *   - Transient errors (network, API timeouts) are allowed to propagate so
 *     Temporal's retry policy can handle them.
 *   - Non-retryable errors (bad document, missing record) are caught and
 *     returned as a structured failure result.
 */

import { ApplicationFailure } from '@temporalio/activity';
import { processDocument } from '../../services/ocr.service.js';
import { classifyDocument as classifyDocumentService } from '../../services/document-classifier.service.js';
import { extractFields as extractFieldsService } from '../../services/field-extraction.service.js';
import { chunkAndEmbed as chunkAndEmbedService } from '../../services/embedding.service.js';
import { generateTimelineEvents } from '../../services/timeline.service.js';

// ---------------------------------------------------------------------------
// Activity: OCR
// ---------------------------------------------------------------------------

/**
 * Activity: Extract text from a document via Google Document AI (OCR).
 *
 * This is the first and most critical pipeline step — all subsequent activities
 * depend on the extracted text. Non-retryable for missing documents (no point
 * retrying if the record doesn't exist). Transient errors (network, API) are
 * allowed to propagate for Temporal's retry policy.
 *
 * @param documentId - Prisma Document record ID.
 * @returns Success indicator; error message on failure.
 * @throws ApplicationFailure.nonRetryable if the document record is not found.
 */
export async function processOcr(
  documentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await processDocument(documentId);
    return { success: true };
  } catch (err) {
    // Non-retryable: document not found
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'DOCUMENT_NOT_FOUND');
    }
    // Let transient errors propagate for Temporal retry
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: Classification
// ---------------------------------------------------------------------------

/**
 * Activity: Classify a document by its extracted text using keyword matching.
 *
 * Determines the document type (e.g., MEDICAL_REPORT, DWC1_CLAIM_FORM) to
 * enable downstream features like auto-completion of investigation items and
 * type-specific field extraction.
 *
 * @param documentId - Prisma Document record ID (must have extracted text).
 * @returns Success indicator with the classified document type.
 * @throws ApplicationFailure.nonRetryable if the document is not found.
 */
export async function classifyDocument(
  documentId: string,
): Promise<{ success: boolean; documentType?: string; error?: string }> {
  try {
    const result = await classifyDocumentService(documentId);
    return { success: true, documentType: result.documentType };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'DOCUMENT_NOT_FOUND');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: Field Extraction
// ---------------------------------------------------------------------------

/**
 * Activity: Extract structured fields (dates, amounts, names) from document text.
 *
 * Uses a two-pass approach: regex patterns for common fields, then Claude API
 * for document-type-specific fields. Results are persisted to extracted_fields table.
 *
 * @param documentId - Prisma Document record ID (must have extracted text).
 * @returns Success indicator with the count of fields extracted.
 * @throws ApplicationFailure.nonRetryable if the document is not found.
 */
export async function extractFields(
  documentId: string,
): Promise<{ success: boolean; fieldCount: number; error?: string }> {
  try {
    const fields = await extractFieldsService(documentId);
    return { success: true, fieldCount: fields.length };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'DOCUMENT_NOT_FOUND');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: Chunking + Embedding
// ---------------------------------------------------------------------------

/**
 * Activity: Split document text into chunks and generate vector embeddings.
 *
 * Creates overlapping text chunks for RAG retrieval and generates 768-dimensional
 * embeddings via Vertex AI. Chunks are stored without embeddings when Vertex AI
 * is not configured, preserving the pipeline for local development.
 *
 * @param documentId - Prisma Document record ID (must have extracted text).
 * @returns Success indicator with the count of chunks created.
 * @throws ApplicationFailure.nonRetryable if the document is not found.
 */
export async function chunkAndEmbed(
  documentId: string,
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    const chunkCount = await chunkAndEmbedService(documentId);
    return { success: true, chunkCount };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'DOCUMENT_NOT_FOUND');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: Timeline Generation
// ---------------------------------------------------------------------------

/**
 * Activity: Extract date-based timeline events from document text.
 *
 * Parses date references and classifies them by surrounding context (injury,
 * filing, payment, medical evaluation, etc.) to build the claim timeline.
 *
 * @param documentId - Prisma Document record ID (must have extracted text).
 * @returns Success indicator with the count of timeline events created.
 * @throws ApplicationFailure.nonRetryable if the document is not found.
 */
export async function generateTimeline(
  documentId: string,
): Promise<{ success: boolean; eventCount: number; error?: string }> {
  try {
    const eventCount = await generateTimelineEvents(documentId);
    return { success: true, eventCount };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'DOCUMENT_NOT_FOUND');
    }
    throw err;
  }
}
