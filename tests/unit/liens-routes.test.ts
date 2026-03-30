import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Lien route tests.
 *
 * Uses server.inject() with mocked Prisma and lien-management/omfs services
 * to test all lien endpoints: CRUD, OMFS comparison, exposure, compliance.
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

const MOCK_LIEN = {
  id: 'lien-1',
  claimId: 'claim-1',
  lienClaimant: 'Dr. Smith Medical Group',
  lienType: 'MEDICAL_PROVIDER',
  totalAmountClaimed: 15000,
  filingDate: new Date('2026-02-01'),
  status: 'RECEIVED',
  lineItems: [],
  totalOmfsAllowed: null,
  discrepancyAmount: null,
};

const MOCK_LIEN_WITH_OMFS = {
  ...MOCK_LIEN,
  totalOmfsAllowed: 12000,
  discrepancyAmount: 3000,
  lineItems: [
    {
      id: 'li-1',
      cptCode: '99213',
      description: 'Office visit',
      amountClaimed: 250,
      omfsRate: 200,
      isOvercharge: true,
      overchargeAmount: 50,
    },
  ],
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

// Mock lien-management service
const mockCreateLien = vi.fn();
const mockGetLien = vi.fn();
const mockGetClaimLiens = vi.fn();
const mockUpdateLienStatus = vi.fn();
const mockAddLineItems = vi.fn();
const mockRunOmfsComparison = vi.fn();
const mockCheckFilingCompliance = vi.fn();
const mockCalculateLienExposure = vi.fn();
const mockGetLienSummary = vi.fn();

vi.mock('../../server/services/lien-management.service.js', () => ({
  createLien: (...args: unknown[]) => mockCreateLien(...args) as unknown,
  getLien: (...args: unknown[]) => mockGetLien(...args) as unknown,
  getClaimLiens: (...args: unknown[]) => mockGetClaimLiens(...args) as unknown,
  updateLienStatus: (...args: unknown[]) => mockUpdateLienStatus(...args) as unknown,
  addLineItems: (...args: unknown[]) => mockAddLineItems(...args) as unknown,
  runOmfsComparison: (...args: unknown[]) => mockRunOmfsComparison(...args) as unknown,
  checkFilingCompliance: (...args: unknown[]) => mockCheckFilingCompliance(...args) as unknown,
  calculateLienExposure: (...args: unknown[]) => mockCalculateLienExposure(...args) as unknown,
  getLienSummary: (...args: unknown[]) => mockGetLienSummary(...args) as unknown,
}));

// Mock omfs-comparison service
vi.mock('../../server/services/omfs-comparison.service.js', () => ({
  lookupOmfsRate: vi.fn().mockReturnValue({ feeScheduleSection: '9789.12.1' }),
  lookupOmfsRateFromKb: vi.fn().mockResolvedValue({ cptCode: '99213', omfsRate: 78.42, description: 'Office visit', feeScheduleSection: '9789.12.1' }),
  compareBillToOmfs: vi.fn().mockReturnValue({ lineItems: [], totalClaimed: 0, totalOmfsAllowed: 0, totalDiscrepancy: 0, discrepancyPercent: 0, disclaimer: 'test', isStubData: true }),
  compareBillToOmfsFromKb: vi.fn().mockResolvedValue({ lineItems: [], totalClaimed: 0, totalOmfsAllowed: 0, totalDiscrepancy: 0, discrepancyPercent: 0, disclaimer: 'test', isStubData: false }),
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

describe('Lien routes', () => {
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
  // POST /api/claims/:claimId/liens — Create lien
  // =========================================================================

  describe('POST /api/claims/:claimId/liens', () => {
    const validPayload = {
      lienClaimant: 'Dr. Smith Medical Group',
      lienType: 'MEDICAL_PROVIDER',
      totalAmountClaimed: 15000,
      filingDate: '2026-02-01',
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-999/liens',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 for invalid body (missing required fields)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
        payload: { lienClaimant: 'Dr. Smith' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for invalid lienType', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
        payload: { ...validPayload, lienType: 'INVALID_TYPE' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for negative totalAmountClaimed', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
        payload: { ...validPayload, totalAmountClaimed: -100 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid filing date', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
        payload: { ...validPayload, filingDate: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('creates a lien and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockCreateLien.mockResolvedValueOnce(MOCK_LIEN);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ id: string; lienClaimant: string }>();
      expect(body.id).toBe('lien-1');
      expect(body.lienClaimant).toBe('Dr. Smith Medical Group');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/liens — List liens
  // =========================================================================

  describe('GET /api/claims/:claimId/liens', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/liens',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/liens',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns liens for the claim', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetClaimLiens.mockResolvedValueOnce([MOCK_LIEN]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/liens',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Array<{ id: string }>>();
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe('lien-1');
    });
  });

  // =========================================================================
  // GET /api/liens/:lienId — Get lien
  // =========================================================================

  describe('GET /api/liens/:lienId', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Lien not found');
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce({ ...MOCK_LIEN, claimId: 'claim-other' });
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns lien with line items', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ id: string; lienClaimant: string }>();
      expect(body.id).toBe('lien-1');
    });
  });

  // =========================================================================
  // PATCH /api/liens/:lienId — Update status
  // =========================================================================

  describe('PATCH /api/liens/:lienId', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/lien-1',
        payload: { status: 'UNDER_REVIEW' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/nonexistent',
        headers: { cookie },
        payload: { status: 'UNDER_REVIEW' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for invalid status value', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/lien-1',
        headers: { cookie },
        payload: { status: 'INVALID_STATUS' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('updates lien status', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const updatedLien = { ...MOCK_LIEN, status: 'UNDER_REVIEW' };
      mockUpdateLienStatus.mockResolvedValueOnce(updatedLien);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/lien-1',
        headers: { cookie },
        payload: { status: 'UNDER_REVIEW' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string }>();
      expect(body.status).toBe('UNDER_REVIEW');
    });

    it('updates lien with resolved amount', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const updatedLien = { ...MOCK_LIEN, status: 'PAID_REDUCED', resolvedAmount: 10000 };
      mockUpdateLienStatus.mockResolvedValueOnce(updatedLien);

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/lien-1',
        headers: { cookie },
        payload: { status: 'PAID_REDUCED', resolvedAmount: 10000 },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 when service throws', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockUpdateLienStatus.mockRejectedValueOnce(new Error('Invalid status transition'));

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/liens/lien-1',
        headers: { cookie },
        payload: { status: 'UNDER_REVIEW' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid status transition');
    });
  });

  // =========================================================================
  // POST /api/liens/:lienId/line-items — Add line items
  // =========================================================================

  describe('POST /api/liens/:lienId/line-items', () => {
    const validItems = {
      items: [
        {
          serviceDate: '2026-01-15',
          cptCode: '99213',
          description: 'Office visit',
          amountClaimed: 250,
        },
      ],
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        payload: validItems,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/nonexistent/line-items',
        headers: { cookie },
        payload: validItems,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for empty items array', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        headers: { cookie },
        payload: { items: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid line item (missing description)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        headers: { cookie },
        payload: {
          items: [{ serviceDate: '2026-01-15', amountClaimed: 100 }],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('adds line items and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const createdItems = [{ id: 'li-1', description: 'Office visit', amountClaimed: 250 }];
      mockAddLineItems.mockResolvedValueOnce(createdItems);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        headers: { cookie },
        payload: validItems,
      });

      expect(response.statusCode).toBe(201);
    });

    it('adds line items with optional bodyPartId and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const payloadWithBodyPart = {
        items: [
          {
            serviceDate: '2026-01-15',
            cptCode: '99213',
            description: 'Office visit — lumbar spine',
            amountClaimed: 250,
            bodyPartId: 'bp-1',
          },
        ],
      };
      const createdItems = [
        { id: 'li-2', description: 'Office visit — lumbar spine', amountClaimed: 250, bodyPartId: 'bp-1' },
      ];
      mockAddLineItems.mockResolvedValueOnce(createdItems);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        headers: { cookie },
        payload: payloadWithBodyPart,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<Array<{ id: string; bodyPartId: string }>>();
      expect(body[0]?.bodyPartId).toBe('bp-1');
    });

    it('returns 400 when service throws', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockAddLineItems.mockRejectedValueOnce(new Error('Duplicate line item'));

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/line-items',
        headers: { cookie },
        payload: validItems,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Duplicate line item');
    });
  });

  // =========================================================================
  // POST /api/liens/:lienId/compare-omfs — Run OMFS comparison
  // =========================================================================

  describe('POST /api/liens/:lienId/compare-omfs', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/compare-omfs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/nonexistent/compare-omfs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('runs OMFS comparison and returns result', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const omfsResult = {
        totalClaimed: 15000,
        totalOmfsAllowed: 12000,
        totalDiscrepancy: 3000,
        discrepancyPercent: 20,
      };
      mockRunOmfsComparison.mockResolvedValueOnce(omfsResult);

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/compare-omfs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ totalClaimed: number; totalOmfsAllowed: number }>();
      expect(body.totalClaimed).toBe(15000);
      expect(body.totalOmfsAllowed).toBe(12000);
    });

    it('returns 400 when comparison fails', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockRunOmfsComparison.mockRejectedValueOnce(new Error('No line items to compare'));

      const response = await server.inject({
        method: 'POST',
        url: '/api/liens/lien-1/compare-omfs',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('No line items to compare');
    });
  });

  // =========================================================================
  // GET /api/liens/:lienId/omfs-report — Get OMFS report
  // =========================================================================

  describe('GET /api/liens/:lienId/omfs-report', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1/omfs-report',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/nonexistent/omfs-report',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when OMFS comparison has not been run', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN); // totalOmfsAllowed is null
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1/omfs-report',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: string }>();
      expect(body.error).toContain('OMFS comparison has not been run');
    });

    it('returns OMFS report with line item details and disclaimer', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN_WITH_OMFS);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1/omfs-report',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        lienId: string;
        lineItems: Array<{ cptCode: string; isOvercharge: boolean }>;
        disclaimer: string;
      }>();
      expect(body.lienId).toBe('lien-1');
      expect(body.lineItems).toHaveLength(1);
      expect(body.lineItems[0]?.isOvercharge).toBe(true);
      expect(body.disclaimer).toContain('Official Medical Fee Schedule');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/lien-exposure — Lien exposure
  // =========================================================================

  describe('GET /api/claims/:claimId/lien-exposure', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/lien-exposure',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/lien-exposure',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns exposure and summary', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      mockCalculateLienExposure.mockResolvedValueOnce({
        totalExposure: 25000,
        byType: { MEDICAL_PROVIDER: 15000, ATTORNEY_FEE: 10000 },
      });
      mockGetLienSummary.mockResolvedValueOnce({
        totalLiens: 2,
        openLiens: 1,
        resolvedLiens: 1,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/lien-exposure',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        exposure: { totalExposure: number };
        summary: { totalLiens: number };
      }>();
      expect(body.exposure.totalExposure).toBe(25000);
      expect(body.summary.totalLiens).toBe(2);
    });
  });

  // =========================================================================
  // GET /api/liens/:lienId/compliance — Filing compliance
  // =========================================================================

  describe('GET /api/liens/:lienId/compliance', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1/compliance',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when lien not found', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/nonexistent/compliance',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns compliance result', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockGetLien.mockResolvedValueOnce(MOCK_LIEN);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const complianceResult = {
        filingFeeCompliant: true,
        lienActivationFeeCompliant: true,
        issues: [],
      };
      mockCheckFilingCompliance.mockResolvedValueOnce(complianceResult);

      const response = await server.inject({
        method: 'GET',
        url: '/api/liens/lien-1/compliance',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ filingFeeCompliant: boolean; issues: unknown[] }>();
      expect(body.filingFeeCompliant).toBe(true);
      expect(body.issues).toHaveLength(0);
    });
  });
});
