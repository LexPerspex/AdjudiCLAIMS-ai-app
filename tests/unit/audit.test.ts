import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Audit query service + route tests.
 *
 * Covers paginated claim/user trail queries, UPL event filtering,
 * aggregate counts, CSV/JSON export, and all HTTP endpoints with RBAC.
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
};

const MOCK_SUPERVISOR = {
  id: 'user-2',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_ADMIN = {
  id: 'user-3',
  email: 'admin@acme-ins.test',
  name: 'Alice Admin',
  role: 'CLAIMS_ADMIN' as const,
  organizationId: 'org-1',
  isActive: true,
};

const MOCK_AUDIT_EVENT = {
  id: 'ae-1',
  userId: 'user-1',
  claimId: 'claim-1',
  eventType: 'CLAIM_VIEWED' as const,
  eventData: { action: 'view' },
  uplZone: null,
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  createdAt: new Date('2026-03-20T10:00:00Z'),
};

const MOCK_UPL_EVENT = {
  id: 'ae-2',
  userId: 'user-1',
  claimId: 'claim-1',
  eventType: 'UPL_ZONE_CLASSIFICATION' as const,
  eventData: { query: 'What is the TD rate?' },
  uplZone: 'GREEN',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  createdAt: new Date('2026-03-20T11:00:00Z'),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockAuditEventCount = vi.fn();
const mockAuditEventGroupBy = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
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
        id: 'ep-1',
        userId: 'user-1',
        dismissedTerms: [],
        trainingModulesCompleted: null,
        isTrainingComplete: true,
        learningModeExpiry: null,
      }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
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
    documentId: 'doc-1',
    ocrSuccess: true,
    classificationSuccess: true,
    extractionSuccess: true,
    embeddingSuccess: true,
    timelineSuccess: true,
    chunksCreated: 0,
    fieldsExtracted: 0,
    timelineEventsCreated: 0,
    errors: [],
  }),
}));

