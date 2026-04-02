import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Sandbox service tests.
 *
 * Tests:
 * - isSandboxMode() reads SANDBOX_MODE env var
 * - seedSandboxData() is idempotent (skips existing TRAIN-* claims)
 * - clearSandboxData() removes only TRAIN-* claims
 * - getSandboxStatus() returns correct counts
 */

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma = {
  claim: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  regulatoryDeadline: { create: vi.fn(), deleteMany: vi.fn() },
  document: { create: vi.fn(), deleteMany: vi.fn() },
  investigationItem: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('../../server/db.js', () => ({ prisma: mockPrisma }));

// Mock sandbox claims data
vi.mock('../../server/data/sandbox-claims.js', () => ({
  SANDBOX_CLAIMS: [
    {
      claimNumber: 'TRAIN-001',
      claimantName: 'Test Claimant (Training)',
      dateOfInjury: new Date('2025-01-15'),
      bodyParts: ['lumbar spine'],
      employer: 'Training Corp',
      insurer: 'Training Insurance',
      status: 'OPEN',
      isCumulativeTrauma: false,
      hasApplicantAttorney: false,
      isLitigated: false,
      currentReserveIndemnity: 10000,
      currentReserveMedical: 5000,
      currentReserveLegal: 0,
      currentReserveLien: 0,
      deadlines: [
        { type: 'ACKNOWLEDGE_15DAY', dueDate: '2025-01-30', status: 'PENDING' },
      ],
      documents: [
        { fileName: 'training-medical-report.pdf', documentType: 'MEDICAL_REPORT' },
      ],
    },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const {
  isSandboxMode,
  seedSandboxData,
  clearSandboxData,
  getSandboxStatus,
} = await import('../../server/services/sandbox.service.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sandbox.service', () => {
  const originalEnv = process.env['SANDBOX_MODE'];

  afterEach(() => {
    vi.clearAllMocks();
    if (originalEnv !== undefined) {
      process.env['SANDBOX_MODE'] = originalEnv;
    } else {
      delete process.env['SANDBOX_MODE'];
    }
  });

  // -----------------------------------------------------------------------
  // isSandboxMode
  // -----------------------------------------------------------------------

  describe('isSandboxMode', () => {
    it('returns true when SANDBOX_MODE=true', () => {
      process.env['SANDBOX_MODE'] = 'true';
      expect(isSandboxMode()).toBe(true);
    });

    it('returns false when SANDBOX_MODE is unset', () => {
      delete process.env['SANDBOX_MODE'];
      expect(isSandboxMode()).toBe(false);
    });

    it('returns false when SANDBOX_MODE=false', () => {
      process.env['SANDBOX_MODE'] = 'false';
      expect(isSandboxMode()).toBe(false);
    });

    it('returns false for non-"true" values', () => {
      process.env['SANDBOX_MODE'] = '1';
      expect(isSandboxMode()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // seedSandboxData — idempotency
  // -----------------------------------------------------------------------

  describe('seedSandboxData', () => {
    it('skips existing TRAIN-* claims (idempotent)', async () => {
      // Claim already exists
      mockPrisma.claim.findFirst.mockResolvedValue({ id: 'existing-claim' });

      const result = await seedSandboxData('org-1', 'user-1');

      expect(result.claims).toBe(0);
      expect(result.documents).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates new claims when none exist', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<void>) => {
        await fn(mockPrisma);
      });
      mockPrisma.claim.create.mockResolvedValue({ id: 'new-claim' });

      const result = await seedSandboxData('org-1', 'user-1');

      expect(result.claims).toBe(1);
      expect(result.documents).toBe(1);
    });

    it('all sandbox claims use TRAIN-* prefix', async () => {
      // Verify mock data template uses TRAIN- prefix
      mockPrisma.claim.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<void>) => {
        await fn(mockPrisma);
      });
      mockPrisma.claim.create.mockResolvedValue({ id: 'new-claim' });

      await seedSandboxData('org-1', 'user-1');

      const createCall = mockPrisma.claim.create.mock.calls[0]?.[0];
      expect(createCall?.data?.claimNumber).toMatch(/^TRAIN-/);
    });
  });

  // -----------------------------------------------------------------------
  // clearSandboxData
  // -----------------------------------------------------------------------

  describe('clearSandboxData', () => {
    it('deletes only TRAIN-* claims for the given org', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([
        { id: 'train-claim-1' },
        { id: 'train-claim-2' },
      ]);
      mockPrisma.$transaction.mockResolvedValue(undefined);

      await clearSandboxData('org-1');

      expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            claimNumber: { startsWith: 'TRAIN-' },
          }),
        }),
      );
    });

    it('does nothing when no sandbox claims exist', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);

      await clearSandboxData('org-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getSandboxStatus
  // -----------------------------------------------------------------------

  describe('getSandboxStatus', () => {
    it('returns sandbox mode status and claim count', async () => {
      process.env['SANDBOX_MODE'] = 'true';
      mockPrisma.claim.count.mockResolvedValue(3);

      const status = await getSandboxStatus('org-1');

      expect(status.isSandboxMode).toBe(true);
      expect(status.claimCount).toBe(3);
    });

    it('counts only TRAIN-* claims for the org', async () => {
      mockPrisma.claim.count.mockResolvedValue(0);

      await getSandboxStatus('org-1');

      expect(mockPrisma.claim.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            claimNumber: { startsWith: 'TRAIN-' },
          }),
        }),
      );
    });
  });
});
