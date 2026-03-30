/**
 * Coverage Determination Service
 *
 * Per-body-part AOE/COE (Arising Out of Employment / Course of Employment)
 * coverage tracking. Maintains an append-only audit log of every coverage
 * determination with the basis, determining examiner, and optional counsel
 * referral backing.
 *
 * GREEN zone feature — coverage determinations are factual administrative
 * actions. Whether a body part is legally compensable is a legal determination
 * (RED zone) that must be made by defense counsel for disputed claims.
 *
 * Statutory authorities:
 * - LC 3600 — Compensability requirements (AOE/COE)
 * - LC 5401 — Claim form (DWC-1) body part disclosure
 * - 8 CCR 9812 — Employer's obligation to accept or deny body parts
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Body Part CRUD
// ---------------------------------------------------------------------------

/**
 * Get all body part records for a claim, ordered by creation date.
 */
export async function getClaimBodyParts(claimId: string) {
  return prisma.claimBodyPart.findMany({
    where: { claimId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Add a new body part to a claim's coverage tracking.
 */
export async function addBodyPart(claimId: string, bodyPartName: string, icdCode?: string) {
  return prisma.claimBodyPart.create({
    data: { claimId, bodyPartName, icdCode },
  });
}

// ---------------------------------------------------------------------------
// Coverage Determination
// ---------------------------------------------------------------------------

export interface RecordDeterminationInput {
  claimId: string;
  bodyPartId: string;
  newStatus: 'PENDING' | 'ADMITTED' | 'DENIED' | 'UNDER_INVESTIGATION';
  determinationDate: Date;
  determinedById: string;
  basis: string;
  counselReferralId?: string;
  notes?: string;
}

/**
 * Record a coverage determination for a specific body part.
 *
 * Creates an append-only CoverageDetermination record capturing the
 * previous and new status, the factual basis, and the examining user.
 * Then updates the ClaimBodyPart status.
 *
 * This is a factual administrative operation (GREEN zone). The question of
 * whether a denial is legally defensible is RED zone — refer to counsel.
 */
export async function recordDetermination(input: RecordDeterminationInput) {
  // 1. Get current body part status
  const bodyPart = await prisma.claimBodyPart.findUniqueOrThrow({ where: { id: input.bodyPartId } });

  // 2. Create CoverageDetermination (append-only)
  const determination = await prisma.coverageDetermination.create({
    data: {
      claimId: input.claimId,
      bodyPartId: input.bodyPartId,
      previousStatus: bodyPart.status,
      newStatus: input.newStatus,
      determinationDate: input.determinationDate,
      determinedById: input.determinedById,
      basis: input.basis,
      counselReferralId: input.counselReferralId,
      notes: input.notes,
    },
  });

  // 3. Update body part status
  await prisma.claimBodyPart.update({
    where: { id: input.bodyPartId },
    data: { status: input.newStatus, statusChangedAt: new Date() },
  });

  return determination;
}

/**
 * Get the determination history for a claim, optionally filtered to one body part.
 */
export async function getDeterminationHistory(claimId: string, bodyPartId?: string) {
  return prisma.coverageDetermination.findMany({
    where: { claimId, ...(bodyPartId ? { bodyPartId } : {}) },
    include: {
      bodyPart: true,
      determinedBy: { select: { id: true, name: true } },
      counselReferral: {
        select: {
          id: true,
          legalIssue: true,
          counselResponse: true,
          respondedAt: true,
        },
      },
    },
    orderBy: { determinationDate: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Coverage Summary
// ---------------------------------------------------------------------------

/**
 * Get a summary of body part coverage status for a claim.
 *
 * Returns counts by status, body part details per bucket, and any
 * counsel advice that has been received for coverage disputes.
 *
 * YELLOW zone — statistical/summary data about admitted vs denied body parts.
 * Whether treatment for a denied part is compensable is a legal question.
 */
export async function getCoverageSummary(claimId: string) {
  const bodyParts = await prisma.claimBodyPart.findMany({
    where: { claimId },
    include: {
      coverageDeterminations: {
        orderBy: { determinationDate: 'desc' },
        take: 1, // most recent determination
        include: {
          determinedBy: { select: { name: true } },
          counselReferral: {
            select: {
              legalIssue: true,
              counselResponse: true,
              respondedAt: true,
            },
          },
        },
      },
    },
  });

  const admitted = bodyParts.filter((bp) => bp.status === 'ADMITTED');
  const denied = bodyParts.filter((bp) => bp.status === 'DENIED');
  const pending = bodyParts.filter((bp) => bp.status === 'PENDING');
  const investigating = bodyParts.filter((bp) => bp.status === 'UNDER_INVESTIGATION');

  // Gather unique counsel referral responses
  const counselAdvice = bodyParts
    .flatMap((bp) => bp.coverageDeterminations)
    .filter((d) => d.counselReferral?.counselResponse)
    .map((d) => ({
      bodyPartName: bodyParts.find((bp) => bp.id === d.bodyPartId)?.bodyPartName,
      legalIssue: d.counselReferral!.legalIssue,
      counselResponse: d.counselReferral!.counselResponse,
      respondedAt: d.counselReferral!.respondedAt,
    }));

  return {
    counts: {
      admitted: admitted.length,
      denied: denied.length,
      pending: pending.length,
      underInvestigation: investigating.length,
      total: bodyParts.length,
    },
    bodyParts: {
      admitted: admitted.map((bp) => ({
        id: bp.id,
        name: bp.bodyPartName,
        icdCode: bp.icdCode,
        statusChangedAt: bp.statusChangedAt,
      })),
      denied: denied.map((bp) => ({
        id: bp.id,
        name: bp.bodyPartName,
        icdCode: bp.icdCode,
        statusChangedAt: bp.statusChangedAt,
      })),
      pending: pending.map((bp) => ({
        id: bp.id,
        name: bp.bodyPartName,
        icdCode: bp.icdCode,
        statusChangedAt: bp.statusChangedAt,
      })),
      underInvestigation: investigating.map((bp) => ({
        id: bp.id,
        name: bp.bodyPartName,
        icdCode: bp.icdCode,
        statusChangedAt: bp.statusChangedAt,
      })),
    },
    counselAdvice,
  };
}

// ---------------------------------------------------------------------------
// Migration helper
// ---------------------------------------------------------------------------

/**
 * Migrate body part names from the legacy JSON Claim.bodyParts field into
 * ClaimBodyPart records. Idempotent — skips names already present.
 *
 * Used during the Phase transition from JSON body parts to relational records.
 */
export async function migrateJsonBodyParts(claimId: string) {
  const claim = await prisma.claim.findUniqueOrThrow({
    where: { id: claimId },
    select: { bodyParts: true },
  });

  const existing = await prisma.claimBodyPart.findMany({ where: { claimId } });
  const existingNames = new Set(existing.map((bp) => bp.bodyPartName.toLowerCase()));

  const bodyParts = (claim.bodyParts as string[]) || [];
  const toCreate = bodyParts.filter((name) => !existingNames.has(name.toLowerCase()));

  if (toCreate.length === 0) {
    return { migrated: 0, skipped: bodyParts.length };
  }

  await prisma.claimBodyPart.createMany({
    data: toCreate.map((name) => ({ claimId, bodyPartName: name })),
  });

  return { migrated: toCreate.length, skipped: bodyParts.length - toCreate.length };
}
