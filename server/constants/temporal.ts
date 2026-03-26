/**
 * Temporal task queue names, workflow names, and workflow ID generators.
 *
 * Two task queues:
 * - document-processing: OCR, classification, extraction, embedding, timeline
 * - llm-jobs: chat responses, UPL classification, counsel referrals, OMFS comparison
 */

/**
 * Temporal task queue names.
 *
 * Two queues separate compute-bound (document processing) from IO-bound (LLM)
 * work, allowing independent scaling. The 'adjudiclaims-' prefix namespaces
 * queues to avoid collision with other Temporal services on the same cluster.
 *
 * - DOCUMENT_PROCESSING: OCR, classification, extraction, embedding, timeline.
 *   CPU/memory intensive, can run on cheaper instances.
 * - LLM_JOBS: Chat responses, UPL classification, counsel referrals, OMFS comparison.
 *   Primarily IO-bound (waiting on LLM API responses), needs fewer workers.
 */
export const TEMPORAL_TASK_QUEUES = {
  DOCUMENT_PROCESSING: 'adjudiclaims-document-processing',
  LLM_JOBS: 'adjudiclaims-llm-jobs',
} as const;

/**
 * Temporal workflow function names.
 *
 * These must match the function names exported by the workflow files registered
 * with the Temporal workers. Changing these names requires updating both the
 * worker registration and this constant.
 */
export const TEMPORAL_WORKFLOWS = {
  DOCUMENT_PIPELINE: 'documentPipelineWorkflow',
  CHAT_RESPONSE: 'chatResponseWorkflow',
  COUNSEL_REFERRAL: 'counselReferralWorkflow',
  OMFS_COMPARISON: 'omfsComparisonWorkflow',
} as const;

/**
 * Workflow ID generators — produce deterministic IDs for idempotent starts.
 *
 * Temporal uses workflow IDs for deduplication: starting a workflow with an
 * ID that is already running returns the existing execution instead of creating
 * a new one. This prevents duplicate document processing on re-uploads and
 * duplicate OMFS comparisons on retry.
 *
 * Chat and referral workflows include a timestamp component because they
 * should NOT be deduplicated — each message/referral is a unique operation.
 */

/**
 * @param documentId - Document ID to process. Deterministic: same document always gets same workflow.
 * @returns Workflow ID in format `doc-pipeline-{documentId}`.
 */
export function getDocumentPipelineWorkflowId(documentId: string): string {
  return `doc-pipeline-${documentId}`;
}

/**
 * @param sessionId - Chat session ID.
 * @param messageIndex - Timestamp or message index for uniqueness.
 * @returns Workflow ID in format `chat-{sessionId}-{messageIndex}`.
 */
export function getChatResponseWorkflowId(sessionId: string, messageIndex: number): string {
  return `chat-${sessionId}-${String(messageIndex)}`;
}

/**
 * @param claimId - Claim ID for the referral.
 * @param timestamp - Request timestamp for uniqueness (each referral is unique).
 * @returns Workflow ID in format `referral-{claimId}-{timestamp}`.
 */
export function getCounselReferralWorkflowId(claimId: string, timestamp: number): string {
  return `referral-${claimId}-${String(timestamp)}`;
}

/**
 * @param lienId - Lien ID to compare. Deterministic: same lien always gets same workflow.
 * @returns Workflow ID in format `omfs-compare-{lienId}`.
 */
export function getOmfsComparisonWorkflowId(lienId: string): string {
  return `omfs-compare-${lienId}`;
}
