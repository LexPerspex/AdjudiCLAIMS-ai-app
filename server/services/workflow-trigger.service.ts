/**
 * Workflow trigger service — thin wrapper for starting Temporal workflows.
 *
 * Routes call this service instead of invoking service functions directly.
 * This decouples request handling from workflow execution and provides
 * a single place to manage workflow IDs, task queue routing, and
 * sync-vs-async semantics.
 *
 * Patterns:
 *   - Fire-and-forget: returns workflowId for status polling
 *   - Synchronous: starts workflow, waits for result, returns it
 */

import { startWorkflow, getWorkflowHandle } from '../lib/temporal.js';
import {
  TEMPORAL_TASK_QUEUES,
  TEMPORAL_WORKFLOWS,
  getDocumentPipelineWorkflowId,
  getChatResponseWorkflowId,
  getCounselReferralWorkflowId,
  getOmfsComparisonWorkflowId,
} from '../constants/temporal.js';

// ---------------------------------------------------------------------------
// Types (duplicated from workflow files — cannot import V8 sandbox modules)
// ---------------------------------------------------------------------------

/**
 * Input for the chat response Temporal workflow.
 *
 * Types are duplicated here because V8 sandbox workflow modules cannot be
 * imported from normal Node.js code. The workflow trigger service acts as
 * the bridge between Fastify route handlers and Temporal workflows.
 */
export interface ChatWorkflowInput {
  /** Claim context for RAG document retrieval. */
  claimId: string;
  /** Chat session ID for conversation continuity. */
  sessionId: string;
  /** The examiner's question or message. */
  message: string;
  /** UPL-compliant system prompt for the LLM. */
  systemPrompt: string;
  /** Conversation history for context. */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

export interface ChatWorkflowResult {
  blocked: boolean;
  zone: 'GREEN' | 'YELLOW' | 'RED';
  content: string;
  classification: {
    zone: 'GREEN' | 'YELLOW' | 'RED';
    reason: string;
    confidence: number;
    isAdversarial: boolean;
  };
  validation: {
    result: 'PASS' | 'FAIL';
    violations: Array<{
      pattern: string;
      matchedText: string;
      position: number;
      severity: 'CRITICAL' | 'WARNING';
      suggestion: string;
    }>;
  };
  citations: Array<{
    documentId: string;
    documentName: string;
    content: string;
    similarity: number;
  }>;
  llmProvider?: string;
  llmModel?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ---------------------------------------------------------------------------
// Document pipeline (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Start a document processing pipeline workflow.
 *
 * Fire-and-forget — returns the workflow ID for status polling.
 * Idempotent: if a workflow for this document is already running,
 * returns the existing workflow ID.
 */
export async function startDocumentPipeline(
  documentId: string,
): Promise<string> {
  return startWorkflow(TEMPORAL_WORKFLOWS.DOCUMENT_PIPELINE, {
    workflowId: getDocumentPipelineWorkflowId(documentId),
    taskQueue: TEMPORAL_TASK_QUEUES.DOCUMENT_PROCESSING,
    args: [documentId],
  });
}

// ---------------------------------------------------------------------------
// Chat response (synchronous — user is waiting)
// ---------------------------------------------------------------------------

/**
 * Start a chat response workflow and wait for its result.
 *
 * Synchronous from the caller's perspective: the route handler
 * awaits this function, which blocks until the workflow completes.
 * Timeout is governed by the workflow's activity timeouts.
 */
export async function startChatResponse(
  input: ChatWorkflowInput,
): Promise<ChatWorkflowResult> {
  const workflowId = getChatResponseWorkflowId(
    input.sessionId,
    Date.now(),
  );

  await startWorkflow(TEMPORAL_WORKFLOWS.CHAT_RESPONSE, {
    workflowId,
    taskQueue: TEMPORAL_TASK_QUEUES.LLM_JOBS,
    args: [input],
  });

  const handle = getWorkflowHandle(workflowId);
  return handle.result() as Promise<ChatWorkflowResult>;
}

// ---------------------------------------------------------------------------
// Counsel referral (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Start a counsel referral workflow.
 *
 * Fire-and-forget — returns the workflow ID for status polling.
 * The examiner can check back later for the generated summary.
 */
export async function startCounselReferral(
  claimId: string,
  userId: string,
  legalIssue: string,
): Promise<string> {
  return startWorkflow(TEMPORAL_WORKFLOWS.COUNSEL_REFERRAL, {
    workflowId: getCounselReferralWorkflowId(claimId, Date.now()),
    taskQueue: TEMPORAL_TASK_QUEUES.LLM_JOBS,
    args: [{ claimId, userId, legalIssue }],
  });
}

// ---------------------------------------------------------------------------
// OMFS comparison (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Start an OMFS comparison workflow.
 *
 * Fire-and-forget — returns the workflow ID for status polling.
 * Idempotent: if a comparison for this lien is already running,
 * returns the existing workflow ID.
 */
export async function startOmfsComparison(
  lienId: string,
): Promise<string> {
  return startWorkflow(TEMPORAL_WORKFLOWS.OMFS_COMPARISON, {
    workflowId: getOmfsComparisonWorkflowId(lienId),
    taskQueue: TEMPORAL_TASK_QUEUES.LLM_JOBS,
    args: [lienId],
  });
}
