import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * MTUS guideline matching tests.
 *
 * Verifies:
 * - Matching by body part returns relevant guidelines
 * - Matching by CPT code narrows results
 * - Disclaimer is always present
 * - GREEN zone framing (no treatment recommendations in output)
 * - Stub data has correct structure
 * - Unknown body part returns empty results gracefully
 * - Guideline detail retrieval works
 * - All matches include sourceSection reference
 * - isStubData flag is set correctly
 *
 * UPL zone: GREEN — factual guideline matching only.
 */

// ---------------------------------------------------------------------------
// Import service functions (pure — no Prisma dependency)
// ---------------------------------------------------------------------------

import {
  matchMtusGuidelines,
  getGuidelineDetail,
  MTUS_DISCLAIMER,
  type MtusMatchRequest,
  type MtusMatchResult,
  type MtusGuidelineMatch,
} from '../../server/services/mtus-matcher.service.js';

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

// ---------------------------------------------------------------------------
// Mock Prisma (required by server routes that import db.js)
// ---------------------------------------------------------------------------

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
      findUnique: vi.fn().mockResolvedValue(null),
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
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

type ServerInstance = Awaited<ReturnType<typeof buildServer>>;

async function loginAs(
  server: ServerInstance,
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
// Server lifecycle
// ---------------------------------------------------------------------------

let server: ServerInstance;

beforeAll(async () => {
  server = await buildServer();
  mockUserFindUnique.mockResolvedValue(MOCK_USER);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue(MOCK_USER);
});

// ==========================================================================
// 1. Pure service function tests
// ==========================================================================

describe('MTUS Matcher Service — matchMtusGuidelines', () => {
  it('matches lumbar spine and returns relevant guidelines', () => {
    const request: MtusMatchRequest = {
      bodyPart: 'lumbar spine',
      treatmentDescription: 'Physical therapy for acute low back pain',
    };

    const result = matchMtusGuidelines(request);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.totalMatches).toBe(result.matches.length);
    expect(result.matches[0]?.title).toContain('Low Back');
  });

  it('matches cervical spine guidelines', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'cervical spine',
      treatmentDescription: 'Cervical collar and physical therapy',
    });

    expect(result.matches.length).toBeGreaterThan(0);
    // Neck/cervical category — title or sourceSection should reflect Neck and Upper Back
    expect(result.matches[0]?.sourceSection).toContain('Neck');
  });

  it('matches shoulder guidelines', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'shoulder',
      treatmentDescription: 'Rotator cuff repair surgery',
    });

    expect(result.matches.length).toBeGreaterThan(0);
    // The shoulder category includes a rotator-cuff guideline; verify text mentions rotator cuff
    const allText = result.matches.map((m) => m.guidelineText.toLowerCase()).join(' ');
    expect(allText).toContain('rotator cuff');
  });

  it('matches knee guidelines', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'knee',
      treatmentDescription: 'Arthroscopic meniscectomy',
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.title).toContain('Knee');
  });

  it('matches wrist guidelines for carpal tunnel', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'wrist',
      treatmentDescription: 'Carpal tunnel release',
    });

    expect(result.matches.length).toBeGreaterThan(0);
    const allText = result.matches.map((m) => m.guidelineText.toLowerCase()).join(' ');
    expect(allText).toContain('carpal tunnel');
  });

  it('narrows results when CPT code is provided', () => {
    // CPT 64721 = carpal tunnel release -> wrist
    const result = matchMtusGuidelines({
      bodyPart: 'hand',
      treatmentDescription: 'Carpal tunnel release surgery',
      cptCode: '64721',
    });

    // "hand" alone won't match, but CPT 64721 maps to wrist
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.guidelineText).toContain('carpal tunnel');
  });

  it('always includes the MTUS disclaimer', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'lumbar spine',
      treatmentDescription: 'Any treatment',
    });

    expect(result.disclaimer).toBe(MTUS_DISCLAIMER);
    expect(result.disclaimer).toContain('LC 4610');
    expect(result.disclaimer).toContain('UR physician');
    expect(result.disclaimer).toContain('does not make treatment recommendations');
  });

  it('includes disclaimer even when no matches found', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'nonexistent body part',
      treatmentDescription: 'Unknown treatment',
    });

    expect(result.disclaimer).toBe(MTUS_DISCLAIMER);
  });

  it('returns empty results gracefully for unknown body part', () => {
    // Use a string that does not contain any registered body-part alias
    // (no back, neck, shoulder, elbow, hand, wrist, knee, ankle, foot, pain, etc.)
    const result = matchMtusGuidelines({
      bodyPart: 'septum nasi',
      treatmentDescription: 'Experimental procedure',
    });

    expect(result.matches).toEqual([]);
    expect(result.totalMatches).toBe(0);
    expect(result.sourceType).toBe('mtus');
  });

  it('sets isStubData flag to true in stub mode', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'lumbar spine',
      treatmentDescription: 'Physical therapy',
    });

    expect(result.isStubData).toBe(true);
  });

  it('sets sourceType to mtus on all results', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'shoulder',
      treatmentDescription: 'Injection',
    });

    expect(result.sourceType).toBe('mtus');
  });

  it('preserves the original query in the result', () => {
    const request: MtusMatchRequest = {
      bodyPart: 'knee',
      diagnosis: 'Meniscal tear',
      treatmentDescription: 'Arthroscopic surgery',
      cptCode: '29881',
    };

    const result = matchMtusGuidelines(request);

    expect(result.query).toEqual(request);
  });

  it('all matches include sourceSection reference (CCR citation)', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'lumbar spine',
      treatmentDescription: 'Physical therapy',
    });

    for (const match of result.matches) {
      expect(match.sourceSection).toBeTruthy();
      expect(match.sourceSection.length).toBeGreaterThan(0);
      // Real DWC MTUS sections live at 8 CCR 9792.20–9792.27
      expect(match.sourceSection).toMatch(/8 CCR 9792\.\d+/);
    }
  });

  it('all matches have relevance scores between 0 and 1', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'cervical spine',
      treatmentDescription: 'Cervical fusion',
    });

    for (const match of result.matches) {
      expect(match.relevance).toBeGreaterThanOrEqual(0);
      expect(match.relevance).toBeLessThanOrEqual(1);
    }
  });

  it('all matches have non-empty guidelineId and title', () => {
    const result = matchMtusGuidelines({
      bodyPart: 'wrist',
      treatmentDescription: 'Splinting',
    });

    for (const match of result.matches) {
      expect(match.guidelineId).toBeTruthy();
      expect(match.title).toBeTruthy();
      expect(match.guidelineText).toBeTruthy();
    }
  });

  // GREEN zone framing: no treatment recommendations
  it('guideline text does not contain treatment recommendations (GREEN zone)', () => {
    const bodyParts = ['lumbar spine', 'cervical spine', 'shoulder', 'knee', 'wrist'];

    for (const bodyPart of bodyParts) {
      const result = matchMtusGuidelines({
        bodyPart,
        treatmentDescription: 'General treatment',
      });

      for (const match of result.matches) {
        // Should reference guidelines and criteria, not make recommendations
        // like "you should" or "we recommend" (first/second person directives)
        expect(match.guidelineText).not.toMatch(/\byou should\b/i);
        expect(match.guidelineText).not.toMatch(/\bwe recommend\b/i);
        expect(match.guidelineText).not.toMatch(/\bI advise\b/i);
        // Body-part guidelines should cite ACOEM (per MTUS adoption); the test
        // restricts to body-part categories above so this assertion holds.
        expect(match.guidelineText).toContain('ACOEM');
      }
    }
  });
});

