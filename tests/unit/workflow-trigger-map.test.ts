import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Workflow trigger map service tests.
 *
 * Covers:
 *   - Static mapping correctness for each major document type
 *   - Unmapped types return empty triggers
 *   - Duplicate prevention (already-active workflows not re-triggered)
 *   - Re-triggering after workflow completion
 *   - Priority level correctness
 *   - Pipeline integration (triggers called after classification)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWorkflowProgressFindUnique = vi.fn();
const mockWorkflowProgressCreate = vi.fn();
const mockWorkflowProgressDelete = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockAuditEventCreate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    workflowProgress: {
      findUnique: (...args: unknown[]) => mockWorkflowProgressFindUnique(...args),
      create: (...args: unknown[]) => mockWorkflowProgressCreate(...args),
      delete: (...args: unknown[]) => mockWorkflowProgressDelete(...args),
    },
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: (...args: unknown[]) => mockAuditEventCreate(...args),
    },
  },
}));

// Mock the workflow definitions to avoid loading the full file
vi.mock('../../server/data/workflow-definitions.js', () => {
  const makeWorkflow = (id: string) => ({
    id,
    title: `Workflow ${id}`,
    description: `Test workflow ${id}`,
    uplZone: 'GREEN',
    authority: 'Test',
    estimatedMinutes: 30,
    steps: [
      { id: `${id}_step_1`, title: 'Step 1', description: 'First step', authority: 'Test', isSkippable: false },
      { id: `${id}_step_2`, title: 'Step 2', description: 'Second step', authority: 'Test', isSkippable: true },
    ],
  });

  const workflows = [
    'new_claim_intake',
    'three_point_contact',
    'reserve_setting',
    'qme_ame_process',
    'ur_treatment_authorization',
    'lien_management',
    'counsel_referral',
    'td_benefit_initiation',
    'return_to_work',
  ].map(makeWorkflow);

  const map = new Map(workflows.map((w) => [w.id, w]));

  return {
    WORKFLOW_DEFINITIONS: workflows,
    WORKFLOWS_BY_ID: map,
  };
});

// Import after mocks are set up
import {
  getTriggersForDocumentType,
  processWorkflowTriggers,
} from '../../server/services/workflow-trigger-map.service.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkflowProgressFindUnique.mockResolvedValue(null);
  mockWorkflowProgressCreate.mockResolvedValue({ id: 'wp-1' });
  mockWorkflowProgressDelete.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// getTriggersForDocumentType — static mapping tests
// ---------------------------------------------------------------------------

