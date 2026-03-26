/**
 * OCR service — wraps Google Document AI for text extraction.
 *
 * Processes uploaded documents through Document AI and persists the
 * extracted text back to the Document record in Prisma.
 *
 * Environment variables required:
 *   DOCUMENT_AI_PROJECT   — GCP project ID hosting the processor
 *   DOCUMENT_AI_LOCATION  — Processor region (default: 'us')
 *   DOCUMENT_AI_PROCESSOR — Processor ID
 */

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { prisma } from '../db.js';
import { storageService } from './storage.service.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getProcessorName(): string {
  const project = process.env['DOCUMENT_AI_PROJECT'];
  const location = process.env['DOCUMENT_AI_LOCATION'] ?? 'us';
  const processor = process.env['DOCUMENT_AI_PROCESSOR'];

  if (!project || !processor) {
    throw new Error(
      'Document AI is not configured. Set DOCUMENT_AI_PROJECT and DOCUMENT_AI_PROCESSOR environment variables.',
    );
  }

  return `projects/${project}/locations/${location}/processors/${processor}`;
}

// ---------------------------------------------------------------------------
// Lazy-initialised client (created once, reused across calls)
// ---------------------------------------------------------------------------

let clientInstance: DocumentProcessorServiceClient | undefined;

function getClient(): DocumentProcessorServiceClient {
  if (!clientInstance) {
    clientInstance = new DocumentProcessorServiceClient();
  }
  return clientInstance;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a document through Google Document AI and persist the extracted text.
 *
 * Pipeline:
 * 1. Fetch the Document record for fileUrl and mimeType
 * 2. Set ocrStatus to PROCESSING (allows UI to show progress)
 * 3. Download file bytes from GCS (or local filesystem in dev)
 * 4. Send to Document AI for text extraction
 * 5. Persist extracted text and set ocrStatus to COMPLETE
 * 6. On failure: set ocrStatus to FAILED and re-throw
 *
 * The Document AI client is lazy-initialized (created once, reused) to avoid
 * creating a new gRPC connection per document, which would be expensive.
 *
 * @param documentId - Prisma Document record ID.
 * @returns The extracted text content.
 * @throws If the document record is not found, Document AI is misconfigured,
 *         or the processor returns no text.
 */
export async function processDocument(documentId: string): Promise<string> {
  // 1. Fetch the Document record to obtain fileUrl and mimeType.
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // 2. Mark as PROCESSING so callers can observe progress.
  await prisma.document.update({
    where: { id: documentId },
    data: { ocrStatus: 'PROCESSING' },
  });

  try {
    // 3. Download file bytes from storage.
    const fileBuffer = await storageService.download(document.fileUrl);

    // 4. Send to Document AI.
    const processorName = getProcessorName();
    const client = getClient();

    const [result] = await client.processDocument({
      name: processorName,
      rawDocument: {
        content: fileBuffer.toString('base64'),
        mimeType: document.mimeType,
      },
    });

    // 5. Extract text from the response.
    const extractedText = result.document?.text ?? '';

    if (!extractedText) {
      throw new Error(
        `Document AI returned no text for document ${documentId}`,
      );
    }

    // 6. Persist extracted text and mark COMPLETE.
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedText,
        ocrStatus: 'COMPLETE',
      },
    });

    return extractedText;
  } catch (error: unknown) {
    // 7. On any failure, mark FAILED and re-throw.
    await prisma.document.update({
      where: { id: documentId },
      data: { ocrStatus: 'FAILED' },
    });

    throw error;
  }
}
