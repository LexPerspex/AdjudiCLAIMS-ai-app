import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lien Management Service tests.
 *
 * Tests lien CRUD, status transitions, filing compliance, lien exposure,
 * and OMFS comparison integration via mocked Prisma.
 *
 * Verifies:
 * - Lien creation with proper Decimal conversion
 * - Valid and invalid status transitions
 * - Filing compliance checks per LC 4903.1
 * - Lien exposure aggregation by type
 * - OMFS comparison updates line items and lien totals
 * - Lien summary aggregation
 */

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockLienCreate = vi.fn();
const mockLienFindUnique = vi.fn();
const mockLienFindMany = vi.fn();
const mockLienUpdate = vi.fn();
const mockLineItemCreate = vi.fn();
const mockLineItemUpdate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    lien: {
      create: (...args: unknown[]) => mockLienCreate(...args) as unknown,
      findUnique: (...args: unknown[]) => mockLienFindUnique(...args) as unknown,
      findMany: (...args: unknown[]) => mockLienFindMany(...args) as unknown,
      update: (...args: unknown[]) => mockLienUpdate(...args) as unknown,
    },
    lienLineItem: {
      create: (...args: unknown[]) => mockLineItemCreate(...args) as unknown,
      update: (...args: unknown[]) => mockLineItemUpdate(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

const {
  createLien,
  getLien,
  getClaimLiens,
  updateLienStatus,
  addLineItems,
  runOmfsComparison,
  checkFilingCompliance,
  calculateLienExposure,
  getLienSummary,
  isValidStatusTransition,
} = await import('../../server/services/lien-management.service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Prisma lien record (with Decimal-like numbers). */
function mockLienRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lien-1',
    claimId: 'claim-1',
    lienClaimant: 'ABC Medical Group',
    lienType: 'MEDICAL_PROVIDER',
    totalAmountClaimed: 5000.00,
    totalOmfsAllowed: null,
    discrepancyAmount: null,
    filingDate: new Date('2025-06-01'),
    filingFeeStatus: 'PAID',
    status: 'RECEIVED',
    resolvedAmount: null,
    resolvedAt: null,
    wcabCaseNumber: null,
    notes: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  };
}

function mockLineItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li-1',
    lienId: 'lien-1',
    serviceDate: new Date('2025-05-15'),
    cptCode: '99213',
    description: 'Office visit',
    amountClaimed: 150.00,
    omfsRate: null,
    isOvercharge: false,
    overchargeAmount: null,
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
// createLien
// ==========================================================================

describe('Lien Management Service — createLien', () => {
  it('creates a lien and returns a LienRecord', async () => {
    mockLienCreate.mockResolvedValueOnce(mockLienRow());

    const result = await createLien('claim-1', {
      lienClaimant: 'ABC Medical Group',
      lienType: 'MEDICAL_PROVIDER',
      totalAmountClaimed: 5000.00,
      filingDate: '2025-06-01',
      filingFeeStatus: 'PAID',
    });

    expect(result.id).toBe('lien-1');
    expect(result.claimId).toBe('claim-1');
    expect(result.lienClaimant).toBe('ABC Medical Group');
    expect(result.totalAmountClaimed).toBe(5000);
    expect(mockLienCreate).toHaveBeenCalledOnce();
  });

  it('defaults filingFeeStatus to UNKNOWN when not provided', async () => {
    mockLienCreate.mockResolvedValueOnce(mockLienRow({ filingFeeStatus: 'UNKNOWN' }));

    await createLien('claim-1', {
      lienClaimant: 'XYZ Provider',
      lienType: 'MEDICAL_PROVIDER',
      totalAmountClaimed: 3000.00,
      filingDate: '2025-06-01',
    });

    expect(mockLienCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filingFeeStatus: 'UNKNOWN',
        }) as unknown,
      }),
    );
  });
});

// ==========================================================================
// getLien
// ==========================================================================

describe('Lien Management Service — getLien', () => {
  it('returns lien with line items when found', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow(),
      lineItems: [mockLineItemRow()],
    });

    const result = await getLien('lien-1');

    expect(result).not.toBeNull();
    const lien = result as NonNullable<typeof result>;
    expect(lien.id).toBe('lien-1');
    expect(lien.lineItems).toHaveLength(1);
    expect((lien.lineItems[0] as (typeof lien.lineItems)[number]).cptCode).toBe('99213');
  });

  it('returns null when lien not found', async () => {
    mockLienFindUnique.mockResolvedValueOnce(null);

    const result = await getLien('nonexistent');

    expect(result).toBeNull();
  });
});

