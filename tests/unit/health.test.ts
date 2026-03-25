import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Health check endpoint tests.
 *
 * These tests exercise the Fastify server directly (no HTTP) using
 * `server.inject()` for fast, reliable test execution.
 */

// Mock Prisma before importing the server builder
vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
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

describe('Health check endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /api/health returns 200 with expected shape', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; product: string; version: string }>();
    expect(body).toEqual({
      status: 'ok',
      product: 'AdjudiCLAIMS',
      version: '0.1.0',
    });
  });

  it('GET /api/health/db returns 200 when database is reachable', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health/db',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; database: string }>();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });
});
