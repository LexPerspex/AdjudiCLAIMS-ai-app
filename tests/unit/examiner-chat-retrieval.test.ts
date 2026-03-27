/**
 * Tests for examiner-chat.service.ts — retrieveContext() integration via processExaminerChat().
 *
 * retrieveContext() is a private function, so we test it indirectly through
 * processExaminerChat() by mocking hybridSearch, prisma, and the LLM adapter.
 *
 * Covers:
 * - Hybrid search success path: fusedScore in citations, heading breadcrumbs
 * - Hybrid search failure: graceful fallback to document-order chunks
 * - Hybrid search empty results: fallback to document-order chunks
 * - Parent content preferred over child content in citations
 * - isParent=false filter in fallback path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const CLAIM_ID = 'claim-test-001';
const USER_ID = 'user-test-001';
const ORG_ID = 'org-test-001';
const SESSION_ID = 'session-test-001';

// ---------------------------------------------------------------------------
// Mock setup — must be before imports
// ---------------------------------------------------------------------------

// Mock prisma
const mockChatSessionFindFirst = vi.fn();
const mockChatSessionCreate = vi.fn();
const mockChatMessageCreate = vi.fn();
const mockDocumentChunkFindMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    chatSession: {
      findFirst: (...args: unknown[]) => mockChatSessionFindFirst(...args) as unknown,
      create: (...args: unknown[]) => mockChatSessionCreate(...args) as unknown,
    },
    chatMessage: {
      create: (...args: unknown[]) => mockChatMessageCreate(...args) as unknown,
    },
    documentChunk: {
      findMany: (...args: unknown[]) => mockDocumentChunkFindMany(...args) as unknown,
    },
  },
}));

// Mock hybrid search
const mockHybridSearch = vi.fn();

vi.mock('../../server/services/hybrid-search.service.js', () => ({
  hybridSearch: (...args: unknown[]) => mockHybridSearch(...args) as unknown,
}));

// Mock UPL classifier — always return GREEN for these tests
const mockClassifyQuery = vi.fn();

vi.mock('../../server/services/upl-classifier.service.js', () => ({
  classifyQuery: (...args: unknown[]) => mockClassifyQuery(...args) as unknown,
}));

// Mock UPL validator — always pass
const mockValidateOutput = vi.fn();

vi.mock('../../server/services/upl-validator.service.js', () => ({
  validateOutput: (...args: unknown[]) => mockValidateOutput(...args) as unknown,
}));

// Mock disclaimer service
vi.mock('../../server/services/disclaimer.service.js', () => ({
  getDisclaimer: () => ({
    disclaimer: 'This is factual information only.',
    referralMessage: null,
  }),
}));

// Mock LLM adapter
const mockLLMGenerate = vi.fn();

vi.mock('../../server/lib/llm/index.js', () => ({
  getLLMAdapter: () => ({
    generate: (...args: unknown[]) => mockLLMGenerate(...args) as unknown,
  }),
}));

// Mock prompts
vi.mock('../../server/prompts/adjudiclaims-chat.prompts.js', () => ({
  EXAMINER_CASE_CHAT_PROMPT: 'You are a claims assistant.',
}));

// Mock audit logging — no-op
vi.mock('../../server/middleware/audit.js', () => ({
  logAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { processExaminerChat } from '../../server/services/examiner-chat.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChatRequest(message = 'What is the TD rate?') {
  return {
    claimId: CLAIM_ID,
    sessionId: SESSION_ID,
    message,
    userId: USER_ID,
    orgId: ORG_ID,
    request: { ip: '127.0.0.1', headers: {} } as unknown as import('fastify').FastifyRequest,
  };
}

function setupDefaultMocks() {
  // UPL classifier: GREEN zone
  mockClassifyQuery.mockResolvedValue({
    zone: 'GREEN',
    confidence: 0.95,
    reason: 'Factual query',
    isAdversarial: false,
  });

  // UPL validator: PASS
  mockValidateOutput.mockReturnValue({ result: 'PASS', violations: [] });

  // Session management
  mockChatSessionFindFirst.mockResolvedValue({ id: SESSION_ID });
  mockChatMessageCreate.mockResolvedValue({ id: 'msg-001' });

  // LLM adapter
  mockLLMGenerate.mockResolvedValue({
    content: 'The TD rate is calculated based on 2/3 of AWE.',
    finishReason: 'end_turn',
    provider: 'stub',
    model: 'stub',
    usage: { inputTokens: 100, outputTokens: 50 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('examiner-chat retrieveContext (via processExaminerChat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // =========================================================================
  // Hybrid search success path
  // =========================================================================

  describe('when hybrid search succeeds', () => {
    it('uses hybrid search results as citations with fusedScore as similarity', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Child chunk about TD rate calculation',
          parentContent: 'Full parent content about TD rate and AWE calculation',
          headingBreadcrumb: 'Medical > Benefits > TD Rate',
          vectorScore: 0.92,
          keywordScore: 0.85,
          fusedScore: 0.0164,
          matchedKeywords: ['rate'],
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-2',
          content: 'Child chunk about AWE',
          parentContent: null,
          headingBreadcrumb: 'Calculations > AWE',
          vectorScore: 0.78,
          keywordScore: 0.0,
          fusedScore: 0.0098,
          matchedKeywords: [],
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations).toHaveLength(2);
      // fusedScore used as similarity
      expect(response.citations[0]!.similarity).toBe(0.0164);
      expect(response.citations[1]!.similarity).toBe(0.0098);
    });

    it('uses heading breadcrumb as documentName', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Some content',
          parentContent: null,
          headingBreadcrumb: 'QME Report > Diagnoses > Lumbar Spine',
          vectorScore: 0.9,
          keywordScore: 0.0,
          fusedScore: 0.01,
          matchedKeywords: [],
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations[0]!.documentName).toBe('QME Report > Diagnoses > Lumbar Spine');
    });

    it('falls back to "Unknown Document" when headingBreadcrumb is null', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Some content',
          parentContent: null,
          headingBreadcrumb: null,
          vectorScore: 0.9,
          keywordScore: 0.0,
          fusedScore: 0.01,
          matchedKeywords: [],
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations[0]!.documentName).toBe('Unknown Document');
    });

    it('prefers parentContent over child content in citations', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Short child chunk',
          parentContent: 'Much longer parent chunk with full context for the LLM',
          headingBreadcrumb: 'Section > Topic',
          vectorScore: 0.9,
          keywordScore: 0.8,
          fusedScore: 0.02,
          matchedKeywords: ['section'],
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations[0]!.content).toBe(
        'Much longer parent chunk with full context for the LLM',
      );
    });

    it('uses child content when parentContent is null', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Child content (no parent available)',
          parentContent: null,
          headingBreadcrumb: null,
          vectorScore: 0.85,
          keywordScore: 0.0,
          fusedScore: 0.01,
          matchedKeywords: [],
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations[0]!.content).toBe('Child content (no parent available)');
    });
  });

  // =========================================================================
  // Hybrid search failure — fallback path
  // =========================================================================

  describe('when hybrid search fails', () => {
    it('falls back to document-order chunks on hybridSearch error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockHybridSearch.mockRejectedValueOnce(new Error('Vector Search index not found'));

      mockDocumentChunkFindMany.mockResolvedValueOnce([
        {
          id: 'chunk-fallback-1',
          content: 'Fallback chunk from document order',
          document: { id: 'doc-fb-1', fileName: 'report.pdf' },
        },
        {
          id: 'chunk-fallback-2',
          content: 'Second fallback chunk',
          document: { id: 'doc-fb-2', fileName: 'medical.pdf' },
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations).toHaveLength(2);
      expect(response.citations[0]!.documentName).toBe('report.pdf');
      expect(response.citations[0]!.content).toBe('Fallback chunk from document order');
      // Fallback uses similarity 1.0
      expect(response.citations[0]!.similarity).toBe(1.0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[examiner-chat] Hybrid search failed'),
        expect.stringContaining('Vector Search index not found'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('falls back to document-order chunks when hybrid search returns empty', async () => {
      mockHybridSearch.mockResolvedValueOnce([]);

      mockDocumentChunkFindMany.mockResolvedValueOnce([
        {
          id: 'chunk-fb-1',
          content: 'Ordered chunk content',
          document: { id: 'doc-1', fileName: 'intake-form.pdf' },
        },
      ]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations).toHaveLength(1);
      expect(response.citations[0]!.documentName).toBe('intake-form.pdf');
      expect(response.citations[0]!.similarity).toBe(1.0);
    });

    it('fallback path filters isParent=false', async () => {
      mockHybridSearch.mockResolvedValueOnce([]);

      mockDocumentChunkFindMany.mockResolvedValueOnce([
        {
          id: 'chunk-child-1',
          content: 'Child chunk only',
          document: { id: 'doc-1', fileName: 'file.pdf' },
        },
      ]);

      await processExaminerChat(makeChatRequest());

      // Verify the findMany call includes isParent: false filter
      expect(mockDocumentChunkFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isParent: false,
          }),
        }),
      );
    });

    it('fallback path excludes ATTORNEY_ONLY, legal analysis, work product, privileged docs', async () => {
      mockHybridSearch.mockResolvedValueOnce([]);

      mockDocumentChunkFindMany.mockResolvedValueOnce([]);

      await processExaminerChat(makeChatRequest());

      expect(mockDocumentChunkFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            document: expect.objectContaining({
              claimId: CLAIM_ID,
              accessLevel: { not: 'ATTORNEY_ONLY' },
              containsLegalAnalysis: false,
              containsWorkProduct: false,
              containsPrivileged: false,
            }),
          }),
        }),
      );
    });

    it('fallback returns empty citations when no chunks exist', async () => {
      mockHybridSearch.mockResolvedValueOnce([]);
      mockDocumentChunkFindMany.mockResolvedValueOnce([]);

      const response = await processExaminerChat(makeChatRequest());

      expect(response.citations).toEqual([]);
    });
  });

  // =========================================================================
  // Context string building
  // =========================================================================

  describe('context string building', () => {
    it('passes citations into LLM prompt as [Source N: documentName]', async () => {
      mockHybridSearch.mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Child content',
          parentContent: 'Parent content about TD',
          headingBreadcrumb: 'Benefits > TD',
          vectorScore: 0.9,
          keywordScore: 0.8,
          fusedScore: 0.02,
          matchedKeywords: [],
        },
      ]);

      await processExaminerChat(makeChatRequest());

      // The LLM generate call should include the citation content in the user message
      expect(mockLLMGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('[Source 1: Benefits > TD]'),
            }),
          ]),
        }),
      );
    });

    it('includes "No relevant documents found" when citations are empty', async () => {
      mockHybridSearch.mockResolvedValueOnce([]);
      mockDocumentChunkFindMany.mockResolvedValueOnce([]);

      await processExaminerChat(makeChatRequest());

      expect(mockLLMGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('No relevant documents found'),
            }),
          ]),
        }),
      );
    });
  });

  // =========================================================================
  // Integration with UPL pipeline
  // =========================================================================

  describe('RED zone skips retrieval entirely', () => {
    it('does not call hybridSearch or fallback when zone is RED', async () => {
      mockClassifyQuery.mockResolvedValueOnce({
        zone: 'RED',
        confidence: 0.99,
        reason: 'Legal advice request',
        isAdversarial: false,
      });
      mockChatMessageCreate.mockResolvedValue({ id: 'msg-blocked' });

      const response = await processExaminerChat(makeChatRequest('Should I accept this claim?'));

      expect(response.wasBlocked).toBe(true);
      expect(response.citations).toEqual([]);
      expect(mockHybridSearch).not.toHaveBeenCalled();
      expect(mockDocumentChunkFindMany).not.toHaveBeenCalled();
    });
  });
});
