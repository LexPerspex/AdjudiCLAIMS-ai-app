import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Medical billing route tests.
 *
 * Uses server.inject() with mocked Prisma and medical-billing-overview service
 * to test all medical billing endpoints: overview, payments, provider summary.
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

const MOCK_MEDICAL_OVERVIEW = {
  lienSummary: {
    totalLiens: 2,
    activeLiens: 1,
    resolvedLiens: 1,
    totalBilled: 23000,
    totalOmfsAllowed: 18000,
    totalResolved: 8000,
    totalOutstanding: 15000,
    byStatus: { RECEIVED: 1, PAID_FULL: 1 },
  },
  omfsSummary: {
    totalLineItems: 3,
    comparedLineItems: 2,
    totalBilled: 450,
    totalOmfsAllowed: 400,
    totalDiscrepancy: 50,
    overchargeCount: 1,
  },
  reserveVsExposure: {
    currentMedicalReserve: 50000,
    currentLienReserve: 20000,
    totalOutstandingLiens: 15000,
    totalMedicalPaid: 5000,
    netExposure: -5000,
  },
  providerSummary: [
    {
      providerName: 'ABC Medical Group',
      totalBilled: 15000,
      totalPaid: 0,
      lienCount: 1,
      outstanding: 15000,
    },
  ],
  admittedVsNonAdmitted: {
    admittedTotal: 10000,
    deniedTotal: 2000,
    pendingTotal: 3000,
    unlinkedTotal: 0,
    disclaimer:
      'Whether treatment for a non-admitted body part is compensable is a legal question. Consult defense counsel.',
  },
  medicalPayments: [],
  timeline: [
    { date: new Date('2026-02-01'), type: 'LIEN_FILED', description: 'Lien filed by ABC Medical Group', amount: 15000 },
  ],
};

const MOCK_PAYMENT = {
  id: 'mp-1',
  claimId: 'claim-1',
  bodyPartId: null,
  lienId: null,
  providerName: 'ABC Medical Group',
  paymentType: 'DIRECT_PAYMENT',
  amount: 1000,
  paymentDate: new Date('2026-02-15'),
  serviceDate: null,
  cptCode: null,
  description: 'Physical therapy session',
  checkNumber: null,
  notes: null,
  createdAt: new Date('2026-02-15'),
};

const MOCK_PROVIDER_SUMMARY = [
  {
    providerName: 'ABC Medical Group',
    totalBilled: 15000,
    totalPaid: 0,
    lienCount: 1,
    paymentCount: 0,
    outstanding: 15000,
  },
];

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
// Mock medical-billing-overview service
// ---------------------------------------------------------------------------

const mockGetMedicalBillingOverview = vi.fn();
const mockGetMedicalPayments = vi.fn();
const mockRecordMedicalPayment = vi.fn();
const mockGetProviderSummary = vi.fn();

vi.mock('../../server/services/medical-billing-overview.service.js', () => ({
  getMedicalBillingOverview: (...args: unknown[]) => mockGetMedicalBillingOverview(...args) as unknown,
  getMedicalPayments: (...args: unknown[]) => mockGetMedicalPayments(...args) as unknown,
  recordMedicalPayment: (...args: unknown[]) => mockRecordMedicalPayment(...args) as unknown,
  getProviderSummary: (...args: unknown[]) => mockGetProviderSummary(...args) as unknown,
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

describe('Medical billing routes', () => {
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
  // GET /api/claims/:claimId/medical-overview
  // =========================================================================

  describe('GET /api/claims/:claimId/medical-overview', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-overview',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/medical-overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns medical billing overview (200)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetMedicalBillingOverview.mockResolvedValueOnce(MOCK_MEDICAL_OVERVIEW);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<typeof MOCK_MEDICAL_OVERVIEW>();
      expect(body.lienSummary.totalLiens).toBe(2);
      expect(body.lienSummary.totalBilled).toBe(23000);
      expect(body.reserveVsExposure.currentMedicalReserve).toBe(50000);
      expect(body.admittedVsNonAdmitted.disclaimer).toContain('Consult defense counsel');
    });

    it('returns 500 when service throws', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetMedicalBillingOverview.mockRejectedValueOnce(new Error('Database error'));

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Database error');
    });
  });

  // =========================================================================
  // POST /api/claims/:claimId/medical-payments
  // =========================================================================

  describe('POST /api/claims/:claimId/medical-payments', () => {
    const validPayload = {
      providerName: 'ABC Medical Group',
      paymentType: 'DIRECT_PAYMENT',
      amount: 1000,
      paymentDate: '2026-02-15',
      description: 'Physical therapy session',
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for missing providerName', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
        payload: {
          paymentType: 'DIRECT_PAYMENT',
          amount: 1000,
          paymentDate: '2026-02-15',
          description: 'PT session',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for invalid paymentType', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
        payload: { ...validPayload, paymentType: 'INVALID_TYPE' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for negative amount', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
        payload: { ...validPayload, amount: -500 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('creates medical payment and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockRecordMedicalPayment.mockResolvedValueOnce(MOCK_PAYMENT);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ id: string; providerName: string; paymentType: string }>();
      expect(body.id).toBe('mp-1');
      expect(body.providerName).toBe('ABC Medical Group');
      expect(body.paymentType).toBe('DIRECT_PAYMENT');
    });

    it('returns 400 when service throws', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockRecordMedicalPayment.mockRejectedValueOnce(new Error('Invalid payment data'));

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid payment data');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/medical-payments
  // =========================================================================

  describe('GET /api/claims/:claimId/medical-payments', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-payments',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns payments list (200)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetMedicalPayments.mockResolvedValueOnce([MOCK_PAYMENT]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-payments',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Array<{ id: string }>>();
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe('mp-1');
    });

    it('passes bodyPartId filter to service', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetMedicalPayments.mockResolvedValueOnce([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/medical-payments?bodyPartId=bp-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetMedicalPayments).toHaveBeenCalledWith(
        'claim-1',
        expect.objectContaining({ bodyPartId: 'bp-1' }),
      );
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/provider-summary
  // =========================================================================

  describe('GET /api/claims/:claimId/provider-summary', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/provider-summary',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when claim access denied', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-999/provider-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns provider summary (200)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockGetProviderSummary.mockResolvedValueOnce(MOCK_PROVIDER_SUMMARY);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/provider-summary',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Array<{ providerName: string; totalBilled: number }>>();
      expect(body).toHaveLength(1);
      expect(body[0]?.providerName).toBe('ABC Medical Group');
      expect(body[0]?.totalBilled).toBe(15000);
    });
  });
});
