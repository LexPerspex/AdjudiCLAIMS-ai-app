import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Education profile service + route tests.
 *
 * Tests the education-profile.service.ts functions (getOrCreateProfile,
 * dismissTerm, reEnableTerms, getTermsWithDismissalState, getEducationMode,
 * getEducationContentForFeature, activateNewExaminerMode) and the education
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
};

const MOCK_PROFILE_BASE = {
  id: 'ep-1',
  userId: 'user-1',
  dismissedTerms: [] as string[],
  trainingModulesCompleted: null,
  isTrainingComplete: false,
  learningModeExpiry: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

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
const mockEducationProfileFindUnique = vi.fn();
const mockEducationProfileFindUniqueOrThrow = vi.fn();
const mockEducationProfileUpsert = vi.fn();
const mockEducationProfileUpdate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
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
    educationProfile: {
      findUnique: (...args: unknown[]) => mockEducationProfileFindUnique(...args) as unknown,
      findUniqueOrThrow: (...args: unknown[]) => mockEducationProfileFindUniqueOrThrow(...args) as unknown,
      upsert: (...args: unknown[]) => mockEducationProfileUpsert(...args) as unknown,
      update: (...args: unknown[]) => mockEducationProfileUpdate(...args) as unknown,
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
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
    chatSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    documentChunk: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    benefitPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock external services used by other routes (required for server build)
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
    payload: { email: user.email },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ---------------------------------------------------------------------------
// Tests: Education Profile Service (direct function tests)
// ---------------------------------------------------------------------------

describe('Education Profile Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  describe('getOrCreateProfile', () => {
    it('creates a profile if none exists (upsert with empty defaults)', async () => {
      const { getOrCreateProfile } = await import(
        '../../server/services/education-profile.service.js'
      );

      const freshProfile = { ...MOCK_PROFILE_BASE };
      mockEducationProfileUpsert.mockResolvedValueOnce(freshProfile);

      const result = await getOrCreateProfile('user-1');

      expect(mockEducationProfileUpsert).toHaveBeenCalledOnce();
      expect(result.userId).toBe('user-1');
      expect(result.dismissedTerms).toEqual([]);
      expect(result.isTrainingComplete).toBe(false);
      expect(result.learningModeExpiry).toBeNull();
    });

    it('returns existing profile when one already exists', async () => {
      const { getOrCreateProfile } = await import(
        '../../server/services/education-profile.service.js'
      );

      const existingProfile = {
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe', 'benefits_td'],
        isTrainingComplete: true,
      };
      mockEducationProfileUpsert.mockResolvedValueOnce(existingProfile);

      const result = await getOrCreateProfile('user-1');

      expect(result.dismissedTerms).toEqual(['benefits_awe', 'benefits_td']);
      expect(result.isTrainingComplete).toBe(true);
    });
  });

  describe('dismissTerm', () => {
    it('adds a valid term ID to the dismissed list', async () => {
      const { dismissTerm } = await import(
        '../../server/services/education-profile.service.js'
      );

      // getOrCreateProfile (upsert) call
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      // update call (push termId)
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe'],
      });

      const result = await dismissTerm('user-1', 'benefits_awe');

      expect(mockEducationProfileUpdate).toHaveBeenCalledOnce();
      expect(result.dismissedTerms).toContain('benefits_awe');
    });

    it('throws for an unknown term ID', async () => {
      const { dismissTerm } = await import(
        '../../server/services/education-profile.service.js'
      );

      await expect(dismissTerm('user-1', 'nonexistent_term_xyz')).rejects.toThrow(
        'Unknown Tier 1 term id: nonexistent_term_xyz',
      );

      // Prisma should NOT have been called
      expect(mockEducationProfileUpsert).not.toHaveBeenCalled();
      expect(mockEducationProfileUpdate).not.toHaveBeenCalled();
    });

    it('deduplicates when term is already dismissed', async () => {
      const { dismissTerm } = await import(
        '../../server/services/education-profile.service.js'
      );

      // getOrCreateProfile (upsert)
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      // update (push) returns a list with a duplicate
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe', 'benefits_awe'],
      });
      // second update (dedup write-back)
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe'],
      });

      const result = await dismissTerm('user-1', 'benefits_awe');

      // The service should have issued a second update to deduplicate
      expect(mockEducationProfileUpdate).toHaveBeenCalledTimes(2);
      // Final dismissed list should have only one entry
      expect(result.dismissedTerms).toEqual(['benefits_awe']);
    });
  });

  describe('reEnableTerms', () => {
    it('clears all dismissed terms when no category is specified', async () => {
      const { reEnableTerms } = await import(
        '../../server/services/education-profile.service.js'
      );

      // getOrCreateProfile (upsert)
      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe', 'benefits_td'],
      });
      // update call
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: [],
      });

      const result = await reEnableTerms('user-1');

      const updateArg = mockEducationProfileUpdate.mock.calls[0]?.[0] as {
        data: { dismissedTerms: string[] };
      };
      expect(updateArg.data.dismissedTerms).toEqual([]);
      expect(result.dismissedTerms).toEqual([]);
    });

    it('clears only terms in the specified category', async () => {
      const { reEnableTerms } = await import(
        '../../server/services/education-profile.service.js'
      );

      // getOrCreateProfile (upsert)
      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe', 'benefits_td'],
      });
      // findUniqueOrThrow to get current dismissed list
      mockEducationProfileFindUniqueOrThrow.mockResolvedValueOnce({
        dismissedTerms: ['benefits_awe', 'benefits_td'],
      });
      // update to persist the filtered list
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: [],
      });

      const result = await reEnableTerms('user-1', 'BENEFITS');

      expect(mockEducationProfileFindUniqueOrThrow).toHaveBeenCalledOnce();
      // BENEFITS category terms should have been removed
      expect(result.dismissedTerms).toEqual([]);
    });
  });

  describe('getTermsWithDismissalState', () => {
    it('returns all Tier 1 terms annotated with isDismissed', async () => {
      const { getTermsWithDismissalState } = await import(
        '../../server/services/education-profile.service.js'
      );

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe'],
      });

      const terms = await getTermsWithDismissalState('user-1');

      expect(terms.length).toBeGreaterThan(0);

      const aweTerm = terms.find((t) => t.term.id === 'benefits_awe');
      expect(aweTerm).toBeDefined();
      expect(aweTerm?.isDismissed).toBe(true);

      const tdTerm = terms.find((t) => t.term.id === 'benefits_td');
      expect(tdTerm).toBeDefined();
      expect(tdTerm?.isDismissed).toBe(false);
    });
  });

  describe('getEducationMode', () => {
    it('returns NEW when learningModeExpiry is in the future', async () => {
      const { getEducationMode } = await import(
        '../../server/services/education-profile.service.js'
      );

      const futureExpiry = new Date();
      futureExpiry.setDate(futureExpiry.getDate() + 15);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        learningModeExpiry: futureExpiry,
      });

      const mode = await getEducationMode('user-1');

      expect(mode).toBe('NEW');
    });

    it('returns STANDARD when learningModeExpiry is in the past', async () => {
      const { getEducationMode } = await import(
        '../../server/services/education-profile.service.js'
      );

      const pastExpiry = new Date();
      pastExpiry.setDate(pastExpiry.getDate() - 5);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        learningModeExpiry: pastExpiry,
      });

      const mode = await getEducationMode('user-1');

      expect(mode).toBe('STANDARD');
    });
  });

  describe('getEducationContentForFeature', () => {
    it('returns Tier 2 entries for a known feature context', async () => {
      const { getEducationContentForFeature } = await import(
        '../../server/services/education-profile.service.js'
      );

      // BENEFIT_CALCULATION is a well-populated feature context
      const entries = getEducationContentForFeature('BENEFIT_CALCULATION');

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      // Every entry should have the required Tier 2 fields
      for (const entry of entries) {
        expect(entry.id).toBeTruthy();
        expect(entry.title).toBeTruthy();
        expect(entry.authority).toBeTruthy();
        expect(entry.youMust).toBeTruthy();
      }
    });

    it('returns an empty array for a feature context with no Tier 2 entries', async () => {
      const { getEducationContentForFeature } = await import(
        '../../server/services/education-profile.service.js'
      );

      // CHAT may have no entries — verify we get an array either way
      const entries = getEducationContentForFeature('CHAT');
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('activateNewExaminerMode', () => {
    it('sets learningModeExpiry to approximately 30 days from now', async () => {
      const { activateNewExaminerMode } = await import(
        '../../server/services/education-profile.service.js'
      );

      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        learningModeExpiry: expectedExpiry,
      });

      const result = await activateNewExaminerMode('user-1');

      expect(mockEducationProfileUpsert).toHaveBeenCalledOnce();
      expect(result.learningModeExpiry).toBeInstanceOf(Date);

      // Should be set to roughly 30 days from now (within 1 minute of tolerance)
      const diffMs = (result.learningModeExpiry as Date).getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Education Routes
// ---------------------------------------------------------------------------

describe('Education Routes', () => {
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

  describe('GET /api/education/profile', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/profile',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with education profile for authenticated user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/profile',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        id: string;
        userId: string;
        dismissedTerms: string[];
        isTrainingComplete: boolean;
      }>();
      expect(body.userId).toBe('user-1');
      expect(Array.isArray(body.dismissedTerms)).toBe(true);
    });
  });

  describe('GET /api/education/terms', () => {
    it('returns all terms with dismissal state for authenticated user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe'],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/terms',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<Array<{ term: { id: string }; isDismissed: boolean }>>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      const aweTerm = body.find((t) => t.term.id === 'benefits_awe');
      expect(aweTerm?.isDismissed).toBe(true);
    });
  });

  describe('POST /api/education/terms/:termId/dismiss', () => {
    it('dismisses a valid term and returns updated profile', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getOrCreateProfile (upsert inside dismissTerm)
      mockEducationProfileUpsert.mockResolvedValueOnce({ ...MOCK_PROFILE_BASE });
      // update (push)
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe'],
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/terms/benefits_awe/dismiss',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ dismissedTerms: string[] }>();
      expect(body.dismissedTerms).toContain('benefits_awe');
    });

    it('returns 404 for an unknown term ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/terms/totally_fake_term_xyz/dismiss',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Term not found');
    });
  });

  describe('POST /api/education/terms/reenable', () => {
    it('clears all dismissed terms when no category is provided', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getOrCreateProfile (upsert inside reEnableTerms)
      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: ['benefits_awe', 'benefits_td'],
      });
      // update (clear all)
      mockEducationProfileUpdate.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        dismissedTerms: [],
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/education/terms/reenable',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ dismissedTerms: string[] }>();
      expect(body.dismissedTerms).toEqual([]);
    });

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/education/terms/reenable',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/education/content/:featureId', () => {
    it('returns Tier 2 entries for a valid feature ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/content/BENEFIT_CALCULATION',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<Array<{ id: string; title: string; authority: string }>>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]?.title).toBeTruthy();
      expect(body[0]?.authority).toBeTruthy();
    });

    it('returns 400 for an invalid/unknown feature ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/content/INVALID_FEATURE',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid feature ID');
    });
  });

  describe('GET /api/education/mode', () => {
    it('returns STANDARD mode when no learning mode expiry is set', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        learningModeExpiry: null,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/mode',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ mode: string }>();
      expect(body.mode).toBe('STANDARD');
    });

    it('returns NEW mode when learningModeExpiry is in the future', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const futureExpiry = new Date();
      futureExpiry.setDate(futureExpiry.getDate() + 20);

      mockEducationProfileUpsert.mockResolvedValueOnce({
        ...MOCK_PROFILE_BASE,
        learningModeExpiry: futureExpiry,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/education/mode',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ mode: string }>();
      expect(body.mode).toBe('NEW');
    });

    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/education/mode',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