// ==========================================================================
// getClaimLiens
// ==========================================================================

describe('Lien Management Service — getClaimLiens', () => {
  it('returns all liens for a claim', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      mockLienRow({ id: 'lien-1' }),
      mockLienRow({ id: 'lien-2', lienType: 'EDD', totalAmountClaimed: 2000 }),
    ]);

    const result = await getClaimLiens('claim-1');

    expect(result).toHaveLength(2);
    expect((result[0] as (typeof result)[number]).id).toBe('lien-1');
    expect((result[1] as (typeof result)[number]).id).toBe('lien-2');
  });

  it('returns empty array when no liens exist', async () => {
    mockLienFindMany.mockResolvedValueOnce([]);

    const result = await getClaimLiens('claim-1');

    expect(result).toHaveLength(0);
  });
});

// ==========================================================================
// updateLienStatus — valid transitions
// ==========================================================================

describe('Lien Management Service — updateLienStatus', () => {
  it('allows RECEIVED -> UNDER_REVIEW', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'RECEIVED' });
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'UNDER_REVIEW' }));

    const result = await updateLienStatus('lien-1', 'UNDER_REVIEW');

    expect(result.status).toBe('UNDER_REVIEW');
  });

  it('allows UNDER_REVIEW -> OMFS_COMPARED', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'UNDER_REVIEW' });
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'OMFS_COMPARED' }));

    const result = await updateLienStatus('lien-1', 'OMFS_COMPARED');

    expect(result.status).toBe('OMFS_COMPARED');
  });

  it('allows OMFS_COMPARED -> NEGOTIATING', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'OMFS_COMPARED' });
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'NEGOTIATING' }));

    const result = await updateLienStatus('lien-1', 'NEGOTIATING');

    expect(result.status).toBe('NEGOTIATING');
  });

  it('allows NEGOTIATING -> PAID_REDUCED with resolvedAmount', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'NEGOTIATING' });
    mockLienUpdate.mockResolvedValueOnce(
      mockLienRow({ status: 'PAID_REDUCED', resolvedAmount: 3500, resolvedAt: new Date() }),
    );

    const result = await updateLienStatus('lien-1', 'PAID_REDUCED', 3500);

    expect(result.status).toBe('PAID_REDUCED');
    expect(result.resolvedAmount).toBe(3500);
  });

  it('allows DISPUTED -> WCAB_HEARING', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'DISPUTED' });
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'WCAB_HEARING' }));

    const result = await updateLienStatus('lien-1', 'WCAB_HEARING');

    expect(result.status).toBe('WCAB_HEARING');
  });

  it('allows WCAB_HEARING -> RESOLVED_BY_ORDER', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'WCAB_HEARING' });
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'RESOLVED_BY_ORDER' }));

    const result = await updateLienStatus('lien-1', 'RESOLVED_BY_ORDER');

    expect(result.status).toBe('RESOLVED_BY_ORDER');
  });

  it('allows any active status -> WITHDRAWN', async () => {
    for (const fromStatus of ['RECEIVED', 'UNDER_REVIEW', 'OMFS_COMPARED', 'NEGOTIATING', 'DISPUTED', 'WCAB_HEARING']) {
      mockLienFindUnique.mockResolvedValueOnce({ status: fromStatus });
      mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'WITHDRAWN' }));

      const result = await updateLienStatus('lien-1', 'WITHDRAWN');

      expect(result.status).toBe('WITHDRAWN');
    }
  });
});

// ==========================================================================
// updateLienStatus — invalid transitions
// ==========================================================================

describe('Lien Management Service — invalid status transitions', () => {
  it('rejects RECEIVED -> PAID_IN_FULL (must go through review)', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'RECEIVED' });

    await expect(updateLienStatus('lien-1', 'PAID_IN_FULL')).rejects.toThrow(
      'Invalid status transition',
    );
  });

  it('rejects RECEIVED -> NEGOTIATING (must go through review)', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'RECEIVED' });

    await expect(updateLienStatus('lien-1', 'NEGOTIATING')).rejects.toThrow(
      'Invalid status transition',
    );
  });

  it('rejects OMFS_COMPARED -> WCAB_HEARING (must go through dispute)', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ status: 'OMFS_COMPARED' });

    await expect(updateLienStatus('lien-1', 'WCAB_HEARING')).rejects.toThrow(
      'Invalid status transition',
    );
  });

  it('throws when lien not found', async () => {
    mockLienFindUnique.mockResolvedValueOnce(null);

    await expect(updateLienStatus('nonexistent', 'UNDER_REVIEW')).rejects.toThrow(
      'not found',
    );
  });
});

