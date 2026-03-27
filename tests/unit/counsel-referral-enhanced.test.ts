import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';

/**
 * Enhanced counsel referral tests — Phase 10D.
 *
 * Tests:
 * - Referral creation generates summary and persists
 * - Referral listing returns all for a claim
 * - Status transitions work (PENDING→SENT→RESPONDED→CLOSED)
 * - Invalid status transitions are rejected
 * - Routes require auth
 * - Claim access is verified
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

const MOCK_CLAIM = {
  id: 'claim-1',
  claimNumber: 'WC-2025-00123',
  claimantName: 'John Smith',
  dateOfInjury: new Date('2025-06-15'),
  bodyParts: ['lumbar spine', 'left shoulder'],
  employer: 'Acme Corp',
  insurer: 'Pacific Insurance',
  status: 'OPEN',
  dateReceived: new Date('2025-06-20'),
  dateAcknowledged: new Date('2025-06-22'),
  dateDetermined: null,
  isLitigated: false,
  hasApplicantAttorney: false,
  totalPaidIndemnity: 5000,
  totalPaidMedical: 3000,
  currentReserveIndemnity: 10000,
  currentReserveMedical: 8000,
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
  documents: [],
  deadlines: [],
};

const MOCK_REFERRAL_PENDING = {
  id: 'ref-1',
  claimId: 'claim-1',
  userId: 'user-1',
  legalIssue: 'Dispute over AOE/COE',
  summary: '# Counsel Referral Summary\n\n## 1. Claim Overview\nTest content',
  status: 'PENDING' as const,
  counselEmail: null,
  counselResponse: null,
  respondedAt: null,
  createdAt: new Date('2025-07-01'),
  updatedAt: new Date('2025-07-01'),
};

const MOCK_REFERRAL_SENT = {
  ...MOCK_REFERRAL_PENDING,
  id: 'ref-2',
  status: 'SENT' as const,
  counselEmail: 'attorney@firm.test',
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockCounselReferralCreate = vi.fn();
const mockCounselReferralFindMany = vi.fn();
const mockCounselReferralFindUnique = vi.fn();
const mockCounselReferralUpdate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    },
    claim: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
      create: vi.fn().mockResolvedValue({}),
    },
    document: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    regulatoryDeadline: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    investigationItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    generatedLetter: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    counselReferral: {
      create: (...args: unknown[]) => mockCounselReferralCreate(...args) as unknown,
      findMany: (...args: unknown[]) => mockCounselReferralFindMany(...args) as unknown,
      findUnique: (...args: unknown[]) => mockCounselReferralFindUnique(...args) as unknown,
      update: (...args: unknown[]) => mockCounselReferralUpdate(...args) as unknown,
    },
    lien: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    benefitPayment: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock LLM adapter
vi.mock('../../server/lib/llm/index.js', () => ({
  getLLMAdapter: () => ({
    provider: 'stub',
    modelId: 'stub-model',
    generate: vi.fn().mockResolvedValue({
      content: '# Counsel Referral Summary\n\n## 1. Claim Overview\nStub content',
      provider: 'stub',
      model: 'stub-model',
      finishReason: 'STUB',
    }),
  }),
}));

// Mock storage and document pipeline services (imported transitively by server)
vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/mock'),
    download: vi.fn().mockResolvedValue(Buffer.from('mock')),
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

vi.mock('../../server/services/deadline-engine.service.js', () => ({
  getClaimDeadlines: vi.fn().mockResolvedValue([]),
  getDeadlineSummary: vi.fn().mockResolvedValue({ total: 0, pending: 0, met: 0, missed: 0 }),
  getAllUserDeadlines: vi.fn().mockResolvedValue([]),
  getAllUserDeadlinesPaginated: vi.fn().mockResolvedValue({ deadlines: [], total: 0 }),
  markDeadline: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/investigation-checklist.service.js', () => ({
  getInvestigationProgress: vi.fn().mockResolvedValue({
    items: [],
    totalItems: 0,
    completedItems: 0,
    progressPercentage: 0,
  }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

// Dynamic import after mocks are in place
const { buildServer } = await import('../../server/index.js');

// Import service functions for unit tests
import {
  isValidStatusTransition,
  createTrackedReferral,
  getClaimReferrals,
  getReferralById,
  updateReferralStatus,
} from '../../server/services/counsel-referral.service.js';

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_USER,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);

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
// Unit tests: Service functions
// ==========================================================================

describe('Counsel Referral Service — status transitions', () => {
  it('PENDING → SENT is valid', () => {
    expect(isValidStatusTransition('PENDING', 'SENT')).toBe(true);
  });

  it('PENDING → CLOSED is valid', () => {
    expect(isValidStatusTransition('PENDING', 'CLOSED')).toBe(true);
  });

  it('SENT → RESPONDED is valid', () => {
    expect(isValidStatusTransition('SENT', 'RESPONDED')).toBe(true);
  });

  it('SENT → CLOSED is valid', () => {
    expect(isValidStatusTransition('SENT', 'CLOSED')).toBe(true);
  });

  it('RESPONDED → CLOSED is valid', () => {
    expect(isValidStatusTransition('RESPONDED', 'CLOSED')).toBe(true);
  });

  it('PENDING → RESPONDED is invalid', () => {
    expect(isValidStatusTransition('PENDING', 'RESPONDED')).toBe(false);
  });

  it('SENT → PENDING is invalid (no backwards)', () => {
    expect(isValidStatusTransition('SENT', 'PENDING')).toBe(false);
  });

  it('CLOSED → anything is invalid', () => {
    expect(isValidStatusTransition('CLOSED', 'PENDING')).toBe(false);
    expect(isValidStatusTransition('CLOSED', 'SENT')).toBe(false);
    expect(isValidStatusTransition('CLOSED', 'RESPONDED')).toBe(false);
  });

  it('RESPONDED → PENDING is invalid', () => {
    expect(isValidStatusTransition('RESPONDED', 'PENDING')).toBe(false);
  });

  it('RESPONDED → SENT is invalid', () => {
    expect(isValidStatusTransition('RESPONDED', 'SENT')).toBe(false);
  });
});

describe('Counsel Referral Service — createTrackedReferral', () => {
  const mockRequest = {
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    log: { error: vi.fn() },
    session: { user: MOCK_USER },
  } as unknown as FastifyRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates summary via generateCounselReferral and persists', async () => {
    // Mock claim lookup for generateCounselReferral's gatherClaimData
    mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
    mockCounselReferralCreate.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

    const result = await createTrackedReferral(
      'user-1',
      'claim-1',
      'Dispute over AOE/COE',
      mockRequest,
    );

    expect(result.id).toBe('ref-1');
    expect(result.status).toBe('PENDING');
    expect(result.legalIssue).toBe('Dispute over AOE/COE');
    expect(mockCounselReferralCreate).toHaveBeenCalledTimes(1);

    // Verify the create call includes the summary
    const createArg = mockCounselReferralCreate.mock.calls[0]?.[0] as { data: { summary: string; status: string } };
    expect(createArg.data.summary).toBeTruthy();
    expect(createArg.data.status).toBe('PENDING');
  });
});

describe('Counsel Referral Service — getClaimReferrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all referrals for a claim', async () => {
    const referrals = [MOCK_REFERRAL_PENDING, MOCK_REFERRAL_SENT];
    mockCounselReferralFindMany.mockResolvedValueOnce(referrals);

    const result = await getClaimReferrals('claim-1');

    expect(result).toHaveLength(2);
    expect(mockCounselReferralFindMany).toHaveBeenCalledWith({
      where: { claimId: 'claim-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns empty array when no referrals exist', async () => {
    mockCounselReferralFindMany.mockResolvedValueOnce([]);

    const result = await getClaimReferrals('claim-no-refs');

    expect(result).toHaveLength(0);
  });
});

describe('Counsel Referral Service — getReferralById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a referral when found', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

    const result = await getReferralById('ref-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ref-1');
  });

  it('returns null when referral not found', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(null);

    const result = await getReferralById('ref-nonexistent');

    expect(result).toBeNull();
  });
});

describe('Counsel Referral Service — updateReferralStatus', () => {
  const mockRequest = {
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    log: { error: vi.fn() },
    session: { user: MOCK_USER },
  } as unknown as FastifyRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions PENDING → SENT', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);
    mockCounselReferralUpdate.mockResolvedValueOnce({
      ...MOCK_REFERRAL_PENDING,
      status: 'SENT',
      counselEmail: 'attorney@firm.test',
    });

    const result = await updateReferralStatus(
      'ref-1',
      'SENT',
      mockRequest,
      undefined,
      'attorney@firm.test',
    );

    expect(result.status).toBe('SENT');
    expect(result.counselEmail).toBe('attorney@firm.test');
  });

  it('transitions SENT → RESPONDED and sets respondedAt', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_SENT);
    mockCounselReferralUpdate.mockResolvedValueOnce({
      ...MOCK_REFERRAL_SENT,
      status: 'RESPONDED',
      counselResponse: 'We will handle this matter.',
      respondedAt: new Date(),
    });

    const result = await updateReferralStatus(
      'ref-2',
      'RESPONDED',
      mockRequest,
      'We will handle this matter.',
    );

    expect(result.status).toBe('RESPONDED');
    expect(result.counselResponse).toBe('We will handle this matter.');

    // Verify respondedAt is set in the update call
    const updateArg = mockCounselReferralUpdate.mock.calls[0]?.[0] as { data: { respondedAt?: Date } };
    expect(updateArg.data.respondedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid transitions (PENDING → RESPONDED)', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

    await expect(
      updateReferralStatus('ref-1', 'RESPONDED', mockRequest),
    ).rejects.toThrow('Invalid status transition: PENDING → RESPONDED');
  });

  it('rejects transitions from CLOSED', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce({
      ...MOCK_REFERRAL_PENDING,
      status: 'CLOSED',
    });

    await expect(
      updateReferralStatus('ref-1', 'SENT', mockRequest),
    ).rejects.toThrow('Invalid status transition: CLOSED → SENT');
  });

  it('throws when referral not found', async () => {
    mockCounselReferralFindUnique.mockResolvedValueOnce(null);

    await expect(
      updateReferralStatus('ref-nonexistent', 'SENT', mockRequest),
    ).rejects.toThrow('Referral not found: ref-nonexistent');
  });
});

// ==========================================================================
// Route integration tests
// ==========================================================================

describe('Counsel Referral Routes', () => {
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
  // Auth enforcement
  // -----------------------------------------------------------------------

  describe('auth enforcement', () => {
    it('POST /api/claims/:claimId/referrals returns 401 without auth', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/referrals',
        payload: { legalIssue: 'Test issue' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('GET /api/claims/:claimId/referrals returns 401 without auth', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/referrals',
      });

      expect(res.statusCode).toBe(401);
    });

    it('GET /api/referrals/:referralId returns 401 without auth', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/referrals/ref-1',
      });

      expect(res.statusCode).toBe(401);
    });

    it('PATCH /api/referrals/:referralId returns 401 without auth', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/api/referrals/ref-1',
        payload: { status: 'SENT' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/claims/:claimId/referrals
  // -----------------------------------------------------------------------

  describe('POST /api/claims/:claimId/referrals', () => {
    it('creates a referral and returns 201', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Mock claim access check
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      // Mock gatherClaimData inside generateCounselReferral
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      // Mock persisting the referral
      mockCounselReferralCreate.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

      const res = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/referrals',
        headers: { cookie },
        payload: { legalIssue: 'Dispute over AOE/COE' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { referral: { id: string; status: string } };
      expect(body.referral.id).toBe('ref-1');
      expect(body.referral.status).toBe('PENDING');
    });

    it('returns 403 when claim access is denied', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Claim belongs to different org
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-other',
        assignedExaminerId: 'user-other',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/referrals',
        headers: { cookie },
        payload: { legalIssue: 'Test issue' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 400 for missing legalIssue', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // Mock claim access
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/referrals',
        headers: { cookie },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/claims/:claimId/referrals
  // -----------------------------------------------------------------------

  describe('GET /api/claims/:claimId/referrals', () => {
    it('lists referrals for a claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      mockCounselReferralFindMany.mockResolvedValueOnce([
        MOCK_REFERRAL_PENDING,
        MOCK_REFERRAL_SENT,
      ]);

      const res = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/referrals',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { referrals: unknown[] };
      expect(body.referrals).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/referrals/:referralId
  // -----------------------------------------------------------------------

  describe('GET /api/referrals/:referralId', () => {
    it('returns a referral by ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

      const res = await server.inject({
        method: 'GET',
        url: '/api/referrals/ref-1',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { referral: typeof MOCK_REFERRAL_PENDING };
      expect(body.referral.id).toBe('ref-1');
    });

    it('returns 404 when referral not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockCounselReferralFindUnique.mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'GET',
        url: '/api/referrals/ref-nonexistent',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/referrals/:referralId
  // -----------------------------------------------------------------------

  describe('PATCH /api/referrals/:referralId', () => {
    it('updates status from PENDING to SENT', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);
      mockCounselReferralUpdate.mockResolvedValueOnce({
        ...MOCK_REFERRAL_PENDING,
        status: 'SENT',
        counselEmail: 'attorney@firm.test',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: '/api/referrals/ref-1',
        headers: { cookie },
        payload: { status: 'SENT', counselEmail: 'attorney@firm.test' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { referral: { status: string } };
      expect(body.referral.status).toBe('SENT');
    });

    it('returns 400 for invalid status transition', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockCounselReferralFindUnique.mockResolvedValueOnce(MOCK_REFERRAL_PENDING);

      const res = await server.inject({
        method: 'PATCH',
        url: '/api/referrals/ref-1',
        headers: { cookie },
        payload: { status: 'RESPONDED' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toContain('Invalid status transition');
    });

    it('returns 404 for unknown referral', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockCounselReferralFindUnique.mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'PATCH',
        url: '/api/referrals/ref-nonexistent',
        headers: { cookie },
        payload: { status: 'SENT' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid status value', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const res = await server.inject({
        method: 'PATCH',
        url: '/api/referrals/ref-1',
        headers: { cookie },
        payload: { status: 'INVALID_STATUS' },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
