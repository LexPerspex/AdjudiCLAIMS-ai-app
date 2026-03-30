import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Medical Billing Overview Service tests.
 *
 * Tests aggregated medical cost data, reserve vs. exposure analysis,
 * provider summary aggregation, admitted vs. non-admitted breakdown,
 * payment recording, and timeline generation via mocked Prisma.
 *
 * Verifies:
 * - getMedicalBillingOverview returns lien summary with correct totals
 * - getMedicalBillingOverview calculates reserve vs exposure correctly
 * - getMedicalBillingOverview aggregates provider summary correctly
 * - getMedicalBillingOverview separates admitted vs non-admitted treatment
 * - getMedicalBillingOverview returns chronological timeline
 * - recordMedicalPayment creates payment record
 * - getMedicalPayments filters by bodyPartId
 * - getProviderSummary aggregates by provider name
 */

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockClaimFindUniqueOrThrow = vi.fn();
const mockLienFindMany = vi.fn();
const mockMedicalPaymentFindMany = vi.fn();
const mockMedicalPaymentCreate = vi.fn();
const mockBenefitPaymentFindMany = vi.fn();
const mockClaimBodyPartFindMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    claim: {
      findUniqueOrThrow: (...args: unknown[]) => mockClaimFindUniqueOrThrow(...args) as unknown,
    },
    lien: {
      findMany: (...args: unknown[]) => mockLienFindMany(...args) as unknown,
    },
    medicalPayment: {
      findMany: (...args: unknown[]) => mockMedicalPaymentFindMany(...args) as unknown,
      create: (...args: unknown[]) => mockMedicalPaymentCreate(...args) as unknown,
    },
    benefitPayment: {
      findMany: (...args: unknown[]) => mockBenefitPaymentFindMany(...args) as unknown,
    },
    claimBodyPart: {
      findMany: (...args: unknown[]) => mockClaimBodyPartFindMany(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

const {
  getMedicalBillingOverview,
  recordMedicalPayment,
  getMedicalPayments,
  getProviderSummary,
} = await import('../../server/services/medical-billing-overview.service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClaimRow(overrides: Record<string, unknown> = {}) {
  return {
    currentReserveMedical: 50000,
    currentReserveLien: 20000,
    totalPaidMedical: 5000,
    ...overrides,
  };
}

function mockLienRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lien-1',
    claimId: 'claim-1',
    lienClaimant: 'ABC Medical Group',
    lienType: 'MEDICAL_PROVIDER',
    totalAmountClaimed: 15000,
    totalOmfsAllowed: 12000,
    discrepancyAmount: 3000,
    filingDate: new Date('2026-01-10'),
    status: 'RECEIVED',
    resolvedAmount: null,
    resolvedAt: null,
    lineItems: [],
    ...overrides,
  };
}

function mockMedicalPaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mp-1',
    claimId: 'claim-1',
    bodyPartId: null,
    bodyPart: null,
    lienId: null,
    providerName: 'ABC Medical Group',
    paymentType: 'DIRECT_PAYMENT',
    amount: 1000,
    paymentDate: new Date('2026-02-15'),
    serviceDate: null,
    cptCode: null,
    description: 'Physical therapy session',
    checkNumber: null,
    notes: null,
    createdAt: new Date('2026-02-15'),
    ...overrides,
  };
}

function mockBodyPartRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bp-1',
    claimId: 'claim-1',
    bodyPartName: 'Lumbar Spine',
    icdCode: 'M54.5',
    status: 'ADMITTED',
    statusChangedAt: new Date('2026-01-15'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ==========================================================================
// getMedicalBillingOverview — lien summary
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalBillingOverview lien summary', () => {
  it('returns lien summary with correct totals', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    const liens = [
      mockLienRow({ id: 'lien-1', totalAmountClaimed: 15000, status: 'RECEIVED' }),
      mockLienRow({ id: 'lien-2', totalAmountClaimed: 8000, status: 'PAID_FULL', resolvedAmount: 8000 }),
    ];
    mockLienFindMany.mockResolvedValueOnce(liens);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.lienSummary.totalLiens).toBe(2);
    expect(overview.lienSummary.activeLiens).toBe(1);
    expect(overview.lienSummary.resolvedLiens).toBe(1);
    expect(overview.lienSummary.totalBilled).toBe(23000);
    expect(overview.lienSummary.totalResolved).toBe(8000);
  });

  it('includes OMFS summary aggregated from all line items', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    const liens = [
      mockLienRow({
        lineItems: [
          { id: 'li-1', amountClaimed: 300, omfsRate: 250, isOvercharge: true, overchargeAmount: 50, bodyPartId: null, bodyPart: null },
          { id: 'li-2', amountClaimed: 150, omfsRate: 150, isOvercharge: false, overchargeAmount: null, bodyPartId: null, bodyPart: null },
        ],
      }),
    ];
    mockLienFindMany.mockResolvedValueOnce(liens);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.omfsSummary.totalLineItems).toBe(2);
    expect(overview.omfsSummary.comparedLineItems).toBe(2);
    expect(overview.omfsSummary.totalBilled).toBe(450);
    expect(overview.omfsSummary.overchargeCount).toBe(1);
  });
});

