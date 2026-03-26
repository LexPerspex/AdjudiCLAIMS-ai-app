/**
 * Chat response workflow — UPL-compliant RAG-powered Q&A via Temporal.
 *
 * This workflow is synchronous from the user's perspective: the route
 * starts the workflow and waits for its result before responding.
 *
 * Pipeline:
 * 1. Classify query (UPL zone determination)
 * 2. If RED zone, return block immediately
 * 3. Retrieve RAG context from claim documents
 * 4. Generate LLM response with examiner system prompt
 * 5. Validate output for UPL violations
 *
 * V8 SANDBOX: This file runs in Temporal's deterministic V8 sandbox.
 * It CANNOT import Node.js modules, Prisma, or anything except
 * @temporalio/workflow. Types are duplicated here, not imported.
 */

import { proxyActivities } from '@temporalio/workflow';

// ---------------------------------------------------------------------------
// Activity interface (duplicated — V8 sandbox cannot import from activities)
// ---------------------------------------------------------------------------

interface UplClassificationResult {
  zone: 'GREEN' | 'YELLOW' | 'RED';
  reason: string;
  confidence: number;
  isAdversarial: boolean;
}

interface CitationResult {
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmResponseResult {
  content: string;
  provider: string;
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

interface SerializableValidationResult {
  result: 'PASS' | 'FAIL';
  violations: Array<{
    pattern: string;
    matchedText: string;
    position: number;
    severity: 'CRITICAL' | 'WARNING';
    suggestion: string;
  }>;
}

interface LlmActivities {
  classifyUplQuery(query: string): Promise<UplClassificationResult>;
  retrieveChatContext(claimId: string, query: string, topK?: number): Promise<CitationResult[]>;
  generateLlmResponse(systemPrompt: string, messages: LlmMessage[], context: string): Promise<LlmResponseResult>;
  validateUplOutput(text: string): Promise<SerializableValidationResult>;
}

// ---------------------------------------------------------------------------
// Activity proxies
// ---------------------------------------------------------------------------

const activities = proxyActivities<LlmActivities>({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '5s',
    backoffCoefficient: 2,
  },
});

// ---------------------------------------------------------------------------
// Workflow input/output types
// ---------------------------------------------------------------------------

export interface ChatWorkflowInput {
  claimId: string;
  sessionId: string;
  message: string;
  systemPrompt: string;
  messages: LlmMessage[];
}

export interface ChatWorkflowResult {
  blocked: boolean;
  zone: 'GREEN' | 'YELLOW' | 'RED';
  content: string;
  classification: UplClassificationResult;
  validation: SerializableValidationResult;
  citations: CitationResult[];
  llmProvider?: string;
  llmModel?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Chat response workflow.
 *
 * Orchestrates the 3-stage UPL pipeline:
 * 1. Pre-chat classification
 * 2. RAG retrieval + LLM generation
 * 3. Post-generation output validation
 */
export async function chatResponseWorkflow(
  input: ChatWorkflowInput,
): Promise<ChatWorkflowResult> {
  // Stage 1: UPL classification
  const classification = await activities.classifyUplQuery(input.message);

  // RED zone: block immediately — no LLM generation
  if (classification.zone === 'RED') {
    return {
      blocked: true,
      zone: 'RED',
      content: '',
      classification,
      validation: { result: 'PASS', violations: [] },
      citations: [],
    };
  }

  // Stage 2: RAG retrieval
  const citations = await activities.retrieveChatContext(input.claimId, input.message);

  // Build context string from citations
  const contextString = citations.length > 0
    ? citations
        .map((c, i) => `[Source ${String(i + 1)}: ${c.documentName}]\n${c.content}`)
        .join('\n\n')
    : 'No relevant documents found in the claim file.';

  // Build the full user message with context
  const messagesWithContext: LlmMessage[] = [
    ...input.messages,
    {
      role: 'user' as const,
      content: `## CLAIM DOCUMENTS\n${contextString}\n\n## EXAMINER QUESTION\n${input.message}`,
    },
  ];

  // Stage 2b: LLM generation
  const response = await activities.generateLlmResponse(
    input.systemPrompt,
    messagesWithContext,
    contextString,
  );

  // Stage 3: UPL output validation
  const validation = await activities.validateUplOutput(response.content);

  // If validation fails, block the response
  const blocked = validation.result === 'FAIL';

  return {
    blocked,
    zone: classification.zone,
    content: blocked ? '' : response.content,
    classification,
    validation,
    citations,
    llmProvider: response.provider,
    llmModel: response.model,
    finishReason: response.finishReason,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}
