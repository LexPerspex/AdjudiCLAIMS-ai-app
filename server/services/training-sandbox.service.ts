/**
 * Training-sandbox service — per-user synthetic claim workspace.
 *
 * AJC-19 / Phase 10.7. Lets an individual trainee toggle a "training mode"
 * which seeds a curated set of synthetic claims scoped to that user. Synthetic
 * claims are visibly marked (`(Training)` claimant suffix, `TRAIN-` claim
 * number prefix) and structurally tagged so they can never be mixed with real
 * data in reports, analytics, or AI feedback loops:
 *
 *   - `Claim.isSynthetic = true` — boolean filter for analytics
 *   - `Claim.syntheticOwnerId` — FK to the trainee that owns the workspace
 *   - `User.trainingModeEnabled` — session-mirrored flag controlling banner UX
 *
 * UPL anchor (per AJC-19 ticket): UPL classification rules apply identically
 * inside the sandbox so trainees practice with the same Green/Yellow/Red
 * disclaimers they will see in production.
 *
 * This service complements the org-wide ENV-gated sandbox in `sandbox.service.ts`
 * (still used for demo seeding by CLAIMS_ADMIN). The two are independent — a
 * user's per-user sandbox can be enabled with or without `SANDBOX_MODE=true`.
 */

import type { DeadlineType } from '@prisma/client';
import { prisma } from '../db.js';
import { SANDBOX_CLAIMS } from '../data/sandbox-claims.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TrainingSandboxStatus {
  /** True when the user has training mode toggled on. */
  trainingModeEnabled: boolean;
  /** Total number of synthetic claims owned by this user. */
  syntheticClaimCount: number;
  /** Number of distinct training scenarios available in the catalog. */
  availableScenarios: number;
}

export interface TrainingSandboxSeedResult {
  /** Number of new synthetic claims created during this call. */
  claimsCreated: number;
  /** Number of new synthetic documents created during this call. */
  documentsCreated: number;
  /** Number of synthetic deadlines created during this call. */
  deadlinesCreated: number;
}

export interface TrainingSandboxResetResult {
  /** Number of synthetic claims removed before re-seeding. */
  claimsRemoved: number;
  /** Counts from the re-seed pass. */
  reseed: TrainingSandboxSeedResult;
}

// ---------------------------------------------------------------------------
// Statutory authority map for deadlines
// (kept local so this service is self-contained — duplicates the table in
// sandbox.service.ts intentionally; both must stay in sync if DeadlineType
// values are added)
// ---------------------------------------------------------------------------

const DEADLINE_AUTHORITY: Record<DeadlineType, string> = {
  ACKNOWLEDGE_15DAY:      '10 CCR 2695.5(b) — Acknowledge within 15 days',
  DETERMINE_40DAY:        '10 CCR 2695.7 — Accept/deny within 40 days',
  TD_FIRST_14DAY:         'LC 4650 — First TD payment within 14 days',
  TD_SUBSEQUENT_14DAY:    'LC 4650(b) — Subsequent TD payments every 14 days',
  DELAY_NOTICE_30DAY:     '10 CCR 2695.7 — Delay notice within 30 days',
  UR_PROSPECTIVE_5DAY:    'LC 4610(g)(1) — UR decision within 5 business days',
  UR_RETROSPECTIVE_30DAY: 'LC 4610(g)(2) — Retrospective UR within 30 days',
  EMPLOYER_NOTIFY_15DAY:  '10 CCR 2695.5(b) — Notify employer within 15 days',
};

// ---------------------------------------------------------------------------
// Internal: seed helpers
// ---------------------------------------------------------------------------

/**
 * Creates the full set of synthetic claims for a single trainee, skipping any
 * that already exist (idempotent). Each claim is scoped to the trainee via
 * `syntheticOwnerId` and marked `isSynthetic = true`.
 */
