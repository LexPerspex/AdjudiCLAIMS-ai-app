import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Compliance dashboard service + route tests.
 *
 * Covers examiner, team, and admin metric computation, UPL monitoring,
 * and all HTTP endpoints with RBAC enforcement.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_EXAMINER = {
  id: 'user-1',
  email: 'examiner@acme-ins.test',
  name: 'Jane Examiner',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_SUPERVISOR = {
  id: 'user-2',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_ADMIN = {
  id: 'user-3',
  email: 'admin@acme-ins.test',
  name: 'Alice Admin',
  role: 'CLAIMS_ADMIN' as const,
  organizationId: 'org-1',
  isActive: true,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();
const mockUserCount = vi.fn();
const mockDeadlineGroupBy = vi.fn();
const mockAuditEventGroupBy = vi.fn();
const mockAuditEventCount = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockEducationProfileFindMany = vi.fn();
const mockClaimCount = vi.fn();
const mockInvestigationGroupBy = vi.fn();
const mockDocumentGroupBy = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      findMany: (...args: unknown[]) => mockUserFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockUserCount(...args) as unknown,
    },
    claim: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: (...args: unknown[]) => mockClaimCount(...args) as unknown,
      create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      findMany: (...args: unknown[]) => mockAuditEventFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockAuditEventCount(...args) as unknown,
      groupBy: (...args: unknown[]) => mockAuditEventGroupBy(...args) as unknown,
      create: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'ep-1',
        userId: 'user-1',
        dismissedTerms: [],
        trainingModulesCompleted: null,
        isTrainingComplete: true,
        learningModeExpiry: null,
      }),
      update: vi.fn().mockResolvedValue({}),
      findMany: (...args: unknown[]) => mockEducationProfileFindMany(...args) as unknown,
      count: vi.fn().mockResolvedValue(0),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    regulatoryDeadline: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: (...args: unknown[]) => mockDeadlineGroupBy(...args) as unknown,
    },
    investigationItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: (...args: unknown[]) => mockInvestigationGroupBy(...args) as unknown,
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      groupBy: (...args: unknown[]) => mockDocumentGroupBy(...args) as unknown,
    },
    chatSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    documentChunk: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    benefitPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
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