// ==========================================================================
// getMedicalBillingOverview — reserve vs exposure
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalBillingOverview reserve vs exposure', () => {
  it('calculates reserve vs exposure correctly', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(
      mockClaimRow({ currentReserveMedical: 50000, currentReserveLien: 20000, totalPaidMedical: 5000 }),
    );
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({ totalAmountClaimed: 25000, status: 'RECEIVED' }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.reserveVsExposure.currentMedicalReserve).toBe(50000);
    expect(overview.reserveVsExposure.currentLienReserve).toBe(20000);
    expect(overview.reserveVsExposure.totalMedicalPaid).toBe(5000);
    expect(overview.reserveVsExposure.totalOutstandingLiens).toBe(25000);
    // netExposure = outstanding - lienReserve = 25000 - 20000 = 5000
    expect(overview.reserveVsExposure.netExposure).toBe(5000);
  });

  it('returns zero values when claim has no liens or payments', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(
      mockClaimRow({ currentReserveMedical: 0, currentReserveLien: 0, totalPaidMedical: 0 }),
    );
    mockLienFindMany.mockResolvedValueOnce([]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.reserveVsExposure.netExposure).toBe(0);
    expect(overview.lienSummary.totalLiens).toBe(0);
  });
});

// ==========================================================================
// getMedicalBillingOverview — provider summary
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalBillingOverview provider summary', () => {
  it('aggregates provider summary correctly from liens and direct payments', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({
        lienClaimant: 'ABC Medical Group',
        totalAmountClaimed: 10000,
        resolvedAmount: null,
        lineItems: [],
      }),
      mockLienRow({
        id: 'lien-2',
        lienClaimant: 'XYZ Pharmacy',
        totalAmountClaimed: 2000,
        resolvedAmount: null,
        lineItems: [],
      }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      mockMedicalPaymentRow({ lienId: null, providerName: 'ABC Medical Group', amount: 500 }),
    ]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    const providers = overview.providerSummary;
    const abcProvider = providers.find((p) => p.providerName === 'ABC Medical Group');
    expect(abcProvider).toBeDefined();
    expect(abcProvider?.totalBilled).toBe(10000);
    // Direct payment (no lienId) adds to totalPaid: 0 (resolved) + 500 (direct) = 500
    expect(abcProvider?.totalPaid).toBe(500);

    const xyzProvider = providers.find((p) => p.providerName === 'XYZ Pharmacy');
    expect(xyzProvider).toBeDefined();
    expect(xyzProvider?.totalBilled).toBe(2000);
  });

  it('does not double-count lien payments in provider summary', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({ lienClaimant: 'ABC Medical Group', totalAmountClaimed: 5000, resolvedAmount: 4000 }),
    ]);
    // Payment linked to lien — should NOT be added to totalPaid again
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      mockMedicalPaymentRow({ lienId: 'lien-1', providerName: 'ABC Medical Group', amount: 4000 }),
    ]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    const abcProvider = overview.providerSummary.find((p) => p.providerName === 'ABC Medical Group');
    // Lien paid: 4000, no direct payment (lienId set)
    expect(abcProvider?.totalPaid).toBe(4000);
  });
});

