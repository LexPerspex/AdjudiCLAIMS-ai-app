/**
 * Temporal activities for LLM operations.
 *
 * Each activity wraps an existing service function. Activities run in normal
 * Node.js (not the V8 workflow sandbox) so they CAN import Prisma, services,
 * and any other Node.js modules.
 *
 * IMPORTANT: All inputs and outputs must be plain serializable objects.
 * No Fastify Request objects, Prisma model instances, or Map/Set types.
 *
 * Error strategy:
 *   - Transient errors (network, API timeouts) propagate for Temporal retry.
 *   - Non-retryable errors (missing record, invalid input) use ApplicationFailure.
 */

import { ApplicationFailure } from '@temporalio/activity';
import { classifyQuery } from '../../services/upl-classifier.service.js';
import { validateOutput } from '../../services/upl-validator.service.js';
import { getLLMAdapter } from '../../lib/llm/index.js';
import { EXAMINER_CASE_CHAT_PROMPT } from '../../prompts/adjudiclaims-chat.prompts.js';
import { prisma } from '../../db.js';
import { generateCounselReferral } from '../../services/counsel-referral.service.js';
import { runOmfsComparison } from '../../services/lien-management.service.js';
import type { BillComparisonResult } from '../../services/omfs-comparison.service.js';

// ---------------------------------------------------------------------------
// Serializable result types (plain objects only — no class instances)
// ---------------------------------------------------------------------------

export interface UplClassificationResult {
  zone: 'GREEN' | 'YELLOW' | 'RED';
  reason: string;
  confidence: number;
  isAdversarial: boolean;
}

export interface CitationResult {
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
}

/**
 * A chat message in the LLM conversation format.
 *
 * Must be a plain serializable object (no class instances) because Temporal
 * serializes all activity inputs/outputs across the worker boundary using JSON.
 * Map, Set, Date, and class instances are not supported.
 */
export interface LlmMessage {
  /** Message role: system (prompt), user (examiner), or assistant (AI). */
  role: 'system' | 'user' | 'assistant';
  /** Message content text. */
  content: string;
}

export interface LlmResponseResult {
  content: string;
  provider: string;
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

export interface SerializableValidationViolation {
  pattern: string;
  matchedText: string;
  position: number;
  severity: 'CRITICAL' | 'WARNING';
  suggestion: string;
}

export interface SerializableValidationResult {
  result: 'PASS' | 'FAIL';
  violations: SerializableValidationViolation[];
}

/**
 * Serializable result from counsel referral generation.
 *
 * The FastifyRequest dependency is removed for Temporal serialization.
 * Audit logging is handled at the route level instead of within the activity.
 */
export interface ReferralResult {
  /** Generated factual summary (or blocked message). */
  summary: string;
  /** Names of the 6 required sections found in the summary. */
  sections: string[];
  /** True if the summary was blocked by UPL output validation. */
  wasBlocked: boolean;
  /** UPL output validation result. */
  validationResult: 'PASS' | 'FAIL';
  /** Number of UPL violations detected. */
  violationCount: number;
}

export interface OmfsComparisonActivityResult {
  lineItems: BillComparisonResult['lineItems'];
  totalClaimed: number;
  totalOmfsAllowed: number;
  totalDiscrepancy: number;
  discrepancyPercent: number;
  disclaimer: string;
  isStubData: boolean;
}

// ---------------------------------------------------------------------------
// Activity: UPL Query Classification
// ---------------------------------------------------------------------------

/**
 * Classify a user query for UPL compliance.
 *
 * Runs the two-stage pipeline (keyword pre-filter + LLM classification).
 * Returns a plain serializable result.
 */
export async function classifyUplQuery(
  query: string,
): Promise<UplClassificationResult> {
  const result = await classifyQuery(query);
  return {
    zone: result.zone,
    reason: result.reason,
    confidence: result.confidence,
    isAdversarial: result.isAdversarial,
  };
}

// ---------------------------------------------------------------------------
// Activity: RAG Context Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant document chunks for a claim query.
 *
 * Excludes attorney-only, privileged, and work product documents.
 * Returns plain citation objects (no Prisma models).
 */
export async function retrieveChatContext(
  claimId: string,
  _query: string,
  topK = 5,
): Promise<CitationResult[]> {
  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        claimId,
        accessLevel: { not: 'ATTORNEY_ONLY' },
        containsLegalAnalysis: false,
        containsWorkProduct: false,
        containsPrivileged: false,
      },
    },
    select: {
      id: true,
      content: true,
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
    take: topK,
    orderBy: { chunkIndex: 'asc' },
  });

  return chunks.map((chunk) => ({
    documentId: chunk.document.id,
    documentName: chunk.document.fileName,
    content: chunk.content,
    similarity: 1.0, // Placeholder until vector search is active
  }));
}

