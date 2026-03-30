import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Education routes tests — Layer 3 ongoing education endpoints.
 *
 * Tests all route handlers defined in server/routes/education.ts for the
 * Layer 3 ongoing education system:
 *   - GET  /api/education/changes
 *   - POST /api/education/changes/:changeId/acknowledge
 *   - GET  /api/education/monthly-review
 *   - POST /api/education/monthly-review/complete
 *   - GET  /api/education/refreshers/current
 *   - POST /api/education/refreshers/:quarter/submit
 *   - GET  /api/education/audit-training
 *
 * Uses server.inject() with mocked Prisma to validate:
 *   - Authentication enforcement (401 for unauthenticated)
 *   - Input validation (400 for invalid params/body)
 *   - Happy paths (200 for valid requests)
 *   - Error paths (404 for not found, 400 for bad data)
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
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  deletedAt: null,
  deletedBy: null,
};

// ---------------------------------------------------------------------------
// Mock Prisma — full mock matching the pattern from education-profile.test.ts
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockEducationProfileFindUnique = vi.fn();
const mockEducationProfileFindUniqueOrThrow = vi.fn();
const mockEducationProfileUpsert = vi.fn();
const mockEducationProfileUpdate = vi.fn();
const mockRegDeadlineFindMany = vi.fn();
const mockClaimFindMany = vi.fn();

vi.mock('argon2', () => ({
  default: { verify: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'), argon2id: 2 },
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
  argon2id: 2,
}));
vi.mock('@otplib/preset-default', () => ({
  authenticator: {
    generateSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    keyuri: vi.fn().mockReturnValue('otpauth://totp/AdjudiCLAIMS:test@test.com?secret=JBSWY3DPEHPK3PXP'),
    verify: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: (...args: unknown[]) => mockClaimFindMany(...args) as unknown,
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    investigationItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 10 }),
    },
    regulatoryDeadline: {
      findMany: (...args: unknown[]) => mockRegDeadlineFindMany(...args) as unknown,
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
      update: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findUnique: (...args: unknown[]) => mockEducationProfileFindUnique(...args) as unknown,
      findUniqueOrThrow: (...args: unknown[]) => mockEducationProfileFindUniqueOrThrow(...args) as unknown,
      upsert: (...args: unknown[]) => mockEducationProfileUpsert(...args) as unknown,
      update: (...args: unknown[]) => mockEducationProfileUpdate(...args) as unknown,
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    chatSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    documentChunk: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    benefitPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      // pass the prisma mock itself as tx
      const { prisma } = await import('../../server/db.js');
      return fn(prisma);
    }),
  },
}));

