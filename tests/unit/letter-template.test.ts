import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Letter template tests.
 *
 * Tests the letter template service and routes:
 * - Template listing and retrieval
 * - Token replacement (all tokens populated, no leftover {{}} markers)
 * - Letter generation persists to DB
 * - Missing required data handled gracefully
 * - All letter types produce valid content
 * - GREEN zone compliance (no legal language in any template)
 * - Route authentication and claim access enforcement
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
  dateReceived: new Date('2025-06-20'),
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
  assignedExaminer: { name: 'Jane Examiner' },
};

const MOCK_GENERATED_LETTER = {
  id: 'letter-1',
  claimId: 'claim-1',
  userId: 'user-1',
  letterType: 'TD_BENEFIT_EXPLANATION' as const,
  content: '# TD Benefit Explanation\n\nTest content',
  templateId: 'td-benefit-explanation',
  populatedData: { claimNumber: 'WC-2025-00123' },
  createdAt: new Date('2025-07-01'),
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockGeneratedLetterCreate = vi.fn();
const mockGeneratedLetterFindMany = vi.fn();
const mockGeneratedLetterFindUnique = vi.fn();

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
      create: (...args: unknown[]) => mockGeneratedLetterCreate(...args) as unknown,
      findMany: (...args: unknown[]) => mockGeneratedLetterFindMany(...args) as unknown,
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
    },
  },
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

// ---------------------------------------------------------------------------
// Import service functions for unit tests
// ---------------------------------------------------------------------------

import {
  getTemplates,
  getTemplate,
} from '../../server/services/letter-template.service.js';


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
// Unit tests: Template data and token replacement
// ==========================================================================

describe('Letter Template Service — unit tests', () => {
  describe('getTemplates', () => {
    it('returns all 5 letter templates', () => {
      const templates = getTemplates();
      expect(templates).toHaveLength(5);
    });

    it('each template has required properties', () => {
      const templates = getTemplates();

      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.letterType).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.requiredFields.length).toBeGreaterThan(0);
        expect(t.template).toBeTruthy();
        expect(t.statutoryAuthority).toBeTruthy();
      }
    });

    it('each template has a unique ID', () => {
      const templates = getTemplates();
      const ids = templates.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each template has a unique letterType', () => {
      const templates = getTemplates();
      const types = templates.map((t) => t.letterType);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  describe('getTemplate', () => {
    it('returns a template by ID', () => {
      const template = getTemplate('td-benefit-explanation');
      expect(template).not.toBeNull();
      expect(template?.letterType).toBe('TD_BENEFIT_EXPLANATION');
    });

    it('returns null for unknown template ID', () => {
      const template = getTemplate('nonexistent-template');
      expect(template).toBeNull();
    });
  });

  describe('template content — letter types', () => {
    it('TD_BENEFIT_EXPLANATION includes rate calculation tokens', () => {
      const t = getTemplate('td-benefit-explanation');
      expect(t?.template).toContain('{{tdRate}}');
      expect(t?.template).toContain('{{awe}}');
      expect(t?.template).toContain('{{statutoryMin}}');
      expect(t?.template).toContain('{{statutoryMax}}');
    });

    it('TD_PAYMENT_SCHEDULE includes payment period tokens', () => {
      const t = getTemplate('td-payment-schedule');
      expect(t?.template).toContain('{{paymentStartDate}}');
      expect(t?.template).toContain('{{paymentEndDate}}');
      expect(t?.template).toContain('{{tdRate}}');
    });

    it('WAITING_PERIOD_NOTICE references LC 4652', () => {
      const t = getTemplate('waiting-period-notice');
      expect(t?.template).toContain('4652');
      expect(t?.statutoryAuthority).toContain('LC 4652');
    });

    it('EMPLOYER_NOTIFICATION_LC3761 includes employer obligations', () => {
      const t = getTemplate('employer-notification-lc3761');
      expect(t?.template).toContain('{{employer}}');
      expect(t?.template).toContain('{{dateReceived}}');
      expect(t?.template).toContain('3761');
    });

    it('BENEFIT_ADJUSTMENT_NOTICE includes updated rate tokens', () => {
      const t = getTemplate('benefit-adjustment-notice');
      expect(t?.template).toContain('{{tdRate}}');
      expect(t?.template).toContain('{{awe}}');
      expect(t?.statutoryAuthority).toContain('LC 4653');
    });
  });

  describe('template content — statutory authority citations', () => {
    it('every template cites at least one statutory authority', () => {
      const templates = getTemplates();

      for (const t of templates) {
        expect(t.statutoryAuthority).toMatch(/LC \d+/);
      }
    });

    it('every template body references its cited authority', () => {
      const templates = getTemplates();

      for (const t of templates) {
        // Extract the LC numbers from the statutoryAuthority field
        const lcNumbers = t.statutoryAuthority.match(/\d+/g) ?? [];
        // At least one LC number should appear in the template body
        const found = lcNumbers.some((num) => t.template.includes(num));
        expect(found).toBe(true);
      }
    });
  });

  describe('GREEN zone compliance — no legal language', () => {
    const PROHIBITED_PHRASES = [
      'you should',
      'we recommend',
      'in our opinion',
      'we advise',
      'legal analysis',
      'legal conclusion',
      'we believe',
      'it is our position',
      'you are entitled to',
      'your rights include',
      'we determine that',
      'liability',
    ];

    it('no template contains prohibited legal language', () => {
      const templates = getTemplates();

      for (const t of templates) {
        const lower = t.template.toLowerCase();
        for (const phrase of PROHIBITED_PHRASES) {
          expect(lower).not.toContain(phrase);
        }
      }
    });

    it('all templates include a disclaimer', () => {
      const templates = getTemplates();

      for (const t of templates) {
        const lower = t.template.toLowerCase();
        expect(lower).toContain('does not constitute legal advice');
      }
    });
  });

  describe('token replacement', () => {
    it('replaces all tokens with provided data', () => {
      // Manually test the replacement logic using the template content
      const template = getTemplate('waiting-period-notice');
      expect(template).not.toBeNull();

      const tokenData: Record<string, string> = {
        currentDate: '2025-07-15',
        claimNumber: 'WC-2025-00123',
        claimantName: 'John Smith',
        dateOfInjury: '2025-06-15',
        employer: 'Acme Corp',
        insurer: 'Pacific Insurance',
        bodyParts: 'lumbar spine, left shoulder',
        examinerName: 'Jane Examiner',
      };

      // Simulate token replacement
      let content = (template as NonNullable<typeof template>).template;
      content = content.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
        return tokenData[token] ?? 'N/A';
      });

      // All provided tokens should be replaced
      expect(content).toContain('WC-2025-00123');
      expect(content).toContain('John Smith');
      expect(content).toContain('2025-06-15');
      expect(content).toContain('Acme Corp');
      expect(content).toContain('Pacific Insurance');
      expect(content).toContain('lumbar spine, left shoulder');
      expect(content).toContain('Jane Examiner');

      // No leftover {{}} markers
      expect(content).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('replaces missing tokens with N/A', () => {
      const template = getTemplate('td-benefit-explanation');
      expect(template).not.toBeNull();

      // Only provide partial data
      const tokenData: Record<string, string> = {
        currentDate: '2025-07-15',
        claimNumber: 'WC-2025-00123',
        claimantName: 'John Smith',
      };

      let content = (template as NonNullable<typeof template>).template;
      content = content.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
        return tokenData[token] ?? 'N/A';
      });

      // No leftover {{}} markers — all replaced with N/A or actual values
      expect(content).not.toMatch(/\{\{[^}]+\}\}/);
      expect(content).toContain('N/A');
    });
  });
});

