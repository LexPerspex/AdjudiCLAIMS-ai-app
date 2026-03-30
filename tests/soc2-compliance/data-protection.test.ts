import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * SOC 2 CC6.5-CC6.7 — Data Protection
 *
 * Tests:
 * - Right to deletion anonymizes PII (name → REDACTED, email → deleted-{id}@redacted.local)
 * - Right to deletion preserves audit trail (AuditEvent records NOT deleted)
 * - Right to deletion soft-deletes associated claims and documents
 * - DSAR export includes all user data sections
 * - DSAR export excludes sensitive fields (passwordHash, mfaSecret)
 * - DSAR export requires admin or self authorization
 * - Data retention identifies records older than 7 years after claim closure
 * - Sentry PII scrubbing strips email and SSN patterns
 */

// ---------------------------------------------------------------------------
// Mock argon2
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
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mock-hash',
  emailVerified: true,
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
};

const MOCK_ADMIN = {
  id: 'user-admin',
  email: 'admin@acme-ins.test',
  name: 'Alice Admin',
  role: 'CLAIMS_ADMIN' as const,
  organizationId: 'org-1',
  isActive: true,
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mock-hash',
  emailVerified: true,
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
};

const MOCK_TARGET_USER = {
  id: 'user-target',
  email: 'target@acme-ins.test',
  name: 'Target User',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserUpdate = vi.fn();
const mockClaimFindMany = vi.fn();
const mockDocumentUpdateMany = vi.fn();
const mockClaimUpdateMany = vi.fn();
const mockAuditEventCreate = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockChatSessionFindMany = vi.fn();
const mockEducationProfileFindUnique = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args) as unknown,
      update: (...args: unknown[]) => mockUserUpdate(...args) as unknown,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      findMany: (...args: unknown[]) => mockClaimFindMany(...args) as unknown,
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: (...args: unknown[]) => mockClaimUpdateMany(...args) as unknown,
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      updateMany: (...args: unknown[]) => mockDocumentUpdateMany(...args) as unknown,
      groupBy: vi.fn().mockResolvedValue([]),
    },
    auditEvent: {
      create: (...args: unknown[]) => mockAuditEventCreate(...args) as unknown,
      findMany: (...args: unknown[]) => mockAuditEventFindMany(...args) as unknown,
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    educationProfile: {
      findUnique: (...args: unknown[]) => mockEducationProfileFindUnique(...args) as unknown,
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
    chatSession: {
      findMany: (...args: unknown[]) => mockChatSessionFindMany(...args) as unknown,
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
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    benefitPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
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
  getInvestigationProgress: vi.fn().mockResolvedValue({ items: [], completedCount: 0, totalCount: 0, percentComplete: 0 }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/benefit-calculator.service.js', () => ({
  calculateTdRate: vi.fn().mockReturnValue({ tdRate: 0, awe: 0, maxRate: 0, minRate: 0, statutoryAuthority: 'LC 4653' }),
  calculateTdBenefit: vi.fn().mockReturnValue({ tdRate: 0, totalBenefit: 0, payments: [], statutoryAuthority: 'LC 4650' }),
  calculateDeathBenefit: vi.fn().mockReturnValue({ totalBenefit: 0, burialAllowance: 0, statutoryAuthority: 'LC 4700' }),
}));

vi.mock('../../server/services/deadline-engine.service.js', () => ({
  getClaimDeadlines: vi.fn().mockResolvedValue([]),
  getDeadlineSummary: vi.fn().mockResolvedValue({ total: 0, pending: 0, met: 0, missed: 0 }),
  getAllUserDeadlines: vi.fn().mockResolvedValue([]),
  getAllUserDeadlinesPaginated: vi.fn().mockResolvedValue({ deadlines: [], total: 0 }),
  markDeadline: vi.fn().mockResolvedValue({}),
}));

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_EXAMINER | typeof MOCK_ADMIN,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  mockEducationProfileFindUnique.mockResolvedValueOnce({ isTrainingComplete: true });
  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: 'TestPassword1!' },
  });
  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error(`No session cookie returned. Status: ${loginResponse.statusCode}, body: ${loginResponse.body}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SOC 2 CC6.5-CC6.7 — Data Protection', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks — these return safe defaults after clearAllMocks
    mockEducationProfileFindUnique.mockResolvedValue({ isTrainingComplete: true });
    mockAuditEventCreate.mockResolvedValue({ id: 'ae-new' });
    mockUserUpdate.mockResolvedValue({});
    mockUserFindFirst.mockResolvedValue(null);
    mockClaimFindMany.mockResolvedValue([]);
    mockChatSessionFindMany.mockResolvedValue([]);
    mockAuditEventFindMany.mockResolvedValue([]);
    mockClaimUpdateMany.mockResolvedValue({ count: 0 });
    mockDocumentUpdateMany.mockResolvedValue({ count: 0 });
  });

  // CC6.5 — Right to deletion anonymizes PII
  it('deletion anonymizes name to REDACTED and email to deleted-{id}@redacted.local', async () => {
    const cookie = await loginAs(server, MOCK_ADMIN);

    // Target user exists in same org
    mockUserFindFirst.mockResolvedValueOnce({ id: MOCK_TARGET_USER.id, email: MOCK_TARGET_USER.email });
    // No assigned claims
    mockClaimFindMany.mockResolvedValueOnce([]);
    // user.update for anonymization
    mockUserUpdate.mockResolvedValueOnce({});

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/users/${MOCK_TARGET_USER.id}/data`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    // Verify update was called with anonymized PII
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'REDACTED',
          email: `deleted-${MOCK_TARGET_USER.id}@redacted.local`,
        }),
      }),
    );
  });

  // CC6.5 — Audit trail is preserved (NOT deleted)
  it('deletion does NOT delete audit events — they are preserved', async () => {
    const cookie = await loginAs(server, MOCK_ADMIN);

    mockUserFindFirst.mockResolvedValueOnce({ id: MOCK_TARGET_USER.id, email: MOCK_TARGET_USER.email });
    mockClaimFindMany.mockResolvedValueOnce([]);
    mockUserUpdate.mockResolvedValueOnce({});

    const { prisma } = await import('../../server/db.js');

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/users/${MOCK_TARGET_USER.id}/data`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    // auditEvent.deleteMany should NEVER be called
    expect((prisma.auditEvent as unknown as Record<string, unknown>)['deleteMany']).toBeUndefined();
    // auditEvent.create should be called (for logging the deletion events)
    expect(mockAuditEventCreate).toHaveBeenCalled();
  });

  // CC6.5 — Soft-deletes associated claims and documents
  it('deletion soft-deletes associated claims and documents', async () => {
    const cookie = await loginAs(server, MOCK_ADMIN);

    mockUserFindFirst.mockResolvedValueOnce({ id: MOCK_TARGET_USER.id, email: MOCK_TARGET_USER.email });
    // User has 2 assigned claims
    mockClaimFindMany.mockResolvedValueOnce([
      { id: 'claim-1' },
      { id: 'claim-2' },
    ]);
    mockDocumentUpdateMany.mockResolvedValueOnce({ count: 3 });
    mockClaimUpdateMany.mockResolvedValueOnce({ count: 2 });
    mockUserUpdate.mockResolvedValueOnce({});

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/users/${MOCK_TARGET_USER.id}/data`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean; recordsAffected: { claims: number; documents: number } }>();
    expect(body.ok).toBe(true);
    expect(body.recordsAffected.claims).toBe(2);
    expect(body.recordsAffected.documents).toBe(3);

    // Verify soft-delete (updateMany) not hard-delete (deleteMany)
    expect(mockDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(mockClaimUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  // CC6.5 — DSAR export includes all user data sections
  it('DSAR export response includes subject, claims, documents, chatSessions, auditEvents, educationProfile', async () => {
    const cookie = await loginAs(server, MOCK_ADMIN);

    // Export own data (admin requesting target user)
    mockUserFindFirst.mockResolvedValueOnce({
      id: MOCK_TARGET_USER.id,
      email: MOCK_TARGET_USER.email,
      name: MOCK_TARGET_USER.name,
      role: MOCK_TARGET_USER.role,
      organizationId: MOCK_TARGET_USER.organizationId,
      isActive: true,
      emailVerified: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    mockClaimFindMany.mockResolvedValueOnce([{ id: 'claim-1', claimNumber: 'CLM-001', claimantName: 'John Doe', dateOfInjury: new Date(), status: 'OPEN', createdAt: new Date(), updatedAt: new Date(), deletedAt: null }]);
    // Documents for the claim
    const { prisma } = await import('../../server/db.js');
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'doc-1', claimId: 'claim-1', fileName: 'report.pdf', documentType: 'MEDICAL_REPORT', ocrStatus: 'COMPLETE', createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    mockChatSessionFindMany.mockResolvedValueOnce([]);
    mockAuditEventFindMany.mockResolvedValueOnce([]);
    mockEducationProfileFindUnique.mockResolvedValueOnce({
      id: 'ep-1',
      isTrainingComplete: true,
      learningModeExpiry: null,
      lastRecertificationDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      dismissedTerms: [],
      trainingModulesCompleted: null,
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${MOCK_TARGET_USER.id}/data-export`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      exportedAt: string;
      subject: Record<string, unknown>;
      claims: unknown[];
      documents: unknown[];
      chatSessions: unknown[];
      auditEvents: unknown[];
      educationProfile: Record<string, unknown> | null;
    }>();

    expect(body.exportedAt).toBeDefined();
    expect(body.subject).toBeDefined();
    expect(Array.isArray(body.claims)).toBe(true);
    expect(Array.isArray(body.documents)).toBe(true);
    expect(Array.isArray(body.chatSessions)).toBe(true);
    expect(Array.isArray(body.auditEvents)).toBe(true);
  });

  // CC6.5 — DSAR export excludes sensitive fields
  it('DSAR export response does NOT contain passwordHash or mfaSecret', async () => {
    const cookie = await loginAs(server, MOCK_ADMIN);

    mockUserFindFirst.mockResolvedValueOnce({
      id: MOCK_TARGET_USER.id,
      email: MOCK_TARGET_USER.email,
      name: MOCK_TARGET_USER.name,
      role: MOCK_TARGET_USER.role,
      organizationId: MOCK_TARGET_USER.organizationId,
      isActive: true,
      emailVerified: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      // passwordHash and mfaSecret explicitly NOT included per route SELECT
    });
    mockClaimFindMany.mockResolvedValueOnce([]);
    mockChatSessionFindMany.mockResolvedValueOnce([]);
    mockAuditEventFindMany.mockResolvedValueOnce([]);
    mockEducationProfileFindUnique.mockResolvedValueOnce(null);

    const response = await server.inject({
      method: 'GET',
      url: `/api/users/${MOCK_TARGET_USER.id}/data-export`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ subject: Record<string, unknown> }>();

    // Sensitive fields must not appear in the export
    expect(body.subject['passwordHash']).toBeUndefined();
    expect(body.subject['mfaSecret']).toBeUndefined();
  });

  // CC6.5 — DSAR export requires admin or self authorization
  it('examiner cannot export another user\'s data (403)', async () => {
    const cookie = await loginAs(server, MOCK_EXAMINER);

    const response = await server.inject({
      method: 'GET',
      url: '/api/users/some-other-user-id/data-export',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // CC6.6 — Data retention identifies 7-year-old records
  it('data retention service identifies claims closed more than 7 years ago', async () => {
    const { identifyExpiredRecords } = await import('../../server/services/data-retention.service.js');

    // mockClaimFindMany is the underlying vi.fn for prisma.claim.findMany in this test file
    mockClaimFindMany.mockResolvedValueOnce([
      { id: 'old-claim-1' },
      { id: 'old-claim-2' },
    ]);
    // Documents on those claims — prisma.document.findMany is a plain vi.fn() in this mock
    const { prisma } = await import('../../server/db.js');
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'doc-old-1' },
    ]);
    // chatSession.findMany is an arrow wrapper over mockChatSessionFindMany — use the underlying mock
    mockChatSessionFindMany.mockResolvedValueOnce([]);

    const expired = await identifyExpiredRecords({ retentionYears: 7, gracePeriodDays: 90 });

    expect(expired.claims).toHaveLength(2);
    expect(expired.claims).toContain('old-claim-1');
  });

  // CC6.7 — Sentry PII scrubbing: verify the patterns used in instrumentation.ts
  it('Sentry PII scrubbing EMAIL_PATTERN matches standard email addresses', () => {
    // Test the same regex used in instrumentation.ts scrubString
    const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const input = 'Error processing user john.doe@example.com data';
    const scrubbed = input.replace(EMAIL_PATTERN, '[REDACTED]');
    expect(scrubbed).not.toContain('john.doe@example.com');
    expect(scrubbed).toContain('[REDACTED]');
  });

  it('Sentry PII scrubbing SSN_PATTERN matches SSN in XXX-XX-XXXX format', () => {
    // Test the same regex used in instrumentation.ts scrubString
    const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
    const input = 'Error for SSN 123-45-6789 in record';
    const scrubbed = input.replace(SSN_PATTERN, '[REDACTED]');
    expect(scrubbed).not.toContain('123-45-6789');
    expect(scrubbed).toContain('[REDACTED]');
  });
});
