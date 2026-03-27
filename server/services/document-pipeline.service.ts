/**
 * Document processing pipeline orchestrator.
 *
 * Orchestrates the full document lifecycle after upload:
 *   1. OCR  — Extract text via Document AI
 *   2. Classify — Determine document type (stub classifier)
 *   3. Extract fields — Pull structured data from text
 *   4. Chunk + Embed — Create vector embeddings for RAG
 *   5. Timeline — Extract date-based events
 *
 * Each step is independent and fault-tolerant — a failure in one step
 * does not prevent subsequent steps from running (where possible).
 * Status is tracked on the Document record via ocrStatus.
 */

import { prisma } from '../db.js';
import { processDocument } from './ocr.service.js';
import { classifyDocument } from './document-classifier.service.js';
import { extractFields } from './field-extraction.service.js';
import { chunkAndEmbed } from './embedding.service.js';
import { generateTimelineEvents } from './timeline.service.js';
import { enrichGraph } from './graph/graph-enrichment.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Summary of document processing pipeline execution.
 *
 * Each pipeline stage reports success/failure independently. OCR is the
 * critical gate: if it fails, no subsequent stages can run (no text to
 * process). All other stages are fault-tolerant — a failure in classification
 * does not prevent field extraction or embedding, because each stage operates
 * on the raw extracted text independently. This design maximizes data
 * extraction even when individual stages encounter errors.
 */
export interface PipelineResult {
  /** The document that was processed. */
  documentId: string;
  /** Whether OCR text extraction succeeded (gate for all subsequent stages). */
  ocrSuccess: boolean;
  /** Whether document type classification succeeded. */
  classificationSuccess: boolean;
  /** Whether structured field extraction succeeded. */
  extractionSuccess: boolean;
  /** Whether chunking and vector embedding succeeded. */
  embeddingSuccess: boolean;
  /** Whether timeline event extraction succeeded. */
  timelineSuccess: boolean;
  /** Whether graph enrichment succeeded. */
  graphEnrichmentSuccess: boolean;
  /** Number of vector embedding chunks created for RAG retrieval. */
  chunksCreated: number;
  /** Number of structured fields extracted (dates, names, amounts, etc.). */
  fieldsExtracted: number;
  /** Number of timeline events created from date references in the text. */
  timelineEventsCreated: number;
  /** Number of graph nodes created during enrichment. */
  graphNodesCreated: number;
  /** Number of graph edges created during enrichment. */
  graphEdgesCreated: number;
  /** Error messages from any failed stages. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full document processing pipeline for a single document.
 *
 * This is designed to be called asynchronously after document upload.
 * It runs each step sequentially since later steps depend on earlier
 * outputs (e.g., classification needs OCR text).
 *
 * @param documentId - The document to process.
 * @returns Summary of what succeeded and what failed.
 */
export async function processDocumentPipeline(
  documentId: string,
): Promise<PipelineResult> {
  const result: PipelineResult = {
    documentId,
    ocrSuccess: false,
    classificationSuccess: false,
    extractionSuccess: false,
    embeddingSuccess: false,
    timelineSuccess: false,
    graphEnrichmentSuccess: false,
    chunksCreated: 0,
    fieldsExtracted: 0,
    timelineEventsCreated: 0,
    graphNodesCreated: 0,
    graphEdgesCreated: 0,
    errors: [],
  };

  // --- Step 1: OCR ---
  try {
    await processDocument(documentId);
    result.ocrSuccess = true;
  } catch (err) {
    result.errors.push(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
    // Cannot continue without text — mark and return early
    return result;
  }

  // --- Step 2: Classification ---
  try {
    await classifyDocument(documentId);
    result.classificationSuccess = true;
  } catch (err) {
    result.errors.push(`Classification failed: ${err instanceof Error ? err.message : String(err)}`);
    // Non-fatal — continue with extraction
  }

  // --- Step 3: Field extraction ---
  try {
    const fields = await extractFields(documentId);
    result.fieldsExtracted = fields.length;
    result.extractionSuccess = true;
  } catch (err) {
    result.errors.push(`Field extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Step 4: Chunking + Embedding ---
  try {
    const chunks = await chunkAndEmbed(documentId);
    result.chunksCreated = chunks;
    result.embeddingSuccess = true;
  } catch (err) {
    result.errors.push(`Chunking/embedding failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Step 5: Timeline events ---
  try {
    const events = await generateTimelineEvents(documentId);
    result.timelineEventsCreated = events;
    result.timelineSuccess = true;
  } catch (err) {
    result.errors.push(`Timeline generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Step 6: Graph enrichment ---
  try {
    const graphResult = await enrichGraph(documentId);
    result.graphNodesCreated = graphResult.nodesCreated;
    result.graphEdgesCreated = graphResult.edgesCreated;
    result.graphEnrichmentSuccess = true;
    if (graphResult.errors.length > 0) {
      result.errors.push(...graphResult.errors.map((e) => `Graph enrichment: ${e}`));
    }
  } catch (err) {
    result.errors.push(`Graph enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Log audit event for pipeline completion
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { claimId: true },
    });

    if (doc) {
      await prisma.auditEvent.create({
        data: {
          userId: 'system',
          claimId: doc.claimId,
          eventType: 'DOCUMENT_CLASSIFIED',
          eventData: {
            documentId,
            ocrSuccess: result.ocrSuccess,
            classificationSuccess: result.classificationSuccess,
            fieldsExtracted: result.fieldsExtracted,
            chunksCreated: result.chunksCreated,
            timelineEventsCreated: result.timelineEventsCreated,
            graphNodesCreated: result.graphNodesCreated,
            graphEdgesCreated: result.graphEdgesCreated,
            errors: result.errors,
          },
        },
      });
    }
  } catch {
    // Audit failure should never fail the pipeline
  }

  return result;
}
