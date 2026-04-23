import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * training-sandbox route integration tests (AJC-19).
 *
 * Boots the full Fastify app via buildServer() and exercises the four
 * /api/training/sandbox/* endpoints with a logged-in CLAIMS_EXAMINER session.
 * Verifies:
 *   - 401 when unauthenticated
 *   - status returns expected DTO
 *   - enable/disable/reset return success and call the service
 *   - non-admin examiner role can use sandbox (this IS the practice ground)
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_EXAMINER = {
  id: 'user-1',
  email: 'examiner@training.test',
  name: 'Trainee Tim',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  trainingModeEnabled: false,
  deletedAt: null,
  deletedBy: null,
};

// ---------------------------------------------------------------------------
// Mock auth helpers (argon2 + otp)
// ---------------------------------------------------------------------------

vi.mock('argon2', () => ({
  default: {
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
    argon2id: 2,
  },
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
  argon2id: 2,
}));

vi.mock('@otplib/preset-default', () => ({
  authenticator: {
    generateSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    keyuri: vi.fn().mockReturnValue('otpauth://totp/...'),
    verify: vi.fn().mockReturnValue(true),
  },
}));

// ---------------------------------------------------------------------------
// Mock prisma — minimal surface needed by login + audit
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue({ isTrainingComplete: true }),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock the training-sandbox service so the routes are tested in isolation
// ---------------------------------------------------------------------------

const mockEnable = vi.fn();
const mockDisable = vi.fn();
const mockReset = vi.fn();
const mockStatus = vi.fn();

vi.mock('../../server/services/training-sandbox.service.js', () => ({
  enableTrainingMode: (...a: unknown[]) => mockEnable(...a) as unknown,
  disableTrainingMode: (...a: unknown[]) => mockDisable(...a) as unknown,
  resetSandbox: (...a: unknown[]) => mockReset(...a) as unknown,
  getTrainingSandboxStatus: (...a: unknown[]) => mockStatus(...a) as unknown,
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Login helper
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

  if (loginResponse.statusCode !== 200) {
    throw new Error(`Login failed: ${String(loginResponse.statusCode)} ${loginResponse.body}`);
  }

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Training-sandbox routes', () => {
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

  // -----------------------------------------------------------------------
  // GET /api/training/sandbox/status
  // -----------------------------------------------------------------------

  describe('GET /api/training/sandbox/status', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/training/sandbox/status',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns the user sandbox status DTO', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockStatus.mockResolvedValueOnce({
        trainingModeEnabled: false,
        syntheticClaimCount: 0,
        availableScenarios: 9,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/training/sandbox/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        trainingModeEnabled: boolean;
        syntheticClaimCount: number;
        availableScenarios: number;
      }>();
      expect(body).toEqual({
        trainingModeEnabled: false,
        syntheticClaimCount: 0,
        availableScenarios: 9,
      });
      expect(mockStatus).toHaveBeenCalledWith('user-1');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/training/sandbox/enable
  // -----------------------------------------------------------------------

  describe('POST /api/training/sandbox/enable', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/enable',
      });
      expect(response.statusCode).toBe(401);
    });

    it('enables training mode and returns seed counts', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockEnable.mockResolvedValueOnce({
        claimsCreated: 9,
        documentsCreated: 42,
        deadlinesCreated: 23,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/enable',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean; claimsCreated: number }>();
      expect(body.success).toBe(true);
      expect(body.claimsCreated).toBe(9);
      // Service called with the trainees user + org IDs
      expect(mockEnable).toHaveBeenCalledWith('user-1', 'org-1');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/training/sandbox/disable
  // -----------------------------------------------------------------------

  describe('POST /api/training/sandbox/disable', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/disable',
      });
      expect(response.statusCode).toBe(401);
    });

    it('disables training mode', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockDisable.mockResolvedValueOnce(undefined);

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/disable',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean }>();
      expect(body.success).toBe(true);
      expect(mockDisable).toHaveBeenCalledWith('user-1');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/training/sandbox/reset
  // -----------------------------------------------------------------------

  describe('POST /api/training/sandbox/reset', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/reset',
      });
      expect(response.statusCode).toBe(401);
    });

    it('resets the sandbox and returns counts', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);
      mockReset.mockResolvedValueOnce({
        claimsRemoved: 9,
        reseed: { claimsCreated: 9, documentsCreated: 42, deadlinesCreated: 23 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/sandbox/reset',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        success: boolean;
        claimsRemoved: number;
        reseed: { claimsCreated: number };
      }>();
      expect(body.success).toBe(true);
      expect(body.claimsRemoved).toBe(9);
      expect(body.reseed.claimsCreated).toBe(9);
      expect(mockReset).toHaveBeenCalledWith('user-1', 'org-1');
    });
  });
});