vi.mock('../../server/services/investigation-checklist.service.js', () => ({
  getInvestigationProgress: vi.fn().mockResolvedValue({
    items: [],
    completedCount: 0,
    totalCount: 0,
    percentComplete: 0,
  }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/benefit-calculator.service.js', () => ({
  calculateTdRate: vi.fn().mockReturnValue({
    tdRate: 0,
    awe: 0,
    maxRate: 0,
    minRate: 0,
    statutoryAuthority: 'LC 4653',
  }),
  calculateTdBenefit: vi.fn().mockReturnValue({
    tdRate: 0,
    totalBenefit: 0,
    payments: [],
    statutoryAuthority: 'LC 4650',
  }),
  calculateDeathBenefit: vi.fn().mockReturnValue({
    totalBenefit: 0,
    burialAllowance: 0,
    statutoryAuthority: 'LC 4700',
  }),
}));

// Dynamic imports after mocks are in place
const { buildServer } = await import('../../server/index.js');
const auditQuery = await import('../../server/services/audit-query.service.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  // login route also queries educationProfile
  const { prisma } = await import('../../server/db.js');
  (prisma.educationProfile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ==========================================================================
// SERVICE TESTS
// ==========================================================================

describe('Audit Query Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClaimAuditTrail', () => {
    it('returns paginated events for a claim', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const result = await auditQuery.getClaimAuditTrail('claim-1');

      expect(result.items).toHaveLength(1);
      expect((result.items[0] as (typeof result.items)[number]).claimId).toBe('claim-1');
      expect(result.total).toBe(1);
      expect(result.take).toBe(50); // default
      expect(result.skip).toBe(0);
    });

    it('filters by event type', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const result = await auditQuery.getClaimAuditTrail('claim-1', {
        eventTypes: ['DOCUMENT_VIEWED'],
      });

      const [findManyCall] = mockAuditEventFindMany.mock.calls;
      const where = (findManyCall as Array<{ where: unknown }>)[0]?.where as Record<string, unknown>;
      expect(where.eventType).toBeDefined();
      expect(result.items).toHaveLength(1);
    });

    it('filters by date range', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const startDate = new Date('2026-03-01');
      const endDate = new Date('2026-03-31');

      const result = await auditQuery.getClaimAuditTrail('claim-1', {
        startDate,
        endDate,
      });

      const [findManyCall] = mockAuditEventFindMany.mock.calls;
      const where = (findManyCall as Array<{ where: unknown }>)[0]?.where as Record<string, unknown>;
      expect(where.createdAt).toBeDefined();
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getUserAuditTrail', () => {
    it('returns events for a user', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT, MOCK_UPL_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(2);

      const result = await auditQuery.getUserAuditTrail('user-1');

      expect(result.items).toHaveLength(2);
      expect((result.items[0] as (typeof result.items)[number]).userId).toBe('user-1');
      expect(result.total).toBe(2);
    });
  });

  describe('getUplEvents', () => {
    it('returns only UPL event types', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_UPL_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const result = await auditQuery.getUplEvents('org-1');

      // Verify the where clause only included UPL event types
      const [findManyCall] = mockAuditEventFindMany.mock.calls;
      const where = (findManyCall as Array<{ where: unknown }>)[0]?.where as Record<string, unknown>;
      const eventTypeFilter = where.eventType as { in: string[] };
      expect(eventTypeFilter.in).toContain('UPL_ZONE_CLASSIFICATION');
      expect(eventTypeFilter.in).toContain('UPL_OUTPUT_BLOCKED');
      expect(eventTypeFilter.in).toContain('UPL_DISCLAIMER_INJECTED');
      expect(eventTypeFilter.in).toContain('UPL_OUTPUT_VALIDATION_FAIL');

      expect(result.items).toHaveLength(1);
      expect((result.items[0] as (typeof result.items)[number]).eventType).toBe('UPL_ZONE_CLASSIFICATION');
    });
  });

  describe('getAuditEventCounts', () => {
    it('returns counts grouped by event type', async () => {
      mockAuditEventGroupBy.mockResolvedValueOnce([
        { eventType: 'CLAIM_VIEWED', _count: { id: 10 } },
        { eventType: 'UPL_ZONE_CLASSIFICATION', _count: { id: 5 } },
      ]);

      const result = await auditQuery.getAuditEventCounts('org-1');

      expect(result).toHaveLength(2);
      expect((result[0] as (typeof result)[number]).eventType).toBe('CLAIM_VIEWED');
      expect((result[0] as (typeof result)[number]).count).toBe(10);
      expect((result[1] as (typeof result)[number]).eventType).toBe('UPL_ZONE_CLASSIFICATION');
      expect((result[1] as (typeof result)[number]).count).toBe(5);
    });
  });

  describe('exportAuditEvents', () => {
    it('returns flattened records for JSON format', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);

      const result = await auditQuery.exportAuditEvents('org-1', { format: 'json' });

      expect(result).toHaveLength(1);
      expect((result[0] as (typeof result)[number]).id).toBe('ae-1');
      expect((result[0] as (typeof result)[number]).userId).toBe('user-1');
      expect((result[0] as (typeof result)[number]).claimId).toBe('claim-1');
      expect(typeof (result[0] as (typeof result)[number]).createdAt).toBe('string'); // ISO string
      expect(typeof (result[0] as (typeof result)[number]).eventDataJson).toBe('string');
    });

    it('serialises eventData as JSON string for CSV format', async () => {
      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);

      const result = await auditQuery.exportAuditEvents('org-1', { format: 'csv' });

      expect((result[0] as (typeof result)[number]).eventDataJson).toBe(JSON.stringify({ action: 'view' }));
    });
  });
});

// ==========================================================================
// ROUTE TESTS
// ==========================================================================

describe('Audit Routes', () => {
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

  // -------------------------------------------------------------------------
  // GET /api/audit/claim/:claimId
  // -------------------------------------------------------------------------

  describe('GET /api/audit/claim/:claimId', () => {
    it('returns 200 with audit trail for authenticated examiner', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/claim/claim-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { events: unknown[]; total: number };
      expect(body.events).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/claim/claim-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/audit/user/:userId
  // -------------------------------------------------------------------------

  describe('GET /api/audit/user/:userId', () => {
    it('returns 403 for examiner role', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/user/user-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with events for supervisor role', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/user/user-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { events: unknown[]; total: number };
      expect(body.events).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/audit/upl
  // -------------------------------------------------------------------------

  describe('GET /api/audit/upl', () => {
    it('requires supervisor role (403 for examiner)', async () => {
      const cookie = await loginAs(server, MOCK_EXAMINER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/upl',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns UPL events for supervisor', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_UPL_EVENT]);
      mockAuditEventCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/upl',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { events: unknown[]; total: number };
      expect(body.events).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/audit/export
  // -------------------------------------------------------------------------

  describe('GET /api/audit/export', () => {
    it('returns 403 for supervisor role', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/export',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 JSON export for admin', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/export?format=json',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { records: unknown[] };
      expect(Array.isArray(body.records)).toBe(true);
      expect(body.records).toHaveLength(1);
    });

    it('returns CSV with correct content-type for admin', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      mockAuditEventFindMany.mockResolvedValueOnce([MOCK_AUDIT_EVENT]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/export?format=csv',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
    });
  });
});
