import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for workflow auto-advance and attention-needing features.
 *
 * Tests autoAdvanceWorkflow() — auto-completing steps based on document type.
 * Tests getWorkflowsNeedingAttention() — urgency-sorted pending workflow list.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const CLAIM_ID = 'claim-auto-1';
const WORKFLOW_ID = 'new_claim_intake';

function makeStepStatuses(overrides?: Array<{ stepId: string; status: string; completedAt?: string }>) {
  const defaults = [
    { stepId: 'intake_step_1', status: 'PENDING' },
    { stepId: 'intake_step_2', status: 'PENDING' },
    { stepId: 'intake_step_3', status: 'PENDING' },
    { stepId: 'intake_step_4', status: 'PENDING' },
    { stepId: 'intake_step_5', status: 'PENDING' },
    { stepId: 'intake_step_6', status: 'PENDING' },
    { stepId: 'intake_step_7', status: 'PENDING' },
  ];
  if (!overrides) return defaults;
  return defaults.map((d) => {
    const override = overrides.find((o) => o.stepId === d.stepId);
    return override ? { ...d, ...override } : d;
  });
}

function makeProgressRecord(overrides?: Partial<{
  id: string;
  claimId: string;
  userId: string;
  workflowId: string;
  isComplete: boolean;
  startedAt: Date;
  completedAt: Date | null;
  stepStatuses: unknown;
}>) {
  return {
    id: overrides?.id ?? 'wp-auto-1',
    claimId: overrides?.claimId ?? CLAIM_ID,
    userId: overrides?.userId ?? 'user-1',
    workflowId: overrides?.workflowId ?? WORKFLOW_ID,
    isComplete: overrides?.isComplete ?? false,
    startedAt: overrides?.startedAt ?? new Date('2026-03-20'),
    completedAt: overrides?.completedAt ?? null,
    stepStatuses: overrides?.stepStatuses ?? makeStepStatuses(),
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    workflowProgress: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Dynamic import after mocks
const {
  autoAdvanceWorkflow,
  getWorkflowsNeedingAttention,
} = await import('../../server/services/workflow-engine.service.js');

// ---------------------------------------------------------------------------
// Tests: autoAdvanceWorkflow
// ---------------------------------------------------------------------------

describe('autoAdvanceWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-completes matching step when document type matches', async () => {
    const record = makeProgressRecord();
    mockFindMany.mockResolvedValueOnce([record]);
    mockUpdate.mockResolvedValueOnce({ ...record, stepStatuses: [] });

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual(['intake_step_1']);
    expect(result.isComplete).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Verify the update included the correct step marked as COMPLETED
    const updateCall = mockUpdate.mock.calls[0]![0];
    const updatedStatuses = updateCall.data.stepStatuses as Array<{ stepId: string; status: string }>;
    const step1 = updatedStatuses.find((s: { stepId: string }) => s.stepId === 'intake_step_1');
    expect(step1?.status).toBe('COMPLETED');
  });

  it('auto-completes employer notification step for EMPLOYER_REPORT', async () => {
    const record = makeProgressRecord();
    mockFindMany.mockResolvedValueOnce([record]);
    mockUpdate.mockResolvedValueOnce({ ...record, stepStatuses: [] });

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'EMPLOYER_REPORT');

    expect(result.stepsAdvanced).toEqual(['intake_step_4']);
    expect(result.isComplete).toBe(false);
  });

  it('returns empty when no active workflow found', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual([]);
    expect(result.isComplete).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns empty for unknown workflow ID', async () => {
    const result = await autoAdvanceWorkflow(CLAIM_ID, 'nonexistent_workflow', 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual([]);
    expect(result.isComplete).toBe(false);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns empty for unmapped document type', async () => {
    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'OTHER');

    expect(result.stepsAdvanced).toEqual([]);
    expect(result.isComplete).toBe(false);
  });

  it('does not re-complete already completed steps', async () => {
    const record = makeProgressRecord({
      stepStatuses: makeStepStatuses([
        { stepId: 'intake_step_1', status: 'COMPLETED', completedAt: '2026-03-20T10:00:00.000Z' },
      ]),
    });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('marks workflow complete when all steps are done after auto-advance', async () => {
    // All steps completed except intake_step_1 which will be auto-completed
    const allCompleted = makeStepStatuses().map((s) =>
      s.stepId === 'intake_step_1'
        ? s
        : { ...s, status: 'COMPLETED', completedAt: '2026-03-20T10:00:00.000Z' },
    );
    const record = makeProgressRecord({ stepStatuses: allCompleted });
    mockFindMany.mockResolvedValueOnce([record]);
    mockUpdate.mockResolvedValueOnce({ ...record, isComplete: true });

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual(['intake_step_1']);
    expect(result.isComplete).toBe(true);

    const updateCall = mockUpdate.mock.calls[0]![0];
    expect(updateCall.data.isComplete).toBe(true);
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);
  });

  it('advances steps in three_point_contact for MEDICAL_REPORT', async () => {
    const tpcRecord = makeProgressRecord({
      workflowId: 'three_point_contact',
      stepStatuses: [
        { stepId: 'three_point_step_1', status: 'PENDING' },
        { stepId: 'three_point_step_2', status: 'PENDING' },
        { stepId: 'three_point_step_3', status: 'PENDING' },
        { stepId: 'three_point_step_4', status: 'PENDING' },
        { stepId: 'three_point_step_5', status: 'PENDING' },
      ],
    });
    mockFindMany.mockResolvedValueOnce([tpcRecord]);
    mockUpdate.mockResolvedValueOnce({ ...tpcRecord, stepStatuses: [] });

    const result = await autoAdvanceWorkflow(CLAIM_ID, 'three_point_contact', 'MEDICAL_REPORT');

    expect(result.stepsAdvanced).toEqual(['three_point_step_3']);
  });

  it('advances steps in qme_ame_process for AME_QME_REPORT', async () => {
    const qmeRecord = makeProgressRecord({
      workflowId: 'qme_ame_process',
      stepStatuses: [
        { stepId: 'qme_step_1', status: 'PENDING' },
        { stepId: 'qme_step_2', status: 'PENDING' },
        { stepId: 'qme_step_3', status: 'PENDING' },
        { stepId: 'qme_step_4', status: 'PENDING' },
        { stepId: 'qme_step_5', status: 'PENDING' },
      ],
    });
    mockFindMany.mockResolvedValueOnce([qmeRecord]);
    mockUpdate.mockResolvedValueOnce({ ...qmeRecord, stepStatuses: [] });

    const result = await autoAdvanceWorkflow(CLAIM_ID, 'qme_ame_process', 'AME_QME_REPORT');

    expect(result.stepsAdvanced).toEqual(['qme_step_3']);
  });

  it('handles multiple active records for same workflow (different users)', async () => {
    const record1 = makeProgressRecord({ id: 'wp-1', userId: 'user-1' });
    const record2 = makeProgressRecord({ id: 'wp-2', userId: 'user-2' });
    mockFindMany.mockResolvedValueOnce([record1, record2]);
    mockUpdate.mockResolvedValue({});

    const result = await autoAdvanceWorkflow(CLAIM_ID, WORKFLOW_ID, 'DWC1_CLAIM_FORM');

    expect(result.stepsAdvanced).toEqual(['intake_step_1']);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: getWorkflowsNeedingAttention
// ---------------------------------------------------------------------------

describe('getWorkflowsNeedingAttention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no active workflows exist', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result).toEqual([]);
  });

  it('returns workflows with pending step counts', async () => {
    const record = makeProgressRecord({ startedAt: new Date() });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.workflowId).toBe(WORKFLOW_ID);
    expect(result[0]!.pendingSteps).toBe(7);
    expect(result[0]!.urgency).toBe('normal');
  });

  it('classifies as overdue when started more than 5 days ago', async () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    const record = makeProgressRecord({ startedAt: sixDaysAgo });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result[0]!.urgency).toBe('overdue');
  });

  it('classifies as due_soon when started 3-5 days ago', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const record = makeProgressRecord({ startedAt: threeDaysAgo });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result[0]!.urgency).toBe('due_soon');
  });

  it('sorts by urgency: overdue first, then due_soon, then normal', async () => {
    const now = new Date();
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const overdueRecord = makeProgressRecord({
      id: 'wp-overdue',
      workflowId: 'three_point_contact',
      startedAt: sixDaysAgo,
      stepStatuses: [
        { stepId: 'three_point_step_1', status: 'PENDING' },
        { stepId: 'three_point_step_2', status: 'PENDING' },
        { stepId: 'three_point_step_3', status: 'PENDING' },
        { stepId: 'three_point_step_4', status: 'PENDING' },
        { stepId: 'three_point_step_5', status: 'PENDING' },
      ],
    });

    const dueSoonRecord = makeProgressRecord({
      id: 'wp-due-soon',
      workflowId: 'coverage_determination',
      startedAt: threeDaysAgo,
      stepStatuses: [
        { stepId: 'coverage_step_1', status: 'PENDING' },
        { stepId: 'coverage_step_2', status: 'PENDING' },
      ],
    });

    const normalRecord = makeProgressRecord({
      id: 'wp-normal',
      startedAt: now,
    });

    // Return in wrong order to verify sorting
    mockFindMany.mockResolvedValueOnce([normalRecord, overdueRecord, dueSoonRecord]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result).toHaveLength(3);
    expect(result[0]!.urgency).toBe('overdue');
    expect(result[1]!.urgency).toBe('due_soon');
    expect(result[2]!.urgency).toBe('normal');
  });

  it('excludes workflows with no pending steps (all completed)', async () => {
    const allDone = makeStepStatuses().map((s) => ({
      ...s,
      status: 'COMPLETED',
      completedAt: '2026-03-20T10:00:00.000Z',
    }));
    const record = makeProgressRecord({ stepStatuses: allDone });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result).toEqual([]);
  });

  it('includes title from workflow definition', async () => {
    const record = makeProgressRecord({ startedAt: new Date() });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result[0]!.title).toBe('New Claim Intake (First 48 Hours)');
  });

  it('skips records with unknown workflow IDs', async () => {
    const record = makeProgressRecord({
      workflowId: 'nonexistent_workflow',
      stepStatuses: [{ stepId: 'x', status: 'PENDING' }],
    });
    mockFindMany.mockResolvedValueOnce([record]);

    const result = await getWorkflowsNeedingAttention(CLAIM_ID);

    expect(result).toEqual([]);
  });
});
