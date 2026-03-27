import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Training module service + route tests.
 *
 * Tests the training-module.service.ts functions (getModule, getAllModules,
 * getTrainingStatus, submitAssessment, checkTrainingGate) and the training
 * route endpoints with mocked Prisma. Also tests the requireTrainingComplete
 * middleware.
 *
 * Regulatory authority: 10 CCR 2695.6 — every insurer shall adopt and
 * communicate minimum training standards to all claims agents and adjusters.
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
  isTrainingComplete: true,
};

const MOCK_UNTRAINED_USER = {
  id: 'user-2',
  email: 'newexaminer@acme-ins.test',
  name: 'New Examiner',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
  isTrainingComplete: false,
};

// Module 1 (module_1): 15 questions, passing = 80% (12/15)
// All correct answers for module_1
const MOD1_ALL_CORRECT = [
  { questionId: 'mod1_q01', selectedOptionId: 'b' },
  { questionId: 'mod1_q02', selectedOptionId: 'c' },
  { questionId: 'mod1_q03', selectedOptionId: 'c' },
  { questionId: 'mod1_q04', selectedOptionId: 'b' },
  { questionId: 'mod1_q05', selectedOptionId: 'b' },
  { questionId: 'mod1_q06', selectedOptionId: 'c' },
  { questionId: 'mod1_q07', selectedOptionId: 'a' },
  { questionId: 'mod1_q08', selectedOptionId: 'b' },
  { questionId: 'mod1_q09', selectedOptionId: 'b' },
  { questionId: 'mod1_q10', selectedOptionId: 'c' },
  { questionId: 'mod1_q11', selectedOptionId: 'b' },
  { questionId: 'mod1_q12', selectedOptionId: 'b' },
  { questionId: 'mod1_q13', selectedOptionId: 'b' },
  { questionId: 'mod1_q14', selectedOptionId: 'b' },
  { questionId: 'mod1_q15', selectedOptionId: 'b' },
];

// Module 1 — failing answers: all wrong (below 80%)
const MOD1_ALL_WRONG = MOD1_ALL_CORRECT.map((a) => ({
  ...a,
  selectedOptionId: 'z', // no option 'z' exists → all wrong
}));

// Module 2 (module_2): 10 questions, passing = 80% (8/10)
const MOD2_ALL_CORRECT = [
  { questionId: 'mod2_q01', selectedOptionId: 'b' },
  { questionId: 'mod2_q02', selectedOptionId: 'a' },
  { questionId: 'mod2_q03', selectedOptionId: 'b' },
  { questionId: 'mod2_q04', selectedOptionId: 'c' },
  { questionId: 'mod2_q05', selectedOptionId: 'c' },
  { questionId: 'mod2_q06', selectedOptionId: 'b' },
  { questionId: 'mod2_q07', selectedOptionId: 'b' },
  { questionId: 'mod2_q08', selectedOptionId: 'b' },
  { questionId: 'mod2_q09', selectedOptionId: 'a' },
  { questionId: 'mod2_q10', selectedOptionId: 'a' },
];

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
      findUnique: (...args: unknown[]) => mockEducationProfileFindUnique(...args) as unknown,
      upsert: (...args: unknown[]) => mockEducationProfileUpsert(...args) as unknown,
      update: (...args: unknown[]) => mockEducationProfileUpdate(...args) as unknown,
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

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
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
    isActive: boolean;
    isTrainingComplete?: boolean;
  },
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  // getTrainingStatus is called during login to hydrate session
  mockEducationProfileFindUnique.mockResolvedValueOnce({
    isTrainingComplete: user.isTrainingComplete ?? true,
    trainingModulesCompleted: {},
  });

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
// Tests: Training Module Service (direct function calls)
// ---------------------------------------------------------------------------

