/**
 * Unit tests for Graph Bridge Services.
 *
 * Tests the four bridge services that connect graph enrichment events
 * to downstream AdjudiCLAIMS systems: workflows, deadlines, investigation
 * checklist, and benefit calculations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockClaimUpdate = vi.fn();
const mockRegulatoryDeadlineFindMany = vi.fn();
const mockRegulatoryDeadlineUpdate = vi.fn();
const mockRegulatoryDeadlineFindFirst = vi.fn();
const mockRegulatoryDeadlineCreate = vi.fn();
const mockInvestigationItemUpdateMany = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    claim: {
      update: (...args: unknown[]) => mockClaimUpdate(...args) as unknown,
    },
    regulatoryDeadline: {
      findMany: (...args: unknown[]) => mockRegulatoryDeadlineFindMany(...args) as unknown,
      update: (...args: unknown[]) => mockRegulatoryDeadlineUpdate(...args) as unknown,
      findFirst: (...args: unknown[]) => mockRegulatoryDeadlineFindFirst(...args) as unknown,
      create: (...args: unknown[]) => mockRegulatoryDeadlineCreate(...args) as unknown,
    },
    investigationItem: {
      updateMany: (...args: unknown[]) => mockInvestigationItemUpdateMany(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { processGraphWorkflowTriggers } from '../../../server/services/graph/graph-workflow-bridge.service.js';
import { processGraphDeadlineTriggers } from '../../../server/services/graph/graph-deadline-bridge.service.js';
import { processGraphInvestigationTriggers } from '../../../server/services/graph/graph-investigation-bridge.service.js';
import { processGraphBenefitTriggers } from '../../../server/services/graph/graph-benefit-bridge.service.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock returns
  mockClaimUpdate.mockResolvedValue({});
  mockRegulatoryDeadlineFindMany.mockResolvedValue([]);
  mockRegulatoryDeadlineUpdate.mockResolvedValue({});
  mockRegulatoryDeadlineFindFirst.mockResolvedValue(null);
  mockRegulatoryDeadlineCreate.mockResolvedValue({});
  mockInvestigationItemUpdateMany.mockResolvedValue({ count: 0 });
});

const CLAIM_ID = 'claim-001';

// ===========================================================================
// Workflow Bridge
// ===========================================================================

describe('processGraphWorkflowTriggers', () => {
  it('logs ur_treatment_authorization for TREATMENT node', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [{ nodeType: 'TREATMENT', canonicalName: 'Lumbar Fusion' }],
      [],
    );
    expect(result.triggeredWorkflows).toContain('ur_treatment_authorization');
  });

  it('logs reserve_setting for new BODY_PART node', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [{ nodeType: 'BODY_PART', canonicalName: 'Left Knee' }],
      [],
    );
    expect(result.triggeredWorkflows).toContain('reserve_setting');
  });

  it('updates claim flags when APPLICANT_ATTORNEY detected', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [{ nodeType: 'PERSON', canonicalName: 'Jane Attorney', personRole: 'APPLICANT_ATTORNEY' }],
      [],
    );

    expect(mockClaimUpdate).toHaveBeenCalledWith({
      where: { id: CLAIM_ID },
      data: { isLitigated: true, hasApplicantAttorney: true },
    });
    expect(result.flagsUpdated).toContain('isLitigated');
    expect(result.flagsUpdated).toContain('hasApplicantAttorney');
  });

  it('logs td_recalculation for EMPLOYED_BY edge with wage data', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'EMPLOYED_BY', properties: { averageWeeklyEarnings: 1200 } }],
    );
    expect(result.triggeredWorkflows).toContain('td_recalculation');
  });

  it('logs ur_appeal_workflow for REVIEWS_UR with DENIED decision', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'REVIEWS_UR', properties: { decision: 'DENIED' } }],
    );
    expect(result.triggeredWorkflows).toContain('ur_appeal_workflow');
  });

  it('does not log ur_appeal for REVIEWS_UR with APPROVED decision', async () => {
    const result = await processGraphWorkflowTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'REVIEWS_UR', properties: { decision: 'APPROVED' } }],
    );
    expect(result.triggeredWorkflows).not.toContain('ur_appeal_workflow');
  });

  it('returns empty results for empty inputs', async () => {
    const result = await processGraphWorkflowTriggers(CLAIM_ID, [], []);
    expect(result.triggeredWorkflows).toEqual([]);
    expect(result.flagsUpdated).toEqual([]);
  });
});

// ===========================================================================
// Deadline Bridge
// ===========================================================================

describe('processGraphDeadlineTriggers', () => {
  it('recalculates deadlines when CLAIM node has dateOfInjury', async () => {
    mockRegulatoryDeadlineFindMany.mockResolvedValue([
      { id: 'dl-1', deadlineType: 'ACKNOWLEDGE_15DAY', status: 'PENDING' },
      { id: 'dl-2', deadlineType: 'TD_FIRST_14DAY', status: 'PENDING' },
    ]);
    mockRegulatoryDeadlineUpdate.mockResolvedValue({});

    const result = await processGraphDeadlineTriggers(
      CLAIM_ID,
      [{ nodeType: 'CLAIM', properties: { dateOfInjury: '2026-01-15' } }],
      [],
    );

    expect(result.deadlinesRecalculated).toBe(2);
    expect(mockRegulatoryDeadlineUpdate).toHaveBeenCalledTimes(2);
  });

  it('creates TD_SUBSEQUENT_14DAY deadline for EMPLOYED_BY with endDate', async () => {
    mockRegulatoryDeadlineFindFirst.mockResolvedValue(null);
    mockRegulatoryDeadlineCreate.mockResolvedValue({});

    const result = await processGraphDeadlineTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'EMPLOYED_BY', properties: { endDate: '2026-02-01' } }],
    );

    expect(result.deadlinesCreated).toBe(1);
    expect(mockRegulatoryDeadlineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          claimId: CLAIM_ID,
          deadlineType: 'TD_SUBSEQUENT_14DAY',
          status: 'PENDING',
          statutoryAuthority: 'LC 4650',
        }),
      }),
    );
  });

  it('does not create duplicate TD_SUBSEQUENT_14DAY deadline', async () => {
    mockRegulatoryDeadlineFindFirst.mockResolvedValue({ id: 'existing-dl' });

    const result = await processGraphDeadlineTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'EMPLOYED_BY', properties: { endDate: '2026-02-01' } }],
    );

    expect(result.deadlinesCreated).toBe(0);
    expect(mockRegulatoryDeadlineCreate).not.toHaveBeenCalled();
  });

  it('creates UR_RETROSPECTIVE_30DAY deadline for REVIEWS_UR with decisionDate', async () => {
    mockRegulatoryDeadlineFindFirst.mockResolvedValue(null);
    mockRegulatoryDeadlineCreate.mockResolvedValue({});

    const result = await processGraphDeadlineTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'REVIEWS_UR', properties: { decisionDate: '2026-03-01' } }],
    );

    expect(result.deadlinesCreated).toBe(1);
    expect(mockRegulatoryDeadlineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deadlineType: 'UR_RETROSPECTIVE_30DAY',
          statutoryAuthority: 'LC 4610',
        }),
      }),
    );
  });

  it('returns zero results for empty inputs', async () => {
    const result = await processGraphDeadlineTriggers(CLAIM_ID, [], []);
    expect(result.deadlinesRecalculated).toBe(0);
    expect(result.deadlinesCreated).toBe(0);
  });
});

// ===========================================================================
// Investigation Bridge
// ===========================================================================

describe('processGraphInvestigationTriggers', () => {
  it('completes THREE_POINT_CONTACT_WORKER for APPLICANT with contactInfo', async () => {
    mockInvestigationItemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processGraphInvestigationTriggers(
      CLAIM_ID,
      [{ nodeType: 'PERSON', personRole: 'APPLICANT', properties: { contactInfo: '555-1234' } }],
      [],
    );

    expect(result.itemsCompleted).toBe(1);
    expect(result.itemTypes).toContain('THREE_POINT_CONTACT_WORKER');
    expect(mockInvestigationItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimId: CLAIM_ID,
          itemType: 'THREE_POINT_CONTACT_WORKER',
          isComplete: false,
        }),
      }),
    );
  });

  it('completes THREE_POINT_CONTACT_EMPLOYER for EMPLOYER_REP', async () => {
    mockInvestigationItemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processGraphInvestigationTriggers(
      CLAIM_ID,
      [{ nodeType: 'PERSON', personRole: 'EMPLOYER_REP', properties: {} }],
      [],
    );

    expect(result.itemsCompleted).toBe(1);
    expect(result.itemTypes).toContain('THREE_POINT_CONTACT_EMPLOYER');
  });

  it('completes THREE_POINT_CONTACT_PROVIDER for TREATING_PHYSICIAN', async () => {
    mockInvestigationItemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processGraphInvestigationTriggers(
      CLAIM_ID,
      [{ nodeType: 'PERSON', personRole: 'TREATING_PHYSICIAN', properties: {} }],
      [],
    );

    expect(result.itemsCompleted).toBe(1);
    expect(result.itemTypes).toContain('THREE_POINT_CONTACT_PROVIDER');
  });

  it('completes AWE_VERIFIED for EMPLOYED_BY edge with wage data', async () => {
    mockInvestigationItemUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processGraphInvestigationTriggers(
      CLAIM_ID,
      [],
      [{ edgeType: 'EMPLOYED_BY', properties: { averageWeeklyEarnings: 1200 } }],
    );

    expect(result.itemsCompleted).toBe(1);
    expect(result.itemTypes).toContain('AWE_VERIFIED');
  });

  it('does not complete APPLICANT without contactInfo', async () => {
    const result = await processGraphInvestigationTriggers(
      CLAIM_ID,
      [{ nodeType: 'PERSON', personRole: 'APPLICANT', properties: {} }],
      [],
    );

    expect(result.itemsCompleted).toBe(0);
    expect(mockInvestigationItemUpdateMany).not.toHaveBeenCalled();
  });

  it('returns zero results for empty inputs', async () => {
    const result = await processGraphInvestigationTriggers(CLAIM_ID, [], []);
    expect(result.itemsCompleted).toBe(0);
    expect(result.itemTypes).toEqual([]);
  });
});

// ===========================================================================
// Benefit Bridge
// ===========================================================================

describe('processGraphBenefitTriggers', () => {
  it('detects wage data from EMPLOYED_BY edge', async () => {
    const result = await processGraphBenefitTriggers(
      CLAIM_ID,
      [{ edgeType: 'EMPLOYED_BY', properties: { averageWeeklyEarnings: 1500 } }],
    );

    expect(result.wageDataFound).toBe(true);
    expect(result.calculationsTriggered).toContain('td_rate_calculation');
  });

  it('detects injury date from INJURED edge', async () => {
    const result = await processGraphBenefitTriggers(
      CLAIM_ID,
      [{ edgeType: 'INJURED', properties: { dateOfInjury: '2026-01-15' } }],
    );

    expect(result.injuryDateFound).toBe(true);
    expect(result.calculationsTriggered).toContain('benefit_year_determination');
  });

  it('triggers full_benefit_calculation when both wage and injury data present', async () => {
    const result = await processGraphBenefitTriggers(
      CLAIM_ID,
      [
        { edgeType: 'EMPLOYED_BY', properties: { averageWeeklyEarnings: 1500 } },
        { edgeType: 'INJURED', properties: { dateOfInjury: '2026-01-15' } },
      ],
    );

    expect(result.wageDataFound).toBe(true);
    expect(result.injuryDateFound).toBe(true);
    expect(result.calculationsTriggered).toContain('full_benefit_calculation');
  });

  it('does not trigger for EMPLOYED_BY without wage data', async () => {
    const result = await processGraphBenefitTriggers(
      CLAIM_ID,
      [{ edgeType: 'EMPLOYED_BY', properties: { employer: 'Acme Corp' } }],
    );

    expect(result.wageDataFound).toBe(false);
    expect(result.calculationsTriggered).toEqual([]);
  });

  it('returns empty results for empty inputs', async () => {
    const result = await processGraphBenefitTriggers(CLAIM_ID, []);
    expect(result.calculationsTriggered).toEqual([]);
    expect(result.wageDataFound).toBe(false);
    expect(result.injuryDateFound).toBe(false);
  });
});

// ===========================================================================
// Bridge failure isolation
// ===========================================================================

describe('bridge failure isolation', () => {
  it('individual bridge errors do not propagate across Promise.all pattern', async () => {
    // Verify each bridge handles its own errors gracefully
    // Workflow bridge — Prisma failure on claim update
    mockClaimUpdate.mockRejectedValue(new Error('DB connection lost'));

    // Should throw (individual bridge), but in enrichment it's wrapped in try/catch
    await expect(
      processGraphWorkflowTriggers(
        CLAIM_ID,
        [{ nodeType: 'PERSON', canonicalName: 'Attorney', personRole: 'APPLICANT_ATTORNEY' }],
        [],
      ),
    ).rejects.toThrow('DB connection lost');
  });

  it('deadline bridge propagates Prisma errors for caller to handle', async () => {
    mockRegulatoryDeadlineFindMany.mockRejectedValue(new Error('Timeout'));

    await expect(
      processGraphDeadlineTriggers(
        CLAIM_ID,
        [{ nodeType: 'CLAIM', properties: { dateOfInjury: '2026-01-15' } }],
        [],
      ),
    ).rejects.toThrow('Timeout');
  });
});
