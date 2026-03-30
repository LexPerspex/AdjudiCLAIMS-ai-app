/**
 * Sandbox service — training environment data management.
 *
 * Provides functions for seeding and clearing synthetic training claims
 * in a sandbox environment. Sandbox mode is controlled by the
 * SANDBOX_MODE environment variable.
 *
 * All sandbox claims use the TRAIN-* claim number prefix and claimant
 * names ending with "(Training)" so they are clearly distinguishable
 * from real claims in any environment.
 *
 * Security: sandbox endpoints require CLAIMS_ADMIN role.
 * These records are never mixed with real claims in reports or analytics.
 */

import { prisma } from '../db.js';
import { SANDBOX_CLAIMS } from '../data/sandbox-claims.js';

/* ------------------------------------------------------------------ */
/*  Environment check                                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns true when the server is running in sandbox mode.
 * Sandbox mode enables the /api/sandbox/* endpoints and seed data.
 */
export function isSandboxMode(): boolean {
  return process.env['SANDBOX_MODE'] === 'true';
}

/* ------------------------------------------------------------------ */
/*  Seed                                                                */
/* ------------------------------------------------------------------ */

/**
 * Seeds all synthetic training claims for the given organization.
 * Idempotent — if a claim with a TRAIN-* number already exists for the
 * org it is skipped (not duplicated).
 *
 * Returns the count of newly created claims and documents.
 */
export async function seedSandboxData(
  organizationId: string,
  seedingUserId: string,
): Promise<{ claims: number; documents: number }> {
  let claimCount = 0;
  let documentCount = 0;

  for (const template of SANDBOX_CLAIMS) {
    // Skip if this sandbox claim already exists for this org
    const existing = await prisma.claim.findFirst({
      where: { claimNumber: template.claimNumber, organizationId },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    // Create the claim with deadlines and documents in a single transaction
    await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.create({
        data: {
          organizationId,
          assignedExaminerId: seedingUserId,
          claimNumber: template.claimNumber,
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

      // Create deadlines — RegulatoryDeadline requires statutoryAuthority
      for (const dl of template.deadlines) {
        await tx.regulatoryDeadline.create({
          data: {
            claimId: claim.id,
            deadlineType: dl.type,
            dueDate: new Date(dl.dueDate),
            status: dl.status,
            statutoryAuthority: DEADLINE_AUTHORITY[dl.type] ?? 'See regulations',
          },
        });
      }

      // Create placeholder document records (no actual file content for sandbox)
      for (const doc of template.documents) {
        await tx.document.create({
          data: {
            claimId: claim.id,
            fileName: doc.fileName,
            fileUrl: `sandbox://training/${template.claimNumber}/${doc.fileName}`,
            fileSize: 0,
            mimeType: 'application/pdf',
            documentType: doc.documentType,
            accessLevel: 'SHARED',
            ocrStatus: 'COMPLETE',
          },
        });
        documentCount++;
      }

      claimCount++;
    });
  }

  return { claims: claimCount, documents: documentCount };
}

/* ------------------------------------------------------------------ */
/*  Clear                                                               */
/* ------------------------------------------------------------------ */

/**
 * Removes all sandbox claims (TRAIN-* prefix) for the given organization.
 * Cascades to associated documents, deadlines, and investigation items.
 */
export async function clearSandboxData(organizationId: string): Promise<void> {
  // Find all TRAIN-* claims for this org
  const sandboxClaims = await prisma.claim.findMany({
    where: {
      organizationId,
      claimNumber: { startsWith: 'TRAIN-' },
    },
    select: { id: true },
  });

  if (sandboxClaims.length === 0) return;

  const claimIds = sandboxClaims.map((c) => c.id);

  // Delete in dependency order to respect foreign key constraints
  await prisma.$transaction([
    prisma.regulatoryDeadline.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.document.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.investigationItem.deleteMany({ where: { claimId: { in: claimIds } } }),
    prisma.claim.deleteMany({ where: { id: { in: claimIds } } }),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * Returns the current sandbox status for an organization:
 * whether sandbox mode is enabled and how many sandbox claims exist.
 */
export async function getSandboxStatus(
  organizationId: string,
): Promise<{ isSandboxMode: boolean; claimCount: number }> {
  const claimCount = await prisma.claim.count({
    where: {
      organizationId,
      claimNumber: { startsWith: 'TRAIN-' },
    },
  });

  return { isSandboxMode: isSandboxMode(), claimCount };
}

/* ------------------------------------------------------------------ */
/*  Deadline statutory authority map                                    */
/* ------------------------------------------------------------------ */

import type { DeadlineType } from '@prisma/client';

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
