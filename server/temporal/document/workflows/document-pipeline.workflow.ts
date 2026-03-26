/**
 * Document processing pipeline workflow.
 *
 * Orchestrates the full document lifecycle:
 *   1. OCR — extract text via Document AI
 *   2. Classify — determine document type
 *   3. Extract fields — pull structured data
 *   4. Chunk + Embed — create vector embeddings for RAG
 *   5. Timeline — extract date-based events
 *
 * V8 SANDBOX RULES:
 *   - This file runs inside Temporal's deterministic V8 sandbox.
 *   - CANNOT import Node.js modules, Prisma, services, or any non-workflow code.
 *   - Only @temporalio/workflow imports are allowed.
 *   - Activities are accessed via proxyActivities.
 *
 * The UI can poll progress via the 'getProgress' query.
 */

import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';

// ---------------------------------------------------------------------------
// Activity type definitions (mirror the activity signatures)
// ---------------------------------------------------------------------------

type DocumentActivities = {
  processOcr: (documentId: string) => Promise<{ success: boolean; error?: string }>;
  classifyDocument: (documentId: string) => Promise<{ success: boolean; documentType?: string; error?: string }>;
  extractFields: (documentId: string) => Promise<{ success: boolean; fieldCount: number; error?: string }>;
  chunkAndEmbed: (documentId: string) => Promise<{ success: boolean; chunkCount: number; error?: string }>;
  generateTimeline: (documentId: string) => Promise<{ success: boolean; eventCount: number; error?: string }>;
};

const activities = proxyActivities<DocumentActivities>({
  startToCloseTimeout: '5m',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10s',
    backoffCoefficient: 2,
  },
});

// ---------------------------------------------------------------------------
// Progress query
// ---------------------------------------------------------------------------

export interface PipelineProgress {
  status: 'running' | 'completed' | 'completed_with_errors';
  currentStep: string;
  completedSteps: string[];
  failedSteps: string[];
}

const progressQuery = defineQuery<PipelineProgress>('getProgress');

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export async function documentPipelineWorkflow(
  documentId: string,
): Promise<PipelineProgress> {
  const progress: PipelineProgress = {
    status: 'running',
    currentStep: 'ocr',
    completedSteps: [],
    failedSteps: [],
  };

  setHandler(progressQuery, () => progress);

  // --- Step 1: OCR (required — all subsequent steps depend on extracted text) ---
  progress.currentStep = 'ocr';
  const ocrResult = await activities.processOcr(documentId);

  if (!ocrResult.success) {
    progress.failedSteps.push('ocr');
    progress.status = 'completed_with_errors';
    progress.currentStep = 'done';
    return progress;
  }

  progress.completedSteps.push('ocr');

  // --- Step 2: Classification ---
  progress.currentStep = 'classify';
  const classifyResult = await activities.classifyDocument(documentId);
  if (classifyResult.success) {
    progress.completedSteps.push('classify');
  } else {
    progress.failedSteps.push('classify');
  }

  // --- Step 3: Field extraction ---
  progress.currentStep = 'extract';
  const extractResult = await activities.extractFields(documentId);
  if (extractResult.success) {
    progress.completedSteps.push('extract');
  } else {
    progress.failedSteps.push('extract');
  }

  // --- Step 4: Chunk + Embed ---
  progress.currentStep = 'embed';
  const embedResult = await activities.chunkAndEmbed(documentId);
  if (embedResult.success) {
    progress.completedSteps.push('embed');
  } else {
    progress.failedSteps.push('embed');
  }

  // --- Step 5: Timeline ---
  progress.currentStep = 'timeline';
  const timelineResult = await activities.generateTimeline(documentId);
  if (timelineResult.success) {
    progress.completedSteps.push('timeline');
  } else {
    progress.failedSteps.push('timeline');
  }

  // --- Done ---
  progress.status =
    progress.failedSteps.length > 0 ? 'completed_with_errors' : 'completed';
  progress.currentStep = 'done';

  return progress;
}
