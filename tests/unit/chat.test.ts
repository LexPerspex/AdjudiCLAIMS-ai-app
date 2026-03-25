import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Chat service tests.
 *
 * Tests the examiner AI chat pipeline (processExaminerChat),
 * counsel referral generation (generateCounselReferral),
 * and UPL-compliant system prompts.
 *
 * The LLM adapter is mocked to return stub responses -- no real API calls.
 * The UPL classifier uses keyword-only mode (no API key in tests).
 * Prisma is mocked to prevent database calls.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-1';
const MOCK_ORG_ID = 'org-1';
const MOCK_CLAIM_ID = 'claim-1';

/** Minimal mock that satisfies FastifyRequest for audit logging. */
function makeMockRequest(): {
  headers: Record<string, string>;
  ip: string;
  log: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
} {
  return {
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'vitest/1.0',
    },
    ip: '127.0.0.1',
    log: {
      error: vi.fn(),
      info: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockSessionCreate = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockMessageCreate = vi.fn();
const mockChunkFindMany = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockAuditCreate = vi.fn().mockResolvedValue({});

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    chatSession: {
      create: (...args: unknown[]) => mockSessionCreate(...args) as unknown,
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args) as unknown,
    },
    chatMessage: {
      create: (...args: unknown[]) => mockMessageCreate(...args) as unknown,
    },
    documentChunk: {
      findMany: (...args: unknown[]) => mockChunkFindMany(...args) as unknown,
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    },
    auditEvent: {
      create: (...args: unknown[]) => mockAuditCreate(...args) as unknown,
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'ep-1', userId: 'user-1', dismissedTerms: [], trainingModulesCompleted: null, isTrainingComplete: true, learningModeExpiry: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock LLM adapter to return stub responses (no real API calls)
vi.mock('../../server/lib/llm/index.js', () => ({
  getLLMAdapter: () => ({
    provider: 'gemini',
    modelId: 'gemini-2.0-flash-lite',
    generate: vi.fn().mockResolvedValue({
      content: 'The TD rate is calculated based on 2/3 of Average Weekly Earnings (AWE).',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'STUB',
    }),
    generateStructured: vi.fn(),
    classify: vi.fn(),
  }),
  _resetAdapterCache: vi.fn(),
}));

// Dynamic imports after mocks are in place
const { processExaminerChat } = await import(
  '../../server/services/examiner-chat.service.js'
);
const { generateCounselReferral } = await import(
  '../../server/services/counsel-referral.service.js'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chat services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // processExaminerChat
  // =========================================================================

  describe('processExaminerChat', () => {
    // -----------------------------------------------------------------------
    // GREEN zone queries
    // -----------------------------------------------------------------------

    it('processes a GREEN zone message and returns wasBlocked: false', async () => {
      // Session creation
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-green' });
      // User message stored
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-1' });
      // RAG retrieval returns empty
      mockChunkFindMany.mockResolvedValueOnce([]);
      // Assistant message stored
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-1' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What is the TD rate for AWE of 1200?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.wasBlocked).toBe(false);
      expect(result.classification.zone).toBe('GREEN');
      expect(result.sessionId).toBe('session-green');
      expect(result.messageId).toBe('assistant-msg-1');
    });

    it('returns stub mode content when LLM returns STUB finishReason', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-stub' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-stub' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-stub' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What is the TD rate for this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.content).toContain('stub mode');
      expect(result.content).toContain('GREEN');
    });

    it('includes citations from RAG retrieval', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-rag' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-rag' });
      mockChunkFindMany.mockResolvedValueOnce([
        {
          id: 'chunk-1',
          content: 'Dr. Smith diagnosed lumbar spine injury with 12% WPI.',
          document: { id: 'doc-1', fileName: 'medical-report.pdf' },
        },
        {
          id: 'chunk-2',
          content: 'Treatment plan includes physical therapy.',
          document: { id: 'doc-2', fileName: 'treatment-plan.pdf' },
        },
      ]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-rag' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What WPI did Dr. Smith assign?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]?.documentName).toBe('medical-report.pdf');
      expect(result.citations[1]?.documentName).toBe('treatment-plan.pdf');
    });

    it('attaches disclaimer for GREEN zone', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-disc' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-disc' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-disc' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What is the TD rate for this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.disclaimer).toBeDefined();
      expect(result.disclaimer.zone).toBe('GREEN');
      expect(result.disclaimer.isBlocked).toBe(false);
    });

    // -----------------------------------------------------------------------
    // RED zone queries
    // -----------------------------------------------------------------------

    it('blocks a RED zone message with wasBlocked: true', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-red' });
      // User message stored
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-red' });
      // Blocked assistant message stored
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-red' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I deny this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.wasBlocked).toBe(true);
      expect(result.classification.zone).toBe('RED');
      expect(result.citations).toHaveLength(0);
    });

    it('returns RED zone referral content for blocked messages', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-red-content' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-red2' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-red2' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I accept this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.wasBlocked).toBe(true);
      expect(result.content).toContain('attorney');
    });

    it('does not call RAG retrieval for RED zone queries', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-no-rag' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-norag' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-norag' });

      await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I settle this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      // documentChunk.findMany should NOT be called for RED zone
      expect(mockChunkFindMany).not.toHaveBeenCalled();
    });

    it('returns validation PASS for RED zone (validation not needed for blocked responses)', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-red-val' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-val' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-val' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I reject this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.validation.result).toBe('PASS');
      expect(result.validation.violations).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Session management
    // -----------------------------------------------------------------------

    it('creates a new session when no sessionId is provided', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-new' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-new' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-new' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Summarize the report for this claim.',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.sessionId).toBe('session-new');
      expect(mockSessionCreate).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing session when valid sessionId is provided', async () => {
      mockSessionFindFirst.mockResolvedValueOnce({ id: 'session-existing' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-reuse' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-reuse' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        sessionId: 'session-existing',
        message: 'What documents are in this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.sessionId).toBe('session-existing');
      expect(mockSessionFindFirst).toHaveBeenCalledTimes(1);
      expect(mockSessionCreate).not.toHaveBeenCalled();
    });

    it('creates a new session when provided sessionId is not found', async () => {
      mockSessionFindFirst.mockResolvedValueOnce(null);
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-fallback' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-fallback' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-fallback' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        sessionId: 'nonexistent-session',
        message: 'What is the date of injury?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      expect(result.sessionId).toBe('session-fallback');
      expect(mockSessionCreate).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Audit logging
    // -----------------------------------------------------------------------

    it('logs audit events for GREEN zone classification and response', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-audit' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-audit' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-audit' });

      await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What is the TD rate for this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      // Audit events are fire-and-forget (void), but we can check that
      // auditEvent.create was called for classification + response
      // Allow time for the void promises to resolve
      await new Promise((r) => setTimeout(r, 50));
      expect(mockAuditCreate).toHaveBeenCalled();
    });

    it('logs audit events for RED zone blocking', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-audit-red' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-audit-red' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-audit-red' });

      await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I deny this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockAuditCreate).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // YELLOW zone queries (no keyword match -> YELLOW default in stub mode)
    // -----------------------------------------------------------------------

    it('classifies unmatched queries as YELLOW in keyword-only mode', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-yellow' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-yellow' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-yellow' });

      const result = await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Tell me about the apportionment situation in this claim.',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      // In stub mode, queries that don't match GREEN or RED keywords
      // fall to LLM which returns STUB -> classifyQuerySync -> YELLOW
      expect(result.classification.zone).toBe('YELLOW');
      expect(result.wasBlocked).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Message persistence
    // -----------------------------------------------------------------------

    it('stores the user message with correct UPL zone', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-persist' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-persist' });
      mockChunkFindMany.mockResolvedValueOnce([]);
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-persist' });

      await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'What is the TD rate for AWE of 1500?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      // First call to chatMessage.create is the user message
      const userMsgCall = mockMessageCreate.mock.calls[0] as [
        { data: { sessionId: string; role: string; content: string; uplZone: string } },
      ];
      expect(userMsgCall[0].data.role).toBe('USER');
      expect(userMsgCall[0].data.uplZone).toBe('GREEN');
    });

    it('stores the blocked assistant message with wasBlocked: true for RED zone', async () => {
      mockSessionCreate.mockResolvedValueOnce({ id: 'session-block-persist' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'user-msg-block' });
      mockMessageCreate.mockResolvedValueOnce({ id: 'assistant-msg-block' });

      await processExaminerChat({
        claimId: MOCK_CLAIM_ID,
        message: 'Should I deny this claim?',
        userId: MOCK_USER_ID,
        orgId: MOCK_ORG_ID,
        request: makeMockRequest() as never,
      });

      // Second call to chatMessage.create is the assistant message
      const assistantMsgCall = mockMessageCreate.mock.calls[1] as [
        {
          data: {
            sessionId: string;
            role: string;
            uplZone: string;
            wasBlocked: boolean;
            disclaimerApplied: boolean;
          };
        },
      ];
      expect(assistantMsgCall[0].data.role).toBe('ASSISTANT');
      expect(assistantMsgCall[0].data.wasBlocked).toBe(true);
      expect(assistantMsgCall[0].data.disclaimerApplied).toBe(true);
      expect(assistantMsgCall[0].data.uplZone).toBe('RED');
    });
  });

  // =========================================================================
  // generateCounselReferral
  // =========================================================================

  describe('generateCounselReferral', () => {
    const MOCK_CLAIM_DATA = {
      claimNumber: 'WC-2026-0001',
      claimantName: 'John Doe',
      dateOfInjury: new Date('2026-01-15'),
      bodyParts: ['lumbar spine'],
      employer: 'Acme Corp',
      insurer: 'Acme Insurance',
      status: 'OPEN',
      dateReceived: new Date('2026-01-20'),
      dateAcknowledged: null,
      dateDetermined: null,
      isLitigated: false,
      hasApplicantAttorney: false,
      totalPaidIndemnity: { toString: () => '0.00' },
      totalPaidMedical: { toString: () => '0.00' },
      currentReserveIndemnity: { toString: () => '10000.00' },
      currentReserveMedical: { toString: () => '5000.00' },
      documents: [
        {
          id: 'doc-1',
          fileName: 'medical-report.pdf',
          documentType: 'MEDICAL_REPORT',
          createdAt: new Date('2026-01-25'),
        },
      ],
      deadlines: [
        {
          deadlineType: 'ACKNOWLEDGE_15DAY',
          dueDate: new Date('2026-02-04'),
          status: 'PENDING',
          statutoryAuthority: '10 CCR 2695.5(b)',
        },
      ],
    };

    it('generates a counsel referral summary for a valid claim', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Coverage question identified',
        request: makeMockRequest() as never,
      });

      expect(result.wasBlocked).toBe(false);
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('includes all 6 required sections in the stub summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Apportionment dispute',
        request: makeMockRequest() as never,
      });

      expect(result.sections).toContain('Claim Overview');
      expect(result.sections).toContain('Medical Evidence');
      expect(result.sections).toContain('Benefits Status');
      expect(result.sections).toContain('Claim Timeline');
      expect(result.sections).toContain('Legal Issue Identified');
      expect(result.sections).toContain('Documents Available');
      expect(result.sections).toHaveLength(6);
    });

    it('includes the legal issue in the summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Disputed apportionment between current and prior injuries',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toContain(
        'Disputed apportionment between current and prior injuries',
      );
    });

    it('includes claim financial data in the summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Reserve question',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toContain('$10000.00');
      expect(result.summary).toContain('$5000.00');
    });

    it('includes claimant info in the summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Coverage question',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toContain('John Doe');
      expect(result.summary).toContain('WC-2026-0001');
    });

    it('includes document list in the summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Medical dispute',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toContain('medical-report.pdf');
    });

    it('returns empty summary for non-existent claim', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const result = await generateCounselReferral({
        claimId: 'nonexistent-claim',
        userId: MOCK_USER_ID,
        legalIssue: 'Coverage question',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toBe('Claim not found.');
      expect(result.sections).toHaveLength(0);
      expect(result.wasBlocked).toBe(false);
    });

    it('passes UPL output validation for the stub summary', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Medical dispute',
        request: makeMockRequest() as never,
      });

      expect(result.validation.result).toBe('PASS');
      expect(result.validation.violations).toHaveLength(0);
    });

    it('ends the stub summary with the defense counsel review line', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      const result = await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Apportionment dispute',
        request: makeMockRequest() as never,
      });

      expect(result.summary).toContain(
        "defense counsel's review and legal analysis",
      );
    });

    it('logs audit event for generated referral', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);

      await generateCounselReferral({
        claimId: MOCK_CLAIM_ID,
        userId: MOCK_USER_ID,
        legalIssue: 'Coverage question',
        request: makeMockRequest() as never,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockAuditCreate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // System prompts
  // =========================================================================

  describe('System prompts', () => {
    it('EXAMINER_CASE_CHAT_PROMPT contains UPL boundary language', async () => {
      const { EXAMINER_CASE_CHAT_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain(
        'UNAUTHORIZED PRACTICE OF LAW',
      );
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('GREEN ZONE');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('YELLOW ZONE');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('RED ZONE');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain(
        'Business and Professions Code',
      );
    });

    it('EXAMINER_CASE_CHAT_PROMPT states it is NOT a lawyer', async () => {
      const { EXAMINER_CASE_CHAT_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('NOT a lawyer');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('NOT a legal advisor');
    });

    it('EXAMINER_CASE_CHAT_PROMPT prohibits advisory language', async () => {
      const { EXAMINER_CASE_CHAT_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('You should');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('I recommend');
      expect(EXAMINER_CASE_CHAT_PROMPT).toContain('NEVER use advisory framing');
    });

    it('EXAMINER_DRAFT_CHAT_PROMPT restricts to administrative documents', async () => {
      const { EXAMINER_DRAFT_CHAT_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(EXAMINER_DRAFT_CHAT_PROMPT).toContain(
        'FACTUAL AND ADMINISTRATIVE documents only',
      );
      expect(EXAMINER_DRAFT_CHAT_PROMPT).toContain('MUST REFUSE');
    });

    it('EXAMINER_DRAFT_CHAT_PROMPT lists prohibited document types', async () => {
      const { EXAMINER_DRAFT_CHAT_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(EXAMINER_DRAFT_CHAT_PROMPT).toContain('Settlement offers');
      expect(EXAMINER_DRAFT_CHAT_PROMPT).toContain(
        'Legal position statements',
      );
      expect(EXAMINER_DRAFT_CHAT_PROMPT).toContain('Coverage analysis memos');
    });

    it('COUNSEL_REFERRAL_PROMPT requires all 6 sections', async () => {
      const { COUNSEL_REFERRAL_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Claim Overview');
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Medical Evidence');
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Benefits Status');
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Claim Timeline');
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Legal Issue Identified');
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Documents Available');
    });

    it('COUNSEL_REFERRAL_PROMPT enforces factual-only language', async () => {
      const { COUNSEL_REFERRAL_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(COUNSEL_REFERRAL_PROMPT).toContain('ONLY factual information');
      expect(COUNSEL_REFERRAL_PROMPT).toContain(
        'No legal conclusions or recommendations',
      );
      expect(COUNSEL_REFERRAL_PROMPT).toContain('Factual framing only');
    });

    it('COUNSEL_REFERRAL_PROMPT ends with defense counsel closing line', async () => {
      const { COUNSEL_REFERRAL_PROMPT } = await import(
        '../../server/prompts/adjudiclaims-chat.prompts.js'
      );
      expect(COUNSEL_REFERRAL_PROMPT).toContain(
        "defense counsel's review and legal analysis",
      );
    });
  });
});
