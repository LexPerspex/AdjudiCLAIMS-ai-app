/**
 * Temporal task queue names, workflow names, and workflow ID generators.
 *
 * Two task queues:
 * - document-processing: OCR, classification, extraction, embedding, timeline
 * - llm-jobs: chat responses, UPL classification, counsel referrals, OMFS comparison
 */

export const TEMPORAL_TASK_QUEUES = {
  DOCUMENT_PROCESSING: 'adjudiclaims-document-processing',
  LLM_JOBS: 'adjudiclaims-llm-jobs',
} as const;

export const TEMPORAL_WORKFLOWS = {
  DOCUMENT_PIPELINE: 'documentPipelineWorkflow',
  CHAT_RESPONSE: 'chatResponseWorkflow',
  COUNSEL_REFERRAL: 'counselReferralWorkflow',
  OMFS_COMPARISON: 'omfsComparisonWorkflow',
} as const;

// Workflow ID generators — deterministic for idempotent starts
export function getDocumentPipelineWorkflowId(documentId: string): string {
  return `doc-pipeline-${documentId}`;
}

export function getChatResponseWorkflowId(sessionId: string, messageIndex: number): string {
  return `chat-${sessionId}-${String(messageIndex)}`;
}

export function getCounselReferralWorkflowId(claimId: string, timestamp: number): string {
  return `referral-${claimId}-${String(timestamp)}`;
}

export function getOmfsComparisonWorkflowId(lienId: string): string {
  return `omfs-compare-${lienId}`;
}