// Dynamic imports after mocks are in place
const { buildServer } = await import('../../server/index.js');
const complianceDashboard = await import('../../server/services/compliance-dashboard.service.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  // login route also queries educationProfile
  const { prisma } = await import('../../server/db.js');
  (prisma.educationProfile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

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
// Helpers to set up default service mocks for getExaminerMetrics
// ---------------------------------------------------------------------------

function mockExaminerMetrics() {
  // regulatoryDeadline.groupBy — deadline status breakdown
  mockDeadlineGroupBy.mockResolvedValueOnce([
    { status: 'MET', _count: { id: 8 } },
    { status: 'MISSED', _count: { id: 2 } },
    { status: 'PENDING', _count: { id: 3 } },
  ]);
  // auditEvent.groupBy — UPL zone distribution
  mockAuditEventGroupBy.mockResolvedValueOnce([
    { uplZone: 'GREEN', _count: { id: 15 } },
    { uplZone: 'YELLOW', _count: { id: 3 } },
    { uplZone: 'RED', _count: { id: 1 } },
  ]);
  // claim.count — active claims
  mockClaimCount.mockResolvedValueOnce(5);
  // auditEvent.count — blocked count
  mockAuditEventCount.mockResolvedValueOnce(1);
}

function mockTeamMetrics() {
  // First Promise.all (6 concurrent calls):
  // 1. regulatoryDeadline.groupBy (org-wide deadline status)
  mockDeadlineGroupBy.mockResolvedValueOnce([
    { status: 'MET', _count: { id: 20 } },
    { status: 'MISSED', _count: { id: 4 } },
    { status: 'PENDING', _count: { id: 6 } },
  ]);
  // 2. auditEvent.groupBy (org-wide UPL zones)
  mockAuditEventGroupBy.mockResolvedValueOnce([
    { uplZone: 'GREEN', _count: { id: 50 } },
    { uplZone: 'YELLOW', _count: { id: 10 } },
    { uplZone: 'RED', _count: { id: 5 } },
  ]);
  // 3. auditEvent.count (org blocked count)
  mockAuditEventCount.mockResolvedValueOnce(3);
  // 4. educationProfile.findMany
  mockEducationProfileFindMany.mockResolvedValueOnce([
    { isTrainingComplete: true },
    { isTrainingComplete: true },
    { isTrainingComplete: false },
  ]);
  // 5. user.count (org user count for training denominator)
  mockUserCount.mockResolvedValueOnce(4);
  // 6. user.findMany (examiners with claims)
  mockUserFindMany.mockResolvedValueOnce([
    { id: 'user-1', name: 'Jane Examiner' },
  ]);

  // Second batch Promise.all (3 concurrent calls for per-examiner breakdown):
  // 1. regulatoryDeadline.groupBy (per-examiner batch)
  mockDeadlineGroupBy.mockResolvedValueOnce([
    { status: 'MET', _count: { id: 8 } },
    { status: 'MISSED', _count: { id: 2 } },
  ]);
  // 2. auditEvent.groupBy (per-user block events)
  mockAuditEventGroupBy.mockResolvedValueOnce([
    { userId: 'user-1', _count: { id: 1 } },
  ]);
  // 3. auditEvent.groupBy (per-user zone totals)
  mockAuditEventGroupBy.mockResolvedValueOnce([
    { userId: 'user-1', _count: { id: 30 } },
  ]);
  // $queryRawUnsafe returns [] by default from the mock above
}

// ==========================================================================
// SERVICE TESTS
// ==========================================================================

describe('Compliance Dashboard Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getExaminerComplianceMetrics', () => {
    it('returns deadline adherence and UPL summary for examiner', async () => {
      mockExaminerMetrics();

      const result = await complianceDashboard.getExaminerComplianceMetrics('user-1');

      expect(result.deadlineAdherence).toBeDefined();
      expect(result.deadlineAdherence.met).toBe(8);
      expect(result.deadlineAdherence.missed).toBe(2);
      expect(result.deadlineAdherence.pending).toBe(3);
      // adherenceRate = met / (met + missed) = 8 / 10 = 0.8
      expect(result.deadlineAdherence.adherenceRate).toBeCloseTo(0.8, 4);

      expect(result.uplSummary).toBeDefined();
      expect(result.uplSummary.green).toBe(15);
      expect(result.uplSummary.yellow).toBe(3);
      expect(result.uplSummary.red).toBe(1);
      expect(result.uplSummary.blocked).toBe(1);

      expect(result.activeClaimsCount).toBe(5);
    });
  });

  describe('getSupervisorTeamMetrics', () => {
    it('returns team-wide deadline adherence, UPL compliance, and training completion', async () => {
      mockTeamMetrics();

      const result = await complianceDashboard.getSupervisorTeamMetrics('org-1');

      expect(result.teamDeadlineAdherence).toBeDefined();
      expect(result.teamDeadlineAdherence.met).toBe(20);
      expect(result.teamDeadlineAdherence.missed).toBe(4);
      expect(result.teamDeadlineAdherence.adherenceRate).toBeCloseTo(0.8333, 3);

      expect(result.teamUplCompliance).toBeDefined();
      expect(result.teamUplCompliance.greenRate).toBeGreaterThan(0);

      expect(result.trainingCompletion).toBeDefined();
      expect(result.trainingCompletion.complete).toBe(2);
      expect(result.trainingCompletion.incomplete).toBe(2); // 4 total users - 2 complete
      expect(result.trainingCompletion.total).toBe(4);

      expect(result.examinerBreakdown).toBeDefined();
      expect(Array.isArray(result.examinerBreakdown)).toBe(true);
    });
  });

  describe('getAdminComplianceReport', () => {
    it('includes DOI audit readiness score and compliance score breakdown', async () => {
      // getAdminReport calls getTeamMetrics first (reuses its mocks), then additional queries
      mockTeamMetrics();

      // investigationItem.groupBy
      mockInvestigationGroupBy.mockResolvedValueOnce([
        { isComplete: true, _count: { id: 18 } },
        { isComplete: false, _count: { id: 2 } },
      ]);
      // document.groupBy (claims with docs)
      mockDocumentGroupBy.mockResolvedValueOnce([
        { claimId: 'claim-1' },
        { claimId: 'claim-2' },
      ]);
      // claim.count (total org claims)
      mockClaimCount.mockResolvedValueOnce(3);

      const result = await complianceDashboard.getAdminComplianceReport('org-1');

      expect(result.doiAuditReadinessScore).toBeDefined();
      expect(result.doiAuditReadinessScore).toBeGreaterThanOrEqual(0);
      expect(result.doiAuditReadinessScore).toBeLessThanOrEqual(100);

      expect(result.complianceScoreBreakdown).toBeDefined();
      expect(result.complianceScoreBreakdown.deadlineScore).toBeGreaterThanOrEqual(0);
      expect(result.complianceScoreBreakdown.investigationScore).toBeGreaterThanOrEqual(0);
      expect(result.complianceScoreBreakdown.documentationScore).toBeGreaterThanOrEqual(0);
      expect(result.complianceScoreBreakdown.uplScore).toBeGreaterThanOrEqual(0);

      // All team metrics also present
      expect(result.teamDeadlineAdherence).toBeDefined();
      expect(result.teamUplCompliance).toBeDefined();
      expect(result.trainingCompletion).toBeDefined();
    });
  });

  describe('getUplMonitoringMetrics', () => {
    it('returns zone distribution with green/yellow/red counts', async () => {
      // auditEvent.groupBy — zone distribution
      mockAuditEventGroupBy.mockResolvedValueOnce([
        { uplZone: 'GREEN', _count: { id: 40 } },
        { uplZone: 'YELLOW', _count: { id: 8 } },
        { uplZone: 'RED', _count: { id: 2 } },
      ]);
      // auditEvent.findMany — block events for per-period bucketing
      mockAuditEventFindMany.mockResolvedValueOnce([
        { createdAt: new Date('2026-03-20T10:00:00Z') },
        { createdAt: new Date('2026-03-20T14:00:00Z') },
      ]);
      // auditEvent.count — validation fail count
      mockAuditEventCount.mockResolvedValueOnce(1);
      // auditEvent.count — RED zone count for adversarial rate
      mockAuditEventCount.mockResolvedValueOnce(2);

      const result = await complianceDashboard.getUplMonitoringMetrics('org-1');

      expect(result.zoneDistribution).toBeDefined();
      expect(result.zoneDistribution.green).toBe(40);
      expect(result.zoneDistribution.yellow).toBe(8);
      expect(result.zoneDistribution.red).toBe(2);

      expect(result.blocksPerPeriod).toBeDefined();
      expect(Array.isArray(result.blocksPerPeriod)).toBe(true);
      // Both block events on same day should be grouped into one entry
      expect(result.blocksPerPeriod).toHaveLength(1);
      expect((result.blocksPerPeriod[0] as (typeof result.blocksPerPeriod)[number]).period).toBe('2026-03-20');
      expect((result.blocksPerPeriod[0] as (typeof result.blocksPerPeriod)[number]).count).toBe(2);

      expect(result.adversarialDetectionRate).toBeDefined();
      expect(result.adversarialDetectionRate).toBeGreaterThanOrEqual(0);
    });
  });
});

