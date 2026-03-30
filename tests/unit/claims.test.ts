import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Claims route tests.
 *
 * Uses server.inject() with mocked Prisma to test claim CRUD operations,
 * RBAC authorization, and input validation.
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

const MOCK_CLAIM = {
  id: 'claim-1',
  claimNumber: 'WC-2026-0001',
  claimantName: 'John Doe',
  dateOfInjury: new Date('2026-01-15'),
  bodyParts: ['lumbar spine', 'left knee'],
  employer: 'Acme Corp',
  insurer: 'Acme Insurance',
  status: 'OPEN' as const,
  dateReceived: new Date('2026-01-20'),
  assignedExaminerId: 'user-1',
  organizationId: 'org-1',
  createdAt: new Date('2026-01-20'),
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindMany = vi.fn();
const mockClaimCount = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockClaimCreate = vi.fn();
const mockDeadlineCreateMany = vi.fn();
const mockInvestigationCreateMany = vi.fn();

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

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  user: {
    findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    update: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
  },
  claim: {
    findMany: (...args: unknown[]) => mockClaimFindMany(...args) as unknown,
    count: (...args: unknown[]) => mockClaimCount(...args) as unknown,
    findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    create: (...args: unknown[]) => mockClaimCreate(...args) as unknown,
  },
  regulatoryDeadline: {
    createMany: (...args: unknown[]) => mockDeadlineCreateMany(...args) as unknown,
  },
  investigationItem: {
    createMany: (...args: unknown[]) => mockInvestigationCreateMany(...args) as unknown,
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
  // $transaction passes the same mock as the tx client to the callback
  $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
    return fn(mockPrisma);
  }),
};

vi.mock('../../server/db.js', () => ({
  prisma: mockPrisma,
}));

// Dynamic import after mock is in place
const { buildServer } = await import('../../server/index.js');

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
// Tests
// ---------------------------------------------------------------------------

describe('Claims routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock returns for deadline/investigation generators
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  describe('GET /api/claims', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns claims for the authenticated user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindMany.mockResolvedValueOnce([MOCK_CLAIM]);
      mockClaimCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        claims: typeof MOCK_CLAIM[];
        total: number;
        take: number;
        skip: number;
      }>();

      expect(body.claims).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.take).toBe(50);
      expect(body.skip).toBe(0);
    });

    it('respects pagination query params', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindMany.mockResolvedValueOnce([]);
      mockClaimCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims?take=10&skip=5',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ take: number; skip: number }>();
      expect(body.take).toBe(10);
      expect(body.skip).toBe(5);
    });
  });

  describe('GET /api/claims/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for non-existent claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Claim not found');
    });

    it('returns claim for authorized user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        ...MOCK_CLAIM,
        dateAcknowledged: null,
        dateDetermined: null,
        dateClosed: null,
        isLitigated: false,
        hasApplicantAttorney: false,
        isCumulativeTrauma: false,
        currentReserveIndemnity: 0,
        currentReserveMedical: 0,
        currentReserveLegal: 0,
        currentReserveLien: 0,
        totalPaidIndemnity: 0,
        totalPaidMedical: 0,
        updatedAt: new Date(),
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ id: string; claimNumber: string }>();
      expect(body.id).toBe('claim-1');
      expect(body.claimNumber).toBe('WC-2026-0001');
    });
  });

  describe('POST /api/claims', () => {
    const validPayload = {
      claimNumber: 'WC-2026-0002',
      claimantName: 'Alice Smith',
      dateOfInjury: '2026-02-10',
      bodyParts: ['right shoulder'],
      employer: 'Test Corp',
      insurer: 'Test Insurance',
      dateReceived: '2026-02-15',
    };

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('creates a claim and returns it', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const createdClaim = {
        id: 'claim-new',
        ...validPayload,
        dateOfInjury: new Date(validPayload.dateOfInjury),
        dateReceived: new Date(validPayload.dateReceived),
        status: 'OPEN',
        assignedExaminerId: MOCK_USER.id,
        organizationId: MOCK_USER.organizationId,
        createdAt: new Date(),
      };

      mockClaimCreate.mockResolvedValueOnce(createdClaim);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims',
        headers: { cookie },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);

      const body = response.json<{
        id: string;
        claimNumber: string;
        assignedExaminerId: string;
      }>();

      expect(body.id).toBe('claim-new');
      expect(body.claimNumber).toBe('WC-2026-0002');
      expect(body.assignedExaminerId).toBe(MOCK_USER.id);

      // Verify deadlines and investigation items were generated
      expect(mockDeadlineCreateMany).toHaveBeenCalledOnce();
      expect(mockInvestigationCreateMany).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid input (missing required fields)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims',
        headers: { cookie },
        payload: {
          claimNumber: 'WC-2026-0003',
          // missing claimantName, dateOfInjury, bodyParts, employer, insurer, dateReceived
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string; details: unknown[] }>();
      expect(body.error).toBe('Invalid request body');
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details)).toBe(true);
    });

    it('returns 400 for empty body parts array', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims',
        headers: { cookie },
        payload: {
          ...validPayload,
          bodyParts: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid date format', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims',
        headers: { cookie },
        payload: {
          ...validPayload,
          dateOfInjury: 'not-a-date',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
