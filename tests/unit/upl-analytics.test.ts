import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

/**
 * AJC-7 — UPL compliance analytics: recent RED blocks + alert configuration.
 *
 * Covers:
 * 1. getRecentRedBlocks — correct metadata mapping, queryLengthBucket logic,
 *    limit clamping, adversarial flag, empty result
 * 2. getUplAlertConfig — returns default when no config set
 * 3. setUplAlertConfig — merges updates, clamps threshold values
 * 4. GET /api/compliance/upl/blocks route — SUPERVISOR+ gated, returns blocks array
 * 5. GET /api/compliance/upl/alert-config — SUPERVISOR+ gated
 * 6. PUT /api/compliance/upl/alert-config — validates body, returns updated config
 */

// ---------------------------------------------------------------------------
// Mocks — service unit tests
// ---------------------------------------------------------------------------

const mockAuditEventFindMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    auditEvent: {
      findMany: (...args: unknown[]) => mockAuditEventFindMany(...args) as unknown,
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    regulatoryDeadline: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    investigationItem: {
      groupBy: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    document: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    chatSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    documentChunk: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    benefitPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const svc = await import('../../server/services/compliance-dashboard.service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlockEvent(overrides: {
  id?: string;
  userId?: string;
  userName?: string;
  createdAt?: Date;
  queryLength?: number;
  isAdversarial?: boolean;
}) {
  return {
    id: overrides.id ?? 'evt-1',
    createdAt: overrides.createdAt ?? new Date('2026-04-20T10:00:00Z'),
    userId: overrides.userId ?? 'user-1',
    eventData: {
      queryLength: overrides.queryLength ?? 0,
      isAdversarial: overrides.isAdversarial ?? false,
      reason: 'legal advice request',
    },
    user: { name: overrides.userName ?? 'Alice Examiner' },
  };
}

// ---------------------------------------------------------------------------
// 1. getRecentRedBlocks — service unit tests
// ---------------------------------------------------------------------------

describe('UPL Analytics — getRecentRedBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset alert config store between tests by setting a clean org
  });

  it('returns empty array when no block events exist', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    const result = await svc.getRecentRedBlocks('org-1');

    expect(result).toHaveLength(0);
  });

  it('maps block events to RecentRedBlock metadata correctly', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({
        id: 'evt-abc',
        userId: 'user-x',
        userName: 'Bob Smith',
        createdAt: new Date('2026-04-19T08:30:00Z'),
        queryLength: 120,
        isAdversarial: false,
      }),
    ]);

    const result = await svc.getRecentRedBlocks('org-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'evt-abc',
      userId: 'user-x',
      userName: 'Bob Smith',
      timestamp: '2026-04-19T08:30:00.000Z',
      queryLengthBucket: 'medium',
      isAdversarial: false,
    });
  });

  it('buckets query length correctly — short < 50', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ queryLength: 30 }),
    ]);

    const [block] = await svc.getRecentRedBlocks('org-1');
    expect(block?.queryLengthBucket).toBe('short');
  });

  it('buckets query length correctly — medium 50–200', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ queryLength: 50 }),
    ]);
    const [b1] = await svc.getRecentRedBlocks('org-1');
    expect(b1?.queryLengthBucket).toBe('medium');

    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ queryLength: 200 }),
    ]);
    const [b2] = await svc.getRecentRedBlocks('org-1');
    expect(b2?.queryLengthBucket).toBe('medium');
  });

  it('buckets query length correctly — long > 200', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ queryLength: 201 }),
    ]);

    const [block] = await svc.getRecentRedBlocks('org-1');
    expect(block?.queryLengthBucket).toBe('long');
  });

  it('propagates isAdversarial flag', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ isAdversarial: true }),
    ]);

    const [block] = await svc.getRecentRedBlocks('org-1');
    expect(block?.isAdversarial).toBe(true);
  });

  it('handles missing eventData gracefully (null)', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([
      {
        id: 'evt-null',
        createdAt: new Date('2026-04-18T12:00:00Z'),
        userId: 'user-2',
        eventData: null,
        user: { name: 'Carol' },
      },
    ]);

    const [block] = await svc.getRecentRedBlocks('org-1');
    // queryLength defaults to 0 → 'short'
    expect(block?.queryLengthBucket).toBe('short');
    // isAdversarial defaults to false
    expect(block?.isAdversarial).toBe(false);
  });

  it('clamps limit to 100 maximum', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    await svc.getRecentRedBlocks('org-1', 999);

    const callArg = mockAuditEventFindMany.mock.calls[0]?.[0] as { take?: number };
    expect(callArg?.take).toBe(100);
  });

  it('uses minimum limit of 1', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    await svc.getRecentRedBlocks('org-1', 0);

    const callArg = mockAuditEventFindMany.mock.calls[0]?.[0] as { take?: number };
    expect(callArg?.take).toBe(1);
  });

  it('scopes query to the org via user.organizationId', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    await svc.getRecentRedBlocks('org-target');

    const callArg = mockAuditEventFindMany.mock.calls[0]?.[0] as {
      where?: { user?: { organizationId?: string } };
    };
    expect(callArg?.where?.user?.organizationId).toBe('org-target');
  });

  it('orders results by createdAt descending', async () => {
    mockAuditEventFindMany.mockResolvedValueOnce([]);

    await svc.getRecentRedBlocks('org-1');

    const callArg = mockAuditEventFindMany.mock.calls[0]?.[0] as {
      orderBy?: { createdAt?: string };
    };
    expect(callArg?.orderBy?.createdAt).toBe('desc');
  });
});