// ==========================================================================
// 2. Guideline detail retrieval
// ==========================================================================

describe('MTUS Matcher Service — getGuidelineDetail', () => {
  it('returns a guideline by valid ID', () => {
    const guideline = getGuidelineDetail('mtus-lowback-001');

    expect(guideline).not.toBeNull();
    const g = guideline as NonNullable<typeof guideline>;
    expect(g.guidelineId).toBe('mtus-lowback-001');
    expect(g.title).toContain('Low Back');
    expect(g.sourceSection).toContain('9792.23.5');
  });

  it('returns null for non-existent guideline ID', () => {
    const guideline = getGuidelineDetail('mtus-nonexistent-999');

    expect(guideline).toBeNull();
  });

  it('returned guideline has all required fields', () => {
    const guideline = getGuidelineDetail('mtus-shoulder-001');

    expect(guideline).not.toBeNull();
    const g = guideline as NonNullable<typeof guideline>;
    expect(g.guidelineId).toBeTruthy();
    expect(g.title).toBeTruthy();
    expect(g.guidelineText).toBeTruthy();
    expect(g.sourceSection).toBeTruthy();
    expect(typeof g.relevance).toBe('number');
  });

  it('retrieves guidelines from all body part categories', () => {
    const ids = [
      'mtus-lowback-001',
      'mtus-neck-001',
      'mtus-shoulder-001',
      'mtus-elbow-001',
      'mtus-handwrist-001',
      'mtus-knee-001',
      'mtus-anklefoot-001',
    ];

    for (const id of ids) {
      const guideline = getGuidelineDetail(id);
      expect(guideline).not.toBeNull();
      expect((guideline as NonNullable<typeof guideline>).guidelineId).toBe(id);
    }
  });

  it('retrieves guidelines from all cross-cutting topic categories', () => {
    const ids = [
      'mtus-chronicpain-001',
      'mtus-opioids-001',
      'mtus-acupuncture-001',
      'mtus-formulary-001',
      'mtus-methodology-001',
    ];

    for (const id of ids) {
      const guideline = getGuidelineDetail(id);
      expect(guideline).not.toBeNull();
      expect((guideline as NonNullable<typeof guideline>).guidelineId).toBe(id);
    }
  });
});

