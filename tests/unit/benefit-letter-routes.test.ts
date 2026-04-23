import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * AJC-16 — Benefit-payment letter + LC 3761 employer-notification
 * route integration tests.
 *
 * Verifies:
 *   - POST /api/payments/:id/letters/benefit-payment    (auth, RBAC, 201/404/403)
 *   - POST /api/claims/:id/letters/employer-notification (auth, RBAC, 201/400/403)
 *   - GET  /api/letters/:id/pdf                         (auth, Content-Disposition)
 */

// ---------------------------------------------------------------------------
// Fixtures
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

const MOCK_CLAIM_FOR_ACCESS = {
  id: 'claim-1',
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
  deletedAt: null,
};

const MOCK_CLAIM_FOREIGN_ORG = {
  id: 'claim-1',
  organizationId: 'org-other',
  assignedExaminerId: 'user-other',
  deletedAt: null,
};

const MOCK_CLAIM_DATA = {
  id: 'claim-1',
  claimNumber: 'WC-2026-00042',
  claimantName: 'Maria Garcia',
  dateOfInjury: new Date('2026-01-10'),
  bodyParts: ['lumbar spine'],
  employer: 'Acme Manufacturing LLC',
  insurer: 'Pacific Workers Insurance',
  dateReceived: new Date('2026-01-15'),
  assignedExaminer: { name: 'Jane Examiner' },
};

const MOCK_PAYMENT = {
  id: 'payment-1',
  claimId: 'claim-1',
  paymentType: 'TD' as const,
  amount: '857.42',
  paymentDate: new Date('2026-02-14'),
  periodStart: new Date('2026-02-01'),
  periodEnd: new Date('2026-02-14'),
};

const MOCK_GENERATED_LETTER = {
  id: 'letter-bp-1',
  claimId: 'claim-1',
  userId: 'user-1',
  letterType: 'BENEFIT_PAYMENT_LETTER' as const,
  content: '# Benefit Payment Letter\n\nWC-2026-00042 — payment $857.42',
  templateId: 'benefit-payment-letter',
  populatedData: { claimNumber: 'WC-2026-00042', paymentAmount: '857.42' },
  createdAt: new Date('2026-02-15'),
};

// ---------------------------------------------------------------------------
// Mock Prisma + supporting modules
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockBenefitPaymentFindUnique = vi.fn();
const mockGeneratedLetterCreate = vi.fn();
const mockGeneratedLetterFindUnique = vi.fn();

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
    timelineEvent: { findMany: vi.fn().mockResolvedValue([]) },
    regulatoryDeadline: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    investigationItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
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
    generatedLetter: {
      create: (...args: unknown[]) => mockGeneratedLetterCreate(...args) as unknown,
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: (...args: unknown[]) => mockGeneratedLetterFindUnique(...args) as unknown,
    },
    counselReferral: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
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
      findUnique: (...args: unknown[]) => mockBenefitPaymentFindUnique(...args) as unknown,
    },
  },
}));

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

// Dynamic import after mocks are wired
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and capture session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_USER,
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
// Test suite
// ---------------------------------------------------------------------------

