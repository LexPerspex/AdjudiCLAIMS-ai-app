import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Workflow engine service + route tests.
 *
 * Tests the workflow-engine.service.ts functions (getWorkflow, getAllWorkflows,
 * startWorkflow, completeStep, skipStep, getWorkflowProgress) and the
 * workflow route endpoints with mocked Prisma.
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
  claimNumber: 'WC-2026-0001',
  claimantName: 'John Doe',
  dateOfInjury: new Date('2026-01-15'),
  bodyParts: ['lumbar spine'],
  employer: 'Acme Corp',
  insurer: 'Acme Insurance',
  status: 'OPEN' as const,
  dateReceived: new Date('2026-01-20'),
  assignedExaminerId: 'user-1',
  organizationId: 'org-1',
  createdAt: new Date('2026-01-20'),
};

// Known workflow / step IDs from workflow-definitions.ts
const WORKFLOW_ID = 'new_claim_intake';
const _STEP_SKIPPABLE_ID = 'intake_step_7'; // reserves step — isSkippable: true
const STEP_NOT_SKIPPABLE_ID = 'intake_step_1'; // receive/log — isSkippable: false

function makeProgressRecord(overrides?: Partial<{
  isComplete: boolean;
  completedAt: Date | null;
  stepStatuses: unknown;
}>) {
  return {
    id: 'wp-1',
    claimId: 'claim-1',
    userId: 'user-1',
    workflowId: WORKFLOW_ID,
    isComplete: overrides?.isComplete ?? false,
    startedAt: new Date('2026-01-20'),
    completedAt: overrides?.completedAt ?? null,
    stepStatuses: overrides?.stepStatuses ?? [],
  };
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
const mockWorkflowProgressCreate = vi.fn();
const mockWorkflowProgressFindUnique = vi.fn();
const mockWorkflowProgressFindUniqueOrThrow = vi.fn();
const mockWorkflowProgressUpdate = vi.fn();
const mockEducationProfileFindUnique = vi.fn();

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
    workflowProgress: {
      create: (...args: unknown[]) => mockWorkflowProgressCreate(...args) as unknown,
      findUnique: (...args: unknown[]) => mockWorkflowProgressFindUnique(...args) as unknown,
      findUniqueOrThrow: (...args: unknown[]) => mockWorkflowProgressFindUniqueOrThrow(...args) as unknown,
      update: (...args: unknown[]) => mockWorkflowProgressUpdate(...args) as unknown,
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
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
  isTrainingComplete = true,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);
  mockEducationProfileFindUnique.mockResolvedValueOnce({ isTrainingComplete });

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
// Tests: Workflow Engine Service (direct function tests)
// ---------------------------------------------------------------------------

describe('Workflow Engine Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorkflow', () => {
    it('returns workflow definition for a known workflowId', async () => {
      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow(WORKFLOW_ID);

      expect(workflow).not.toBeNull();
      expect(workflow?.id).toBe(WORKFLOW_ID);
      expect(workflow?.title).toBeTruthy();
      expect(Array.isArray(workflow?.steps)).toBe(true);
    });

    it('returns null for an unknown workflowId', async () => {
      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow('no_such_workflow_xyz');

      expect(workflow).toBeNull();
    });
  });

  describe('getAllWorkflows', () => {
    it('returns all 20 workflow summaries', async () => {
      const { getAllWorkflows } = await import('../../server/services/workflow-engine.service.js');

      const workflows = getAllWorkflows();

      expect(workflows).toHaveLength(20);
      for (const w of workflows) {
        expect(w.id).toBeTruthy();
        expect(w.title).toBeTruthy();
        expect(typeof w.stepCount).toBe('number');
        expect(w.stepCount).toBeGreaterThan(0);
      }
    });
  });

  describe('startWorkflow', () => {
    it('creates a progress record with all steps PENDING', async () => {
      const { startWorkflow } = await import('../../server/services/workflow-engine.service.js');
      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));

      const record = makeProgressRecord({ stepStatuses: pendingStatuses });
      mockWorkflowProgressCreate.mockResolvedValueOnce(record);

      const result = await startWorkflow('user-1', 'claim-1', WORKFLOW_ID);

      expect(result.workflowId).toBe(WORKFLOW_ID);
      expect(result.isComplete).toBe(false);
      expect(result.steps.every((s) => s.status === 'PENDING')).toBe(true);
      expect(result.completedSteps).toBe(0);
    });

    it('throws for an unknown workflowId', async () => {
      const { startWorkflow } = await import('../../server/services/workflow-engine.service.js');

      await expect(startWorkflow('user-1', 'claim-1', 'no_such_workflow_xyz')).rejects.toThrow(
        'Unknown workflowId',
      );
    });
  });

  describe('completeStep', () => {
    it('marks a step as COMPLETED and returns updated progress', async () => {
      const { completeStep, getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const stepId = (workflow.steps[0] as (typeof workflow.steps)[number]).id;
      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));
      const completedStatuses = workflow.steps.map((s) =>
        s.id === stepId
          ? { stepId: s.id, status: 'COMPLETED', completedAt: new Date().toISOString() }
          : { stepId: s.id, status: 'PENDING' },
      );

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: pendingStatuses }),
      );
      mockWorkflowProgressUpdate.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: completedStatuses }),
      );

      const result = await completeStep('user-1', 'claim-1', WORKFLOW_ID, stepId);

      const completedStep = result.steps.find((s) => s.id === stepId);
      expect(completedStep?.status).toBe('COMPLETED');
    });

    it('sets isComplete=true when all steps are completed', async () => {
      const { completeStep, getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const lastStep = workflow.steps[workflow.steps.length - 1] as (typeof workflow.steps)[number];

      // All steps completed except the last
      const allButLastCompleted = workflow.steps.map((s) =>
        s.id === lastStep.id
          ? { stepId: s.id, status: 'PENDING' }
          : { stepId: s.id, status: 'COMPLETED', completedAt: new Date().toISOString() },
      );
      const allCompleted = workflow.steps.map((s) => ({
        stepId: s.id,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      }));

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: allButLastCompleted }),
      );
      mockWorkflowProgressUpdate.mockResolvedValueOnce(
        makeProgressRecord({ isComplete: true, completedAt: new Date(), stepStatuses: allCompleted }),
      );

      const result = await completeStep('user-1', 'claim-1', WORKFLOW_ID, lastStep.id);

      expect(result.isComplete).toBe(true);
    });
  });

  describe('skipStep', () => {
    it('marks a skippable step as SKIPPED with a reason', async () => {
      const { skipStep, getWorkflow } = await import('../../server/services/workflow-engine.service.js');

      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const skippableStep = workflow.steps.find((s) => s.isSkippable);
      expect(skippableStep).toBeDefined();
      const stepId = (skippableStep as NonNullable<typeof skippableStep>).id;

      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));
      const skippedStatuses = workflow.steps.map((s) =>
        s.id === stepId
          ? { stepId: s.id, status: 'SKIPPED', skipReason: 'No reserves needed at this stage' }
          : { stepId: s.id, status: 'PENDING' },
      );

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: pendingStatuses }),
      );
      mockWorkflowProgressUpdate.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: skippedStatuses }),
      );

      const result = await skipStep(
        'user-1', 'claim-1', WORKFLOW_ID, stepId, 'No reserves needed at this stage',
      );

      const skippedResult = result.steps.find((s) => s.id === stepId);
      expect(skippedResult?.status).toBe('SKIPPED');
    });

    it('throws when attempting to skip a non-skippable step', async () => {
      const { skipStep } = await import('../../server/services/workflow-engine.service.js');

      await expect(
        skipStep('user-1', 'claim-1', WORKFLOW_ID, STEP_NOT_SKIPPABLE_ID, 'trying to skip'),
      ).rejects.toThrow('not skippable');
    });
  });

  describe('getWorkflowProgress', () => {
    it('merges workflow definition with persisted progress', async () => {
      const { getWorkflowProgress, getWorkflow } = await import(
        '../../server/services/workflow-engine.service.js'
      );

      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const statuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: statuses }),
      );

      const result = await getWorkflowProgress('user-1', 'claim-1', WORKFLOW_ID);

      expect(result.workflowId).toBe(WORKFLOW_ID);
      expect(result.title).toBe(workflow.title);
      expect(result.totalSteps).toBe(workflow.steps.length);
      expect(result.steps).toHaveLength(workflow.steps.length);
      for (const step of result.steps) {
        expect(step.title).toBeTruthy();
        expect(step.authority).toBeTruthy();
        expect(step.status).toBe('PENDING');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Workflow Routes (HTTP integration via Fastify inject)
// ---------------------------------------------------------------------------

describe('Workflow Routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineCreateMany.mockResolvedValue({ count: 4 });
    mockInvestigationCreateMany.mockResolvedValue({ count: 10 });
  });

  // ── GET /api/workflows ────────────────────────────────────────────────────

  describe('GET /api/workflows', () => {
    it('returns 200 and all workflows for authenticated user with training complete', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { workflows: unknown[] };
      expect(Array.isArray(body.workflows)).toBe(true);
      expect(body.workflows.length).toBe(20);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── GET /api/workflows/:workflowId ────────────────────────────────────────

  describe('GET /api/workflows/:workflowId', () => {
    it('returns 200 and workflow definition for known workflowId', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      const response = await server.inject({
        method: 'GET',
        url: `/api/workflows/${WORKFLOW_ID}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { id: string; steps: unknown[] };
      expect(body.id).toBe(WORKFLOW_ID);
      expect(Array.isArray(body.steps)).toBe(true);
    });

    it('returns 404 for unknown workflowId', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows/no_such_workflow_xyz',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── POST /api/claims/:claimId/workflows/:workflowId/start ─────────────────

  describe('POST /api/claims/:claimId/workflows/:workflowId/start', () => {
    it('returns 201 and progress detail when workflow is started successfully', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');
      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));
      mockWorkflowProgressCreate.mockResolvedValueOnce(makeProgressRecord({ stepStatuses: pendingStatuses }));

      const response = await server.inject({
        method: 'POST',
        url: `/api/claims/claim-1/workflows/${WORKFLOW_ID}/start`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { workflowId: string; isComplete: boolean };
      expect(body.workflowId).toBe(WORKFLOW_ID);
      expect(body.isComplete).toBe(false);
    });

    it('returns 409 when workflow was already started', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockWorkflowProgressCreate.mockRejectedValueOnce(
        new Error('Unique constraint failed — P2002'),
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/claims/claim-1/workflows/${WORKFLOW_ID}/start`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  // ── PATCH /api/claims/:claimId/workflows/:workflowId/steps/:stepId ────────

  describe('PATCH /api/claims/:claimId/workflows/:workflowId/steps/:stepId', () => {
    it('completes a step and returns updated progress (action=complete)', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');
      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const stepId = (workflow.steps[0] as (typeof workflow.steps)[number]).id;
      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));
      const completedStatuses = workflow.steps.map((s) =>
        s.id === stepId
          ? { stepId: s.id, status: 'COMPLETED', completedAt: new Date().toISOString() }
          : { stepId: s.id, status: 'PENDING' },
      );

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: pendingStatuses }),
      );
      mockWorkflowProgressUpdate.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: completedStatuses }),
      );

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/claims/claim-1/workflows/${WORKFLOW_ID}/steps/${stepId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { action: 'complete' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { steps: Array<{ id: string; status: string }> };
      const completedStep = body.steps.find((s) => s.id === stepId);
      expect(completedStep?.status).toBe('COMPLETED');
    });

    it('skips a step with a reason (action=skip)', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');
      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const skippableStep = workflow.steps.find((s) => s.isSkippable) as (typeof workflow.steps)[number];
      const stepId = skippableStep.id;

      const pendingStatuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));
      const skippedStatuses = workflow.steps.map((s) =>
        s.id === stepId
          ? { stepId: s.id, status: 'SKIPPED', skipReason: 'No reserves yet' }
          : { stepId: s.id, status: 'PENDING' },
      );

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: pendingStatuses }),
      );
      mockWorkflowProgressUpdate.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: skippedStatuses }),
      );

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/claims/claim-1/workflows/${WORKFLOW_ID}/steps/${stepId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { action: 'skip', reason: 'No reserves yet' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { steps: Array<{ id: string; status: string }> };
      const skippedResult = body.steps.find((s) => s.id === stepId);
      expect(skippedResult?.status).toBe('SKIPPED');
    });
  });

  // ── GET /api/claims/:claimId/workflows/:workflowId/progress ───────────────

  describe('GET /api/claims/:claimId/workflows/:workflowId/progress', () => {
    it('returns 200 and workflow progress for started workflow', async () => {
      cookie = await loginAs(server, MOCK_USER, true);

      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const { getWorkflow } = await import('../../server/services/workflow-engine.service.js');
      const workflow = getWorkflow(WORKFLOW_ID) as NonNullable<ReturnType<typeof getWorkflow>>;
      const statuses = workflow.steps.map((s) => ({ stepId: s.id, status: 'PENDING' }));

      mockWorkflowProgressFindUniqueOrThrow.mockResolvedValueOnce(
        makeProgressRecord({ stepStatuses: statuses }),
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/claims/claim-1/workflows/${WORKFLOW_ID}/progress`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        workflowId: string;
        totalSteps: number;
        completedSteps: number;
      };
      expect(body.workflowId).toBe(WORKFLOW_ID);
      expect(typeof body.totalSteps).toBe('number');
      expect(body.completedSteps).toBe(0);
    });
  });

  // ── Training Gate Integration ─────────────────────────────────────────────

  describe('Training Gate Integration', () => {
    it('blocks workflow routes when isTrainingComplete=false (403)', async () => {
      // Login with training NOT complete
      cookie = await loginAs(server, MOCK_USER, false);

      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('allows workflow routes when isTrainingComplete=true (200)', async () => {
      // Login with training complete
      cookie = await loginAs(server, MOCK_USER, true);

      const response = await server.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
