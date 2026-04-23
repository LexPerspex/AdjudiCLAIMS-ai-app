/**
 * Examiner chat service -- UPL-compliant RAG-powered Q&A.
 *
 * Three-stage pipeline per request:
 * 1. Pre-chat: classifyQuery() -> zone determination
 * 2. Chat: RAG retrieval -> LLM response with examiner system prompt
 * 3. Post-chat: validateOutput() -> prohibited language check
 *
 * Zone-based flow:
 * - GREEN: Generate -> validate -> add GREEN disclaimer -> deliver
 * - YELLOW: Generate -> validate -> add YELLOW disclaimer -> deliver
 * - RED: Block immediately -> deliver attorney referral message
 */

import type { FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { classifyQuery, type UplClassification } from './upl-classifier.service.js';
import { validateOutput, type ValidationResult } from './upl-validator.service.js';
import { getDisclaimer, type DisclaimerResult } from './disclaimer.service.js';
import { getLLMAdapter } from '../lib/llm/index.js';
import { EXAMINER_CASE_CHAT_PROMPT } from '../prompts/adjudiclaims-chat.prompts.js';
import { logAuditEvent } from '../middleware/audit.js';
import { hybridSearch } from './hybrid-search.service.js';
import {
  queryGraphForExaminer,
  formatGraphContext,
  type GraphQueryResult,
} from './graph/examiner-graph-access.service.js';
import { getClaimGraphSummary } from './graph/graph-traversal.service.js';
import { EXAMINER_TOOLS, executeTool } from './chat-tools.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for the examiner chat 3-stage UPL pipeline.
 *
 * Each message goes through: (1) UPL classification, (2) RAG + LLM generation,
 * (3) output validation. The three stages exist because no single layer is
 * sufficient: regex catches known patterns but misses novel phrasing, the LLM
 * system prompt constrains generation but can be circumvented, and output
 * validation catches any prohibited language that slips through.
 */
export interface ChatRequest {
  /** The claim context for RAG document retrieval. */
  claimId: string;
  /** Existing session ID for conversation continuity; omit to start new session. */
  sessionId?: string;
  /** The examiner's question or message. */
  message: string;
  /** The authenticated examiner's user ID. */
  userId: string;
  /** The examiner's organization ID (for audit scoping). */
  orgId: string;
  /** Fastify request for audit logging (IP, user-agent). */
  request: FastifyRequest;
}

export interface Citation {
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  /** Heading breadcrumb for source attribution (L1 > L2 > L3) */
  headingBreadcrumb?: string;
}

// ---------------------------------------------------------------------------
// Graph Trust UX types — G5 Trust UX (AJC-14)
// ---------------------------------------------------------------------------

/**
 * A single entity referenced during graph traversal for this response.
 *
 * Surfaced in the entity panel so the examiner can see exactly which
 * graph nodes informed the answer. Factual display only — no legal conclusions.
 */
export interface GraphTrustEntity {
  /** Graph node ID */
  id: string;
  /** Canonical entity name (e.g. "John Smith", "Lumbar Spine") */
  name: string;
  /** Node type for icon/label display */
  nodeType: string;
  /**
   * Extraction confidence from graph node — numeric in [0, 1].
   * Maps to HIGH (>0.8), MEDIUM (0.5–0.8), LOW (<0.5) for badge display.
   */
  confidence: number;
  /** Human-readable confidence label */
  confidenceBadge: 'verified' | 'confident' | 'suggested' | 'ai_generated';
  /** Alternate names this entity was found under */
  aliases?: string[];
  /** Number of source documents this entity was extracted from */
  sourceCount: number;
}

/**
 * A source document that contributed to this response via graph traversal.
 *
 * Surfaced in the provenance panel so the examiner can see which
 * documents the AI used. Includes relevance score (not legal analysis).
 */
export interface GraphTrustSource {
  /** Document file name */
  documentName: string;
  /** Document category for label display */
  documentType?: string;
  /**
   * Relevance score in [0, 1] — derived from citation similarity or
   * graph edge confidence, whichever is available.
   */
  confidence: number;
  /** ISO timestamp of when this document was processed */
  extractedAt: string;
}

/**
 * Graph RAG trust transparency data attached to each assistant message.
 *
 * This is the "Glass Box" layer: instead of showing the examiner a black-box
 * answer, we surface the exact entities and documents that contributed to it.
 *
 * All fields are factual (GREEN zone). No legal analysis or conclusions exposed.
 */
export interface GraphTrustData {
  /**
   * Composite confidence score for this response in [0, 1].
   *
   * Calculated as the mean confidence of all traversed graph nodes.
   * Falls back to mean citation similarity if no graph context was used.
   */
  overallConfidence: number;
  /** Graph entities referenced during traversal (empty if graph not used) */
  entities: GraphTrustEntity[];
  /** Source documents that contributed to the response */
  provenance: GraphTrustSource[];
  /** True if graph context was used; false if RAG-only response */
  graphContextUsed: boolean;
}

/**
 * Response from the examiner chat pipeline.
 *
 * Contains the full audit trail of the 3-stage UPL pipeline: what zone the
 * query was classified into, what disclaimer was applied, whether the output
 * passed validation, and whether the response was blocked. This transparency
 * is part of the Glass Box philosophy — the examiner can see exactly why
 * the system responded the way it did.
 */
export interface ChatResponse {
  /** Chat session ID (created or existing). */
  sessionId: string;
  /** ID of the persisted assistant message record. */
  messageId: string;
  /** The response content (or blocked message if wasBlocked=true). */
  content: string;
  /** Stage 1 result: UPL zone classification of the query. */
  classification: UplClassification;
  /** Zone-appropriate disclaimer attached to the response. */
  disclaimer: DisclaimerResult;
  /** Stage 3 result: output validation for prohibited language. */
  validation: ValidationResult;
  /** True if the response was blocked at any stage (RED zone or output validation failure). */
  wasBlocked: boolean;
  /** Document chunks retrieved via RAG for this response. */
  citations: Citation[];
  /** Whether graph context was included in the LLM prompt. */
  graphContextIncluded?: boolean;
  /** G5 Trust UX: confidence badge, entity panel, and source provenance data. */
  graphTrust: GraphTrustData;
}

// ---------------------------------------------------------------------------
// RAG retrieval (with document access filtering)
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant document chunks for the query, excluding
 * attorney-only, privileged, and work product documents.
 *
 * Uses a simple chunk query ordered by chunk index as a fallback
 * until pgvector similarity search is fully configured.
 */
async function retrieveContext(
  claimId: string,
  query: string,
  topK = 5,
): Promise<Citation[]> {
  // Try hybrid search (vector + keyword fusion)
  try {
    const results = await hybridSearch(query, claimId, { finalTopK: topK });

    if (results.length > 0) {
      return results.map((r) => ({
        documentId: r.documentId,
        documentName: r.headingBreadcrumb ?? 'Unknown Document',
        content: r.parentContent ?? r.content,  // Prefer parent content for broader LLM context
        similarity: r.fusedScore,
      }));
    }
  } catch (err) {
    console.warn(
      '[examiner-chat] Hybrid search failed, falling back to document order:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Fallback: ordered chunk retrieval (no search infrastructure configured)
  const chunks = await prisma.documentChunk.findMany({
    where: {
      isParent: false,
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
    similarity: 1.0,
  }));
}

// ---------------------------------------------------------------------------
// Graph Trust UX builder — G5 (AJC-14)
// ---------------------------------------------------------------------------

/**
 * Build the GraphTrustData for the G5 Trust UX from the graph query result
 * and RAG citation list.
 *
 * Why separate from the main pipeline: trust UX is a transparency layer on top
 * of existing graph + RAG data. Keeping it isolated ensures it cannot affect
 * UPL enforcement or LLM generation.
 *
 * @param graphResult - UPL-filtered graph query result, or null if graph not used.
 * @param citations - RAG citations with similarity scores.
 * @returns Fully populated GraphTrustData for the response.
 */
function buildGraphTrustData(
  graphResult: GraphQueryResult | null,
  citations: Citation[],
): GraphTrustData {
  // Build entity list from graph nodes (only what the examiner is allowed to see)
  const entities: GraphTrustEntity[] = graphResult?.nodes.slice(0, 10).map((node) => ({
    id: node.id,
    name: node.canonicalName,
    nodeType: node.nodeType as string,
    confidence: node.confidence,
    confidenceBadge: node.confidenceBadge,
    aliases: [],
    sourceCount: node.sourceCount,
  })) ?? [];

  // Build provenance from citations (deduplicated by documentName)
  const seenDocs = new Set<string>();
  const provenance: GraphTrustSource[] = citations
    .filter((c) => {
      if (seenDocs.has(c.documentName)) return false;
      seenDocs.add(c.documentName);
      return true;
    })
    .map((c) => ({
      documentName: c.documentName,
      confidence: c.similarity,
      extractedAt: new Date().toISOString(),
    }));

  // Overall confidence: mean of graph node confidences if available,
  // else mean of citation similarities, else 0.5 (neutral/unknown)
  let overallConfidence: number;
  if (entities.length > 0) {
    overallConfidence = entities.reduce((acc, e) => acc + e.confidence, 0) / entities.length;
  } else if (provenance.length > 0) {
    overallConfidence = provenance.reduce((acc, p) => acc + p.confidence, 0) / provenance.length;
  } else {
    overallConfidence = 0.5;
  }

  // Clamp to [0, 1]
  overallConfidence = Math.min(Math.max(overallConfidence, 0), 1);

  return {
    overallConfidence,
    entities,
    provenance,
    graphContextUsed: graphResult !== null,
  };
}

/**
 * Build the context string from retrieved citations for injection into the prompt.
 */
function buildContextString(citations: Citation[]): string {
  if (citations.length === 0) {
    return 'No relevant documents found in the claim file.';
  }

  return citations
    .map(
      (c, i) =>
        `[Source ${String(i + 1)}: ${c.documentName}]\n${c.content}`,
    )
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

async function getOrCreateSession(
  claimId: string,
  userId: string,
  sessionId?: string,
): Promise<string> {
  if (sessionId) {
    // Verify the session exists and belongs to this user/claim
    const existing = await prisma.chatSession.findFirst({
      where: { id: sessionId, claimId, userId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // Create a new session
  const session = await prisma.chatSession.create({
    data: { claimId, userId },
    select: { id: true },
  });

  return session.id;
}

// ---------------------------------------------------------------------------
// Main chat function
// ---------------------------------------------------------------------------

/**
 * Process an examiner chat message through the 3-stage UPL pipeline.
 *
 * Stage 1: classifyQuery() -- keyword pre-filter + LLM classification
 * Stage 2: RAG retrieval + LLM generation with UPL-compliant system prompt
 * Stage 3: validateOutput() -- prohibited language regex scan
 *
 * Audit events are logged at every enforcement boundary.
 * Never logs PII -- only IDs, zones, and counts.
 */
export async function processExaminerChat(
  chatRequest: ChatRequest,
): Promise<ChatResponse> {
  const { claimId, message, userId, request } = chatRequest;

  // Stage 1: Pre-chat UPL classification
  const classification = await classifyQuery(message);

  // Get disclaimer for the classified zone
  const disclaimer = getDisclaimer(classification.zone);

  // Get or create session
  const sessionId = await getOrCreateSession(claimId, userId, chatRequest.sessionId);

  // Store the user message
  const userMessage = await prisma.chatMessage.create({
    data: {
      sessionId,
      role: 'USER',
      content: message,
      uplZone: classification.zone,
    },
    select: { id: true },
  });

  // Audit log the classification -- never log message content (PII risk)
  void logAuditEvent({
    userId,
    claimId,
    eventType: 'UPL_ZONE_CLASSIFICATION',
    eventData: {
      zone: classification.zone,
      confidence: classification.confidence,
      isAdversarial: classification.isAdversarial,
      sessionId,
      messageId: userMessage.id,
    },
    uplZone: classification.zone,
    request,
  });

  // RED zone: block immediately
  if (classification.zone === 'RED') {
    const blockedContent = disclaimer.referralMessage ?? disclaimer.disclaimer;

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: blockedContent,
        uplZone: 'RED',
        wasBlocked: true,
        disclaimerApplied: true,
      },
      select: { id: true },
    });

    void logAuditEvent({
      userId,
      claimId,
      eventType: 'UPL_OUTPUT_BLOCKED',
      eventData: {
        reason: classification.reason,
        sessionId,
        messageId: assistantMessage.id,
      },
      uplZone: 'RED',
      request,
    });

    return {
      sessionId,
      messageId: assistantMessage.id,
      content: blockedContent,
      classification,
      disclaimer,
      validation: { result: 'PASS', violations: [] },
      wasBlocked: true,
      citations: [],
      graphTrust: buildGraphTrustData(null, []),
    };
  }

  // --- Stage 1.5: Graph Context ---
  let graphContext = '';
  // Captured for G5 Trust UX — null means graph was not used
  let capturedGraphResult: GraphQueryResult | null = null;
  try {
    const maturity = await getClaimGraphSummary(claimId);
    // Only query graph if maturity is GROWING or higher
    if (maturity.maturityLabel !== 'NASCENT') {
      const graphResult = await queryGraphForExaminer(
        claimId,
        classification.zone as 'GREEN' | 'YELLOW' | 'RED',
        { maxNodes: 20, maxEdges: 30 },
      );
      graphContext = formatGraphContext(graphResult);
      // Capture for G5 Trust UX transparency layer
      capturedGraphResult = graphResult;
    }
  } catch (err) {
    // Graph context failure is non-fatal — chat continues with RAG only
    console.warn(
      '[examiner-chat] Graph context failed, continuing with RAG only:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Stage 2: RAG retrieval + LLM generation (with agentic tool-use loop)
  const citations = await retrieveContext(claimId, message);
  const contextString = buildContextString(citations);

  const adapter = getLLMAdapter('FREE');
  const initialRequest = {
    systemPrompt: EXAMINER_CASE_CHAT_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: `${graphContext ? `${graphContext}\n\n` : ''}## CLAIM DOCUMENTS\n${contextString}\n\n## EXAMINER QUESTION\n${message}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 4096,
    tools: EXAMINER_TOOLS,
  };

  let llmResponse = await adapter.generate(initialRequest);

  // Agentic loop: if LLM requests tool use, execute and continue
  const MAX_TOOL_ROUNDS = 3;
  let toolRounds = 0;

  while (llmResponse.toolCalls?.length && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;
    const toolResults = await Promise.all(
      llmResponse.toolCalls.map(async (tc) => ({
        toolCallId: tc.id,
        content: await executeTool(tc, claimId, classification.zone),
      })),
    );

    llmResponse = await adapter.generate({
      ...initialRequest,
      toolResults,
    });
  }

  let responseContent = llmResponse.content;

  // Handle stub responses (no API key configured)
  if (llmResponse.finishReason === 'STUB') {
    responseContent =
      '[Chat service running in stub mode -- no LLM API key configured]\n\n' +
      `Your question has been classified as ${classification.zone} zone.\n\n` +
      'To get AI-powered responses, configure VERTEX_AI_PROJECT or ANTHROPIC_API_KEY.';
  }

  // Stage 3: Post-chat UPL output validation
  const validation = validateOutput(responseContent);

  // If output validation fails, block the response
  if (validation.result === 'FAIL') {
    const blockedContent =
      'The AI response was blocked because it contained language that may constitute ' +
      'legal advice. Please rephrase your question to focus on factual information, ' +
      'or contact defense counsel for legal guidance.';

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: blockedContent,
        uplZone: classification.zone,
        wasBlocked: true,
        disclaimerApplied: true,
      },
      select: { id: true },
    });

    void logAuditEvent({
      userId,
      claimId,
      eventType: 'UPL_OUTPUT_BLOCKED',
      eventData: {
        reason: 'Output validation failed',
        violationCount: validation.violations.length,
        sessionId,
        messageId: assistantMessage.id,
      },
      uplZone: classification.zone,
      request,
    });

    return {
      sessionId,
      messageId: assistantMessage.id,
      content: blockedContent,
      classification,
      disclaimer,
      validation,
      wasBlocked: true,
      citations,
      graphTrust: buildGraphTrustData(capturedGraphResult, citations),
    };
  }

  // Append disclaimer for YELLOW zone
  if (classification.zone === 'YELLOW') {
    responseContent = `${responseContent}\n\n${disclaimer.disclaimer}`;

    void logAuditEvent({
      userId,
      claimId,
      eventType: 'UPL_DISCLAIMER_INJECTED',
      eventData: { zone: 'YELLOW', sessionId },
      uplZone: 'YELLOW',
      request,
    });
  }

  // Store the assistant message
  const assistantMessage = await prisma.chatMessage.create({
    data: {
      sessionId,
      role: 'ASSISTANT',
      content: responseContent,
      uplZone: classification.zone,
      wasBlocked: false,
      disclaimerApplied: classification.zone === 'YELLOW',
    },
    select: { id: true },
  });

  // Audit log the response -- log provider/model/usage, never response content
  void logAuditEvent({
    userId,
    claimId,
    eventType: 'CHAT_RESPONSE_GENERATED',
    eventData: {
      sessionId,
      messageId: assistantMessage.id,
      zone: classification.zone,
      citationCount: citations.length,
      graphContextLength: graphContext.length,
      provider: llmResponse.provider,
      model: llmResponse.model,
      usage: llmResponse.usage,
    },
    uplZone: classification.zone,
    request,
  });

  return {
    sessionId,
    messageId: assistantMessage.id,
    content: responseContent,
    classification,
    disclaimer,
    validation,
    wasBlocked: false,
    citations,
    graphContextIncluded: graphContext.length > 0,
    graphTrust: buildGraphTrustData(capturedGraphResult, citations),
  };
}