// ==========================================================================
// getMedicalBillingOverview — admitted vs non-admitted
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalBillingOverview admitted vs non-admitted', () => {
  it('separates admitted vs non-admitted treatment by body part status', async () => {
    const admittedBodyPart = mockBodyPartRow({ id: 'bp-1', status: 'ADMITTED' });
    const deniedBodyPart = mockBodyPartRow({ id: 'bp-2', bodyPartName: 'Right Knee', status: 'DENIED' });

    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({
        lineItems: [
          { id: 'li-1', amountClaimed: 500, omfsRate: null, isOvercharge: false, overchargeAmount: null, bodyPartId: 'bp-1', bodyPart: admittedBodyPart },
          { id: 'li-2', amountClaimed: 300, omfsRate: null, isOvercharge: false, overchargeAmount: null, bodyPartId: 'bp-2', bodyPart: deniedBodyPart },
        ],
      }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([admittedBodyPart, deniedBodyPart]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.admittedVsNonAdmitted.admittedTotal).toBe(500);
    expect(overview.admittedVsNonAdmitted.deniedTotal).toBe(300);
    expect(overview.admittedVsNonAdmitted.disclaimer).toContain('Consult defense counsel');
  });

  it('accumulates unlinked amounts for items with no body part', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({
        lineItems: [
          { id: 'li-1', amountClaimed: 400, omfsRate: null, isOvercharge: false, overchargeAmount: null, bodyPartId: null, bodyPart: null },
        ],
      }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      mockMedicalPaymentRow({ bodyPartId: null, bodyPart: null, amount: 100 }),
    ]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    expect(overview.admittedVsNonAdmitted.unlinkedTotal).toBe(500); // 400 + 100
  });
});

// ==========================================================================
// getMedicalBillingOverview — timeline
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalBillingOverview timeline', () => {
  it('returns chronological (newest-first) timeline of liens and payments', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({ filingDate: new Date('2026-01-10'), resolvedAt: null }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      mockMedicalPaymentRow({ paymentDate: new Date('2026-02-20') }),
    ]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    // Timeline sorted newest first: payment (Feb 20) > lien (Jan 10)
    expect(overview.timeline).toHaveLength(2);
    expect(overview.timeline[0]?.type).toBe('MEDICAL_PAYMENT');
    expect(overview.timeline[1]?.type).toBe('LIEN_FILED');
  });

  it('includes lien resolution event in timeline', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce(mockClaimRow());
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({
        filingDate: new Date('2026-01-10'),
        resolvedAt: new Date('2026-03-01'),
        status: 'PAID_REDUCED',
        resolvedAmount: 12000,
      }),
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);
    mockBenefitPaymentFindMany.mockResolvedValueOnce([]);
    mockClaimBodyPartFindMany.mockResolvedValueOnce([]);

    const overview = await getMedicalBillingOverview('claim-1');

    const resolvedEvent = overview.timeline.find((e) => e.type === 'LIEN_RESOLVED');
    expect(resolvedEvent).toBeDefined();
    expect(resolvedEvent?.amount).toBe(12000);
  });
});

// ==========================================================================
// recordMedicalPayment
// ==========================================================================

describe('Medical Billing Overview Service — recordMedicalPayment', () => {
  it('creates a medical payment record', async () => {
    const created = mockMedicalPaymentRow();
    mockMedicalPaymentCreate.mockResolvedValueOnce(created);

    const result = await recordMedicalPayment({
      claimId: 'claim-1',
      providerName: 'ABC Medical Group',
      paymentType: 'DIRECT_PAYMENT',
      amount: 1000,
      paymentDate: new Date('2026-02-15'),
      description: 'Physical therapy session',
    });

    expect(mockMedicalPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimId: 'claim-1',
        providerName: 'ABC Medical Group',
        paymentType: 'DIRECT_PAYMENT',
        amount: 1000,
        description: 'Physical therapy session',
      }),
    });
    expect(result.id).toBe('mp-1');
  });

  it('passes optional fields when provided', async () => {
    const created = mockMedicalPaymentRow({ bodyPartId: 'bp-1', lienId: 'lien-1', checkNumber: 'CHK-001' });
    mockMedicalPaymentCreate.mockResolvedValueOnce(created);

    await recordMedicalPayment({
      claimId: 'claim-1',
      bodyPartId: 'bp-1',
      lienId: 'lien-1',
      providerName: 'ABC Medical Group',
      paymentType: 'LIEN_PAYMENT',
      amount: 5000,
      paymentDate: new Date('2026-02-15'),
      description: 'Lien settlement',
      checkNumber: 'CHK-001',
    });

    const createArgs = mockMedicalPaymentCreate.mock.calls[0]?.[0] as
      | { data: { bodyPartId: string; lienId: string; checkNumber: string } }
      | undefined;
    expect(createArgs?.data.bodyPartId).toBe('bp-1');
    expect(createArgs?.data.lienId).toBe('lien-1');
    expect(createArgs?.data.checkNumber).toBe('CHK-001');
  });
});

