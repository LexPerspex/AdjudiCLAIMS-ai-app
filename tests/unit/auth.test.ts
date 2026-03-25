import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Authentication route tests.
 *
 * Uses server.inject() with mocked Prisma to test session-based
 * login, logout, and session check endpoints.
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

const MOCK_INACTIVE_USER = {
  id: 'user-inactive',
  email: 'inactive@acme-ins.test',
  name: 'Inactive User',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: false,
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFindUnique = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args) as unknown,
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

// Dynamic import after mock is in place
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: extract session cookie from response
// ---------------------------------------------------------------------------

function getSessionCookie(response: Awaited<ReturnType<Awaited<ReturnType<typeof buildServer>>['inject']>>): string | undefined {
  const setCookie = response.headers['set-cookie'];
  if (typeof setCookie === 'string') {
    return setCookie;
  }
  if (Array.isArray(setCookie)) {
    return setCookie[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/auth/login', () => {
    it('sets session and returns user profile for valid email', async () => {
      mockFindUnique.mockResolvedValueOnce(MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MOCK_USER.email },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        id: string;
        email: string;
        name: string;
        role: string;
        organizationId: string;
      }>();

      expect(body.id).toBe(MOCK_USER.id);
      expect(body.email).toBe(MOCK_USER.email);
      expect(body.name).toBe(MOCK_USER.name);
      expect(body.role).toBe(MOCK_USER.role);
      expect(body.organizationId).toBe(MOCK_USER.organizationId);

      // Session cookie should be set
      const cookie = getSessionCookie(response);
      expect(cookie).toBeDefined();
    });

    it('returns 401 for unknown email', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'unknown@nowhere.test' },
      });

      expect(response.statusCode).toBe(401);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid credentials');
    });

    it('returns 401 for inactive user', async () => {
      mockFindUnique.mockResolvedValueOnce(MOCK_INACTIVE_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MOCK_INACTIVE_USER.email },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid email format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session and returns { ok: true }', async () => {
      // First, login to get a session
      mockFindUnique.mockResolvedValueOnce(MOCK_USER);

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MOCK_USER.email },
      });

      const cookie = getSessionCookie(loginResponse);

      // Now logout
      const logoutResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: cookie ?? '' },
      });

      expect(logoutResponse.statusCode).toBe(200);

      const body = logoutResponse.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);
    });
  });

  describe('GET /api/auth/session', () => {
    it('returns user when authenticated', async () => {
      // Login first
      mockFindUnique.mockResolvedValueOnce(MOCK_USER);

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: MOCK_USER.email },
      });

      const cookie = getSessionCookie(loginResponse);

      // Check session
      const sessionResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: cookie ?? '' },
      });

      expect(sessionResponse.statusCode).toBe(200);

      const body = sessionResponse.json<{
        id: string;
        email: string;
        role: string;
        organizationId: string;
      }>();

      expect(body.id).toBe(MOCK_USER.id);
      expect(body.email).toBe(MOCK_USER.email);
      expect(body.role).toBe(MOCK_USER.role);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/auth/session',
      });

      expect(response.statusCode).toBe(401);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Not authenticated');
    });
  });
});