// ==========================================================================
// ROUTE TESTS
// ==========================================================================

describe('Compliance Routes', () => {
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

  // -------------------------------------------------------------------------
  // GET /api/compliance/examiner
  // -------------------------------------------------------------------------

  describe('GET /api/compliance/examiner', () => {
    it('returns 200 with metrics for authenticated examiner', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockExaminerMetrics();

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/examiner',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        deadlineAdherence: unknown;
        uplSummary: unknown;
        activeClaimsCount: number;
      };
      expect(body.deadlineAdherence).toBeDefined();
      expect(body.uplSummary).toBeDefined();
      expect(typeof body.activeClaimsCount).toBe('number');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/examiner',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/compliance/team
  // -------------------------------------------------------------------------

  describe('GET /api/compliance/team', () => {
    it('returns 403 for examiner role', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/team',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with team metrics for supervisor', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockTeamMetrics();

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/team',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        teamDeadlineAdherence: unknown;
        teamUplCompliance: unknown;
        trainingCompletion: unknown;
        examinerBreakdown: unknown[];
      };
      expect(body.teamDeadlineAdherence).toBeDefined();
      expect(body.teamUplCompliance).toBeDefined();
      expect(body.trainingCompletion).toBeDefined();
      expect(Array.isArray(body.examinerBreakdown)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/compliance/admin
  // -------------------------------------------------------------------------

  describe('GET /api/compliance/admin', () => {
    it('returns 403 for supervisor role', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/admin',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with admin report for admin role', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      // Admin report = teamMetrics + admin-only queries
      mockTeamMetrics();
      mockInvestigationGroupBy.mockResolvedValueOnce([
        { isComplete: true, _count: { id: 10 } },
        { isComplete: false, _count: { id: 5 } },
      ]);
      mockDocumentGroupBy.mockResolvedValueOnce([
        { claimId: 'claim-1' },
      ]);
      mockClaimCount.mockResolvedValueOnce(2);

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/admin',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        doiAuditReadinessScore: number;
        complianceScoreBreakdown: unknown;
      };
      expect(typeof body.doiAuditReadinessScore).toBe('number');
      expect(body.complianceScoreBreakdown).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/compliance/upl
  // -------------------------------------------------------------------------

  describe('GET /api/compliance/upl', () => {
    it('requires supervisor role (403 for examiner)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/upl',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns UPL monitoring data for supervisor', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      // UPL dashboard mocks
      mockAuditEventGroupBy.mockResolvedValueOnce([
        { uplZone: 'GREEN', _count: { id: 20 } },
        { uplZone: 'RED', _count: { id: 1 } },
      ]);
      mockAuditEventFindMany.mockResolvedValueOnce([]);
      mockAuditEventCount.mockResolvedValueOnce(0);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/compliance/upl',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        zoneDistribution: { green: number; yellow: number; red: number };
        blocksPerPeriod: unknown[];
        adversarialDetectionRate: number;
      };
      expect(body.zoneDistribution).toBeDefined();
      expect(typeof body.zoneDistribution.green).toBe('number');
      expect(Array.isArray(body.blocksPerPeriod)).toBe(true);
      expect(typeof body.adversarialDetectionRate).toBe('number');
    });
  });
});