// Mock external services required by server build
vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/test'),
    download: vi.fn().mockResolvedValue(Buffer.from('test')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/services/document-pipeline.service.js', () => ({
  processDocumentPipeline: vi.fn().mockResolvedValue({
    documentId: 'doc-1',
    ocrSuccess: true,
    classificationSuccess: true,
    extractionSuccess: true,
    embeddingSuccess: true,
    timelineSuccess: true,
    chunksCreated: 0,
    fieldsExtracted: 0,
    timelineEventsCreated: 0,
    errors: [],
  }),
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// Import data for test reference
const { REGULATORY_CHANGES } = await import('../../server/data/regulatory-changes.js');
const { QUARTERLY_REFRESHERS } = await import('../../server/data/quarterly-refreshers.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_USER,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);

  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: 'TestPassword1!' },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ---------------------------------------------------------------------------
// Defaults for education profile mocks
// ---------------------------------------------------------------------------

const MOCK_PROFILE_BASE = {
  id: 'ep-1',
  userId: 'user-1',
  dismissedTerms: [],
  acknowledgedChanges: [],
  monthlyReviewsCompleted: null,
  quarterlyRefreshers: null,
  auditTrainingCompleted: null,
  trainingModulesCompleted: null,
  isTrainingComplete: true,
  learningModeExpiry: null,
  lastRecertificationDate: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Education Routes — Layer 3 Ongoing Education', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegDeadlineFindMany.mockResolvedValue([]);
    mockClaimFindMany.mockResolvedValue([]);
  });

  // =========================================================================
  // GET /api/education/changes
  // =========================================================================

  describe('GET /api/education/changes', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/changes',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns all changes with isAcknowledged annotations', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getPendingChanges calls findUnique
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        acknowledgedChanges: [],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/changes',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ changes: Array<{ id: string; isAcknowledged: boolean }> }>();
      expect(body.changes.length).toBe(REGULATORY_CHANGES.length);
      // All should be unacknowledged for a fresh user
      for (const change of body.changes) {
        expect(change.isAcknowledged).toBe(false);
      }
    });

    it('marks acknowledged changes correctly', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const firstChangeId = (REGULATORY_CHANGES[0] as (typeof REGULATORY_CHANGES)[number]).id;

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        acknowledgedChanges: [firstChangeId],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/changes',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ changes: Array<{ id: string; isAcknowledged: boolean }> }>();
      const acked = body.changes.find((c) => c.id === firstChangeId);
      expect(acked?.isAcknowledged).toBe(true);

      // Others should be unacknowledged
      const unacked = body.changes.filter((c) => c.id !== firstChangeId);
      for (const change of unacked) {
        expect(change.isAcknowledged).toBe(false);
      }
    });

    it('returns changes with required fields (title, effectiveDate, urgency)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        acknowledgedChanges: [],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/changes',
        headers: { cookie },
      });

      const body = response.json<{ changes: Array<{ title: string; effectiveDate: string; urgency: string }> }>();
      for (const change of body.changes) {
        expect(change.title).toBeTruthy();
        expect(change.effectiveDate).toBeTruthy();
        expect(change.urgency).toBeTruthy();
      }
    });
  });

  // =========================================================================
  // POST /api/education/changes/:changeId/acknowledge
  // =========================================================================

  describe('POST /api/education/changes/:changeId/acknowledge', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/education/changes/rc-2026-001/acknowledge',
      });
      expect(response.statusCode).toBe(401);
    });

    it('acknowledges a valid change and returns success', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const firstChangeId = (REGULATORY_CHANGES[0] as (typeof REGULATORY_CHANGES)[number]).id;

      // acknowledgeChange calls: upsert, findUniqueOrThrow, update
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({
        acknowledgedChanges: [],
      });
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        acknowledgedChanges: [firstChangeId],
      });

      const response = await server.inject({
        method: 'POST',
        url: `/api/education/changes/${firstChangeId}/acknowledge`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ success: boolean; changeId: string }>();
      expect(body.success).toBe(true);
      expect(body.changeId).toBe(firstChangeId);
    });

    it('returns 404 for unknown change ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/changes/rc-nonexistent/acknowledge',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Regulatory change not found');
    });

    it('returns 400 for empty change ID segment', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Double-slash URL gets normalized by Fastify — results in 400 validation error
      const response = await server.inject({
        method: 'POST',
        url: '/api/education/changes//acknowledge',
        headers: { cookie },
      });

      // Fastify normalizes the URL; the empty segment triggers a validation error
      expect([400, 404]).toContain(response.statusCode);
    });
  });

  // =========================================================================
  // GET /api/education/monthly-review
  // =========================================================================

  describe('GET /api/education/monthly-review', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/monthly-review',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns isDue=true and review data for a new user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // isMonthlyReviewDue calls findUnique — return null (no profile)
      mockEducationProfileFindUnique.mockResolvedValueOnce(null);
      // generateMonthlyReview calls regulatoryDeadline.findMany x2, claim.findMany x1
      // (already default empty from beforeEach)

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/monthly-review',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        isDue: boolean;
        review: {
          month: string;
          userId: string;
          organizationId: string;
          missedDeadlines: unknown[];
          approachingDeadlines: unknown[];
          claimsWithoutRecentActivity: unknown[];
          generatedAt: string;
        };
      }>();

      expect(body.isDue).toBe(true);
      expect(body.review.userId).toBe(MOCK_USER.id);
      expect(body.review.organizationId).toBe(MOCK_USER.organizationId);
      expect(body.review.month).toMatch(/^\d{4}-\d{2}$/);
      expect(Array.isArray(body.review.missedDeadlines)).toBe(true);
      expect(Array.isArray(body.review.approachingDeadlines)).toBe(true);
      expect(Array.isArray(body.review.claimsWithoutRecentActivity)).toBe(true);
    });

    it('returns isDue=false when current month is completed', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const now = new Date();
      const currentMonth = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        monthlyReviewsCompleted: {
          [currentMonth]: { completedAt: now.toISOString(), missedDeadlineCount: 0 },
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/monthly-review',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ isDue: boolean }>();
      expect(body.isDue).toBe(false);
    });
  });

  // =========================================================================
  // POST /api/education/monthly-review/complete
  // =========================================================================

  describe('POST /api/education/monthly-review/complete', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        payload: { month: '2026-03' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('completes a monthly review and returns success', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // completeMonthlyReview calls: upsert, findUniqueOrThrow, update
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({
        monthlyReviewsCompleted: null,
      });
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        monthlyReviewsCompleted: { '2026-03': { completedAt: new Date().toISOString(), missedDeadlineCount: 0 } },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        headers: { cookie },
        payload: { month: '2026-03' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ success: boolean; month: string }>();
      expect(body.success).toBe(true);
      expect(body.month).toBe('2026-03');
    });

    it('returns 400 for invalid month format — text', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        headers: { cookie },
        payload: { month: 'March 2026' },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for invalid month format — full date', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        headers: { cookie },
        payload: { month: '2026-03-15' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing month field', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/monthly-review/complete',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/education/refreshers/current
  // =========================================================================

  describe('GET /api/education/refreshers/current', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/refreshers/current',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns refresher and status for authenticated user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getRefresherStatus calls findUnique
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        quarterlyRefreshers: null,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/refreshers/current',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        refresher: unknown;
        status: {
          currentQuarter: string | null;
          completedRefreshers: Record<string, unknown>;
          isCurrentQuarterComplete: boolean;
        };
      }>();

      expect(body).toHaveProperty('refresher');
      expect(body).toHaveProperty('status');
      expect(body.status).toHaveProperty('currentQuarter');
      expect(body.status).toHaveProperty('completedRefreshers');
      expect(body.status).toHaveProperty('isCurrentQuarterComplete');
    });

    it('does not expose correctOptionId in refresher questions', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        quarterlyRefreshers: null,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/refreshers/current',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        refresher: { questions: Array<Record<string, unknown>> } | null;
      }>();

      if (body.refresher) {
        for (const q of body.refresher.questions) {
          expect(q).not.toHaveProperty('correctOptionId');
        }
      }
    });
  });

  // =========================================================================
  // POST /api/education/refreshers/:quarter/submit
  // =========================================================================

  describe('POST /api/education/refreshers/:quarter/submit', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/education/refreshers/2026-Q1/submit',
        payload: { answers: {} },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid quarter format', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/refreshers/2026-1/submit',
        headers: { cookie },
        payload: { answers: { q1: 'a' } },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid quarter format');
    });

    it('returns 400 for invalid quarter format — Q5', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/refreshers/2026-Q5/submit',
        headers: { cookie },
        payload: { answers: { q1: 'a' } },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing answers in body', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/refreshers/2026-Q1/submit',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for non-existent quarter refresher', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/refreshers/2099-Q4/submit',
        headers: { cookie },
        payload: { answers: { q1: 'a' } },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toContain('Quarterly refresher not found');
    });

    it('returns 400 for incomplete answers', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const refresher = QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number];

      const response = await server.inject({
        method: 'POST',
        url: `/api/education/refreshers/${refresher.quarter}/submit`,
        headers: { cookie },
        payload: { answers: { [refresher.questions[0]!.id]: refresher.questions[0]!.correctOptionId } },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toContain('Refresher assessment incomplete');
    });

    it('submits correct answers and returns passing result', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const refresher = QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number];

      // submitRefresherAssessment calls: upsert, findUniqueOrThrow, update
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({
        quarterlyRefreshers: null,
      });
      mockEducationProfileUpdate.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });

      const allCorrect: Record<string, string> = {};
      for (const q of refresher.questions) {
        allCorrect[q.id] = q.correctOptionId;
      }

      const response = await server.inject({
        method: 'POST',
        url: `/api/education/refreshers/${refresher.quarter}/submit`,
        headers: { cookie },
        payload: { answers: allCorrect },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        quarter: string;
        score: number;
        passed: boolean;
        totalQuestions: number;
        correctCount: number;
        results: Array<{ questionId: string; correct: boolean; explanation: string }>;
      }>();

      expect(body.score).toBe(1);
      expect(body.passed).toBe(true);
      expect(body.correctCount).toBe(refresher.totalQuestions);
      expect(body.totalQuestions).toBe(refresher.totalQuestions);
      expect(body.quarter).toBe(refresher.quarter);
      expect(body.results.length).toBe(refresher.totalQuestions);
    });

    it('submits wrong answers and returns failing result', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const refresher = QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number];

      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({
        quarterlyRefreshers: null,
      });
      mockEducationProfileUpdate.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });

      const allWrong: Record<string, string> = {};
      for (const q of refresher.questions) {
        const wrongOption = q.options.find((o) => o.id !== q.correctOptionId);
        allWrong[q.id] = (wrongOption as NonNullable<typeof wrongOption>).id;
      }

      const response = await server.inject({
        method: 'POST',
        url: `/api/education/refreshers/${refresher.quarter}/submit`,
        headers: { cookie },
        payload: { answers: allWrong },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ score: number; passed: boolean; correctCount: number }>();
      expect(body.score).toBe(0);
      expect(body.passed).toBe(false);
      expect(body.correctCount).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/education/audit-training
  // =========================================================================

  describe('GET /api/education/audit-training', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/audit-training',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns empty requirements array when no audit triggers', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getRequiredAuditTraining calls: upsert, findUniqueOrThrow, then auditEvent.count (3x)
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({ auditTrainingCompleted: {} });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/audit-training',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ requirements: unknown[] }>();
      expect(body.requirements).toEqual([]);
    });
  });
});