// ==========================================================================
// getMedicalPayments
// ==========================================================================

describe('Medical Billing Overview Service — getMedicalPayments', () => {
  it('returns all payments for a claim when no filters provided', async () => {
    const payments = [mockMedicalPaymentRow(), mockMedicalPaymentRow({ id: 'mp-2' })];
    mockMedicalPaymentFindMany.mockResolvedValueOnce(payments);

    const result = await getMedicalPayments('claim-1');

    expect(result).toHaveLength(2);
    expect(mockMedicalPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { claimId: 'claim-1' } }),
    );
  });

  it('filters by bodyPartId when provided', async () => {
    mockMedicalPaymentFindMany.mockResolvedValueOnce([mockMedicalPaymentRow({ bodyPartId: 'bp-1' })]);

    await getMedicalPayments('claim-1', { bodyPartId: 'bp-1' });

    const callArgs = mockMedicalPaymentFindMany.mock.calls[0]?.[0] as
      | { where: { bodyPartId?: string } }
      | undefined;
    expect(callArgs?.where.bodyPartId).toBe('bp-1');
  });

  it('filters by providerName when provided', async () => {
    mockMedicalPaymentFindMany.mockResolvedValueOnce([mockMedicalPaymentRow()]);

    await getMedicalPayments('claim-1', { providerName: 'ABC Medical Group' });

    const callArgs = mockMedicalPaymentFindMany.mock.calls[0]?.[0] as
      | { where: { providerName?: string } }
      | undefined;
    expect(callArgs?.where.providerName).toBe('ABC Medical Group');
  });
});

// ==========================================================================
// getProviderSummary
// ==========================================================================

describe('Medical Billing Overview Service — getProviderSummary', () => {
  it('aggregates by provider name from liens and direct payments', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      {
        id: 'lien-1',
        lienClaimant: 'ABC Medical Group',
        totalAmountClaimed: 10000,
        resolvedAmount: 8000,
      },
      {
        id: 'lien-2',
        lienClaimant: 'XYZ Pharmacy',
        totalAmountClaimed: 2000,
        resolvedAmount: null,
      },
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      { id: 'mp-1', lienId: null, providerName: 'ABC Medical Group', amount: 500 },
    ]);

    const result = await getProviderSummary('claim-1');

    expect(result).toHaveLength(2);
    // sorted by totalBilled desc
    expect(result[0]?.providerName).toBe('ABC Medical Group');
    expect(result[0]?.totalBilled).toBe(10000);
    // lien resolvedAmount (8000) + direct payment (500) = 8500
    expect(result[0]?.totalPaid).toBe(8500);
    expect(result[0]?.outstanding).toBe(1500);
  });

  it('does not add lien-linked payments to provider totalPaid again', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      { id: 'lien-1', lienClaimant: 'ABC Medical Group', totalAmountClaimed: 5000, resolvedAmount: 4000 },
    ]);
    // This payment references a lien — must not double-count
    mockMedicalPaymentFindMany.mockResolvedValueOnce([
      { id: 'mp-1', lienId: 'lien-1', providerName: 'ABC Medical Group', amount: 4000 },
    ]);

    const result = await getProviderSummary('claim-1');

    expect(result[0]?.totalPaid).toBe(4000); // only from resolvedAmount, not payment
  });

  it('returns results sorted by totalBilled descending', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      { id: 'lien-1', lienClaimant: 'Small Clinic', totalAmountClaimed: 1000, resolvedAmount: null },
      { id: 'lien-2', lienClaimant: 'Big Hospital', totalAmountClaimed: 50000, resolvedAmount: null },
    ]);
    mockMedicalPaymentFindMany.mockResolvedValueOnce([]);

    const result = await getProviderSummary('claim-1');

    expect(result[0]?.providerName).toBe('Big Hospital');
    expect(result[1]?.providerName).toBe('Small Clinic');
  });
});
