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
