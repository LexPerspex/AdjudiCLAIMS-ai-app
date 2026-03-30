import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Coverage route tests.
 *
 * Uses server.inject() with mocked Prisma and coverage-determination service
 * to test all AOE/COE body part and coverage determination endpoints.
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
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  deletedAt: null,
  deletedBy: null,
};

const MOCK_CLAIM = {
  id: 'claim-1',
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
};

const MOCK_BODY_PART = {
  id: 'bp-1',
  claimId: 'claim-1',
  bodyPartName: 'Lumbar Spine',
  icdCode: 'M54.5',
  status: 'PENDING',
  statusChangedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const MOCK_DETERMINATION = {
  id: 'det-1',
  claimId: 'claim-1',
  bodyPartId: 'bp-1',
  previousStatus: 'PENDING',
  newStatus: 'ADMITTED',
  determinationDate: new Date('2026-02-01'),
  determinedById: 'user-1',
  basis: 'Medical evidence supports AOE/COE',
  counselReferralId: null,
  notes: null,
  createdAt: new Date('2026-02-01'),
};

const MOCK_COVERAGE_SUMMARY = {
  counts: { admitted: 1, denied: 0, pending: 0, underInvestigation: 0, total: 1 },
  bodyParts: {
    admitted: [{ id: 'bp-1', name: 'Lumbar Spine', icdCode: 'M54.5', statusChangedAt: null }],
    denied: [],
    pending: [],
    underInvestigation: [],
  },
  counselAdvice: [],
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();

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
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    },
    auditEvent: {
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
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock coverage-determination service
// ---------------------------------------------------------------------------

const mockGetClaimBodyParts = vi.fn();
const mockAddBodyPart = vi.fn();
const mockRecordDetermination = vi.fn();
const mockGetDeterminationHistory = vi.fn();
const mockGetCoverageSummary = vi.fn();
const mockMigrateJsonBodyParts = vi.fn();

vi.mock('../../server/services/coverage-determination.service.js', () => ({
  getClaimBodyParts: (...args: unknown[]) => mockGetClaimBodyParts(...args) as unknown,
  addBodyPart: (...args: unknown[]) => mockAddBodyPart(...args) as unknown,
  recordDetermination: (...args: unknown[]) => mockRecordDetermination(...args) as unknown,
  getDeterminationHistory: (...args: unknown[]) => mockGetDeterminationHistory(...args) as unknown,
  getCoverageSummary: (...args: unknown[]) => mockGetCoverageSummary(...args) as unknown,
  migrateJsonBodyParts: (...args: unknown[]) => mockMigrateJsonBodyParts(...args) as unknown,
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_EXAMINER,
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
// Tests
// ---------------------------------------------------------------------------

describe('Coverage routes', () => {
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
  // GET /api/claims/:claimId/body-parts
  // =========================================================================

  describe('GET /api/claims/:claimId/body-parts', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/body-parts',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/body-parts',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns body parts for the claim', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetClaimBodyParts.mockResolvedValueOnce([MOCK_BODY_PART]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/body-parts',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Array<{ id: string; bodyPartName: string }>>();
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe('bp-1');
      expect(body[0]?.bodyPartName).toBe('Lumbar Spine');
    });
  });

  // =========================================================================
  // POST /api/claims/:claimId/body-parts
  // =========================================================================

  describe('POST /api/claims/:claimId/body-parts', () => {
    const validPayload = {
      bodyPartName: 'Lumbar Spine',
      icdCode: 'M54.5',
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/body-parts',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for missing bodyPartName', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/body-parts',
        headers: { cookie },
        payload: { icdCode: 'M54.5' }, // missing bodyPartName
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for empty bodyPartName', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/body-parts',
        headers: { cookie },
        payload: { bodyPartName: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('creates body part and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockAddBodyPart.mockResolvedValueOnce(MOCK_BODY_PART);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/body-parts',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ id: string; bodyPartName: string; status: string }>();
      expect(body.id).toBe('bp-1');
      expect(body.bodyPartName).toBe('Lumbar Spine');
      expect(body.status).toBe('PENDING');
    });
  });

  // =========================================================================
  // POST /api/claims/:claimId/coverage-determinations
  // =========================================================================

  describe('POST /api/claims/:claimId/coverage-determinations', () => {
    const validPayload = {
      bodyPartId: 'bp-1',
      newStatus: 'ADMITTED',
      determinationDate: '2026-02-01',
      basis: 'Medical evidence supports AOE/COE',
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for missing bodyPartId', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
        payload: { newStatus: 'ADMITTED', determinationDate: '2026-02-01', basis: 'Evidence' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for invalid newStatus', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
        payload: { ...validPayload, newStatus: 'INVALID_STATUS' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid determinationDate', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
        payload: { ...validPayload, determinationDate: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('creates determination and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockRecordDetermination.mockResolvedValueOnce(MOCK_DETERMINATION);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ id: string; newStatus: string; previousStatus: string }>();
      expect(body.id).toBe('det-1');
      expect(body.newStatus).toBe('ADMITTED');
      expect(body.previousStatus).toBe('PENDING');
    });

    it('returns 400 when service throws', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockRecordDetermination.mockRejectedValueOnce(new Error('Body part not found'));

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Body part not found');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/coverage-determinations
  // =========================================================================

  describe('GET /api/claims/:claimId/coverage-determinations', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/coverage-determinations',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns determination history (200)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetDeterminationHistory.mockResolvedValueOnce([MOCK_DETERMINATION]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/coverage-determinations',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Array<{ id: string }>>();
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe('det-1');
    });

    it('passes bodyPartId query param to service', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetDeterminationHistory.mockResolvedValueOnce([MOCK_DETERMINATION]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/coverage-determinations?bodyPartId=bp-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetDeterminationHistory).toHaveBeenCalledWith('claim-1', 'bp-1');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/coverage-summary
  // =========================================================================

  describe('GET /api/claims/:claimId/coverage-summary', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/coverage-summary',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns coverage summary (200)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetCoverageSummary.mockResolvedValueOnce(MOCK_COVERAGE_SUMMARY);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/coverage-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<typeof MOCK_COVERAGE_SUMMARY>();
      expect(body.counts.admitted).toBe(1);
      expect(body.counts.total).toBe(1);
      expect(body.bodyParts.admitted).toHaveLength(1);
      expect(body.counselAdvice).toHaveLength(0);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/coverage-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
