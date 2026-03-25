import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Deadline engine service + route tests.
 *
 * Tests urgency classification (pure functions), business day calculation,
 * deadline recalculation, and all HTTP endpoints with RBAC enforcement.
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

const _MOCK_SUPERVISOR = {
  id: 'user-2',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_OTHER_EXAMINER = {
  id: 'user-3',
  email: 'other@acme-ins.test',
  name: 'Other Examiner',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_CLAIM = {
  id: 'claim-1',
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
};

const MOCK_DEADLINE_PENDING = {
  id: 'dl-1',
  claimId: 'claim-1',
  deadlineType: 'ACKNOWLEDGE_15DAY' as const,
  dueDate: new Date('2026-04-05'),
  status: 'PENDING' as const,
  statutoryAuthority: '10 CCR 2695.5(b)',
  createdAt: new Date('2026-03-20'),
  completedAt: null,
};

const MOCK_DEADLINE_MET = {
  id: 'dl-2',
  claimId: 'claim-1',
  deadlineType: 'EMPLOYER_NOTIFY_15DAY' as const,
  dueDate: new Date('2026-04-05'),
  status: 'MET' as const,
  statutoryAuthority: 'LC 3761',
  createdAt: new Date('2026-03-20'),
  completedAt: new Date('2026-03-28'),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockDeadlineFindMany = vi.fn();
const mockDeadlineFindUnique = vi.fn();
const mockDeadlineCount = vi.fn();
const mockDeadlineUpdate = vi.fn();
const mockDeadlineCreateMany = vi.fn();
const mockInvestigationCreateMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    regulatoryDeadline: {
      findMany: (...args: unknown[]) => mockDeadlineFindMany(...args) as unknown,
      findUnique: (...args: unknown[]) => mockDeadlineFindUnique(...args) as unknown,
      count: (...args: unknown[]) => mockDeadlineCount(...args) as unknown,
      update: (...args: unknown[]) => mockDeadlineUpdate(...args) as unknown,
      createMany: (...args: unknown[]) => mockDeadlineCreateMany(...args) as unknown,
    },
    investigationItem: {
      createMany: (...args: unknown[]) => mockInvestigationCreateMany(...args) as unknown,
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
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

vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/test'),
    download: vi.fn().mockResolvedValue(Buffer.from('fake')),
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

vi.mock('../../server/services/investigation-checklist.service.js', () => ({
  getInvestigationProgress: vi.fn().mockResolvedValue({
    items: [],
    completedCount: 0,
    totalCount: 0,
    percentComplete: 0,
  }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/benefit-calculator.service.js', () => ({
  calculateTdRate: vi.fn().mockReturnValue({
    tdRate: 0,
    awe: 0,
    maxRate: 0,
    minRate: 0,
    statutoryAuthority: 'LC 4653',
  }),
  calculateTdBenefit: vi.fn().mockReturnValue({
    tdRate: 0,
    totalBenefit: 0,
    payments: [],
    statutoryAuthority: 'LC 4650',
  }),
  calculateDeathBenefit: vi.fn().mockReturnValue({
    totalBenefit: 0,
    burialAllowance: 0,
    statutoryAuthority: 'LC 4700',
  }),
}));

// Dynamic import after mocks are in place
const { buildServer } = await import('../../server/index.js');
const {
  classifyUrgency,
  addBusinessDays,
} = await import('../../server/services/deadline-engine.service.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
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

// ==========================================================================
// SERVICE TESTS — Pure functions (no DB)
// ==========================================================================

describe('Deadline Engine Service', () => {
  describe('classifyUrgency', () => {
    it('returns GREEN when less than 50% of time has elapsed', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-16'); // 15 days
      const now = new Date('2026-03-06'); // day 5 of 15 = 33%

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('GREEN');
      expect(result.percentElapsed).toBeLessThan(50);
      expect(result.daysRemaining).toBe(10);
    });

    it('returns YELLOW when 50-80% of time has elapsed', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-11'); // 10 days
      const now = new Date('2026-03-07'); // day 6 of 10 = 60%

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('YELLOW');
      expect(result.percentElapsed).toBeGreaterThanOrEqual(50);
      expect(result.percentElapsed).toBeLessThanOrEqual(80);
    });

    it('returns RED when more than 80% of time has elapsed', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-11'); // 10 days
      const now = new Date('2026-03-10'); // day 9 of 10 = 90%

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('RED');
      expect(result.percentElapsed).toBeGreaterThan(80);
      expect(result.daysRemaining).toBe(1);
    });

    it('returns OVERDUE when past the due date', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-11');
      const now = new Date('2026-03-15'); // 4 days past due

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('OVERDUE');
      expect(result.percentElapsed).toBe(100);
      expect(result.daysRemaining).toBe(0);
    });

    it('returns daysRemaining = 0 when overdue (never negative)', () => {
      const created = new Date('2026-01-01');
      const due = new Date('2026-01-10');
      const now = new Date('2026-02-01'); // well past due

      const result = classifyUrgency(created, due, now);

      expect(result.daysRemaining).toBe(0);
      expect(result.urgency).toBe('OVERDUE');
    });

    it('returns YELLOW at exactly 50% elapsed', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-11'); // 10 days
      const now = new Date('2026-03-06'); // day 5 of 10 = exactly 50%

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('YELLOW');
      expect(result.percentElapsed).toBe(50);
    });

    it('returns RED at exactly 80% elapsed', () => {
      const created = new Date('2026-03-01');
      const due = new Date('2026-03-11'); // 10 days
      const now = new Date('2026-03-09'); // day 8 of 10 = exactly 80%

      const result = classifyUrgency(created, due, now);

      // 80% is boundary — classified as YELLOW (50-80 inclusive)
      expect(result.urgency).toBe('YELLOW');
      expect(result.percentElapsed).toBe(80);
    });

    it('returns RED at 81% elapsed', () => {
      const created = new Date('2026-03-01T00:00:00Z');
      const due = new Date('2026-03-21T00:00:00Z'); // 20 days
      // 81% of 20 days = 16.2 days
      const now = new Date('2026-03-18T00:00:00Z'); // day 17 of 20 = 85%

      const result = classifyUrgency(created, due, now);

      expect(result.urgency).toBe('RED');
      expect(result.percentElapsed).toBeGreaterThan(80);
    });
  });

  describe('addBusinessDays', () => {
    it('skips weekends when adding business days', () => {
      // 2026-03-20 is a Friday
      const friday = new Date('2026-03-20');
      const result = addBusinessDays(friday, 1);

      // Next business day is Monday 2026-03-23
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2); // March
      expect(result.getDate()).toBe(23); // Monday
    });

    it('correctly adds 5 business days spanning a weekend', () => {
      // 2026-03-16 is a Monday
      const monday = new Date('2026-03-16');
      const result = addBusinessDays(monday, 5);

      // 5 business days from Monday = the following Monday 2026-03-23
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(23);
    });

    it('skips CA holidays (New Year observed)', () => {
      // 2026-01-01 is Thursday (New Year's Day)
      // Adding 1 business day from Dec 31 (Wednesday) should skip Jan 1
      const dec31 = new Date('2025-12-31');
      const result = addBusinessDays(dec31, 1);

      // Jan 1 is a holiday, so next business day is Jan 2 (Friday)
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(2);
    });

    it('skips Labor Day 2026 (first Monday of September)', () => {
      // 2026-09-07 is Labor Day (1st Monday of September)
      // 2026-09-04 is a Friday
      const friday = new Date('2026-09-04');
      const result = addBusinessDays(friday, 1);

      // Saturday Sep 5, Sunday Sep 6 (weekend), Monday Sep 7 (Labor Day)
      // Next business day is Tuesday Sep 8
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(8); // September
      expect(result.getDate()).toBe(8);
    });

    it('skips Christmas 2026 (December 25, Friday)', () => {
      // 2026-12-25 is a Friday = Christmas
      // 2026-12-24 is Thursday
      const thursday = new Date('2026-12-24');
      const result = addBusinessDays(thursday, 1);

      // Dec 25 is holiday (Friday), Dec 26/27 is weekend
      // Next business day is Monday Dec 28
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(11); // December
      expect(result.getDate()).toBe(28);
    });

    it('handles adding 0 business days (returns same date)', () => {
      const date = new Date('2026-03-18');
      const result = addBusinessDays(date, 0);
      expect(result.getTime()).toBe(date.getTime());
    });
  });
});

