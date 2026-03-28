import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Reports route tests.
 *
 * Uses server.inject() with mocked Prisma and compliance-report service
 * to test report generation endpoints with RBAC enforcement.
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
  id: 'user-sup',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_ADMIN = {
  id: 'user-admin',
  email: 'admin@acme-ins.test',
  name: 'Carol Admin',
  role: 'CLAIMS_ADMIN' as const,
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

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
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
  },
}));

// Mock compliance-report service
const mockGenerateClaimFileSummary = vi.fn();
const mockGenerateClaimActivityLog = vi.fn();
const mockGenerateDeadlineAdherenceReport = vi.fn();
const mockGenerateAuditReadinessReport = vi.fn();

vi.mock('../../server/services/compliance-report.service.js', () => ({
  generateClaimFileSummary: (...args: unknown[]) => mockGenerateClaimFileSummary(...args) as unknown,
  generateClaimActivityLog: (...args: unknown[]) => mockGenerateClaimActivityLog(...args) as unknown,
  generateDeadlineAdherenceReport: (...args: unknown[]) => mockGenerateDeadlineAdherenceReport(...args) as unknown,
  generateAuditReadinessReport: (...args: unknown[]) => mockGenerateAuditReadinessReport(...args) as unknown,
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Report routes', () => {
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
  // GET /api/reports/claim/:claimId/file-summary
  // =========================================================================

  describe('GET /api/reports/claim/:claimId/file-summary', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-1/file-summary',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-999/file-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns file summary for authorized user', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const mockReport = {
        claimNumber: 'WC-2026-0001',
        claimantName: 'John Doe',
        sections: ['Claim Overview', 'Document Inventory'],
        generatedAt: new Date().toISOString(),
      };
      mockGenerateClaimFileSummary.mockResolvedValueOnce(mockReport);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-1/file-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ claimNumber: string }>();
      expect(body.claimNumber).toBe('WC-2026-0001');
    });
  });

  // =========================================================================
  // GET /api/reports/claim/:claimId/activity-log
  // =========================================================================

  describe('GET /api/reports/claim/:claimId/activity-log', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-1/activity-log',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-999/activity-log',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns activity log for authorized user', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const mockReport = {
        entries: [{ date: '2026-03-01', events: ['Claim opened'] }],
        totalEntries: 1,
      };
      mockGenerateClaimActivityLog.mockResolvedValueOnce(mockReport);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-1/activity-log',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ totalEntries: number }>();
      expect(body.totalEntries).toBe(1);
    });

    it('passes date range query params to service', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGenerateClaimActivityLog.mockResolvedValueOnce({ entries: [], totalEntries: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/claim/claim-1/activity-log?startDate=2026-01-01&endDate=2026-03-01',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGenerateClaimActivityLog).toHaveBeenCalledWith(
        'claim-1',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
    });
  });

  // =========================================================================
  // GET /api/reports/deadline-adherence
  // =========================================================================

  describe('GET /api/reports/deadline-adherence', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/deadline-adherence',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for CLAIMS_EXAMINER (insufficient role)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/deadline-adherence',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Insufficient permissions');
    });

    it('returns report for CLAIMS_SUPERVISOR', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      const mockReport = {
        overallAdherence: 0.92,
        byType: { ACKNOWLEDGE_15DAY: { met: 10, missed: 1 } },
      };
      mockGenerateDeadlineAdherenceReport.mockResolvedValueOnce(mockReport);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/deadline-adherence',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ overallAdherence: number }>();
      expect(body.overallAdherence).toBe(0.92);
    });

    it('returns report for CLAIMS_ADMIN', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      mockGenerateDeadlineAdherenceReport.mockResolvedValueOnce({
        overallAdherence: 0.88,
        byType: {},
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/deadline-adherence',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('passes date range to service', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockGenerateDeadlineAdherenceReport.mockResolvedValueOnce({ overallAdherence: 0.9, byType: {} });

      await server.inject({
        method: 'GET',
        url: '/api/reports/deadline-adherence?startDate=2026-01-01&endDate=2026-03-01',
        headers: { cookie },
      });

      expect(mockGenerateDeadlineAdherenceReport).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
    });
  });

  // =========================================================================
  // GET /api/reports/audit-readiness
  // =========================================================================

  describe('GET /api/reports/audit-readiness', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/audit-readiness',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for CLAIMS_EXAMINER', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/audit-readiness',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for CLAIMS_SUPERVISOR (ADMIN only)', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/audit-readiness',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns audit readiness report for CLAIMS_ADMIN', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      const mockReport = {
        compositeScore: 85,
        categories: {
          documentation: 90,
          deadlines: 80,
          compliance: 85,
        },
      };
      mockGenerateAuditReadinessReport.mockResolvedValueOnce(mockReport);

      const response = await server.inject({
        method: 'GET',
        url: '/api/reports/audit-readiness',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ compositeScore: number }>();
      expect(body.compositeScore).toBe(85);
    });
  });
});