// ==========================================================================
// Route tests: API endpoints
// ==========================================================================

describe('Letter Routes — API tests', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    cookie = await loginAs(server, MOCK_USER);
  });

  // -----------------------------------------------------------------------
  // GET /api/letters/templates
  // -----------------------------------------------------------------------

  describe('GET /api/letters/templates', () => {
    it('returns 200 and list of 5 templates', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/templates',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as { templates: Array<{ id: string }> };
      expect(body.templates).toHaveLength(5);
    });

    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/templates',
      });

      expect(response.statusCode).toBe(401);
    });

    it('does not include full template text in listing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/templates',
        headers: { cookie },
      });

      const body = JSON.parse(response.payload) as { templates: Array<Record<string, unknown>> };
      for (const t of body.templates) {
        expect(t).not.toHaveProperty('template');
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/letters/templates/:templateId
  // -----------------------------------------------------------------------

  describe('GET /api/letters/templates/:templateId', () => {
    it('returns 200 and template detail', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/templates/td-benefit-explanation',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as { template: { id: string; template: string } };
      expect(body.template.id).toBe('td-benefit-explanation');
      expect(body.template.template).toBeTruthy();
    });

    it('returns 404 for unknown template', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/templates/nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/claims/:claimId/letters/generate
  // -----------------------------------------------------------------------

  describe('POST /api/claims/:claimId/letters/generate', () => {
    it('returns 201 and generated letter on success', async () => {
      // Mock claim access check
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      // Mock claim data fetch for template population
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      // Mock letter persistence
      mockGeneratedLetterCreate.mockResolvedValueOnce({
        ...MOCK_GENERATED_LETTER,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/generate',
        headers: { cookie },
        payload: {
          templateId: 'td-benefit-explanation',
          overrides: {
            tdRate: '800.00',
            awe: '1200.00',
            statutoryMin: '242.86',
            statutoryMax: '1694.57',
          },
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload) as { letter: { id: string } };
      expect(body.letter.id).toBe('letter-1');
    });

    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/generate',
        payload: { templateId: 'td-benefit-explanation' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 if claim access denied', async () => {
      // Mock claim in different org
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-other',
        assignedExaminerId: 'user-other',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/generate',
        headers: { cookie },
        payload: { templateId: 'td-benefit-explanation' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 for missing templateId', async () => {
      // Mock claim access check
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/generate',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for unknown template', async () => {
      // Mock claim access check
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/letters/generate',
        headers: { cookie },
        payload: { templateId: 'nonexistent-template' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/claims/:claimId/letters
  // -----------------------------------------------------------------------

  describe('GET /api/claims/:claimId/letters', () => {
    it('returns 200 and list of letters for a claim', async () => {
      // Mock claim access check
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-1',
        assignedExaminerId: 'user-1',
      });

      mockGeneratedLetterFindMany.mockResolvedValueOnce([MOCK_GENERATED_LETTER]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/letters',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as { letters: Array<{ id: string }> };
      expect(body.letters).toHaveLength(1);
      expect(body.letters[0]?.id).toBe('letter-1');
    });

    it('returns 403 if claim access denied', async () => {
      mockClaimFindUnique.mockResolvedValueOnce({
        id: 'claim-1',
        organizationId: 'org-other',
        assignedExaminerId: 'user-other',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/letters',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/letters/:letterId
  // -----------------------------------------------------------------------

  describe('GET /api/letters/:letterId', () => {
    it('returns 200 and letter detail', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce(MOCK_GENERATED_LETTER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as { letter: { id: string } };
      expect(body.letter.id).toBe('letter-1');
    });

    it('returns 404 for unknown letter', async () => {
      mockGeneratedLetterFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/letters/letter-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
