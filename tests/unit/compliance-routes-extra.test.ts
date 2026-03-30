import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Compliance routes — additional branch coverage.
 *
 * Covers uncovered branches in server/routes/compliance.ts:
 * - parseOptionalDate with invalid date string (lines 43-44)
 * - GET /api/compliance/upl with invalid query params (line 126)
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_SUPERVISOR = {
  id: 'user-2',
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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockAuditEventGroupBy = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockAuditEventCount = vi.fn();

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
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      findMany: (...args: unknown[]) => mockAuditEventFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockAuditEventCount(...args) as unknown,
      groupBy: (...args: unknown[]) => mockAuditEventGroupBy(...args) as unknown,
      create: vi.fn().mockResolvedValue({}),
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'ep-1', userId: 'user-1', dismissedTerms: [],
        trainingModulesCompleted: null, isTrainingComplete: true, learningModeExpiry: null,
      }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    regulatoryDeadline: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    investigationItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
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

// ---------------------------------------------------------------------------
// Helper: login
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_SUPERVISOR,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compliance Routes — extra coverage', () => {
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

  it('GET /api/compliance/upl handles invalid date in startDate (parseOptionalDate returns undefined)', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    // UPL dashboard mocks
    mockAuditEventGroupBy.mockResolvedValueOnce([
      { uplZone: 'GREEN', _count: { id: 10 } },
    ]);
    mockAuditEventFindMany.mockResolvedValueOnce([]);
    mockAuditEventCount.mockResolvedValueOnce(0);
    mockAuditEventCount.mockResolvedValueOnce(0);

    const response = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl?startDate=not-a-date&endDate=also-invalid',
      headers: { cookie },
    });

    // Invalid dates are silently treated as undefined, so request succeeds
    expect(response.statusCode).toBe(200);
  });

  it('GET /api/compliance/upl accepts valid date range', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    mockAuditEventGroupBy.mockResolvedValueOnce([
      { uplZone: 'GREEN', _count: { id: 5 } },
    ]);
    mockAuditEventFindMany.mockResolvedValueOnce([]);
    mockAuditEventCount.mockResolvedValueOnce(0);
    mockAuditEventCount.mockResolvedValueOnce(0);

    const response = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl?startDate=2026-03-01&endDate=2026-03-31&period=month',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it('GET /api/compliance/upl rejects invalid period value', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    const response = await server.inject({
      method: 'GET',
      url: '/api/compliance/upl?period=invalid',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toBe('Invalid query parameters');
  });
});
