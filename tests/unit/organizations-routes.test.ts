import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Organization route tests.
 *
 * Uses server.inject() with mocked Prisma to test organization
 * retrieval and member listing with RBAC enforcement.
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

const MOCK_SUPERVISOR = {
  id: 'user-sup',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
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

const MOCK_ADMIN = {
  id: 'user-admin',
  email: 'admin@acme-ins.test',
  name: 'Carol Admin',
  role: 'CLAIMS_ADMIN' as const,
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

const MOCK_ORG = {
  id: 'org-1',
  name: 'Acme Insurance',
  type: 'INSURANCE_CARRIER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockOrgFindUnique = vi.fn();
const mockUserFindMany = vi.fn();

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
      findMany: (...args: unknown[]) => mockUserFindMany(...args) as unknown,
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    organization: {
      findUnique: (...args: unknown[]) => mockOrgFindUnique(...args) as unknown,
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

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_EXAMINER | typeof MOCK_SUPERVISOR | typeof MOCK_ADMIN,
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

describe('Organization routes', () => {
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
  // GET /api/orgs/:id
  // =========================================================================

  describe('GET /api/orgs/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when user tries to access another org', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-other',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Access denied to this organization');
    });

    it('returns 404 when org not found in database', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockOrgFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Organization not found');
    });

    it('returns organization for authenticated user in same org', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockOrgFindUnique.mockResolvedValueOnce(MOCK_ORG);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ id: string; name: string; type: string }>();
      expect(body.id).toBe('org-1');
      expect(body.name).toBe('Acme Insurance');
      expect(body.type).toBe('INSURANCE_CARRIER');
    });
  });

  // =========================================================================
  // GET /api/orgs/:id/members
  // =========================================================================

  describe('GET /api/orgs/:id/members', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1/members',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for CLAIMS_EXAMINER (insufficient role)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1/members',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Insufficient permissions');
    });

    it('returns 403 when supervisor tries to access another org members', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-other/members',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Access denied to this organization');
    });

    it('returns members for CLAIMS_SUPERVISOR', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      mockUserFindMany.mockResolvedValueOnce([
        { id: 'user-1', email: 'examiner@acme-ins.test', name: 'Jane Examiner', role: 'CLAIMS_EXAMINER', createdAt: new Date() },
        { id: 'user-sup', email: 'supervisor@acme-ins.test', name: 'Bob Supervisor', role: 'CLAIMS_SUPERVISOR', createdAt: new Date() },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1/members',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ members: Array<{ id: string; name: string }> }>();
      expect(body.members).toHaveLength(2);
    });

    it('returns members for CLAIMS_ADMIN', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      mockUserFindMany.mockResolvedValueOnce([
        { id: 'user-1', email: 'examiner@acme-ins.test', name: 'Jane Examiner', role: 'CLAIMS_EXAMINER', createdAt: new Date() },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/orgs/org-1/members',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ members: Array<{ id: string }> }>();
      expect(body.members).toHaveLength(1);
    });
  });
});