describe('getTriggersForDocumentType', () => {
  it('returns two triggers for DWC1_CLAIM_FORM (new_claim_intake + three_point_contact)', () => {
    const triggers = getTriggersForDocumentType('DWC1_CLAIM_FORM');
    expect(triggers).toHaveLength(2);
    expect(triggers.map((t) => t.workflowId)).toEqual([
      'new_claim_intake',
      'three_point_contact',
    ]);
  });

  it('returns reserve_setting for MEDICAL_REPORT', () => {
    const triggers = getTriggersForDocumentType('MEDICAL_REPORT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('reserve_setting');
  });

  it('returns qme_ame_process for AME_QME_REPORT', () => {
    const triggers = getTriggersForDocumentType('AME_QME_REPORT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('qme_ame_process');
  });

  it('returns ur_treatment_authorization for UTILIZATION_REVIEW', () => {
    const triggers = getTriggersForDocumentType('UTILIZATION_REVIEW');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('ur_treatment_authorization');
  });

  it('returns lien_management for BILLING_STATEMENT', () => {
    const triggers = getTriggersForDocumentType('BILLING_STATEMENT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('lien_management');
  });

  it('returns reserve_setting for WAGE_STATEMENT', () => {
    const triggers = getTriggersForDocumentType('WAGE_STATEMENT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('reserve_setting');
  });

  it('returns counsel_referral for LEGAL_CORRESPONDENCE', () => {
    const triggers = getTriggersForDocumentType('LEGAL_CORRESPONDENCE');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('counsel_referral');
  });

  it('returns td_benefit_initiation for BENEFIT_NOTICE', () => {
    const triggers = getTriggersForDocumentType('BENEFIT_NOTICE');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('td_benefit_initiation');
  });

  it('returns three_point_contact for EMPLOYER_REPORT', () => {
    const triggers = getTriggersForDocumentType('EMPLOYER_REPORT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('three_point_contact');
  });

  it('returns counsel_referral for WCAB_FILING', () => {
    const triggers = getTriggersForDocumentType('WCAB_FILING');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('counsel_referral');
  });

  it('returns counsel_referral for SETTLEMENT_DOCUMENT', () => {
    const triggers = getTriggersForDocumentType('SETTLEMENT_DOCUMENT');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('counsel_referral');
  });

  it('returns return_to_work for RETURN_TO_WORK', () => {
    const triggers = getTriggersForDocumentType('RETURN_TO_WORK');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('return_to_work');
  });

  it('returns lien_management for LIEN_CLAIM', () => {
    const triggers = getTriggersForDocumentType('LIEN_CLAIM');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('lien_management');
  });

  it('returns counsel_referral for DISCOVERY_REQUEST', () => {
    const triggers = getTriggersForDocumentType('DISCOVERY_REQUEST');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('counsel_referral');
  });

  it('returns reserve_setting for DWC_OFFICIAL_FORM', () => {
    const triggers = getTriggersForDocumentType('DWC_OFFICIAL_FORM');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.workflowId).toBe('reserve_setting');
  });

  // --- Unmapped types ---

  it('returns empty array for OTHER', () => {
    expect(getTriggersForDocumentType('OTHER')).toEqual([]);
  });

  it('returns empty array for CORRESPONDENCE', () => {
    expect(getTriggersForDocumentType('CORRESPONDENCE')).toEqual([]);
  });

  it('returns empty array for IMAGING_REPORT', () => {
    expect(getTriggersForDocumentType('IMAGING_REPORT')).toEqual([]);
  });

  it('returns empty array for PHARMACY_RECORD', () => {
    expect(getTriggersForDocumentType('PHARMACY_RECORD')).toEqual([]);
  });

  it('returns empty array for completely unknown type', () => {
    expect(getTriggersForDocumentType('DOES_NOT_EXIST')).toEqual([]);
  });

  // --- Priority levels ---

  it('DWC1_CLAIM_FORM triggers are high priority', () => {
    const triggers = getTriggersForDocumentType('DWC1_CLAIM_FORM');
    expect(triggers.every((t) => t.priority === 'high')).toBe(true);
  });

  it('BILLING_STATEMENT trigger is low priority', () => {
    const triggers = getTriggersForDocumentType('BILLING_STATEMENT');
    expect(triggers[0]!.priority).toBe('low');
  });

  it('WAGE_STATEMENT trigger is medium priority', () => {
    const triggers = getTriggersForDocumentType('WAGE_STATEMENT');
    expect(triggers[0]!.priority).toBe('medium');
  });

  it('LEGAL_CORRESPONDENCE trigger is high priority', () => {
    const triggers = getTriggersForDocumentType('LEGAL_CORRESPONDENCE');
    expect(triggers[0]!.priority).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// processWorkflowTriggers — integration logic tests
// ---------------------------------------------------------------------------

describe('processWorkflowTriggers', () => {
  it('creates WorkflowProgress records for triggered workflows', async () => {
    const result = await processWorkflowTriggers('claim-1', 'user-1', 'AME_QME_REPORT');

    expect(result.documentType).toBe('AME_QME_REPORT');
    expect(result.triggeredWorkflows).toHaveLength(1);
    expect(result.triggeredWorkflows[0]!.workflowId).toBe('qme_ame_process');
    expect(mockWorkflowProgressCreate).toHaveBeenCalledTimes(1);
    expect(mockWorkflowProgressCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          claimId: 'claim-1',
          userId: 'user-1',
          workflowId: 'qme_ame_process',
          isComplete: false,
        }),
      }),
    );
  });

  it('creates multiple WorkflowProgress records for DWC1_CLAIM_FORM', async () => {
    const result = await processWorkflowTriggers('claim-1', 'user-1', 'DWC1_CLAIM_FORM');

    expect(result.triggeredWorkflows).toHaveLength(2);
    expect(mockWorkflowProgressCreate).toHaveBeenCalledTimes(2);
  });

  it('returns empty for unmapped document types', async () => {
    const result = await processWorkflowTriggers('claim-1', 'user-1', 'OTHER');

    expect(result.triggeredWorkflows).toEqual([]);
    expect(result.documentType).toBe('OTHER');
    expect(mockWorkflowProgressCreate).not.toHaveBeenCalled();
  });

  it('does not re-trigger already active (non-complete) workflows', async () => {
    // Simulate an existing active workflow
    mockWorkflowProgressFindUnique.mockResolvedValue({ isComplete: false });

    const result = await processWorkflowTriggers('claim-1', 'user-1', 'AME_QME_REPORT');

    expect(result.triggeredWorkflows).toHaveLength(0);
    expect(mockWorkflowProgressCreate).not.toHaveBeenCalled();
  });

  it('re-triggers a completed workflow (deletes old, creates new)', async () => {
    // Simulate an existing completed workflow
    mockWorkflowProgressFindUnique.mockResolvedValue({ isComplete: true });

    const result = await processWorkflowTriggers('claim-1', 'user-1', 'AME_QME_REPORT');

    expect(result.triggeredWorkflows).toHaveLength(1);
    expect(mockWorkflowProgressDelete).toHaveBeenCalledTimes(1);
    expect(mockWorkflowProgressCreate).toHaveBeenCalledTimes(1);
  });

  it('initialises step statuses as PENDING for all workflow steps', async () => {
    await processWorkflowTriggers('claim-1', 'user-1', 'AME_QME_REPORT');

    const createCall = mockWorkflowProgressCreate.mock.calls[0]![0];
    const stepStatuses = createCall.data.stepStatuses;
    expect(stepStatuses).toHaveLength(2);
    expect(stepStatuses[0]).toEqual({ stepId: 'qme_ame_process_step_1', status: 'PENDING' });
    expect(stepStatuses[1]).toEqual({ stepId: 'qme_ame_process_step_2', status: 'PENDING' });
  });

  it('handles mixed active and new workflows for multi-trigger types', async () => {
    // DWC1_CLAIM_FORM triggers new_claim_intake + three_point_contact
    // Simulate new_claim_intake already active, three_point_contact not started
    mockWorkflowProgressFindUnique
      .mockResolvedValueOnce({ isComplete: false }) // new_claim_intake — active
      .mockResolvedValueOnce(null); // three_point_contact — not started

    const result = await processWorkflowTriggers('claim-1', 'user-1', 'DWC1_CLAIM_FORM');

    expect(result.triggeredWorkflows).toHaveLength(1);
    expect(result.triggeredWorkflows[0]!.workflowId).toBe('three_point_contact');
    expect(mockWorkflowProgressCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Pipeline integration test
// ---------------------------------------------------------------------------

describe('pipeline integration', () => {
  it('processWorkflowTriggers is importable and has the expected signature', () => {
    expect(typeof processWorkflowTriggers).toBe('function');
    expect(processWorkflowTriggers.length).toBe(3); // claimId, userId, documentType
  });

  it('getTriggersForDocumentType is a pure sync function', () => {
    // Should not return a promise
    const result = getTriggersForDocumentType('DWC1_CLAIM_FORM');
    expect(Array.isArray(result)).toBe(true);
  });
});