// ---------------------------------------------------------------------------
// Activity: LLM Response Generation
// ---------------------------------------------------------------------------

/**
 * Generate an LLM response with the given system prompt and messages.
 *
 * Returns a plain serializable result (no LLMResponse class instance).
 */
export async function generateLlmResponse(
  systemPrompt: string,
  messages: LlmMessage[],
  context: string,
): Promise<LlmResponseResult> {
  const adapter = getLLMAdapter('FREE');

  const llmMessages = messages.length > 0
    ? messages
    : [
        {
          role: 'user' as const,
          content: `## CLAIM DOCUMENTS\n${context}\n\n## EXAMINER QUESTION\n`,
        },
      ];

  const response = await adapter.generate({
    systemPrompt: systemPrompt || EXAMINER_CASE_CHAT_PROMPT,
    messages: llmMessages,
    temperature: 0.3,
    maxTokens: 4096,
  });

  return {
    content: response.content,
    provider: response.provider,
    model: response.model,
    finishReason: response.finishReason,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}

// ---------------------------------------------------------------------------
// Activity: UPL Output Validation
// ---------------------------------------------------------------------------

/**
 * Validate AI-generated text for UPL compliance violations.
 *
 * Uses the synchronous regex-based validator. Returns a plain serializable
 * result (Map is converted to plain object).
 */
export function validateUplOutput(
  text: string,
): SerializableValidationResult {
  const result = validateOutput(text);
  return {
    result: result.result,
    violations: result.violations.map((v) => ({
      pattern: v.pattern,
      matchedText: v.matchedText,
      position: v.position,
      severity: v.severity,
      suggestion: v.suggestion,
    })),
  };
}

// ---------------------------------------------------------------------------
// Activity: Counsel Referral Summary Generation
// ---------------------------------------------------------------------------

/**
 * Generate a factual counsel referral summary for a claim.
 *
 * Wraps the existing generateCounselReferral service, but without
 * the FastifyRequest dependency (not serializable across Temporal boundary).
 * Audit logging is handled at the route level instead.
 */
export async function generateReferralSummary(
  claimId: string,
  userId: string,
  legalIssue: string,
): Promise<ReferralResult> {
  // We call the service without a FastifyRequest — the service handles
  // the missing request gracefully for audit logging (logs won't have IP/UA).
  // For Temporal workflows, audit events are logged by the route that
  // triggers the workflow, not by the activity itself.
  try {
    const result = await generateCounselReferral({
      claimId,
      userId,
      legalIssue,
      request: undefined as unknown as Parameters<typeof generateCounselReferral>[0]['request'],
    });

    return {
      summary: result.summary,
      sections: result.sections,
      wasBlocked: result.wasBlocked,
      validationResult: result.validation.result,
      violationCount: result.validation.violations.length,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'CLAIM_NOT_FOUND');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: OMFS Bill Comparison
// ---------------------------------------------------------------------------

/**
 * Run OMFS bill comparison on a lien's line items.
 *
 * Wraps the existing runOmfsComparison from lien-management.service.
 * Returns a plain serializable result.
 */
export async function runOmfsComparisonActivity(
  lienId: string,
): Promise<OmfsComparisonActivityResult> {
  try {
    const result = await runOmfsComparison(lienId);
    return {
      lineItems: result.lineItems,
      totalClaimed: result.totalClaimed,
      totalOmfsAllowed: result.totalOmfsAllowed,
      totalDiscrepancy: result.totalDiscrepancy,
      discrepancyPercent: result.discrepancyPercent,
      disclaimer: result.disclaimer,
      isStubData: result.isStubData,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw ApplicationFailure.nonRetryable(err.message, 'LIEN_NOT_FOUND');
    }
    if (err instanceof Error && err.message.includes('no line items')) {
      throw ApplicationFailure.nonRetryable(err.message, 'NO_LINE_ITEMS');
    }
    throw err;
  }
}
