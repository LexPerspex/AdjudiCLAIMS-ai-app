import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Coverage Determination Service tests.
 *
 * Tests per-body-part AOE/COE coverage tracking: CRUD, append-only
 * determination log, coverage summary, and JSON migration via mocked Prisma.
 *
 * Verifies:
 * - getClaimBodyParts returns body parts ordered by createdAt
 * - addBodyPart creates with PENDING status (default)
 * - recordDetermination creates append-only entry and updates body part status
 * - recordDetermination stores previousStatus correctly
 * - getDeterminationHistory returns chronological history (optionally filtered)
 * - getCoverageSummary groups body parts by status
 * - getCoverageSummary includes counsel advice from linked referrals
 * - migrateJsonBodyParts creates ClaimBodyPart records from JSON array
 * - migrateJsonBodyParts skips already-existing body parts
 */

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockBodyPartFindMany = vi.fn();
const mockBodyPartCreate = vi.fn();
const mockBodyPartFindUniqueOrThrow = vi.fn();
const mockBodyPartUpdate = vi.fn();
const mockBodyPartCreateMany = vi.fn();
const mockCoverageDeterminationCreate = vi.fn();
const mockCoverageDeterminationFindMany = vi.fn();
const mockClaimFindUniqueOrThrow = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    claimBodyPart: {
      findMany: (...args: unknown[]) => mockBodyPartFindMany(...args) as unknown,
      create: (...args: unknown[]) => mockBodyPartCreate(...args) as unknown,
      findUniqueOrThrow: (...args: unknown[]) => mockBodyPartFindUniqueOrThrow(...args) as unknown,
      update: (...args: unknown[]) => mockBodyPartUpdate(...args) as unknown,
      createMany: (...args: unknown[]) => mockBodyPartCreateMany(...args) as unknown,
    },
    coverageDetermination: {
      create: (...args: unknown[]) => mockCoverageDeterminationCreate(...args) as unknown,
      findMany: (...args: unknown[]) => mockCoverageDeterminationFindMany(...args) as unknown,
    },
    claim: {
      findUniqueOrThrow: (...args: unknown[]) => mockClaimFindUniqueOrThrow(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

const {
  getClaimBodyParts,
  addBodyPart,
  recordDetermination,
  getDeterminationHistory,
  getCoverageSummary,
  migrateJsonBodyParts,
} = await import('../../server/services/coverage-determination.service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockBodyPartRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bp-1',
    claimId: 'claim-1',
    bodyPartName: 'Lumbar Spine',
    icdCode: 'M54.5',
    status: 'PENDING',
    statusChangedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function mockDeterminationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'det-1',
    claimId: 'claim-1',
    bodyPartId: 'bp-1',
    previousStatus: 'PENDING',
    newStatus: 'ADMITTED',
    determinationDate: new Date('2026-02-01'),
    determinedById: 'user-1',
    basis: 'Medical evidence supports AOE/COE',
    counselReferralId: null,
    notes: null,
    createdAt: new Date('2026-02-01'),
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
// getClaimBodyParts
// ==========================================================================

describe('Coverage Determination Service — getClaimBodyParts', () => {
  it('returns body parts ordered by createdAt', async () => {
    const parts = [
      mockBodyPartRow({ id: 'bp-1', createdAt: new Date('2026-01-01') }),
      mockBodyPartRow({ id: 'bp-2', bodyPartName: 'Right Knee', createdAt: new Date('2026-01-02') }),
    ];
    mockBodyPartFindMany.mockResolvedValueOnce(parts);

    const result = await getClaimBodyParts('claim-1');

    expect(mockBodyPartFindMany).toHaveBeenCalledWith({
      where: { claimId: 'claim-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('bp-1');
    expect(result[1]?.id).toBe('bp-2');
  });

  it('returns empty array when claim has no body parts', async () => {
    mockBodyPartFindMany.mockResolvedValueOnce([]);

    const result = await getClaimBodyParts('claim-empty');

    expect(result).toHaveLength(0);
  });
});

// ==========================================================================
// addBodyPart
// ==========================================================================

describe('Coverage Determination Service — addBodyPart', () => {
  it('creates a body part and returns the record', async () => {
    const created = mockBodyPartRow();
    mockBodyPartCreate.mockResolvedValueOnce(created);

    const result = await addBodyPart('claim-1', 'Lumbar Spine', 'M54.5');

    expect(mockBodyPartCreate).toHaveBeenCalledWith({
      data: { claimId: 'claim-1', bodyPartName: 'Lumbar Spine', icdCode: 'M54.5' },
    });
    expect(result.bodyPartName).toBe('Lumbar Spine');
    expect(result.icdCode).toBe('M54.5');
  });

  it('creates a body part without icdCode', async () => {
    const created = mockBodyPartRow({ icdCode: undefined });
    mockBodyPartCreate.mockResolvedValueOnce(created);

    await addBodyPart('claim-1', 'Right Shoulder');

    expect(mockBodyPartCreate).toHaveBeenCalledWith({
      data: { claimId: 'claim-1', bodyPartName: 'Right Shoulder', icdCode: undefined },
    });
  });
});

// ==========================================================================
// recordDetermination
// ==========================================================================

describe('Coverage Determination Service — recordDetermination', () => {
  it('creates append-only determination and updates body part status', async () => {
    const bodyPart = mockBodyPartRow({ status: 'PENDING' });
    const determination = mockDeterminationRow({ previousStatus: 'PENDING', newStatus: 'ADMITTED' });

    mockBodyPartFindUniqueOrThrow.mockResolvedValueOnce(bodyPart);
    mockCoverageDeterminationCreate.mockResolvedValueOnce(determination);
    mockBodyPartUpdate.mockResolvedValueOnce({ ...bodyPart, status: 'ADMITTED' });

    const result = await recordDetermination({
      claimId: 'claim-1',
      bodyPartId: 'bp-1',
      newStatus: 'ADMITTED',
      determinationDate: new Date('2026-02-01'),
      determinedById: 'user-1',
      basis: 'Medical evidence supports AOE/COE',
    });

    expect(mockCoverageDeterminationCreate).toHaveBeenCalledOnce();
    expect(mockBodyPartUpdate).toHaveBeenCalledWith({
      where: { id: 'bp-1' },
      data: { status: 'ADMITTED', statusChangedAt: expect.any(Date) },
    });
    expect(result.id).toBe('det-1');
  });

  it('stores previousStatus from the current body part status', async () => {
    const bodyPart = mockBodyPartRow({ status: 'UNDER_INVESTIGATION' });
    const determination = mockDeterminationRow({
      previousStatus: 'UNDER_INVESTIGATION',
      newStatus: 'DENIED',
    });

    mockBodyPartFindUniqueOrThrow.mockResolvedValueOnce(bodyPart);
    mockCoverageDeterminationCreate.mockResolvedValueOnce(determination);
    mockBodyPartUpdate.mockResolvedValueOnce({ ...bodyPart, status: 'DENIED' });

    const result = await recordDetermination({
      claimId: 'claim-1',
      bodyPartId: 'bp-1',
      newStatus: 'DENIED',
      determinationDate: new Date('2026-02-15'),
      determinedById: 'user-1',
      basis: 'No objective medical evidence',
    });

    // The create call should have captured previousStatus from bodyPart.status
    const createArgs = mockCoverageDeterminationCreate.mock.calls[0]?.[0] as
      | { data: { previousStatus: string; newStatus: string } }
      | undefined;
    expect(createArgs?.data.previousStatus).toBe('UNDER_INVESTIGATION');
    expect(createArgs?.data.newStatus).toBe('DENIED');
    expect(result.previousStatus).toBe('UNDER_INVESTIGATION');
  });

  it('stores counselReferralId when provided', async () => {
    const bodyPart = mockBodyPartRow({ status: 'PENDING' });
    const determination = mockDeterminationRow({ counselReferralId: 'ref-1' });

    mockBodyPartFindUniqueOrThrow.mockResolvedValueOnce(bodyPart);
    mockCoverageDeterminationCreate.mockResolvedValueOnce(determination);
    mockBodyPartUpdate.mockResolvedValueOnce({ ...bodyPart, status: 'ADMITTED' });

    await recordDetermination({
      claimId: 'claim-1',
      bodyPartId: 'bp-1',
      newStatus: 'ADMITTED',
      determinationDate: new Date('2026-02-01'),
      determinedById: 'user-1',
      basis: 'Counsel confirmed AOE/COE',
      counselReferralId: 'ref-1',
    });

    const createArgs2 = mockCoverageDeterminationCreate.mock.calls[0]?.[0] as
      | { data: { counselReferralId: string } }
      | undefined;
    expect(createArgs2?.data.counselReferralId).toBe('ref-1');
  });
});

// ==========================================================================
// getDeterminationHistory
// ==========================================================================

describe('Coverage Determination Service — getDeterminationHistory', () => {
  it('returns chronological determination history for a claim', async () => {
    const determinations = [
      mockDeterminationRow({ id: 'det-2', determinationDate: new Date('2026-03-01') }),
      mockDeterminationRow({ id: 'det-1', determinationDate: new Date('2026-02-01') }),
    ];
    mockCoverageDeterminationFindMany.mockResolvedValueOnce(determinations);

    const result = await getDeterminationHistory('claim-1');

    expect(mockCoverageDeterminationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { claimId: 'claim-1' },
        orderBy: { determinationDate: 'desc' },
      }),
    );
    expect(result).toHaveLength(2);
  });

  it('filters determination history by bodyPartId when provided', async () => {
    const determinations = [mockDeterminationRow({ bodyPartId: 'bp-2' })];
    mockCoverageDeterminationFindMany.mockResolvedValueOnce(determinations);

    await getDeterminationHistory('claim-1', 'bp-2');

    expect(mockCoverageDeterminationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { claimId: 'claim-1', bodyPartId: 'bp-2' },
      }),
    );
  });

  it('does not add bodyPartId filter when not provided', async () => {
    mockCoverageDeterminationFindMany.mockResolvedValueOnce([]);

    await getDeterminationHistory('claim-1');

    const callArgs = mockCoverageDeterminationFindMany.mock.calls[0]?.[0] as
      | { where: Record<string, unknown> }
      | undefined;
    expect(callArgs?.where.bodyPartId).toBeUndefined();
  });
});

// ==========================================================================
// getCoverageSummary
// ==========================================================================

describe('Coverage Determination Service — getCoverageSummary', () => {
  it('groups body parts by status correctly', async () => {
    const bodyParts = [
      mockBodyPartRow({ id: 'bp-1', status: 'ADMITTED', coverageDeterminations: [] }),
      mockBodyPartRow({ id: 'bp-2', bodyPartName: 'Right Knee', status: 'DENIED', coverageDeterminations: [] }),
      mockBodyPartRow({ id: 'bp-3', bodyPartName: 'Left Shoulder', status: 'PENDING', coverageDeterminations: [] }),
      mockBodyPartRow({
        id: 'bp-4',
        bodyPartName: 'Cervical Spine',
        status: 'UNDER_INVESTIGATION',
        coverageDeterminations: [],
      }),
    ];
    mockBodyPartFindMany.mockResolvedValueOnce(bodyParts);

    const summary = await getCoverageSummary('claim-1');

    expect(summary.counts.admitted).toBe(1);
    expect(summary.counts.denied).toBe(1);
    expect(summary.counts.pending).toBe(1);
    expect(summary.counts.underInvestigation).toBe(1);
    expect(summary.counts.total).toBe(4);
    expect(summary.bodyParts.admitted).toHaveLength(1);
    expect(summary.bodyParts.denied).toHaveLength(1);
    expect(summary.bodyParts.pending).toHaveLength(1);
    expect(summary.bodyParts.underInvestigation).toHaveLength(1);
  });

  it('includes counsel advice from linked referrals', async () => {
    const bodyParts = [
      {
        ...mockBodyPartRow({ id: 'bp-1', status: 'DENIED' }),
        coverageDeterminations: [
          {
            id: 'det-1',
            bodyPartId: 'bp-1',
            determinedBy: { name: 'Jane Examiner' },
            counselReferral: {
              legalIssue: 'AOE/COE dispute for lumbar spine',
              counselResponse: 'Denial is defensible based on medical records',
              respondedAt: new Date('2026-02-10'),
            },
          },
        ],
      },
    ];
    mockBodyPartFindMany.mockResolvedValueOnce(bodyParts);

    const summary = await getCoverageSummary('claim-1');

    expect(summary.counselAdvice).toHaveLength(1);
    expect(summary.counselAdvice[0]?.counselResponse).toBe(
      'Denial is defensible based on medical records',
    );
    expect(summary.counselAdvice[0]?.bodyPartName).toBe('Lumbar Spine');
  });

  it('excludes determinations with no counsel response', async () => {
    const bodyParts = [
      {
        ...mockBodyPartRow({ id: 'bp-1', status: 'PENDING' }),
        coverageDeterminations: [
          {
            id: 'det-1',
            bodyPartId: 'bp-1',
            determinedBy: { name: 'Jane Examiner' },
            counselReferral: {
              legalIssue: 'AOE/COE question',
              counselResponse: null, // no response yet
              respondedAt: null,
            },
          },
        ],
      },
    ];
    mockBodyPartFindMany.mockResolvedValueOnce(bodyParts);

    const summary = await getCoverageSummary('claim-1');

    expect(summary.counselAdvice).toHaveLength(0);
  });

  it('returns zero counts for empty claim', async () => {
    mockBodyPartFindMany.mockResolvedValueOnce([]);

    const summary = await getCoverageSummary('claim-empty');

    expect(summary.counts.total).toBe(0);
    expect(summary.counts.admitted).toBe(0);
    expect(summary.counselAdvice).toHaveLength(0);
  });
});

// ==========================================================================
// migrateJsonBodyParts
// ==========================================================================

describe('Coverage Determination Service — migrateJsonBodyParts', () => {
  it('creates ClaimBodyPart records from JSON body parts array', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce({
      bodyParts: ['Lumbar Spine', 'Right Knee', 'Left Shoulder'],
    });
    mockBodyPartFindMany.mockResolvedValueOnce([]); // none exist yet
    mockBodyPartCreateMany.mockResolvedValueOnce({ count: 3 });

    const result = await migrateJsonBodyParts('claim-1');

    expect(mockBodyPartCreateMany).toHaveBeenCalledWith({
      data: [
        { claimId: 'claim-1', bodyPartName: 'Lumbar Spine' },
        { claimId: 'claim-1', bodyPartName: 'Right Knee' },
        { claimId: 'claim-1', bodyPartName: 'Left Shoulder' },
      ],
    });
    expect(result.migrated).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('skips body parts that already exist (case-insensitive)', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce({
      bodyParts: ['Lumbar Spine', 'Right Knee'],
    });
    mockBodyPartFindMany.mockResolvedValueOnce([
      mockBodyPartRow({ bodyPartName: 'lumbar spine' }), // already exists (different case)
    ]);
    mockBodyPartCreateMany.mockResolvedValueOnce({ count: 1 });

    const result = await migrateJsonBodyParts('claim-1');

    expect(mockBodyPartCreateMany).toHaveBeenCalledWith({
      data: [{ claimId: 'claim-1', bodyPartName: 'Right Knee' }],
    });
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('returns zero migrated when all body parts already exist', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce({
      bodyParts: ['Lumbar Spine'],
    });
    mockBodyPartFindMany.mockResolvedValueOnce([mockBodyPartRow({ bodyPartName: 'lumbar spine' })]);

    const result = await migrateJsonBodyParts('claim-1');

    expect(mockBodyPartCreateMany).not.toHaveBeenCalled();
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('handles claim with no JSON body parts', async () => {
    mockClaimFindUniqueOrThrow.mockResolvedValueOnce({
      bodyParts: null,
    });
    mockBodyPartFindMany.mockResolvedValueOnce([]);

    const result = await migrateJsonBodyParts('claim-1');

    expect(mockBodyPartCreateMany).not.toHaveBeenCalled();
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