// ---------------------------------------------------------------------------
// 2. Alert config — service unit tests (pure / no DB)
// ---------------------------------------------------------------------------

describe('UPL Analytics — alert configuration', () => {
  it('returns default config for an org with no custom config', () => {
    const config = svc.getUplAlertConfig('org-new-' + String(Date.now()));

    expect(config.redRateThreshold).toBe(0.05);
    expect(config.blockCountThreshold).toBe(10);
    expect(config.alertsEnabled).toBe(true);
  });

  it('setUplAlertConfig stores and returns the updated config', () => {
    const orgId = 'org-test-' + String(Date.now());

    const updated = svc.setUplAlertConfig(orgId, {
      redRateThreshold: 0.1,
      blockCountThreshold: 20,
      alertsEnabled: false,
    });

    expect(updated.redRateThreshold).toBe(0.1);
    expect(updated.blockCountThreshold).toBe(20);
    expect(updated.alertsEnabled).toBe(false);

    // Subsequent get returns the updated config
    const retrieved = svc.getUplAlertConfig(orgId);
    expect(retrieved).toEqual(updated);
  });

  it('setUplAlertConfig merges partial updates', () => {
    const orgId = 'org-partial-' + String(Date.now());

    // First set full config
    svc.setUplAlertConfig(orgId, {
      redRateThreshold: 0.08,
      blockCountThreshold: 15,
      alertsEnabled: true,
    });

    // Then partially update only alertsEnabled
    const result = svc.setUplAlertConfig(orgId, { alertsEnabled: false });

    expect(result.redRateThreshold).toBe(0.08);
    expect(result.blockCountThreshold).toBe(15);
    expect(result.alertsEnabled).toBe(false);
  });

  it('clamps redRateThreshold to 0–1', () => {
    const orgId = 'org-clamp-rate-' + String(Date.now());

    const r1 = svc.setUplAlertConfig(orgId, { redRateThreshold: 2.5 });
    expect(r1.redRateThreshold).toBe(1);

    const r2 = svc.setUplAlertConfig(orgId, { redRateThreshold: -0.5 });
    expect(r2.redRateThreshold).toBe(0);
  });

  it('clamps blockCountThreshold to >= 0 and rounds to integer', () => {
    const orgId = 'org-clamp-count-' + String(Date.now());

    const r1 = svc.setUplAlertConfig(orgId, { blockCountThreshold: -5 });
    expect(r1.blockCountThreshold).toBe(0);

    const r2 = svc.setUplAlertConfig(orgId, { blockCountThreshold: 7.9 });
    expect(r2.blockCountThreshold).toBe(8);
  });

  it('different orgs maintain independent configs', () => {
    const orgA = 'org-A-' + String(Date.now());
    const orgB = 'org-B-' + String(Date.now());

    svc.setUplAlertConfig(orgA, { redRateThreshold: 0.03 });
    svc.setUplAlertConfig(orgB, { redRateThreshold: 0.12 });

    expect(svc.getUplAlertConfig(orgA).redRateThreshold).toBe(0.03);
    expect(svc.getUplAlertConfig(orgB).redRateThreshold).toBe(0.12);
  });
});

// ---------------------------------------------------------------------------
// 3. Route integration tests
// ---------------------------------------------------------------------------

const MOCK_SUPERVISOR = {
  id: 'user-sup',
  email: 'supervisor@test.test',
  name: 'Sup User',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-route-test',
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

const MOCK_EXAMINER = {
  ...MOCK_SUPERVISOR,
  id: 'user-exam',
  email: 'examiner@test.test',
  name: 'Exam User',
  role: 'CLAIMS_EXAMINER' as const,
};

const mockUserFindUnique = vi.fn();

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

vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/test'),
    download: vi.fn().mockResolvedValue(Buffer.from('fake')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/services/document-pipeline.service.js', () => ({
  processDocumentPipeline: vi.fn().mockResolvedValue({
    documentId: 'doc-1', ocrSuccess: true, classificationSuccess: true,
    extractionSuccess: true, embeddingSuccess: true, timelineSuccess: true,
    chunksCreated: 0, fieldsExtracted: 0, timelineEventsCreated: 0, errors: [],
  }),
}));