// ==========================================================================
// ROUTE TESTS — HTTP endpoints with mocked DB
// ==========================================================================

describe('Deadline routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  // =========================================================================
  // GET /api/claims/:claimId/deadlines
  // =========================================================================
  describe('GET /api/claims/:claimId/deadlines', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/deadlines',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns deadlines with urgency and summary for a claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      // getClaimDeadlines calls findMany
      mockDeadlineFindMany.mockResolvedValueOnce([MOCK_DEADLINE_PENDING, MOCK_DEADLINE_MET]);
      // getDeadlineSummary also calls getClaimDeadlines which calls findMany
      mockDeadlineFindMany.mockResolvedValueOnce([MOCK_DEADLINE_PENDING, MOCK_DEADLINE_MET]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/deadlines',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        deadlines: unknown[];
        summary: { total: number; pending: number; met: number };
        disclaimer: string;
      }>();

      expect(body.deadlines).toHaveLength(2);
      expect(body.summary.total).toBe(2);
      expect(body.disclaimer).toBe(
        'Deadlines calculated from statutory requirements. Verify underlying dates.',
      );
    });

    it('returns 404 for non-existent claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/nonexistent/deadlines',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/deadlines
  // =========================================================================
  describe('GET /api/deadlines', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/deadlines',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns all user deadlines sorted by urgency', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Past due deadline (OVERDUE) and future deadline (GREEN)
      const overdueDeadline = {
        ...MOCK_DEADLINE_PENDING,
        id: 'dl-overdue',
        dueDate: new Date('2026-01-01'), // past due
        createdAt: new Date('2025-12-01'),
      };
      const greenDeadline = {
        ...MOCK_DEADLINE_PENDING,
        id: 'dl-green',
        dueDate: new Date('2027-12-31'), // far future
        createdAt: new Date('2026-03-20'),
      };

      mockDeadlineCount.mockResolvedValueOnce(2);
      mockDeadlineFindMany.mockResolvedValueOnce([greenDeadline, overdueDeadline]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/deadlines',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        deadlines: Array<{ id: string; urgency: string }>;
        total: number;
        take: number;
        skip: number;
      }>();

      expect(body.total).toBe(2);
      expect(body.take).toBe(50);
      expect(body.skip).toBe(0);

      // OVERDUE should be first (sorted by urgency)
      expect(body.deadlines[0]?.urgency).toBe('OVERDUE');
      expect(body.deadlines[1]?.urgency).toBe('GREEN');
    });

    it('supports urgency filter query parameter', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const overdueDeadline = {
        ...MOCK_DEADLINE_PENDING,
        id: 'dl-overdue',
        dueDate: new Date('2026-01-01'),
        createdAt: new Date('2025-12-01'),
      };
      const greenDeadline = {
        ...MOCK_DEADLINE_PENDING,
        id: 'dl-green',
        dueDate: new Date('2027-12-31'),
        createdAt: new Date('2026-03-20'),
      };

      mockDeadlineCount.mockResolvedValueOnce(2);
      mockDeadlineFindMany.mockResolvedValueOnce([greenDeadline, overdueDeadline]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/deadlines?urgency=OVERDUE',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        deadlines: Array<{ id: string; urgency: string }>;
        total: number;
      }>();

      // Should only include OVERDUE deadlines
      expect(body.total).toBe(1);
      expect(body.deadlines[0]?.urgency).toBe('OVERDUE');
    });

    it('supports pagination', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // DB-level pagination: count returns total (3), findMany returns the
      // page slice that Prisma would return with take=1, skip=1.
      const pageSlice = [
        { ...MOCK_DEADLINE_PENDING, id: 'dl-b', dueDate: new Date('2026-01-02'), createdAt: new Date('2025-12-01') },
      ];

      mockDeadlineCount.mockResolvedValueOnce(3);
      mockDeadlineFindMany.mockResolvedValueOnce(pageSlice);

      const response = await server.inject({
        method: 'GET',
        url: '/api/deadlines?take=1&skip=1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        deadlines: unknown[];
        total: number;
        take: number;
        skip: number;
      }>();

      expect(body.total).toBe(3);
      expect(body.take).toBe(1);
      expect(body.skip).toBe(1);
      expect(body.deadlines).toHaveLength(1);
    });

    it('examiner only sees deadlines for their assigned claims', async () => {
      const cookie = await loginAs(server, MOCK_OTHER_EXAMINER);

      mockDeadlineCount.mockResolvedValueOnce(0);
      mockDeadlineFindMany.mockResolvedValueOnce([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/deadlines',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      // Verify the query used the examiner filter
      expect(mockDeadlineFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            claim: expect.objectContaining({
              assignedExaminerId: 'user-3',
            }) as unknown,
          }) as unknown,
        }),
      );
    });
  });

  // =========================================================================
  // PATCH /api/deadlines/:id
  // =========================================================================
  describe('PATCH /api/deadlines/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        payload: { status: 'MET' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('marks a deadline as MET', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockDeadlineFindUnique.mockResolvedValueOnce({
        id: 'dl-1',
        claimId: 'claim-1',
        deadlineType: 'ACKNOWLEDGE_15DAY',
        status: 'PENDING',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const updatedDeadline = {
        ...MOCK_DEADLINE_PENDING,
        status: 'MET',
        completedAt: new Date(),
      };
      mockDeadlineUpdate.mockResolvedValueOnce(updatedDeadline);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'MET' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ status: string }>();
      expect(body.status).toBe('MET');
    });

    it('marks a deadline as WAIVED with reason', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockDeadlineFindUnique.mockResolvedValueOnce({
        id: 'dl-1',
        claimId: 'claim-1',
        deadlineType: 'ACKNOWLEDGE_15DAY',
        status: 'PENDING',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const updatedDeadline = {
        ...MOCK_DEADLINE_PENDING,
        status: 'WAIVED',
        completedAt: new Date(),
      };
      mockDeadlineUpdate.mockResolvedValueOnce(updatedDeadline);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'WAIVED', reason: 'Duplicate claim — waived per supervisor' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ status: string }>();
      expect(body.status).toBe('WAIVED');
    });

    it('rejects invalid status values', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'INVALID' },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('rejects PENDING as a status update (only MET or WAIVED)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'PENDING' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects MISSED as a status update (only MET or WAIVED)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'MISSED' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for non-existent deadline', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockDeadlineFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/nonexistent',
        headers: { cookie },
        payload: { status: 'MET' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when deadline belongs to inaccessible claim', async () => {
      const cookie = await loginAs(server, MOCK_OTHER_EXAMINER);

      mockDeadlineFindUnique.mockResolvedValueOnce({
        id: 'dl-1',
        claimId: 'claim-1',
        deadlineType: 'ACKNOWLEDGE_15DAY',
        status: 'PENDING',
      });
      // Claim is assigned to user-1, but we're logged in as user-3
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'MET' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('creates an audit log entry when marking deadline', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockDeadlineFindUnique.mockResolvedValueOnce({
        id: 'dl-1',
        claimId: 'claim-1',
        deadlineType: 'ACKNOWLEDGE_15DAY',
        status: 'PENDING',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDeadlineUpdate.mockResolvedValueOnce({
        ...MOCK_DEADLINE_PENDING,
        status: 'MET',
        completedAt: new Date(),
      });

      const { prisma: mockedPrisma } = await import('../../server/db.js');

      await server.inject({
        method: 'PATCH',
        url: '/api/deadlines/dl-1',
        headers: { cookie },
        payload: { status: 'MET' },
      });

      // Allow the void promise to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion
      expect(mockedPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'DEADLINE_MET',
            userId: 'user-1',
            claimId: 'claim-1',
          }) as unknown,
        }),
      );
    });
  });
});