// ==========================================================================
// isValidStatusTransition
// ==========================================================================

describe('Lien Management Service — isValidStatusTransition', () => {
  it('returns true for valid transition', () => {
    expect(isValidStatusTransition('RECEIVED', 'UNDER_REVIEW')).toBe(true);
    expect(isValidStatusTransition('NEGOTIATING', 'PAID_IN_FULL')).toBe(true);
  });

  it('returns false for invalid transition', () => {
    expect(isValidStatusTransition('RECEIVED', 'PAID_IN_FULL')).toBe(false);
    expect(isValidStatusTransition('PAID_IN_FULL', 'RECEIVED')).toBe(false);
  });
});

// ==========================================================================
// addLineItems
// ==========================================================================

describe('Lien Management Service — addLineItems', () => {
  it('creates line items and returns records', async () => {
    mockLienFindUnique.mockResolvedValueOnce({ id: 'lien-1' });
    mockLineItemCreate.mockResolvedValueOnce(mockLineItemRow());

    const result = await addLineItems('lien-1', [
      { serviceDate: '2025-05-15', cptCode: '99213', description: 'Office visit', amountClaimed: 150 },
    ]);

    expect(result).toHaveLength(1);
    expect((result[0] as (typeof result)[number]).cptCode).toBe('99213');
    expect((result[0] as (typeof result)[number]).amountClaimed).toBe(150);
  });

  it('throws when lien not found', async () => {
    mockLienFindUnique.mockResolvedValueOnce(null);

    await expect(
      addLineItems('nonexistent', [
        { serviceDate: '2025-05-15', description: 'Visit', amountClaimed: 100 },
      ]),
    ).rejects.toThrow('not found');
  });
});

// ==========================================================================
// runOmfsComparison
// ==========================================================================

describe('Lien Management Service — runOmfsComparison', () => {
  it('runs OMFS comparison and updates line items', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ status: 'UNDER_REVIEW' }),
      lineItems: [
        mockLineItemRow({ id: 'li-1', cptCode: '99213', amountClaimed: 150.00 }),
        mockLineItemRow({ id: 'li-2', cptCode: '97110', amountClaimed: 60.00, description: 'Therapeutic exercises' }),
      ],
    });
    mockLineItemUpdate.mockResolvedValue({});
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'OMFS_COMPARED' }));

    const result = await runOmfsComparison('lien-1');

    expect(result.lineItems).toHaveLength(2);
    expect(result.totalClaimed).toBe(210.00);
    expect(result.totalOmfsAllowed).toBe(120.57); // 78.42 + 42.15
    expect(result.totalDiscrepancy).toBe(89.43);
    expect(result.disclaimer).toContain('OMFS rate comparison');
    expect(result.isStubData).toBe(true);

    // Should have updated 2 line items
    expect(mockLineItemUpdate).toHaveBeenCalledTimes(2);
    // Should have updated lien totals and status
    expect(mockLienUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OMFS_COMPARED',
        }) as unknown,
      }),
    );
  });

  it('throws when lien has no line items', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow(),
      lineItems: [],
    });

    await expect(runOmfsComparison('lien-1')).rejects.toThrow('no line items');
  });

  it('throws when lien not found', async () => {
    mockLienFindUnique.mockResolvedValueOnce(null);

    await expect(runOmfsComparison('nonexistent')).rejects.toThrow('not found');
  });

  it('does not change status if lien is not UNDER_REVIEW', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ status: 'OMFS_COMPARED' }),
      lineItems: [mockLineItemRow()],
    });
    mockLineItemUpdate.mockResolvedValue({});
    mockLienUpdate.mockResolvedValueOnce(mockLienRow({ status: 'OMFS_COMPARED' }));

    await runOmfsComparison('lien-1');

    // Should not include status in update
    expect(mockLienUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          status: expect.anything() as unknown,
        }) as unknown,
      }),
    );
  });
});

// ==========================================================================
// checkFilingCompliance
// ==========================================================================