describe('AJC-16 — Benefit letter + LC 3761 routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;

  beforeAll(async () => {
    server = await buildServer();
    cookie = await loginAs(server, MOCK_USER);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: requireAuth re-fetches user — provide an answer for any call
    // that touches user.findUnique during the test.
    mockUserFindUnique.mockResolvedValue(MOCK_USER);
  });

  // -------------------------------------------------------------------------
  // POST /api/payments/:paymentId/letters/benefit-payment
  // -------------------------------------------------------------------------

  describe('POST /api/payments/:paymentId/letters/benefit-payment', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/payment-1/letters/benefit-payment',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 if payment not found', async () => {
      mockBenefitPaymentFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/missing/letters/benefit-payment',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload) as { error: string };
      expect(body.error).toContain('not found');
    });

    it('returns 403 if claim access denied (different org)', async () => {
      // First call: payment lookup for claim-id resolution
      mockBenefitPaymentFindUnique.mockResolvedValueOnce({ id: 'payment-1', claimId: 'claim-1' });
      // Second call: claim access check returns foreign-org claim
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOREIGN_ORG);

      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/payment-1/letters/benefit-payment',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 201 with generated letter on success', async () => {
      // Payment lookup for claim-id resolution
      mockBenefitPaymentFindUnique.mockResolvedValueOnce({ id: 'payment-1', claimId: 'claim-1' });
      // Claim access check
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);
      // Service-internal payment lookup (in generateBenefitPaymentLetter)
      mockBenefitPaymentFindUnique.mockResolvedValueOnce(MOCK_PAYMENT);
      // Service-internal claim lookup (in letter-template.service.fetchClaimData)
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);
      // Persistence
      mockGeneratedLetterCreate.mockResolvedValueOnce(MOCK_GENERATED_LETTER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/payment-1/letters/benefit-payment',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as { letter: { id: string; letterType: string } };
      expect(body.letter.id).toBe('letter-bp-1');
      expect(body.letter.letterType).toBe('BENEFIT_PAYMENT_LETTER');
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claims/:claimId/letters/employer-notification
  // -------------------------------------------------------------------------

  describe('POST /api/claims/:claimId/letters/employer-notification', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        payload: {
          type: 'BENEFIT_AWARD',
          benefitType: 'TD',
          benefitAmount: 1000,
          effectiveDate: '2026-03-01',
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 if claim access denied', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOREIGN_ORG);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: {
          type: 'BENEFIT_AWARD',
          benefitType: 'TD',
          benefitAmount: 1000,
          effectiveDate: '2026-03-01',
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 400 for invalid event payload (missing fields)', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: { type: 'BENEFIT_AWARD' }, // missing benefitType/Amount/EffectiveDate
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid effectiveDate format', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: {
          type: 'BENEFIT_AWARD',
          benefitType: 'TD',
          benefitAmount: 1000,
          effectiveDate: '03/01/2026', // wrong format
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for unknown event type', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: { type: 'UNKNOWN_EVENT' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 201 for valid BENEFIT_AWARD event', async () => {
      // Claim access check
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);
      // Service-internal claim lookup (in letter-template.service.fetchClaimData)
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);
      mockGeneratedLetterCreate.mockResolvedValueOnce({
        ...MOCK_GENERATED_LETTER,
        id: 'letter-en-1',
        letterType: 'EMPLOYER_NOTIFICATION_BENEFIT_AWARD',
        templateId: 'employer-notification-benefit-award',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: {
          type: 'BENEFIT_AWARD',
          benefitType: 'TD',
          benefitAmount: 857.42,
          effectiveDate: '2026-02-14',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as { letter: { letterType: string } };
      expect(body.letter.letterType).toBe('EMPLOYER_NOTIFICATION_BENEFIT_AWARD');
    });

    it('returns 201 for valid CLAIM_DECISION event', async () => {
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_DATA);
      mockGeneratedLetterCreate.mockResolvedValueOnce({
        ...MOCK_GENERATED_LETTER,
        id: 'letter-cd-1',
        letterType: 'EMPLOYER_NOTIFICATION_CLAIM_DECISION',
        templateId: 'employer-notification-claim-decision',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/employer-notification',
        headers: { cookie },
        payload: {
          type: 'CLAIM_DECISION',
          decisionType: 'ACCEPTED',
          decisionDate: '2026-03-15',
          decisionBasis: 'Investigation complete; AOE/COE established.',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as { letter: { letterType: string } };
      expect(body.letter.letterType).toBe('EMPLOYER_NOTIFICATION_CLAIM_DECISION');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/letters/:letterId/pdf
  // -------------------------------------------------------------------------

  describe('GET /api/letters/:letterId/pdf', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-bp-1/pdf',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 if letter not found', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/missing/pdf',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 if the parent claim is in a different org', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce(MOCK_GENERATED_LETTER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOREIGN_ORG);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-bp-1/pdf',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 200 with HTML body and Content-Disposition: attachment', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce(MOCK_GENERATED_LETTER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-bp-1/pdf',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      const disposition = response.headers['content-disposition'];
      expect(disposition).toBeTruthy();
      const dispositionStr = String(disposition);
      expect(dispositionStr).toMatch(/^attachment;\s*filename=/);
      expect(dispositionStr).toContain('WC-2026-00042');
      expect(dispositionStr).toContain('BENEFIT_PAYMENT_LETTER');
      expect(dispositionStr).toContain('letter-bp-1');
      // Body should contain the rendered HTML
      expect(response.payload).toContain('<!DOCTYPE html>');
      expect(response.payload).toContain('Glass Box Solutions');
      expect(response.payload).toContain('WC-2026-00042');
    });

    it('sanitizes the filename to remove path-traversal characters', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce({
        ...MOCK_GENERATED_LETTER,
        populatedData: { claimNumber: '../../etc/passwd' },
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM_FOR_ACCESS);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-bp-1/pdf',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const dispositionStr = String(response.headers['content-disposition']);
      // Slashes and dots-in-filename context must be replaced
      expect(dispositionStr).not.toContain('../');
      expect(dispositionStr).not.toContain('/');
    });
  });
});