// ==========================================================================
// 3. Route integration tests
// ==========================================================================

describe('MTUS Routes — POST /api/mtus/match', () => {
  it('returns 401 without authentication', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      payload: {
        bodyPart: 'lumbar spine',
        treatmentDescription: 'Physical therapy',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns matched guidelines for authenticated user', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        bodyPart: 'lumbar spine',
        treatmentDescription: 'Physical therapy for low back pain',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as MtusMatchResult;
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.disclaimer).toBe(MTUS_DISCLAIMER);
    expect(body.sourceType).toBe('mtus');
    expect(body.isStubData).toBe(true);
  });

  it('returns 400 for missing bodyPart', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        treatmentDescription: 'Physical therapy',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for missing treatmentDescription', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        bodyPart: 'lumbar spine',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid CPT code format', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        bodyPart: 'lumbar spine',
        treatmentDescription: 'PT',
        cptCode: 'ABC',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts valid CPT code', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        bodyPart: 'wrist',
        treatmentDescription: 'Carpal tunnel release',
        cptCode: '64721',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as MtusMatchResult;
    expect(body.matches.length).toBeGreaterThan(0);
  });

  it('returns empty matches gracefully for unknown body part', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/mtus/match',
      headers: { cookie },
      payload: {
        bodyPart: 'pinky toe',
        treatmentDescription: 'Some treatment',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as MtusMatchResult;
    expect(body.matches).toEqual([]);
    expect(body.totalMatches).toBe(0);
    expect(body.disclaimer).toBe(MTUS_DISCLAIMER);
  });
});

describe('MTUS Routes — GET /api/mtus/guidelines/:guidelineId', () => {
  it('returns 401 without authentication', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/mtus/guidelines/mtus-lowback-001',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns guideline detail for valid ID', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'GET',
      url: '/api/mtus/guidelines/mtus-lowback-001',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { guideline: MtusGuidelineMatch };
    expect(body.guideline.guidelineId).toBe('mtus-lowback-001');
    expect(body.guideline.sourceSection).toMatch(/8 CCR 9792\.\d+/);
  });

  it('returns 404 for non-existent guideline', async () => {
    const cookie = await loginAs(server, MOCK_USER);
    const res = await server.inject({
      method: 'GET',
      url: '/api/mtus/guidelines/mtus-nonexistent-999',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
  });
});