describe('Lien Management Service — checkFilingCompliance', () => {
  it('returns compliant for valid lien with paid filing fee', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ filingFeeStatus: 'PAID' }),
      lineItems: [{ id: 'li-1' }],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags unpaid filing fee', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ filingFeeStatus: 'NOT_PAID' }),
      lineItems: [{ id: 'li-1' }],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('Filing fee not paid');
    expect(result.issues[0]).toContain('LC 4903.1');
  });

  it('flags unknown filing fee status', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ filingFeeStatus: 'UNKNOWN' }),
      lineItems: [{ id: 'li-1' }],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(false);
    expect(result.issues[0]).toContain('unknown');
  });

  it('flags medical provider lien with no line items', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ filingFeeStatus: 'PAID', lienType: 'MEDICAL_PROVIDER' }),
      lineItems: [],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(false);
    expect(result.issues.some((i) => i.includes('no line items'))).toBe(true);
  });

  it('does not flag missing line items for non-medical lien types', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({ filingFeeStatus: 'PAID', lienType: 'EDD' }),
      lineItems: [],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags multiple compliance issues', async () => {
    mockLienFindUnique.mockResolvedValueOnce({
      ...mockLienRow({
        filingFeeStatus: 'NOT_PAID',
        lienClaimant: '',
        lienType: 'MEDICAL_PROVIDER',
      }),
      lineItems: [],
    });

    const result = await checkFilingCompliance('lien-1');

    expect(result.isCompliant).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('throws when lien not found', async () => {
    mockLienFindUnique.mockResolvedValueOnce(null);

    await expect(checkFilingCompliance('nonexistent')).rejects.toThrow('not found');
  });
});

// ==========================================================================
// calculateLienExposure
// ==========================================================================

describe('Lien Management Service — calculateLienExposure', () => {
  it('calculates total exposure from active liens', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      { lienType: 'MEDICAL_PROVIDER', totalAmountClaimed: 5000 },
      { lienType: 'EDD', totalAmountClaimed: 3000 },
      { lienType: 'MEDICAL_PROVIDER', totalAmountClaimed: 2000 },
    ]);

    const result = await calculateLienExposure('claim-1');

    expect(result.totalExposure).toBe(10000);
    expect(result.activeLienCount).toBe(3);
    expect(result.byType['MEDICAL_PROVIDER']).toBe(7000);
    expect(result.byType['EDD']).toBe(3000);
  });

  it('returns zero exposure when no active liens', async () => {
    mockLienFindMany.mockResolvedValueOnce([]);

    const result = await calculateLienExposure('claim-1');

    expect(result.totalExposure).toBe(0);
    expect(result.activeLienCount).toBe(0);
  });
});

// ==========================================================================
// getLienSummary
// ==========================================================================

describe('Lien Management Service — getLienSummary', () => {
  it('returns summary with counts by status and type', async () => {
    mockLienFindMany.mockResolvedValueOnce([
      { lienType: 'MEDICAL_PROVIDER', status: 'RECEIVED', totalAmountClaimed: 5000, totalOmfsAllowed: null, discrepancyAmount: null },
      { lienType: 'MEDICAL_PROVIDER', status: 'OMFS_COMPARED', totalAmountClaimed: 3000, totalOmfsAllowed: 2000, discrepancyAmount: 1000 },
      { lienType: 'EDD', status: 'PAID_IN_FULL', totalAmountClaimed: 2000, totalOmfsAllowed: null, discrepancyAmount: null },
    ]);

    const result = await getLienSummary('claim-1');

    expect(result.totalLiens).toBe(3);
    expect(result.totalClaimed).toBe(10000);
    expect(result.totalOmfsAllowed).toBe(2000);
    expect(result.totalDiscrepancy).toBe(1000);
    expect(result.activeLienCount).toBe(2); // RECEIVED + OMFS_COMPARED
    expect(result.byStatus['RECEIVED']).toBe(1);
    expect(result.byStatus['OMFS_COMPARED']).toBe(1);
    expect(result.byStatus['PAID_IN_FULL']).toBe(1);
    expect(result.byType['MEDICAL_PROVIDER']).toBe(2);
    expect(result.byType['EDD']).toBe(1);
  });

  it('returns zeroed summary for claim with no liens', async () => {
    mockLienFindMany.mockResolvedValueOnce([]);

    const result = await getLienSummary('claim-1');

    expect(result.totalLiens).toBe(0);
    expect(result.totalClaimed).toBe(0);
    expect(result.activeLienCount).toBe(0);
  });
});
