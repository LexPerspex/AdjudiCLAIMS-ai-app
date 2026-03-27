import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Compliance report service tests — covers all 4 report generators.
 *
 * Tests verify:
 *   1. generateClaimFileSummary — CCR 10101 claim file summary
 *   2. generateClaimActivityLog — CCR 10103 chronological activity log
 *   3. generateDeadlineAdherenceReport — org-wide deadline stats
 *   4. generateAuditReadinessReport — DOI audit readiness score (0-100)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockClaimFindUniqueOrThrow = vi.fn();
const mockDocumentFindMany = vi.fn();
const mockInvestigationItemFindMany = vi.fn();
const mockRegulatoryDeadlineFindMany = vi.fn();
const mockBenefitPaymentFindMany = vi.fn();
const mockAuditEventCount = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockRegulatoryDeadlineGroupBy = vi.fn();
const mockInvestigationItemGroupBy = vi.fn();
const mockDocumentGroupBy = vi.fn();
const mockClaimCount = vi.fn();
const mockLienGroupBy = vi.fn();
const mockQueryRawUnsafe = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    claim: {
      findUniqueOrThrow: (...args: unknown[]): unknown => mockClaimFindUniqueOrThrow(...args),
      count: (...args: unknown[]): unknown => mockClaimCount(...args),
    },
    document: {
      findMany: (...args: unknown[]): unknown => mockDocumentFindMany(...args),
      groupBy: (...args: unknown[]): unknown => mockDocumentGroupBy(...args),
    },
    investigationItem: {
      findMany: (...args: unknown[]): unknown => mockInvestigationItemFindMany(...args),
      groupBy: (...args: unknown[]): unknown => mockInvestigationItemGroupBy(...args),
    },
    regulatoryDeadline: {
      findMany: (...args: unknown[]): unknown => mockRegulatoryDeadlineFindMany(...args),
      groupBy: (...args: unknown[]): unknown => mockRegulatoryDeadlineGroupBy(...args),
    },
    benefitPayment: {
      findMany: (...args: unknown[]): unknown => mockBenefitPaymentFindMany(...args),
    },
    auditEvent: {
      count: (...args: unknown[]): unknown => mockAuditEventCount(...args),
      findMany: (...args: unknown[]): unknown => mockAuditEventFindMany(...args),
    },
    lien: {
      groupBy: (...args: unknown[]): unknown => mockLienGroupBy(...args),
    },
    $queryRawUnsafe: (...args: unknown[]): unknown => mockQueryRawUnsafe(...args),
  },
}));

// Import after mocks
import {
  generateClaimFileSummary,
  generateClaimActivityLog,
  generateDeadlineAdherenceReport,
  generateAuditReadinessReport,
} from '../../server/services/compliance-report.service.js';

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. generateClaimFileSummary
// ---------------------------------------------------------------------------

