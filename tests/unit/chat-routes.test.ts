import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Chat route tests.
 *
 * Uses server.inject() with mocked Prisma and service modules to test
 * chat endpoints: send message, list sessions, get messages, counsel referral.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-1',
  email: 'examiner@acme-ins.test',
  name: 'Jane Examiner',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_SUPERVISOR = {
  id: 'user-sup',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_CLAIM = {
  id: 'claim-1',
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockChatSessionFindMany = vi.fn();
const mockChatSessionFindUnique = vi.fn();
const mockChatMessageFindMany = vi.fn();
const mockChatMessageCount = vi.fn();

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  user: {
    findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
  },
  claim: {
    findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
  },
  chatSession: {
    findMany: (...args: unknown[]) => mockChatSessionFindMany(...args) as unknown,
    findUnique: (...args: unknown[]) => mockChatSessionFindUnique(...args) as unknown,
  },
  chatMessage: {
    findMany: (...args: unknown[]) => mockChatMessageFindMany(...args) as unknown,
    count: (...args: unknown[]) => mockChatMessageCount(...args) as unknown,
  },
  auditEvent: {
    create: vi.fn().mockResolvedValue({}),
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
};

vi.mock('../../server/db.js', () => ({
  prisma: mockPrisma,
}));

// Mock the chat services so routes don't need real LLM / full service stack
const mockProcessExaminerChat = vi.fn();
vi.mock('../../server/services/examiner-chat.service.js', () => ({
  processExaminerChat: (...args: unknown[]) => mockProcessExaminerChat(...args) as unknown,
}));

const mockGenerateCounselReferral = vi.fn();
vi.mock('../../server/services/counsel-referral.service.js', () => ({
  generateCounselReferral: (...args: unknown[]) => mockGenerateCounselReferral(...args) as unknown,
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_USER | typeof MOCK_SUPERVISOR,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);

  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chat routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /api/claims/:claimId/chat
  // =========================================================================

  describe('POST /api/claims/:claimId/chat', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/chat',
        payload: { message: 'What is the TD rate?' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim access is denied', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Claim not found or not authorized
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-999/chat',
        headers: { cookie },
        payload: { message: 'What is the TD rate?' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for empty message', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/chat',
        headers: { cookie },
        payload: { message: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for missing message field', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/chat',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('sends a message and returns chat response', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockProcessExaminerChat.mockResolvedValueOnce({
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'The TD rate is calculated based on 2/3 of AWE.',
        classification: { zone: 'GREEN' },
        wasBlocked: false,
        disclaimer: { disclaimer: 'This is factual information only.' },
        citations: [
          { documentId: 'doc-1', documentName: 'report.pdf', content: 'Some content from the document' },
        ],
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/chat',
        headers: { cookie },
        payload: { message: 'What is the TD rate?' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        sessionId: string;
        messageId: string;
        content: string;
        zone: string;
        wasBlocked: boolean;
        disclaimer: string;
        citations: Array<{ documentId: string; documentName: string; snippet: string }>;
      }>();

      expect(body.sessionId).toBe('session-1');
      expect(body.zone).toBe('GREEN');
      expect(body.wasBlocked).toBe(false);
      expect(body.citations).toHaveLength(1);
      expect(body.citations[0]?.documentName).toBe('report.pdf');
    });

    it('passes sessionId to service when provided', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockProcessExaminerChat.mockResolvedValueOnce({
        sessionId: 'session-existing',
        messageId: 'msg-2',
        content: 'Response',
        classification: { zone: 'GREEN' },
        wasBlocked: false,
        disclaimer: { disclaimer: '' },
        citations: [],
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/chat',
        headers: { cookie },
        payload: { message: 'Follow-up question', sessionId: 'session-existing' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockProcessExaminerChat).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-existing' }),
      );
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/chat/sessions
  // =========================================================================

  describe('GET /api/claims/:claimId/chat/sessions', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/chat/sessions',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/chat/sessions',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns sessions for the claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockChatSessionFindMany.mockResolvedValueOnce([
        {
          id: 'session-1',
          claimId: 'claim-1',
          userId: 'user-1',
          createdAt: new Date('2026-03-01'),
          _count: { messages: 5 },
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/chat/sessions',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ sessions: Array<{ id: string; messageCount: number }>; total: number }>();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]?.messageCount).toBe(5);
      expect(body.total).toBe(1);
    });
  });

  // =========================================================================
  // GET /api/chat/sessions/:sessionId/messages
  // =========================================================================

  describe('GET /api/chat/sessions/:sessionId/messages', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-1/messages',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when session not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockChatSessionFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/nonexistent/messages',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Session not found');
    });

    it('returns 404 when claim access is denied for session', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockChatSessionFindUnique.mockResolvedValueOnce({
        id: 'session-1',
        claimId: 'claim-other-org',
        userId: 'user-1',
      });
      // Claim access denied
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-1/messages',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when examiner tries to access another user session', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockChatSessionFindUnique.mockResolvedValueOnce({
        id: 'session-other',
        claimId: 'claim-1',
        userId: 'user-other',
      });
      // Claim access passes
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-other/messages',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns messages with pagination', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockChatSessionFindUnique.mockResolvedValueOnce({
        id: 'session-1',
        claimId: 'claim-1',
        userId: 'user-1',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const mockMessages = [
        { id: 'msg-1', role: 'USER', content: 'Hello', uplZone: 'GREEN', wasBlocked: false, disclaimerApplied: false, createdAt: new Date() },
        { id: 'msg-2', role: 'ASSISTANT', content: 'Hi there', uplZone: 'GREEN', wasBlocked: false, disclaimerApplied: false, createdAt: new Date() },
      ];

      mockChatMessageFindMany.mockResolvedValueOnce(mockMessages);
      mockChatMessageCount.mockResolvedValueOnce(2);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-1/messages',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ messages: unknown[]; total: number; take: number; skip: number }>();
      expect(body.messages).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.take).toBe(50);
      expect(body.skip).toBe(0);
    });

    it('respects pagination query params', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockChatSessionFindUnique.mockResolvedValueOnce({
        id: 'session-1',
        claimId: 'claim-1',
        userId: 'user-1',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockChatMessageFindMany.mockResolvedValueOnce([]);
      mockChatMessageCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-1/messages?take=10&skip=5',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ take: number; skip: number }>();
      expect(body.take).toBe(10);
      expect(body.skip).toBe(5);
    });

    it('allows supervisor to access other user sessions', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockChatSessionFindUnique.mockResolvedValueOnce({
        id: 'session-examiner',
        claimId: 'claim-1',
        userId: 'user-1', // Different user
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockChatMessageFindMany.mockResolvedValueOnce([]);
      mockChatMessageCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/sessions/session-examiner/messages',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // POST /api/claims/:claimId/counsel-referral
  // =========================================================================

  describe('POST /api/claims/:claimId/counsel-referral', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/counsel-referral',
        payload: { legalIssue: 'Coverage question' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-999/counsel-referral',
        headers: { cookie },
        payload: { legalIssue: 'Coverage question' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for missing legalIssue', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/counsel-referral',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for empty legalIssue', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/counsel-referral',
        headers: { cookie },
        payload: { legalIssue: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('generates a counsel referral summary', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockGenerateCounselReferral.mockResolvedValueOnce({
        summary: 'Factual summary for defense counsel.',
        sections: ['Claim Overview', 'Medical Evidence'],
        wasBlocked: false,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/counsel-referral',
        headers: { cookie },
        payload: { legalIssue: 'Disputed apportionment' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ summary: string; sections: string[]; wasBlocked: boolean }>();
      expect(body.summary).toBe('Factual summary for defense counsel.');
      expect(body.sections).toHaveLength(2);
      expect(body.wasBlocked).toBe(false);
    });
  });
});