describe('Training Module Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getModule', () => {
    it('returns a module with questions stripped of correctOptionId', async () => {
      const { getModule } = await import(
        '../../server/services/training-module.service.js'
      );

      const mod = getModule('module_1');

      expect(mod).not.toBeNull();
      const m = mod as NonNullable<typeof mod>;
      expect(m.id).toBe('module_1');
      expect(m.questions.length).toBeGreaterThan(0);

      for (const q of m.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
      }
    });

    it('returns null for an unknown module ID', async () => {
      const { getModule } = await import(
        '../../server/services/training-module.service.js'
      );

      const result = getModule('module_999_does_not_exist');

      expect(result).toBeNull();
    });
  });

  describe('getAllModules', () => {
    it('returns all 4 training modules', async () => {
      const { getAllModules } = await import(
        '../../server/services/training-module.service.js'
      );

      const modules = getAllModules();

      expect(modules).toHaveLength(4);
      const ids = modules.map((m) => m.id);
      expect(ids).toContain('module_1');
      expect(ids).toContain('module_2');
      expect(ids).toContain('module_3');
      expect(ids).toContain('module_4');
    });

    it('strips correctOptionId from all questions in all modules', async () => {
      const { getAllModules } = await import(
        '../../server/services/training-module.service.js'
      );

      const modules = getAllModules();

      for (const mod of modules) {
        for (const q of mod.questions) {
          expect(q).not.toHaveProperty('correctOptionId');
        }
      }
    });
  });

  describe('getTrainingStatus', () => {
    it('returns all modules incomplete for a new user with no profile', async () => {
      const { getTrainingStatus } = await import(
        '../../server/services/training-module.service.js'
      );

      mockEducationProfileFindUnique.mockResolvedValueOnce(null);

      const status = await getTrainingStatus('user-new');

      expect(status.isComplete).toBe(false);
      expect(status.modules).toHaveLength(4);
      for (const mod of status.modules) {
        expect(mod.isComplete).toBe(false);
        expect(mod.score).toBeNull();
        expect(mod.completedAt).toBeNull();
      }
    });

    it('returns correct completion state when module_1 has been passed', async () => {
      const { getTrainingStatus } = await import(
        '../../server/services/training-module.service.js'
      );

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: false,
        trainingModulesCompleted: {
          module_1: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
        },
      });

      const status = await getTrainingStatus('user-1');

      expect(status.isComplete).toBe(false);
      const mod1 = status.modules.find((m) => m.moduleId === 'module_1');
      expect(mod1?.isComplete).toBe(true);
      expect(mod1?.score).toBe(1.0);

      // Remaining modules should be incomplete
      const incompleteModules = status.modules.filter((m) => m.moduleId !== 'module_1');
      for (const mod of incompleteModules) {
        expect(mod.isComplete).toBe(false);
      }
    });
  });

  describe('submitAssessment', () => {
    it('grades correctly — passing score (all correct answers, module_1)', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      // Profile read for merge + upsert on pass
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        trainingModulesCompleted: {},
      });
      mockEducationProfileUpsert.mockResolvedValueOnce({});

      const result = await submitAssessment('user-1', 'module_1', MOD1_ALL_CORRECT);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.totalQuestions).toBe(15);
      expect(result.correctCount).toBe(15);
      expect(result.results).toHaveLength(15);
      expect(result.results.every((r) => r.correct)).toBe(true);
    });

    it('grades correctly — failing score (all wrong answers, module_1)', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      const result = await submitAssessment('user-1', 'module_1', MOD1_ALL_WRONG);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.correctCount).toBe(0);
      expect(result.results.every((r) => !r.correct)).toBe(true);
    });

    it('throws for an unknown module ID', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      await expect(
        submitAssessment('user-1', 'module_999', [{ questionId: 'q1', selectedOptionId: 'a' }]),
      ).rejects.toThrow('Training module not found: module_999');
    });

    it('throws when not all questions are answered (incomplete submission)', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      // Provide only 1 answer for module_1 which has 15 questions
      const partialAnswers = [{ questionId: 'mod1_q01', selectedOptionId: 'b' }];

      await expect(
        submitAssessment('user-1', 'module_1', partialAnswers),
      ).rejects.toThrow('Assessment incomplete');
    });

    it('calls educationProfile.upsert to persist on a passing submission', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        trainingModulesCompleted: {},
      });
      mockEducationProfileUpsert.mockResolvedValueOnce({});

      await submitAssessment('user-1', 'module_1', MOD1_ALL_CORRECT);

      expect(mockEducationProfileUpsert).toHaveBeenCalledOnce();
      const call = (mockEducationProfileUpsert.mock.calls[0] as unknown[])[0] as {
        where: { userId: string };
        create: { isTrainingComplete: boolean };
        update: { isTrainingComplete: boolean };
      };
      expect(call.where.userId).toBe('user-1');
    });

    it('does NOT call educationProfile.upsert on a failing submission', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      await submitAssessment('user-1', 'module_1', MOD1_ALL_WRONG);

      expect(mockEducationProfileUpsert).not.toHaveBeenCalled();
    });

    it('sets isTrainingComplete=true on upsert when all 4 modules have been passed', async () => {
      const { submitAssessment } = await import(
        '../../server/services/training-module.service.js'
      );

      // Simulate modules 2, 3, 4 already completed — submitting module 1 to finish
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        trainingModulesCompleted: {
          module_2: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
          module_3: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
          module_4: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
        },
      });
      mockEducationProfileUpsert.mockResolvedValueOnce({});

      const result = await submitAssessment('user-1', 'module_1', MOD1_ALL_CORRECT);

      expect(result.passed).toBe(true);
      expect(mockEducationProfileUpsert).toHaveBeenCalledOnce();

      const call = (mockEducationProfileUpsert.mock.calls[0] as unknown[])[0] as {
        create: { isTrainingComplete: boolean };
        update: { isTrainingComplete: boolean };
      };
      expect(call.create.isTrainingComplete).toBe(true);
      expect(call.update.isTrainingComplete).toBe(true);
    });
  });

  describe('checkTrainingGate', () => {
    it('returns false for a user with no education profile (new user)', async () => {
      const { checkTrainingGate } = await import(
        '../../server/services/training-module.service.js'
      );

      mockEducationProfileFindUnique.mockResolvedValueOnce(null);

      const result = await checkTrainingGate('user-new');

      expect(result).toBe(false);
    });

    it('returns true for a user with isTrainingComplete=true', async () => {
      const { checkTrainingGate } = await import(
        '../../server/services/training-module.service.js'
      );

      mockEducationProfileFindUnique.mockResolvedValueOnce({ isTrainingComplete: true });

      const result = await checkTrainingGate('user-1');

      expect(result).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Training Routes
// ---------------------------------------------------------------------------

describe('Training Routes', () => {
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

  describe('GET /api/training/status', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/training/status',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with training status for authenticated user', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: true,
        trainingModulesCompleted: {
          module_1: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
          module_2: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
          module_3: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
          module_4: { completedAt: '2026-03-01T10:00:00.000Z', score: 1.0, passed: true },
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/training/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ isComplete: boolean; modules: unknown[] }>();
      expect(body.isComplete).toBe(true);
      expect(body.modules).toHaveLength(4);
    });
  });

  describe('GET /api/training/modules', () => {
    it('returns all 4 training modules with completion state', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: false,
        trainingModulesCompleted: {},
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/training/modules',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ modules: { id: string; isComplete: boolean }[] }>();
      expect(body.modules).toHaveLength(4);
      for (const mod of body.modules) {
        expect(mod).toHaveProperty('id');
        expect(mod).toHaveProperty('isComplete');
        expect(mod).not.toHaveProperty('correctOptionId');
      }
    });
  });

  describe('GET /api/training/modules/:moduleId', () => {
    it('returns module content with questions (no correctOptionId)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/training/modules/module_1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        id: string;
        questions: { id: string; correctOptionId?: unknown }[];
      }>();
      expect(body.id).toBe('module_1');
      expect(body.questions.length).toBeGreaterThan(0);
      for (const q of body.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
      }
    });

    it('returns 404 for an unknown module ID', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'GET',
        url: '/api/training/modules/module_999_unknown',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Training module not found');
    });
  });

  describe('POST /api/training/modules/:moduleId/submit', () => {
    it('returns 400 for invalid body (missing answers field)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/modules/module_1/submit',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns graded result with passed=true for all-correct answers (module_2)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getTrainingStatus before submission (statusBefore check in route)
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: false,
        trainingModulesCompleted: {},
      });
      // Profile read inside submitAssessment for merge
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        trainingModulesCompleted: {},
      });
      mockEducationProfileUpsert.mockResolvedValueOnce({});
      // getTrainingStatus after submission (statusAfter check in route)
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: false,
        trainingModulesCompleted: {
          module_2: { completedAt: new Date().toISOString(), score: 1.0, passed: true },
        },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/modules/module_2/submit',
        headers: { cookie },
        payload: { answers: MOD2_ALL_CORRECT },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        passed: boolean;
        score: number;
        correctCount: number;
        totalQuestions: number;
      }>();
      expect(body.passed).toBe(true);
      expect(body.score).toBe(1.0);
      expect(body.correctCount).toBe(10);
      expect(body.totalQuestions).toBe(10);
    });

    it('returns graded result with passed=false for all-wrong answers (module_2)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      // getTrainingStatus before submission
      mockEducationProfileFindUnique.mockResolvedValueOnce({
        isTrainingComplete: false,
        trainingModulesCompleted: {},
      });

      const allWrongMod2 = MOD2_ALL_CORRECT.map((a) => ({
        ...a,
        selectedOptionId: 'z',
      }));

      const response = await server.inject({
        method: 'POST',
        url: '/api/training/modules/module_2/submit',
        headers: { cookie },
        payload: { answers: allWrongMod2 },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ passed: boolean; correctCount: number }>();
      expect(body.passed).toBe(false);
      expect(body.correctCount).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: requireTrainingComplete Middleware
// ---------------------------------------------------------------------------

describe('requireTrainingComplete middleware', () => {
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

  it('allows request through for a user with isTrainingComplete=true', async () => {
    const cookie = await loginAs(server, MOCK_USER); // isTrainingComplete: true

    // GET /api/workflows uses [requireAuth(), requireTrainingComplete()] as preHandler
    const response = await server.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { cookie },
    });

    // 200 — anything but 401/403 confirms the gate passed
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });

  it('allows request through for a user with isTrainingComplete=undefined (legacy session) — direct middleware test', async () => {
    // The auth login route sets isTrainingComplete: educationProfile?.isTrainingComplete ?? false,
    // which means new logins always produce true or false, never undefined. The undefined case
    // only arises for sessions created before Phase 6. We test the middleware function directly
    // to cover this code path without going through the login route.
    const { requireTrainingComplete } = await import(
      '../../server/middleware/training-gate.js'
    );

    const mockDone = vi.fn();
    const mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    // Session user with isTrainingComplete absent (undefined) — legacy session
    const mockRequest = {
      session: {
        user: {
          id: 'user-legacy',
          email: 'legacy@acme-ins.test',
          role: 'CLAIMS_EXAMINER',
          organizationId: 'org-1',
          // isTrainingComplete intentionally absent
        },
      },
    };

    const handler = requireTrainingComplete();
    (handler as (...args: unknown[]) => void)(
      mockRequest as Parameters<typeof handler>[0],
      mockReply as unknown as Parameters<typeof handler>[1],
      mockDone,
    );

    // Middleware should call done() — not reply.code(403) — for undefined isTrainingComplete
    expect(mockDone).toHaveBeenCalledOnce();
    expect(mockReply.code).not.toHaveBeenCalledWith(403);
  });

  it('blocks request with 403 for a user with isTrainingComplete=false', async () => {
    const cookie = await loginAs(server, MOCK_UNTRAINED_USER); // isTrainingComplete: false

    const response = await server.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);

    const body = response.json<{ trainingRequired: boolean }>();
    expect(body.trainingRequired).toBe(true);
  });

  it('blocks unauthenticated request with 401', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/workflows',
    });

    expect(response.statusCode).toBe(401);
  });
});