describe('generateClaimFileSummary', () => {
  const MOCK_CLAIM = {
    id: 'claim-1',
    claimNumber: 'WC-2026-001',
    claimantName: 'Jane Doe',
    dateOfInjury: new Date('2026-01-15'),
    status: 'OPEN',
    assignedExaminerId: 'user-1',
    dateReceived: new Date('2026-01-20'),
    dateAcknowledged: new Date('2026-01-22'),
    dateDetermined: null,
    dateClosed: null,
  };

  it('returns a complete claim file summary with all aggregations', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValue(MOCK_CLAIM);
    mockDocumentFindMany.mockResolvedValue([
      { documentType: 'MEDICAL_REPORT' },
      { documentType: 'MEDICAL_REPORT' },
      { documentType: 'DWC1_CLAIM_FORM' },
      { documentType: null },
    ]);
    mockInvestigationItemFindMany.mockResolvedValue([
      { isComplete: true },
      { isComplete: true },
      { isComplete: false },
    ]);
    mockRegulatoryDeadlineFindMany.mockResolvedValue([
      { status: 'MET' },
      { status: 'MET' },
      { status: 'MISSED' },
      { status: 'PENDING' },
    ]);
    mockBenefitPaymentFindMany.mockResolvedValue([
      { amount: 1000.5, isLate: false, penaltyAmount: 0 },
      { amount: 500.25, isLate: true, penaltyAmount: 50.03 },
    ]);
    mockAuditEventCount.mockResolvedValue(42);

    const result = await generateClaimFileSummary('claim-1');

    expect(result.claimId).toBe('claim-1');
    expect(result.claimNumber).toBe('WC-2026-001');
    expect(result.claimantName).toBe('Jane Doe');
    expect(result.status).toBe('OPEN');

    // Documents
    expect(result.documents.totalCount).toBe(4);
    expect(result.documents.byType['MEDICAL_REPORT']).toBe(2);
    expect(result.documents.byType['DWC1_CLAIM_FORM']).toBe(1);
    expect(result.documents.byType['UNCLASSIFIED']).toBe(1);

    // Investigation items
    expect(result.investigationItems.total).toBe(3);
    expect(result.investigationItems.complete).toBe(2);
    expect(result.investigationItems.incomplete).toBe(1);

    // Deadlines
    expect(result.deadlines.total).toBe(4);
    expect(result.deadlines.met).toBe(2);
    expect(result.deadlines.missed).toBe(1);
    expect(result.deadlines.pending).toBe(1);

    // Benefit payments
    expect(result.benefitPayments.total).toBe(2);
    expect(result.benefitPayments.totalAmount).toBe(1500.75);
    expect(result.benefitPayments.lateCount).toBe(1);
    expect(result.benefitPayments.totalPenalties).toBe(50.03);

    // Audit events
    expect(result.auditEventCount).toBe(42);

    // Metadata
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('handles empty claim with no related data', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValue(MOCK_CLAIM);
    mockDocumentFindMany.mockResolvedValue([]);
    mockInvestigationItemFindMany.mockResolvedValue([]);
    mockRegulatoryDeadlineFindMany.mockResolvedValue([]);
    mockBenefitPaymentFindMany.mockResolvedValue([]);
    mockAuditEventCount.mockResolvedValue(0);

    const result = await generateClaimFileSummary('claim-1');

    expect(result.documents.totalCount).toBe(0);
    expect(result.documents.byType).toEqual({});
    expect(result.investigationItems.total).toBe(0);
    expect(result.deadlines.total).toBe(0);
    expect(result.benefitPayments.total).toBe(0);
    expect(result.auditEventCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. generateClaimActivityLog
// ---------------------------------------------------------------------------

describe('generateClaimActivityLog', () => {
  it('returns events grouped by date in chronological order', async () => {
    const events = [
      {
        id: 'evt-1',
        eventType: 'CLAIM_CREATED',
        eventData: null,
        createdAt: new Date('2026-01-20T10:00:00Z'),
        ipAddress: '10.0.0.1',
      },
      {
        id: 'evt-2',
        eventType: 'DOCUMENT_UPLOADED',
        eventData: { fileName: 'report.pdf' },
        createdAt: new Date('2026-01-20T14:30:00Z'),
        ipAddress: '10.0.0.1',
      },
      {
        id: 'evt-3',
        eventType: 'DEADLINE_MET',
        eventData: null,
        createdAt: new Date('2026-01-22T09:00:00Z'),
        ipAddress: '10.0.0.2',
      },
    ];
    mockAuditEventFindMany.mockResolvedValue(events);

    const result = await generateClaimActivityLog('claim-1');

    expect(result.claimId).toBe('claim-1');
    expect(result.totalEvents).toBe(3);
    expect(result.eventsByDate).toHaveLength(2);

    // First date group
    expect((result.eventsByDate[0] as (typeof result.eventsByDate)[number]).date).toBe('2026-01-20');
    expect((result.eventsByDate[0] as (typeof result.eventsByDate)[number]).events).toHaveLength(2);

    // Second date group
    expect((result.eventsByDate[1] as (typeof result.eventsByDate)[number]).date).toBe('2026-01-22');
    expect((result.eventsByDate[1] as (typeof result.eventsByDate)[number]).events).toHaveLength(1);

    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('passes date range filter to the query', async () => {
    mockAuditEventFindMany.mockResolvedValue([]);

    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');

    const result = await generateClaimActivityLog('claim-1', { startDate, endDate });

    expect(result.startDate).toEqual(startDate);
    expect(result.endDate).toEqual(endDate);
    expect(result.totalEvents).toBe(0);
    expect(result.eventsByDate).toHaveLength(0);

    // Verify date filter was passed to Prisma
    expect(mockAuditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimId: 'claim-1',
          createdAt: { gte: startDate, lte: endDate },
        }) as unknown,
      }),
    );
  });

  it('returns empty log when no events exist', async () => {
    mockAuditEventFindMany.mockResolvedValue([]);

    const result = await generateClaimActivityLog('claim-1');

    expect(result.totalEvents).toBe(0);
    expect(result.eventsByDate).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. generateDeadlineAdherenceReport
// ---------------------------------------------------------------------------

describe('generateDeadlineAdherenceReport', () => {
  it('computes per-type stats and overall adherence rate', async () => {
    mockRegulatoryDeadlineFindMany.mockResolvedValue([
      { deadlineType: 'ACKNOWLEDGE_15DAY', status: 'MET', claimId: 'c-1' },
      { deadlineType: 'ACKNOWLEDGE_15DAY', status: 'MET', claimId: 'c-2' },
      { deadlineType: 'ACKNOWLEDGE_15DAY', status: 'MISSED', claimId: 'c-3' },
      { deadlineType: 'DETERMINE_40DAY', status: 'MET', claimId: 'c-1' },
      { deadlineType: 'DETERMINE_40DAY', status: 'PENDING', claimId: 'c-2' },
      { deadlineType: 'TD_FIRST_14DAY', status: 'MISSED', claimId: 'c-1' },
    ]);
    mockQueryRawUnsafe.mockResolvedValue([
      { claim_id: 'c-3', claim_number: 'WC-003', missed_count: BigInt(1) },
      { claim_id: 'c-1', claim_number: 'WC-001', missed_count: BigInt(1) },
    ]);

    const result = await generateDeadlineAdherenceReport('org-1');

    expect(result.orgId).toBe('org-1');
    expect(result.totalMet).toBe(3);
    expect(result.totalMissed).toBe(2);
    expect(result.totalPending).toBe(1);
    expect(result.totalWaived).toBe(0);

    // Overall: 3 met / (3 met + 2 missed) = 0.6
    expect(result.overallAdherenceRate).toBe(0.6);

    // Per-type breakdown
    expect(result.byDeadlineType).toHaveLength(3);

    type DeadlineTypeEntry = (typeof result.byDeadlineType)[number];
    const ack = result.byDeadlineType.find((t) => t.deadlineType === 'ACKNOWLEDGE_15DAY') as DeadlineTypeEntry;
    expect(ack).toBeDefined();
    expect(ack.met).toBe(2);
    expect(ack.missed).toBe(1);
    expect(ack.adherenceRate).toBeCloseTo(0.6667, 3);

    const td = result.byDeadlineType.find((t) => t.deadlineType === 'TD_FIRST_14DAY') as DeadlineTypeEntry;
    expect(td).toBeDefined();
    expect(td.met).toBe(0);
    expect(td.missed).toBe(1);
    expect(td.adherenceRate).toBe(0);

    // Worst performers
    expect(result.worstPerformers).toHaveLength(2);
    expect((result.worstPerformers[0] as (typeof result.worstPerformers)[number]).claimNumber).toBe('WC-003');
    expect((result.worstPerformers[0] as (typeof result.worstPerformers)[number]).missedCount).toBe(1);

    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('handles org with no deadlines', async () => {
    mockRegulatoryDeadlineFindMany.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);

    const result = await generateDeadlineAdherenceReport('org-1');

    expect(result.overallAdherenceRate).toBe(0);
    expect(result.totalMet).toBe(0);
    expect(result.totalMissed).toBe(0);
    expect(result.byDeadlineType).toHaveLength(0);
    expect(result.worstPerformers).toHaveLength(0);
  });

  it('passes date filters when provided', async () => {
    mockRegulatoryDeadlineFindMany.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);

    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-03-31');

    await generateDeadlineAdherenceReport('org-1', { startDate, endDate });

    expect(mockRegulatoryDeadlineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dueDate: { gte: startDate, lte: endDate },
        }) as unknown,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. generateAuditReadinessReport
// ---------------------------------------------------------------------------

describe('generateAuditReadinessReport', () => {
  it('computes composite score with all categories', async () => {
    // Deadline: 8 met, 2 missed => 80% => 24/30
    mockRegulatoryDeadlineGroupBy.mockResolvedValue([
      { status: 'MET', _count: { id: 8 } },
      { status: 'MISSED', _count: { id: 2 } },
      { status: 'PENDING', _count: { id: 3 } },
    ]);

    // Investigation: 7 complete, 3 incomplete => 70% => 18/25
    mockInvestigationItemGroupBy.mockResolvedValue([
      { isComplete: true, _count: { id: 7 } },
      { isComplete: false, _count: { id: 3 } },
    ]);

    // Documentation: 9 claims with docs / 10 total => 90% => 18/20
    mockDocumentGroupBy.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({ claimId: `c-${String(i)}` })),
    );
    mockClaimCount.mockResolvedValue(10);

    // UPL: 1 block / 50 classifications => 2% block rate => 98% => 15/15
    mockAuditEventCount.mockResolvedValueOnce(1); // blocked
    mockAuditEventCount.mockResolvedValueOnce(50); // total classifications

    // Lien: 3 received, 5 tracked (past RECEIVED) => 5/8 = 62.5% => 6/10
    mockLienGroupBy.mockResolvedValue([
      { status: 'RECEIVED', _count: { id: 3 } },
      { status: 'OMFS_COMPARED', _count: { id: 3 } },
      { status: 'PAID_IN_FULL', _count: { id: 2 } },
    ]);

    const result = await generateAuditReadinessReport('org-1');

    expect(result.orgId).toBe('org-1');
    expect(result.categories).toHaveLength(5);

    // Verify individual scores
    type CategoryEntry = (typeof result.categories)[number];
    const deadline = result.categories.find((c) => c.category === 'Deadline Adherence') as CategoryEntry;
    expect(deadline).toBeDefined();
    expect(deadline.score).toBe(24);
    expect(deadline.maxScore).toBe(30);

    const investigation = result.categories.find((c) => c.category === 'Investigation Completeness') as CategoryEntry;
    expect(investigation).toBeDefined();
    expect(investigation.score).toBe(18);
    expect(investigation.maxScore).toBe(25);

    const documentation = result.categories.find((c) => c.category === 'Documentation') as CategoryEntry;
    expect(documentation).toBeDefined();
    expect(documentation.score).toBe(18);
    expect(documentation.maxScore).toBe(20);

    const upl = result.categories.find((c) => c.category === 'UPL Compliance') as CategoryEntry;
    expect(upl).toBeDefined();
    expect(upl.score).toBe(15);
    expect(upl.maxScore).toBe(15);

    const lien = result.categories.find((c) => c.category === 'Lien Tracking') as CategoryEntry;
    expect(lien).toBeDefined();
    expect(lien.score).toBe(6);
    expect(lien.maxScore).toBe(10);

    // Composite: 24 + 18 + 18 + 15 + 6 = 81
    expect(result.compositeScore).toBe(81);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('returns zero scores when org has no data', async () => {
    mockRegulatoryDeadlineGroupBy.mockResolvedValue([]);
    mockInvestigationItemGroupBy.mockResolvedValue([]);
    mockDocumentGroupBy.mockResolvedValue([]);
    mockClaimCount.mockResolvedValue(0);
    mockAuditEventCount.mockResolvedValueOnce(0); // blocked
    mockAuditEventCount.mockResolvedValueOnce(0); // total classifications
    mockLienGroupBy.mockResolvedValue([]);

    const result = await generateAuditReadinessReport('org-empty');

    // UPL score is 15 when no events exist (0 blocks / 0 classifications = 0% block rate = 100% compliant)
    // All other categories are 0
    expect(result.compositeScore).toBe(15);
    for (const category of result.categories) {
      if (category.category === 'UPL Compliance') {
        expect(category.score).toBe(15); // No blocks = full compliance
      } else {
        expect(category.score).toBe(0);
      }
    }
  });

  it('clamps all scores to their max values', async () => {
    // All perfect
    mockRegulatoryDeadlineGroupBy.mockResolvedValue([
      { status: 'MET', _count: { id: 100 } },
    ]);
    mockInvestigationItemGroupBy.mockResolvedValue([
      { isComplete: true, _count: { id: 50 } },
    ]);
    mockDocumentGroupBy.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ claimId: `c-${String(i)}` })),
    );
    mockClaimCount.mockResolvedValue(20);
    mockAuditEventCount.mockResolvedValueOnce(0); // 0 blocks
    mockAuditEventCount.mockResolvedValueOnce(100); // 100 classifications
    mockLienGroupBy.mockResolvedValue([
      { status: 'PAID_IN_FULL', _count: { id: 10 } },
    ]);

    const result = await generateAuditReadinessReport('org-perfect');

    expect(result.compositeScore).toBe(100);

    type CatEntry = (typeof result.categories)[number];
    const deadline = result.categories.find((c) => c.category === 'Deadline Adherence') as CatEntry;
    expect(deadline.score).toBe(30);

    const investigation = result.categories.find((c) => c.category === 'Investigation Completeness') as CatEntry;
    expect(investigation.score).toBe(25);

    const documentation = result.categories.find((c) => c.category === 'Documentation') as CatEntry;
    expect(documentation.score).toBe(20);

    const upl = result.categories.find((c) => c.category === 'UPL Compliance') as CatEntry;
    expect(upl.score).toBe(15);

    const lien = result.categories.find((c) => c.category === 'Lien Tracking') as CatEntry;
    expect(lien.score).toBe(10);
  });
});
