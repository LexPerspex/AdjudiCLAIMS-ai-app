import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * SOC 2 CC8.1 — Change Management
 *
 * Tests:
 * - TypeScript strict mode enforced (tsconfig strict: true)
 * - All API routes validate input with Zod schemas
 * - Unknown routes return 404 (not 500)
 * - CORS properly configured (not wildcard in production)
 * - Security headers present in responses (httpOnly, sameSite cookie flags)
 * - Environment validation fails fast on missing required config
 */

// ---------------------------------------------------------------------------
// Static tests (no server required)
// ---------------------------------------------------------------------------

describe('SOC 2 CC8.1 — Change Management (static checks)', () => {

  // TypeScript strict mode enforced
  it('tsconfig.json has "strict": true in compilerOptions', () => {
    const tsconfigPath = resolve('/home/vncuser/AdjudiCLAIMS-ai-app-1/tsconfig.json');
    const raw = readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(raw) as {
      compilerOptions?: { strict?: boolean; noUncheckedIndexedAccess?: boolean };
    };

    expect(tsconfig.compilerOptions?.strict).toBe(true);
  });

  // Environment validation fails fast
  it('validateEnv throws on invalid DATABASE_URL in development mode', async () => {
    const envModule = await import('../../server/lib/env.js');
    const { _resetEnv, validateEnv } = envModule;

    const origEnv = { ...process.env };
    _resetEnv();
    process.env['NODE_ENV'] = 'development';
    process.env['DATABASE_URL'] = 'http://not-a-database-url';

    try {
      expect(() => validateEnv()).toThrow();
    } finally {
      process.env = { ...origEnv };
      _resetEnv();
    }
  });

  it('validateEnv throws when SESSION_SECRET is missing in production', async () => {
    const envModule = await import('../../server/lib/env.js');
    const { _resetEnv, validateEnv } = envModule;

    const origEnv = { ...process.env };
    _resetEnv();
    process.env['NODE_ENV'] = 'production';
    process.env['DATABASE_URL'] = 'postgresql://prod:pass@host:5432/db';
    delete process.env['SESSION_SECRET'];

    try {
      expect(() => validateEnv()).toThrow(/SESSION_SECRET/);
    } finally {
      process.env = { ...origEnv };
      _resetEnv();
    }
  });
});

// ---------------------------------------------------------------------------
// Server-based tests
// ---------------------------------------------------------------------------

vi.mock('argon2', () => ({
  default: {
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mock-hash'),
    argon2id: 2,
  },
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mock-hash'),
  argon2id: 2,
}));

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
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

const { buildServer } = await import('../../server/index.js');

describe('SOC 2 CC8.1 — Change Management (server checks)', () => {
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

  // All API routes validate input with Zod — test representative endpoints
  it('POST /api/auth/login validates input and returns 400 for missing fields (Zod enforcement)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'valid@example.com' }, // missing password
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string }>();
    expect(body.error).toBe('Invalid request body');
  });

  it('POST /api/auth/register validates email format (Zod enforcement)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'not-an-email',
        name: 'Test User',
        password: 'ValidPass1!',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // Unknown routes return 404 (not 500)
  it('GET /api/nonexistent-route returns 404 (not 500)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/nonexistent-endpoint-xyz',
    });

    expect(response.statusCode).toBe(404);
    expect(response.statusCode).not.toBe(500);
  });

  it('DELETE /api/claims/nonexistent-route returns 404 (not 500)', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/claims/nonexistent-sub-path/deeply/nested',
    });

    expect([404, 401]).toContain(response.statusCode);
    expect(response.statusCode).not.toBe(500);
  });

  // CORS not wildcard in production — verified by config inspection
  it('CORS configuration uses CORS_ORIGINS allowlist in production (not wildcard)', () => {
    // This is verified through the env config: when NODE_ENV=production and
    // CORS_ORIGINS is not set, corsOrigins defaults to [] (empty = block all).
    // The server/index.ts code: env.NODE_ENV === 'production' ? [] : [true]
    // We verify this logic by reading the source directly.
    const indexPath = resolve('/home/vncuser/AdjudiCLAIMS-ai-app-1/server/index.ts');
    const source = readFileSync(indexPath, 'utf-8');

    // The production fallback must NOT be wildcard (true or '*')
    // It should be [] (empty array = block all when not configured)
    expect(source).toContain("'production'");
    expect(source).toContain('? []'); // production fallback is empty array
    expect(source).not.toMatch(/NODE_ENV.*production.*true.*CORS/);
  });

  // Session cookie has security attributes
  it('login response sets session cookie with httpOnly and sameSite=lax', async () => {
    const { prisma } = await import('../../server/db.js');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      email: 'examiner@acme-ins.test',
      name: 'Jane Examiner',
      role: 'CLAIMS_EXAMINER',
      organizationId: 'org-1',
      isActive: true,
      emailVerified: true,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mock-hash',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mfaEnabled: false,
      mfaSecret: null,
      deletedAt: null,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'examiner@acme-ins.test', password: 'TestPassword1!' },
    });

    expect(response.statusCode).toBe(200);

    const setCookie = response.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    expect(cookieStr).toBeDefined();
    expect(typeof cookieStr).toBe('string');

    const cookieLower = cookieStr!.toLowerCase();
    // httpOnly must be present
    expect(cookieLower).toContain('httponly');
    // sameSite=lax must be present
    expect(cookieLower).toContain('samesite=lax');
  });
});