vi.mock('../../server/services/investigation-checklist.service.js', () => ({
  getInvestigationProgress: vi.fn().mockResolvedValue({
    items: [], completedCount: 0, totalCount: 0, percentComplete: 0,
  }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/benefit-calculator.service.js', () => ({
  calculateTdRate: vi.fn().mockReturnValue({
    tdRate: 0, awe: 0, maxRate: 0, minRate: 0, statutoryAuthority: 'LC 4653',
  }),
  calculateTdBenefit: vi.fn().mockReturnValue({
    tdRate: 0, totalBenefit: 0, payments: [], statutoryAuthority: 'LC 4650',
  }),
  calculateDeathBenefit: vi.fn().mockReturnValue({
    totalBenefit: 0, burialAllowance: 0, statutoryAuthority: 'LC 4700',
  }),
}));

const { buildServer } = await import('../../server/index.js');

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { email: string; [key: string]: unknown },
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  const { prisma } = await import('../../server/db.js');
  (prisma.educationProfile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

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

describe('UPL Analytics — route integration', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-wire findUnique for session restoration after clearAllMocks
    const { prisma } = vi.mocked(await import('../../server/db.js'));
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    );
  });

  // ------- GET /compliance/upl/blocks -------

  it('GET /api/compliance/upl/blocks — 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/blocks',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/compliance/upl/blocks — 403 for CLAIMS_EXAMINER', async () => {
    const cookie = await loginAs(server, MOCK_EXAMINER);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/blocks',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/compliance/upl/blocks — 200 with blocks array for SUPERVISOR', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    mockAuditEventFindMany.mockResolvedValueOnce([
      makeBlockEvent({ id: 'blk-1', userId: 'user-1', userName: 'Test User' }),
    ]);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/blocks',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { blocks: unknown[] };
    expect(Array.isArray(body.blocks)).toBe(true);
    expect(body.blocks).toHaveLength(1);
  });

  it('GET /api/compliance/upl/blocks — accepts limit query param', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    mockAuditEventFindMany.mockResolvedValueOnce([]);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/blocks?limit=10',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    // findMany should have been called with take=10
    const callArg = mockAuditEventFindMany.mock.calls[0]?.[0] as { take?: number };
    expect(callArg?.take).toBe(10);
  });

  it('GET /api/compliance/upl/blocks — 400 for invalid limit param', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/blocks?limit=0',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
  });

  // ------- GET /compliance/upl/alert-config -------

  it('GET /api/compliance/upl/alert-config — 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/alert-config',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/compliance/upl/alert-config — 403 for CLAIMS_EXAMINER', async () => {
    const cookie = await loginAs(server, MOCK_EXAMINER);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/compliance/upl/alert-config — 200 with config object for SUPERVISOR', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const res = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      redRateThreshold: number;
      blockCountThreshold: number;
      alertsEnabled: boolean;
    };
    expect(typeof body.redRateThreshold).toBe('number');
    expect(typeof body.blockCountThreshold).toBe('number');
    expect(typeof body.alertsEnabled).toBe('boolean');
  });

  // ------- PUT /compliance/upl/alert-config -------

  it('PUT /api/compliance/upl/alert-config — 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/compliance/upl/alert-config',
      payload: { redRateThreshold: 0.1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /api/compliance/upl/alert-config — 403 for CLAIMS_EXAMINER', async () => {
    const cookie = await loginAs(server, MOCK_EXAMINER);

    const res = await server.inject({
      method: 'PUT',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
      payload: { redRateThreshold: 0.1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /api/compliance/upl/alert-config — 200 updates and returns config', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const res = await server.inject({
      method: 'PUT',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
      payload: {
        redRateThreshold: 0.08,
        blockCountThreshold: 15,
        alertsEnabled: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      redRateThreshold: number;
      blockCountThreshold: number;
      alertsEnabled: boolean;
    };
    expect(body.redRateThreshold).toBe(0.08);
    expect(body.blockCountThreshold).toBe(15);
    expect(body.alertsEnabled).toBe(false);
  });

  it('PUT /api/compliance/upl/alert-config — 400 for invalid body (rate > 1)', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const res = await server.inject({
      method: 'PUT',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
      payload: { redRateThreshold: 2.0 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/compliance/upl/alert-config — 400 for invalid body (alertsEnabled not boolean)', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const res = await server.inject({
      method: 'PUT',
      url: '/api/compliance/upl/alert-config',
      headers: { cookie },
      payload: { alertsEnabled: 'yes' },
    });

    expect(res.statusCode).toBe(400);
  });
});
