import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * training-sandbox.service tests (AJC-19).
 *
 * Verifies the per-user synthetic-claim workspace:
 *  - enableTrainingMode flips the flag and seeds claims scoped to the user
 *  - all seeded claims are marked isSynthetic=true and own=userId
 *  - resetSandbox deletes only the user's synthetic claims (never real or
 *    another user's claims)
 *  - disableTrainingMode flips the flag without touching claim data
 *  - getTrainingSandboxStatus returns flag + counts
 */

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: { update: vi.fn(), findUnique: vi.fn() },
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

// 3-template fixture catalog (lighter than the full 9 — keeps tests fast)
vi.mock('../../server/data/sandbox-claims.js', () => ({
  SANDBOX_CLAIMS: [
    {
      claimNumber: 'TRAIN-001',
      claimantName: 'Fixture A (Training)',
      dateOfInjury: new Date('2025-01-15'),
      bodyParts: ['lumbar spine'],
      employer: 'Training Co',
      insurer: 'Training Ins',
      status: 'OPEN',
      isCumulativeTrauma: false,
      hasApplicantAttorney: false,
      isLitigated: false,
      currentReserveIndemnity: 1000,
      currentReserveMedical: 500,
      currentReserveLegal: 0,
      currentReserveLien: 0,
      scenarioDescription: 'fixture',
      deadlines: [{ type: 'ACKNOWLEDGE_15DAY', dueDate: '2025-01-30', status: 'PENDING' }],
      documents: [{ fileName: 'a.pdf', documentType: 'MEDICAL_REPORT' }],
    },
    {
      claimNumber: 'TRAIN-002',
      claimantName: 'Fixture B (Training)',
      dateOfInjury: new Date('2025-02-15'),
      bodyParts: ['cervical spine'],
      employer: 'Training Co',
      insurer: 'Training Ins',
      status: 'OPEN',
      isCumulativeTrauma: true,
      hasApplicantAttorney: true,
      isLitigated: false,
      currentReserveIndemnity: 2000,
      currentReserveMedical: 1500,
      currentReserveLegal: 500,
      currentReserveLien: 0,
      scenarioDescription: 'fixture',
      deadlines: [],
      documents: [
        { fileName: 'b1.pdf', documentType: 'MEDICAL_REPORT' },
        { fileName: 'b2.pdf', documentType: 'CORRESPONDENCE' },
      ],
    },
    {
      claimNumber: 'TRAIN-003',
      claimantName: 'Fixture C (Training)',
      dateOfInjury: new Date('2025-03-15'),
      bodyParts: ['right knee'],
      employer: 'Training Co',
      insurer: 'Training Ins',
      status: 'ACCEPTED',
      isCumulativeTrauma: false,
      hasApplicantAttorney: false,
      isLitigated: false,
      currentReserveIndemnity: 3000,
      currentReserveMedical: 2500,
      currentReserveLegal: 0,
      currentReserveLien: 0,
      scenarioDescription: 'fixture',
      deadlines: [{ type: 'TD_FIRST_14DAY', dueDate: '2025-03-29', status: 'MET' }],
      documents: [{ fileName: 'c.pdf', documentType: 'MEDICAL_REPORT' }],
    },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const {
  enableTrainingMode,
  disableTrainingMode,
  resetSandbox,
  getTrainingSandboxStatus,
} = await import('../../server/services/training-sandbox.service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupTransactionPassthrough(): void {
  mockPrisma.$transaction.mockImplementation(
    async (fnOrOps: ((tx: typeof mockPrisma) => Promise<unknown>) | unknown[]) => {
      if (Array.isArray(fnOrOps)) {
        // Array form (used by removeSyntheticClaimsForUser) — just resolve.
        return [];
      }
      return await fnOrOps(mockPrisma);
    },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('training-sandbox.service', () => {
  // -----------------------------------------------------------------------
  // enableTrainingMode
  // -----------------------------------------------------------------------

  describe('enableTrainingMode', () => {
    it('flips the flag and seeds all claim templates as synthetic+owned', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', trainingModeEnabled: true });
      mockPrisma.claim.findFirst.mockResolvedValue(null);
      mockPrisma.claim.create.mockImplementation((args: { data: { claimNumber: string } }) => ({
        id: `claim-${args.data.claimNumber}`,
      }));
      setupTransactionPassthrough();

      const result = await enableTrainingMode('user-1', 'org-1');

      // Flag flipped on the User record
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { trainingModeEnabled: true },
      });

      // Every template in the fixture catalog was seeded
      expect(result.claimsCreated).toBe(3);
      // Total docs across the fixture: 1+2+1 = 4
      expect(result.documentsCreated).toBe(4);
      // Total deadlines across the fixture: 1+0+1 = 2
      expect(result.deadlinesCreated).toBe(2);

      // Every created claim is marked synthetic + owned by the trainee
      const createCalls = mockPrisma.claim.create.mock.calls;
      expect(createCalls.length).toBe(3);
      for (const [args] of createCalls as [{ data: Record<string, unknown> }][]) {
        expect(args.data['isSynthetic']).toBe(true);
        expect(args.data['syntheticOwnerId']).toBe('user-1');
        expect(args.data['organizationId']).toBe('org-1');
        expect(args.data['assignedExaminerId']).toBe('user-1');
        // Composite claim number includes the user-id suffix so trainees
        // can each own their own copy of TRAIN-001 etc.
        expect(args.data['claimNumber']).toMatch(/^TRAIN-\d{3}-/);
      }
    });

    it('is idempotent — skips templates that already have a synthetic copy for the user', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });
      // Pretend all 3 templates already exist for this user
      mockPrisma.claim.findFirst.mockResolvedValue({ id: 'existing' });
      setupTransactionPassthrough();

      const result = await enableTrainingMode('user-1', 'org-1');

      expect(result.claimsCreated).toBe(0);
      expect(result.documentsCreated).toBe(0);
      expect(result.deadlinesCreated).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // disableTrainingMode
  // -----------------------------------------------------------------------

  describe('disableTrainingMode', () => {
    it('flips the flag and does NOT touch claim data', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', trainingModeEnabled: false });

      await disableTrainingMode('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { trainingModeEnabled: false },
      });
      // Crucial: disabling never deletes the trainee's synthetic claims.
      expect(mockPrisma.claim.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // resetSandbox
  // -----------------------------------------------------------------------

  describe('resetSandbox', () => {
    it('removes ONLY the trainees synthetic claims, then re-seeds', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([
        { id: 'syn-1' },
        { id: 'syn-2' },
        { id: 'syn-3' },
      ]);
      mockPrisma.claim.findFirst.mockResolvedValue(null);
      mockPrisma.claim.create.mockImplementation((args: { data: { claimNumber: string } }) => ({
        id: `claim-${args.data.claimNumber}`,
      }));
      setupTransactionPassthrough();

      const result = await resetSandbox('user-1', 'org-1');

      // The findMany filter is the safety contract: never deletes real claims.
      expect(mockPrisma.claim.findMany).toHaveBeenCalledWith({
        where: { syntheticOwnerId: 'user-1', isSynthetic: true },
        select: { id: true },
      });

      expect(result.claimsRemoved).toBe(3);
      // Re-seed populates a fresh catalog.
      expect(result.reseed.claimsCreated).toBe(3);
    });

    it('skips deletion entirely when no synthetic claims exist', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);
      mockPrisma.claim.findFirst.mockResolvedValue(null);
      mockPrisma.claim.create.mockImplementation((args: { data: { claimNumber: string } }) => ({
        id: `claim-${args.data.claimNumber}`,
      }));
      setupTransactionPassthrough();

      const result = await resetSandbox('user-1', 'org-1');

      expect(result.claimsRemoved).toBe(0);
      // The deleteMany transaction was not invoked when there's nothing to remove
      // (only the seeding tx fires — tracked separately via claim.create calls).
      expect(mockPrisma.claim.deleteMany).not.toHaveBeenCalled();
    });

    it('belt-and-suspenders deleteMany asserts isSynthetic + syntheticOwnerId on the claim delete', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([{ id: 'syn-1' }]);
      mockPrisma.claim.findFirst.mockResolvedValue({ id: 'existing' }); // skip reseed for clarity

      // Capture the exact delete spec passed into the $transaction array.
      let capturedClaimDelete: unknown = null;
      mockPrisma.$transaction.mockImplementation(
        async (fnOrOps: ((tx: typeof mockPrisma) => Promise<unknown>) | unknown[]) => {
          if (Array.isArray(fnOrOps)) {
            // The 4th op (index 3) is the claim deleteMany.
            capturedClaimDelete = fnOrOps[3];
            return [];
          }
          return await fnOrOps(mockPrisma);
        },
      );

      // Stub deleteMany to record what would have been deleted
      const claimDeleteSpy = vi.fn().mockReturnValue({ marker: 'claim-delete' });
      mockPrisma.claim.deleteMany = claimDeleteSpy;

      await resetSandbox('user-1', 'org-1');

      expect(claimDeleteSpy).toHaveBeenCalledWith({
        where: {
          id: { in: ['syn-1'] },
          isSynthetic: true,
          syntheticOwnerId: 'user-1',
        },
      });
      expect(capturedClaimDelete).toEqual({ marker: 'claim-delete' });
    });
  });

  // -----------------------------------------------------------------------
  // getTrainingSandboxStatus
  // -----------------------------------------------------------------------

  describe('getTrainingSandboxStatus', () => {
    it('returns flag + counts for the user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ trainingModeEnabled: true });
      mockPrisma.claim.count.mockResolvedValue(3);

      const status = await getTrainingSandboxStatus('user-1');

      expect(status.trainingModeEnabled).toBe(true);
      expect(status.syntheticClaimCount).toBe(3);
      expect(status.availableScenarios).toBe(3); // matches our fixture catalog size

      // Counts only THIS users synthetic claims
      expect(mockPrisma.claim.count).toHaveBeenCalledWith({
        where: { syntheticOwnerId: 'user-1', isSynthetic: true },
      });
    });

    it('defaults trainingModeEnabled to false when user has no record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.claim.count.mockResolvedValue(0);

      const status = await getTrainingSandboxStatus('ghost-user');

      expect(status.trainingModeEnabled).toBe(false);
      expect(status.syntheticClaimCount).toBe(0);
    });
  });
});
