/**
 * Data retention service.
 *
 * Enforces the 7-year data retention policy for California Workers'
 * Compensation claim records.
 *
 * Regulatory basis:
 * - Cal. Lab. Code § 3762: insurers must retain claim files for minimum 5 years
 *   after claim closure date or final payment, whichever is later.
 * - We use 7 years (plus a 90-day grace period) for an additional safety margin.
 *
 * Retention logic:
 * - Only closed claims (dateClosed != null) are eligible for purge.
 * - The claim's closedAt date must be older than retentionYears.
 * - Claims already soft-deleted (deletedAt != null) are excluded.
 * - A 90-day grace period (gracePeriodDays) is applied before purge executes.
 *
 * What is purged (hard-delete):
 * - DocumentChunks → Documents → ChatSessions for the eligible claims
 * - The Claim records themselves
 *
 * What is NEVER purged (immutable by law):
 * - AuditEvent records
 * - RegulatoryDeadline records (compliance evidence)
 * - BenefitPayment records (financial records)
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetentionPolicy {
  /** Number of years after claim closure before records are eligible for purge. Default: 7 */
  retentionYears: number;
  /** Days of grace period after retention date before purge is authorized. Default: 90 */
  gracePeriodDays: number;
}

export interface ExpiredRecordSet {
  claims: string[];
  documents: string[];
  chatSessions: string[];
}

export interface PurgeResult {
  purgedClaims: number;
  purgedDocuments: number;
  purgedChunks: number;
  purgedChatSessions: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_POLICY: RetentionPolicy = {
  retentionYears: 7,
  gracePeriodDays: 90,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the cutoff date before which a closed claim is eligible for purge.
 * cutoff = now - retentionYears - gracePeriodDays
 */
function computeCutoffDate(policy: RetentionPolicy): Date {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - policy.retentionYears);
  cutoff.setDate(cutoff.getDate() - policy.gracePeriodDays);
  return cutoff;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Identify records that have exceeded the retention window and are eligible
 * for purge. Does NOT perform any deletion.
 *
 * Eligible claims must satisfy ALL of:
 * 1. dateClosed is not null (claim must be formally closed)
 * 2. dateClosed < cutoff date (past retention + grace period)
 * 3. deletedAt is null (not already soft-deleted)
 */
export async function identifyExpiredRecords(
  policy?: Partial<RetentionPolicy>,
): Promise<ExpiredRecordSet> {
  const resolvedPolicy: RetentionPolicy = { ...DEFAULT_POLICY, ...policy };
  const cutoffDate = computeCutoffDate(resolvedPolicy);

  // Find eligible claims
  const expiredClaims = await prisma.claim.findMany({
    where: {
      dateClosed: {
        not: null,
        lt: cutoffDate,
      },
      deletedAt: null,
    },
    select: { id: true },
  });

  const claimIds = expiredClaims.map((c) => c.id);

  if (claimIds.length === 0) {
    return { claims: [], documents: [], chatSessions: [] };
  }

  // Find documents on those claims
  const expiredDocuments = await prisma.document.findMany({
    where: { claimId: { in: claimIds } },
    select: { id: true },
  });

  // Find chat sessions on those claims
  const expiredChatSessions = await prisma.chatSession.findMany({
    where: { claimId: { in: claimIds } },
    select: { id: true },
  });

  return {
    claims: claimIds,
    documents: expiredDocuments.map((d) => d.id),
    chatSessions: expiredChatSessions.map((s) => s.id),
  };
}

/**
 * Hard-purge expired claim records.
 *
 * Purge order respects referential integrity:
 * 1. DocumentChunks (FK → Document)
 * 2. Documents
 * 3. ChatMessages (FK → ChatSession, cascade-deleted with session)
 * 4. ChatSessions
 * 5. InvestigationItems (FK → Claim)
 * 6. WorkflowProgress (FK → Claim)
 * 7. TimelineEvents (FK → Claim)
 * 8. RegulatoryDeadlines — SKIPPED (compliance evidence, retained)
 * 9. BenefitPayments — SKIPPED (financial records, retained)
 * 10. AuditEvents — NEVER purged (immutable by law)
 * 11. Claims
 *
 * @param claimIds - Array of claim IDs returned by identifyExpiredRecords()
 */
export async function purgeExpiredRecords(claimIds: string[]): Promise<PurgeResult> {
  if (claimIds.length === 0) {
    return {
      purgedClaims: 0,
      purgedDocuments: 0,
      purgedChunks: 0,
      purgedChatSessions: 0,
    };
  }

  // Validate: re-check that all claims still meet eligibility criteria.
  // This guards against race conditions between identify and purge calls.
  const cutoffDate = computeCutoffDate(DEFAULT_POLICY);
  const eligibleClaims = await prisma.claim.findMany({
    where: {
      id: { in: claimIds },
      dateClosed: {
        not: null,
        lt: cutoffDate,
      },
      deletedAt: null,
    },
    select: { id: true },
  });

  const eligibleIds = eligibleClaims.map((c) => c.id);
  if (eligibleIds.length === 0) {
    return {
      purgedClaims: 0,
      purgedDocuments: 0,
      purgedChunks: 0,
      purgedChatSessions: 0,
    };
  }

  // Find document IDs so we can purge chunks first
  const documents = await prisma.document.findMany({
    where: { claimId: { in: eligibleIds } },
    select: { id: true },
  });
  const documentIds = documents.map((d) => d.id);

  // Purge in dependency order using a transaction
  const [chunksResult, docsResult, chatSessionsResult, , , claimsResult] =
    await prisma.$transaction([
      // 1. Document chunks
      prisma.documentChunk.deleteMany({
        where: { documentId: { in: documentIds } },
      }),
      // 2. Documents (extracted fields and timeline events cascade via FK)
      prisma.document.deleteMany({
        where: { id: { in: documentIds } },
      }),
      // 3. Chat sessions (messages cascade via FK onDelete: Cascade)
      prisma.chatSession.deleteMany({
        where: { claimId: { in: eligibleIds } },
      }),
      // 4. Investigation items
      prisma.investigationItem.deleteMany({
        where: { claimId: { in: eligibleIds } },
      }),
      // 5. Workflow progress
      prisma.workflowProgress.deleteMany({
        where: { claimId: { in: eligibleIds } },
      }),
      // 6. Claims
      // NOTE: AuditEvent, RegulatoryDeadline, BenefitPayment are intentionally
      //       NOT included — they are retained per legal requirements.
      prisma.claim.deleteMany({
        where: { id: { in: eligibleIds } },
      }),
    ]);

  return {
    purgedClaims: claimsResult.count,
    purgedDocuments: docsResult.count,
    purgedChunks: chunksResult.count,
    purgedChatSessions: chatSessionsResult.count,
  };
}