async function seedSyntheticClaimsForUser(
  userId: string,
  organizationId: string,
): Promise<TrainingSandboxSeedResult> {
  let claimsCreated = 0;
  let documentsCreated = 0;
  let deadlinesCreated = 0;

  for (const template of SANDBOX_CLAIMS) {
    // Idempotency: skip if THIS user already owns a synthetic copy of this
    // template. Two trainees in the same org can each own a TRAIN-001
    // because the unique constraint is on (claimNumber, syntheticOwnerId)
    // by virtue of our per-user composite naming below.
    const composedClaimNumber = `${template.claimNumber}-${userId.slice(-8)}`;

    const existing = await prisma.claim.findFirst({
      where: {
        claimNumber: composedClaimNumber,
        syntheticOwnerId: userId,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.create({
        data: {
          organizationId,
          assignedExaminerId: userId,
          syntheticOwnerId: userId,
          isSynthetic: true,
          claimNumber: composedClaimNumber,
          claimantName: template.claimantName,
          dateOfInjury: template.dateOfInjury,
          bodyParts: template.bodyParts,
          employer: template.employer,
          insurer: template.insurer,
          status: template.status,
          isCumulativeTrauma: template.isCumulativeTrauma,
          hasApplicantAttorney: template.hasApplicantAttorney,
          isLitigated: template.isLitigated,
          currentReserveIndemnity: template.currentReserveIndemnity,
          currentReserveMedical: template.currentReserveMedical,
          currentReserveLegal: template.currentReserveLegal,
          currentReserveLien: template.currentReserveLien,
          dateReceived: template.dateOfInjury,
        },
      });

      for (const dl of template.deadlines) {
        await tx.regulatoryDeadline.create({
          data: {
            claimId: claim.id,
            deadlineType: dl.type,
            dueDate: new Date(dl.dueDate),
            status: dl.status,
            statutoryAuthority: DEADLINE_AUTHORITY[dl.type],
          },
        });
        deadlinesCreated++;
      }

      for (const doc of template.documents) {
        await tx.document.create({
          data: {
            claimId: claim.id,
            fileName: doc.fileName,
            fileUrl: `sandbox://training/${userId}/${composedClaimNumber}/${doc.fileName}`,
            fileSize: 0,
            mimeType: 'application/pdf',
            documentType: doc.documentType,
            accessLevel: 'SHARED',
            ocrStatus: 'COMPLETE',
          },
        });
        documentsCreated++;
      }

      claimsCreated++;
    });
  }

  return { claimsCreated, documentsCreated, deadlinesCreated };
}

/**
 * Removes every synthetic claim owned by the trainee and the related
 * dependents (documents, deadlines, investigation items). Real claims are
 * never touched — the WHERE clause requires `syntheticOwnerId = userId` and
 * `isSynthetic = true`.
 */
async function removeSyntheticClaimsForUser(userId: string): Promise<number> {
  const synthetic = await prisma.claim.findMany({
    where: {
      syntheticOwnerId: userId,
      isSynthetic: true,
    },
    select: { id: true },
  });

  if (synthetic.length === 0) return 0;

  const claimIds = synthetic.map((c) => c.id);

  await prisma.$transaction([
    prisma.regulatoryDeadline.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.document.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.investigationItem.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.claim.deleteMany({
      where: {
        id: { in: claimIds },
        // Belt-and-suspenders: re-assert the synthetic constraint here so a
        // race condition that flipped a real claim into the id list cannot
        // delete real data.
        isSynthetic: true,
        syntheticOwnerId: userId,
      },
    }),
  ]);

  return synthetic.length;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Read the current sandbox status for a trainee. Cheap — used to render the
 * banner on every page load via the session.
 */
export async function getTrainingSandboxStatus(userId: string): Promise<TrainingSandboxStatus> {
  const [user, count] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { trainingModeEnabled: true },
    }),
    prisma.claim.count({
      where: { syntheticOwnerId: userId, isSynthetic: true },
    }),
  ]);

  return {
    trainingModeEnabled: user?.trainingModeEnabled ?? false,
    syntheticClaimCount: count,
    availableScenarios: SANDBOX_CLAIMS.length,
  };
}

/**
 * Enable training mode for a user. Flips `trainingModeEnabled = true` and
 * seeds the synthetic claim catalog. Idempotent: re-enabling is a no-op for
 * the flag and re-seed is skipped for already-existing synthetic claims.
 */
export async function enableTrainingMode(
  userId: string,
  organizationId: string,
): Promise<TrainingSandboxSeedResult> {
  await prisma.user.update({
    where: { id: userId },
    data: { trainingModeEnabled: true },
  });

  return await seedSyntheticClaimsForUser(userId, organizationId);
}

/**
 * Disable training mode for a user. Flips the flag off but PRESERVES the
 * synthetic claims — the trainee can re-enable later and pick up where they
 * left off. Use `resetSandbox` to delete and re-seed.
 */
export async function disableTrainingMode(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { trainingModeEnabled: false },
  });
}

/**
 * Reset a user's sandbox to baseline: deletes all of their synthetic claims
 * and re-seeds the catalog. Does NOT change the `trainingModeEnabled` flag.
 *
 * Safe even if the user is not currently in training mode — the WHERE clause
 * scopes deletes to `syntheticOwnerId = userId AND isSynthetic = true`.
 */
export async function resetSandbox(
  userId: string,
  organizationId: string,
): Promise<TrainingSandboxResetResult> {
  const claimsRemoved = await removeSyntheticClaimsForUser(userId);
  const reseed = await seedSyntheticClaimsForUser(userId, organizationId);
  return { claimsRemoved, reseed };
}
