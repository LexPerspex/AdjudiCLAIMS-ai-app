import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Investigation checklist service + route tests.
 *
 * Tests the investigation-checklist.service.ts functions (auto-completion,
 * manual completion, progress tracking) and the investigation + claim PATCH
 * route endpoints with mocked Prisma.
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

const MOCK_ADMIN = {
  id: 'user-3',
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

const MOCK_OTHER_EXAMINER = {
  id: 'user-4',
  email: 'other@acme-ins.test',
  name: 'Other Examiner',
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

const ITEM_TYPES = [
  'THREE_POINT_CONTACT_WORKER',
  'THREE_POINT_CONTACT_EMPLOYER',
  'THREE_POINT_CONTACT_PROVIDER',
  'RECORDED_STATEMENT',
  'EMPLOYER_REPORT',
  'MEDICAL_RECORDS',
  'DWC1_ON_FILE',
  'INDEX_BUREAU_CHECK',
  'AWE_VERIFIED',
  'INITIAL_RESERVES_SET',
] as const;

function makeMockItems(claimId: string, overrides?: Partial<{ isComplete: boolean; completedAt: Date | null; completedById: string | null; documentId: string | null }>) {
  return ITEM_TYPES.map((itemType, i) => ({
    id: `item-${String(i + 1)}`,
    claimId,
    itemType,
    isComplete: overrides?.isComplete ?? false,
    completedAt: overrides?.completedAt ?? null,
    completedById: overrides?.completedById ?? null,
    documentId: overrides?.documentId ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockClaimFindMany = vi.fn();
const mockClaimCount = vi.fn();
const mockClaimCreate = vi.fn();
const mockClaimUpdate = vi.fn();
const mockInvestigationFindMany = vi.fn();
const mockInvestigationFindFirst = vi.fn();
const mockInvestigationUpdate = vi.fn();
const mockInvestigationCreateMany = vi.fn();
const mockDeadlineCreateMany = vi.fn();
const mockDeadlineFindMany = vi.fn();
const mockDeadlineCount = vi.fn();
const mockDeadlineUpdate = vi.fn();

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
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
      findMany: (...args: unknown[]) => mockClaimFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockClaimCount(...args) as unknown,
      create: (...args: unknown[]) => mockClaimCreate(...args) as unknown,
      update: (...args: unknown[]) => mockClaimUpdate(...args) as unknown,
    },
    investigationItem: {
      findMany: (...args: unknown[]) => mockInvestigationFindMany(...args) as unknown,
      findFirst: (...args: unknown[]) => mockInvestigationFindFirst(...args) as unknown,
      update: (...args: unknown[]) => mockInvestigationUpdate(...args) as unknown,
      createMany: (...args: unknown[]) => mockInvestigationCreateMany(...args) as unknown,
    },
    regulatoryDeadline: {
      findMany: (...args: unknown[]) => mockDeadlineFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockDeadlineCount(...args) as unknown,
      createMany: (...args: unknown[]) => mockDeadlineCreateMany(...args) as unknown,
      update: (...args: unknown[]) => mockDeadlineUpdate(...args) as unknown,
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
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

// Mock external services used by document routes
vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/test'),
    download: vi.fn().mockResolvedValue(Buffer.from('test')),
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

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
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
// Tests: Investigation Checklist Service (direct function tests)
// ---------------------------------------------------------------------------

describe('Investigation Checklist Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  describe('getInvestigationProgress', () => {
    it('returns all 10 items with labels', async () => {
      const { getInvestigationProgress } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      const items = makeMockItems('claim-1');
      mockInvestigationFindMany.mockResolvedValueOnce(items);

      const progress = await getInvestigationProgress('claim-1');

      expect(progress.items).toHaveLength(10);
      expect(progress.totalItems).toBe(10);

      // Every item should have label and description
      for (const item of progress.items) {
        expect(item.label).toBeTruthy();
        expect(item.description).toBeTruthy();
      }
    });

    it('returns 0% complete for a new claim (all incomplete)', async () => {
      const { getInvestigationProgress } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationFindMany.mockResolvedValueOnce(makeMockItems('claim-1'));

      const progress = await getInvestigationProgress('claim-1');

      expect(progress.completedItems).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('returns 100% complete when all items are complete', async () => {
      const { getInvestigationProgress } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      const items = makeMockItems('claim-1', {
        isComplete: true,
        completedAt: new Date(),
        completedById: 'user-1',
      });
      mockInvestigationFindMany.mockResolvedValueOnce(items);

      const progress = await getInvestigationProgress('claim-1');

      expect(progress.completedItems).toBe(10);
      expect(progress.percentComplete).toBe(100);
    });
  });

  describe('markItemComplete', () => {
    it('sets isComplete, completedAt, and completedById', async () => {
      const { markItemComplete } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      const completedAt = new Date();
      mockInvestigationUpdate.mockResolvedValueOnce({
        id: 'item-1',
        claimId: 'claim-1',
        itemType: 'THREE_POINT_CONTACT_WORKER',
        isComplete: true,
        completedAt,
        completedById: 'user-1',
        documentId: null,
      });

      const result = await markItemComplete('item-1', 'user-1');

      expect(result.isComplete).toBe(true);
      expect(result.completedAt).toEqual(completedAt);
      expect(result.completedById).toBe('user-1');
      expect(result.isAutoCompleted).toBe(false);
      expect(result.label).toBe('Three-Point Contact: Injured Worker');
    });
  });

  describe('markItemIncomplete', () => {
    it('clears completion fields', async () => {
      const { markItemIncomplete } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationUpdate.mockResolvedValueOnce({
        id: 'item-1',
        claimId: 'claim-1',
        itemType: 'THREE_POINT_CONTACT_WORKER',
        isComplete: false,
        completedAt: null,
        completedById: null,
        documentId: null,
      });

      const result = await markItemIncomplete('item-1');

      expect(result.isComplete).toBe(false);
      expect(result.completedAt).toBeNull();
      expect(result.completedById).toBeNull();
      expect(result.documentId).toBeNull();
    });
  });

  describe('autoCompleteFromDocument', () => {
    it('DWC1_CLAIM_FORM auto-completes DWC1_ON_FILE', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationFindFirst.mockResolvedValueOnce({
        id: 'item-7',
        isComplete: false,
      });
      mockInvestigationUpdate.mockResolvedValueOnce({});

      const result = await autoCompleteFromDocument('claim-1', 'DWC1_CLAIM_FORM', 'doc-1');

      expect(result).toBe('DWC1_ON_FILE');
      expect(mockInvestigationUpdate).toHaveBeenCalledOnce();
    });

    it('MEDICAL_REPORT auto-completes MEDICAL_RECORDS', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationFindFirst.mockResolvedValueOnce({
        id: 'item-6',
        isComplete: false,
      });
      mockInvestigationUpdate.mockResolvedValueOnce({});

      const result = await autoCompleteFromDocument('claim-1', 'MEDICAL_REPORT', 'doc-2');

      expect(result).toBe('MEDICAL_RECORDS');
    });

    it('EMPLOYER_REPORT auto-completes EMPLOYER_REPORT', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationFindFirst.mockResolvedValueOnce({
        id: 'item-5',
        isComplete: false,
      });
      mockInvestigationUpdate.mockResolvedValueOnce({});

      const result = await autoCompleteFromDocument('claim-1', 'EMPLOYER_REPORT', 'doc-3');

      expect(result).toBe('EMPLOYER_REPORT');
    });

    it('WAGE_STATEMENT auto-completes AWE_VERIFIED', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      mockInvestigationFindFirst.mockResolvedValueOnce({
        id: 'item-9',
        isComplete: false,
      });
      mockInvestigationUpdate.mockResolvedValueOnce({});

      const result = await autoCompleteFromDocument('claim-1', 'WAGE_STATEMENT', 'doc-4');

      expect(result).toBe('AWE_VERIFIED');
    });

    it('returns null for unmapped document types (e.g., OTHER)', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      const result = await autoCompleteFromDocument('claim-1', 'OTHER', 'doc-5');

      expect(result).toBeNull();
      expect(mockInvestigationFindFirst).not.toHaveBeenCalled();
    });

    it('does not re-complete an already completed item', async () => {
      const { autoCompleteFromDocument } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      // Item is already complete
      mockInvestigationFindFirst.mockResolvedValueOnce({
        id: 'item-7',
        isComplete: true,
      });

      const result = await autoCompleteFromDocument('claim-1', 'DWC1_CLAIM_FORM', 'doc-6');

      expect(result).toBeNull();
      expect(mockInvestigationUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getItemLabel', () => {
    it('returns label and description for a valid item type', async () => {
      const { getItemLabel } = await import(
        '../../server/services/investigation-checklist.service.js'
      );

      const result = getItemLabel('DWC1_ON_FILE');

      expect(result.label).toBe('DWC-1 Claim Form on File');
      expect(result.description).toContain('DWC-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: PATCH /api/claims/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/claims/:id', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  it('returns 401 for unauthenticated request', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      payload: { status: 'ACCEPTED' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('updates claim fields successfully', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    mockClaimFindUnique.mockResolvedValueOnce({
      id: 'claim-1',
      organizationId: 'org-1',
      assignedExaminerId: 'user-1',
      status: 'OPEN',
    });

    const updatedClaim = {
      ...MOCK_CLAIM,
      claimantName: 'John Doe Updated',
      status: 'UNDER_INVESTIGATION',
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
    };
    mockClaimUpdate.mockResolvedValueOnce(updatedClaim);

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: {
        claimantName: 'John Doe Updated',
        status: 'UNDER_INVESTIGATION',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ claimantName: string; status: string }>();
    expect(body.claimantName).toBe('John Doe Updated');
    expect(body.status).toBe('UNDER_INVESTIGATION');
  });

  it('returns 400 for empty body', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<{ error: string }>();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 404 for nonexistent claim', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    mockClaimFindUnique.mockResolvedValueOnce(null);

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/nonexistent',
      headers: { cookie },
      payload: { status: 'CLOSED' },
    });

    expect(response.statusCode).toBe(404);

    const body = response.json<{ error: string }>();
    expect(body.error).toBe('Claim not found');
  });

  it('examiner can only update their assigned claim', async () => {
    const cookie = await loginAs(server, MOCK_OTHER_EXAMINER);

    mockClaimFindUnique.mockResolvedValueOnce({
      id: 'claim-1',
      organizationId: 'org-1',
      assignedExaminerId: 'user-1', // assigned to MOCK_USER, not MOCK_OTHER_EXAMINER
      status: 'OPEN',
    });

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: { status: 'CLOSED' },
    });

    expect(response.statusCode).toBe(403);

    const body = response.json<{ error: string }>();
    expect(body.error).toBe('Access denied to this claim');
  });

  it('supervisor can update any org claim', async () => {
    const cookie = await loginAs(server, MOCK_SUPERVISOR);

    mockClaimFindUnique.mockResolvedValueOnce({
      id: 'claim-1',
      organizationId: 'org-1',
      assignedExaminerId: 'user-1', // not assigned to supervisor
      status: 'OPEN',
    });

    const updatedClaim = {
      ...MOCK_CLAIM,
      status: 'ACCEPTED',
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
    };
    mockClaimUpdate.mockResolvedValueOnce(updatedClaim);

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: { status: 'ACCEPTED' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('status change is audit logged', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    mockClaimFindUnique.mockResolvedValueOnce({
      id: 'claim-1',
      organizationId: 'org-1',
      assignedExaminerId: 'user-1',
      status: 'OPEN',
    });

    mockClaimUpdate.mockResolvedValueOnce({
      ...MOCK_CLAIM,
      status: 'UNDER_INVESTIGATION',
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
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: { status: 'UNDER_INVESTIGATION' },
    });

    expect(response.statusCode).toBe(200);

    // Verify the audit event was created — the prisma mock's auditEvent.create
    // should have been called with CLAIM_STATUS_CHANGED
    const { prisma } = await import('../../server/db.js');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const auditCreate = prisma.auditEvent.create as ReturnType<typeof vi.fn>;

    // Give the void promise a tick to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(auditCreate).toHaveBeenCalled();

    const auditCall = auditCreate.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { data?: { eventType?: string } } | undefined;
        return arg?.data?.eventType === 'CLAIM_STATUS_CHANGED';
      },
    );
    expect(auditCall).toBeDefined();
  });

  it('date fields are correctly parsed as Date objects', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    mockClaimFindUnique.mockResolvedValueOnce({
      id: 'claim-1',
      organizationId: 'org-1',
      assignedExaminerId: 'user-1',
      status: 'OPEN',
    });

    mockClaimUpdate.mockResolvedValueOnce({
      ...MOCK_CLAIM,
      dateOfInjury: new Date('2026-03-01'),
      dateAcknowledged: new Date('2026-03-05'),
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
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: {
        dateOfInjury: '2026-03-01',
        dateAcknowledged: '2026-03-05',
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify the update was called with Date objects
    expect(mockClaimUpdate).toHaveBeenCalledOnce();
    const updateArg = mockClaimUpdate.mock.calls[0]?.[0] as {
      data: { dateOfInjury: Date; dateAcknowledged: Date };
    };
    expect(updateArg.data.dateOfInjury).toBeInstanceOf(Date);
    expect(updateArg.data.dateAcknowledged).toBeInstanceOf(Date);
  });

  it('returns 400 for invalid status value', async () => {
    const cookie = await loginAs(server, MOCK_USER);

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/claims/claim-1',
      headers: { cookie },
      payload: { status: 'INVALID_STATUS' },
    });

    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Investigation routes
// ---------------------------------------------------------------------------

describe('Investigation routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  describe('GET /api/claims/:claimId/investigation', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/investigation',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for claim not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/nonexistent/investigation',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns investigation progress for authorized user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const items = makeMockItems('claim-1');
      // Mark two items complete to test progress
      const item0 = items[0];
      const item1 = items[1];
      if (item0) {
        item0.isComplete = true;
        item0.completedAt = new Date();
        item0.completedById = 'user-1';
      }
      if (item1) {
        item1.isComplete = true;
        item1.completedAt = new Date();
        item1.completedById = 'user-1';
      }

      mockInvestigationFindMany.mockResolvedValueOnce(items);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/investigation',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: unknown[];
        totalItems: number;
        completedItems: number;
        percentComplete: number;
      }>();
      expect(body.items).toHaveLength(10);
      expect(body.totalItems).toBe(10);
      expect(body.completedItems).toBe(2);
      expect(body.percentComplete).toBe(20);
    });
  });

  describe('PATCH /api/claims/:claimId/investigation/:itemId', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        payload: { isComplete: true },
      });

      expect(response.statusCode).toBe(401);
    });

    it('marks item complete for authorized examiner', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const completedAt = new Date();
      mockInvestigationUpdate.mockResolvedValueOnce({
        id: 'item-1',
        claimId: 'claim-1',
        itemType: 'THREE_POINT_CONTACT_WORKER',
        isComplete: true,
        completedAt,
        completedById: 'user-1',
        documentId: null,
      });

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        headers: { cookie },
        payload: { isComplete: true },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        id: string;
        isComplete: boolean;
        label: string;
      }>();
      expect(body.id).toBe('item-1');
      expect(body.isComplete).toBe(true);
      expect(body.label).toBe('Three-Point Contact: Injured Worker');
    });

    it('examiner cannot mark item as incomplete', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        headers: { cookie },
        payload: { isComplete: false },
      });

      expect(response.statusCode).toBe(403);

      const body = response.json<{ error: string }>();
      expect(body.error).toContain('supervisor');
    });

    it('supervisor can mark item as incomplete', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      mockInvestigationUpdate.mockResolvedValueOnce({
        id: 'item-1',
        claimId: 'claim-1',
        itemType: 'THREE_POINT_CONTACT_WORKER',
        isComplete: false,
        completedAt: null,
        completedById: null,
        documentId: null,
      });

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        headers: { cookie },
        payload: { isComplete: false },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ isComplete: boolean }>();
      expect(body.isComplete).toBe(false);
    });

    it('admin can mark item as incomplete', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      mockInvestigationUpdate.mockResolvedValueOnce({
        id: 'item-1',
        claimId: 'claim-1',
        itemType: 'RECORDED_STATEMENT',
        isComplete: false,
        completedAt: null,
        completedById: null,
        documentId: null,
      });

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        headers: { cookie },
        payload: { isComplete: false },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 for invalid body', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/claims/claim-1/investigation/item-1',
        headers: { cookie },
        payload: { isComplete: 'yes' }, // should be boolean
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
