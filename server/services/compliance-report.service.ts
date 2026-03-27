/**
 * Compliance report service — DOI audit-ready report generators.
 *
 * Generates structured reports from existing claim data models:
 *   - CCR 10101: Claim file summary (all data in a claim file)
 *   - CCR 10103: Claim activity log (chronological audit trail)
 *   - Deadline adherence report (org-wide deadline compliance stats)
 *   - DOI audit readiness assessment (composite score 0-100)
 *
 * All outputs are GREEN zone — factual data aggregation only.
 * No new DB tables; queries only existing Prisma models.
 *
 * GREEN zone disclaimer: "Report computed from system data. Consult qualified
 * counsel for regulatory compliance determinations."
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentSummary {
  totalCount: number;
  byType: Record<string, number>;
}

/**
 * Comprehensive claim file summary for DOI audit purposes.
 *
 * Structured per CCR 10101 requirements: a claim file summary must include
 * all data in the claim file — documents, investigation status, regulatory
 * deadlines, benefit payment history, and audit trail. This is the primary
 * report format used during DOI market conduct examinations.
 *
 * All data is factual (GREEN zone) — no analysis, conclusions, or recommendations.
 */
export interface ClaimFileSummary {
  /** Unique claim ID. */
  claimId: string;
  /** Human-readable claim number (e.g., format varies by carrier). */
  claimNumber: string;
  /** Name of the injured worker. */
  claimantName: string;
  /** Date the injury occurred. */
  dateOfInjury: Date;
  /** Current claim status (OPEN, UNDER_INVESTIGATION, DETERMINED, CLOSED, etc.). */
  status: string;
  /** ID of the examiner assigned to this claim. */
  assignedExaminerId: string;
  /** Date the claim was received by the insurer (starts all regulatory clocks). */
  dateReceived: Date;
  /** Date the claim was acknowledged (15-day deadline per 10 CCR 2695.5(b)). */
  dateAcknowledged: Date | null;
  /** Date the coverage determination was made (40-day deadline per 10 CCR 2695.7(b)). */
  dateDetermined: Date | null;
  /** Date the claim was closed. */
  dateClosed: Date | null;
  /** Document inventory with type breakdown. */
  documents: DocumentSummary;
  /** Investigation checklist completion status. */
  investigationItems: {
    total: number;
    complete: number;
    incomplete: number;
  };
  /** Regulatory deadline adherence summary. */
  deadlines: {
    total: number;
    met: number;
    missed: number;
    pending: number;
    waived: number;
  };
  /** Benefit payment history with late payment tracking. */
  benefitPayments: {
    total: number;
    totalAmount: number;
    lateCount: number;
    totalPenalties: number;
  };
  /** Total number of audit events recorded for this claim. */
  auditEventCount: number;
  /** When this summary was generated. */
  generatedAt: Date;
}

// ---------------------------------------------------------------------------

export interface ActivityLogEntry {
  id: string;
  eventType: string;
  eventData: unknown;
  createdAt: Date;
  ipAddress: string | null;
}

export interface ActivityLogDateGroup {
  date: string; // 'YYYY-MM-DD'
  events: ActivityLogEntry[];
}

export interface ClaimActivityLog {
  claimId: string;
  startDate: Date | null;
  endDate: Date | null;
  totalEvents: number;
  eventsByDate: ActivityLogDateGroup[];
  generatedAt: Date;
}

// ---------------------------------------------------------------------------

export interface DeadlineTypeStats {
  deadlineType: string;
  met: number;
  missed: number;
  pending: number;
  waived: number;
  total: number;
  adherenceRate: number; // 0-1
}

export interface WorstPerformer {
  claimId: string;
  claimNumber: string;
  missedCount: number;
}

export interface DeadlineAdherenceReport {
  orgId: string;
  startDate: Date | null;
  endDate: Date | null;
  overallAdherenceRate: number; // 0-1
  totalMet: number;
  totalMissed: number;
  totalPending: number;
  totalWaived: number;
  byDeadlineType: DeadlineTypeStats[];
  worstPerformers: WorstPerformer[];
  generatedAt: Date;
}

// ---------------------------------------------------------------------------

export interface AuditReadinessCategory {
  category: string;
  score: number;
  maxScore: number;
  details: string;
}

/**
 * DOI audit readiness assessment report with composite score.
 *
 * Score breakdown (0-100):
 * - Deadline adherence: 30 points (heaviest weight — most common audit finding)
 * - Investigation completeness: 25 points (incomplete investigations underpin bad faith)
 * - Documentation: 20 points (claims must have supporting documents per CCR 10101)
 * - UPL compliance: 15 points (system compliance with UPL boundaries)
 * - Lien tracking: 10 points (liens progressed past intake status)
 *
 * These weights differ from the compliance-dashboard.service.ts admin report
 * because this report includes lien tracking as a 5th category.
 */
export interface AuditReadinessReport {
  /** Organization this report covers. */
  orgId: string;
  /** Composite readiness score (0-100). */
  compositeScore: number; // 0-100
  /** Per-category score breakdown with details. */
  categories: AuditReadinessCategory[];
  /** When this report was generated. */
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// 1. CCR 10101 — Claim File Summary
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive claim file summary for DOI audit purposes.
 * Returns all factual data associated with the claim: documents, investigation
 * items, deadlines, benefit payments, and audit event counts.
 */
export async function generateClaimFileSummary(claimId: string): Promise<ClaimFileSummary> {
  const [claim, documents, investigationItems, deadlines, benefitPayments, auditEventCount] =
    await Promise.all([
      prisma.claim.findUniqueOrThrow({
        where: { id: claimId },
        select: {
          id: true,
          claimNumber: true,
          claimantName: true,
          dateOfInjury: true,
          status: true,
          assignedExaminerId: true,
          dateReceived: true,
          dateAcknowledged: true,
          dateDetermined: true,
          dateClosed: true,
        },
      }),

      prisma.document.findMany({
        where: { claimId },
        select: { documentType: true },
      }),

      prisma.investigationItem.findMany({
        where: { claimId },
        select: { isComplete: true },
      }),

      prisma.regulatoryDeadline.findMany({
        where: { claimId },
        select: { status: true },
      }),

      prisma.benefitPayment.findMany({
        where: { claimId },
        select: { amount: true, isLate: true, penaltyAmount: true },
      }),

      prisma.auditEvent.count({
        where: { claimId },
      }),
    ]);

  // Document summary by type
  const byType: Record<string, number> = {};
  for (const doc of documents) {
    const type = doc.documentType ?? 'UNCLASSIFIED';
    byType[type] = (byType[type] ?? 0) + 1;
  }

  // Investigation summary
  const invComplete = investigationItems.filter((i) => i.isComplete).length;
  const invIncomplete = investigationItems.filter((i) => !i.isComplete).length;

  // Deadline summary
  const deadlineCounts = { MET: 0, MISSED: 0, PENDING: 0, WAIVED: 0 };
  for (const d of deadlines) {
    const s = d.status as keyof typeof deadlineCounts;
    if (s in deadlineCounts) deadlineCounts[s]++;
  }

  // Benefit payment summary
  let totalAmount = 0;
  let totalPenalties = 0;
  let lateCount = 0;
  for (const bp of benefitPayments) {
    totalAmount += Number(bp.amount);
    totalPenalties += Number(bp.penaltyAmount);
    if (bp.isLate) lateCount++;
  }

  return {
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    claimantName: claim.claimantName,
    dateOfInjury: claim.dateOfInjury,
    status: claim.status,
    assignedExaminerId: claim.assignedExaminerId,
    dateReceived: claim.dateReceived,
    dateAcknowledged: claim.dateAcknowledged,
    dateDetermined: claim.dateDetermined,
    dateClosed: claim.dateClosed,
    documents: {
      totalCount: documents.length,
      byType,
    },
    investigationItems: {
      total: investigationItems.length,
      complete: invComplete,
      incomplete: invIncomplete,
    },
    deadlines: {
      total: deadlines.length,
      met: deadlineCounts.MET,
      missed: deadlineCounts.MISSED,
      pending: deadlineCounts.PENDING,
      waived: deadlineCounts.WAIVED,
    },
    benefitPayments: {
      total: benefitPayments.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      lateCount,
      totalPenalties: Math.round(totalPenalties * 100) / 100,
    },
    auditEventCount,
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// 2. CCR 10103 — Claim Activity Log
// ---------------------------------------------------------------------------

/**
 * Generate a chronological activity log for a claim, grouped by date.
 * Used for DOI audit trail review (CCR 10103).
 */
export async function generateClaimActivityLog(
  claimId: string,
  options?: { startDate?: Date; endDate?: Date },
): Promise<ClaimActivityLog> {
  const where: {
    claimId: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = { claimId };

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) where.createdAt.gte = options.startDate;
    if (options.endDate) where.createdAt.lte = options.endDate;
  }

  const events = await prisma.auditEvent.findMany({
    where,
    select: {
      id: true,
      eventType: true,
      eventData: true,
      createdAt: true,
      ipAddress: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group events by date
  const dateGroupMap = new Map<string, ActivityLogEntry[]>();
  for (const event of events) {
    const dateKey = event.createdAt.toISOString().slice(0, 10);
    let group = dateGroupMap.get(dateKey);
    if (!group) {
      group = [];
      dateGroupMap.set(dateKey, group);
    }
    group.push({
      id: event.id,
      eventType: event.eventType,
      eventData: event.eventData,
      createdAt: event.createdAt,
      ipAddress: event.ipAddress,
    });
  }

  const eventsByDate: ActivityLogDateGroup[] = Array.from(dateGroupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateEvents]) => ({ date, events: dateEvents }));

  return {
    claimId,
    startDate: options?.startDate ?? null,
    endDate: options?.endDate ?? null,
    totalEvents: events.length,
    eventsByDate,
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// 3. Deadline Adherence Report (org-wide)
// ---------------------------------------------------------------------------

/**
 * Generate an org-wide deadline adherence report with per-type breakdown
 * and worst-performing claims.
 */
export async function generateDeadlineAdherenceReport(
  orgId: string,
  options?: { startDate?: Date; endDate?: Date },
): Promise<DeadlineAdherenceReport> {
  const dateFilter: { gte?: Date; lte?: Date } | undefined =
    options?.startDate || options?.endDate
      ? {
          ...(options.startDate ? { gte: options.startDate } : {}),
          ...(options.endDate ? { lte: options.endDate } : {}),
        }
      : undefined;

  const deadlineWhere = {
    claim: { organizationId: orgId },
    ...(dateFilter ? { dueDate: dateFilter } : {}),
  };

  const [deadlines, worstPerformerRows] = await Promise.all([
    prisma.regulatoryDeadline.findMany({
      where: deadlineWhere,
      select: {
        deadlineType: true,
        status: true,
        claimId: true,
      },
    }),

    // Worst performers: claims with most missed deadlines
    prisma.$queryRawUnsafe<
      Array<{ claim_id: string; claim_number: string; missed_count: bigint }>
    >(
      `
      SELECT c.id AS claim_id, c.claim_number, CAST(COUNT(rd.id) AS SIGNED) AS missed_count
      FROM regulatory_deadlines rd
      JOIN claims c ON c.id = rd.claim_id
      WHERE c.organization_id = ?
        AND rd.status = 'MISSED'
        ${dateFilter?.gte ? `AND rd.due_date >= ?` : ''}
        ${dateFilter?.lte ? `AND rd.due_date <= ?` : ''}
      GROUP BY c.id, c.claim_number
      ORDER BY missed_count DESC
      LIMIT 10
      `,
      ...[
        orgId,
        ...(dateFilter?.gte ? [dateFilter.gte] : []),
        ...(dateFilter?.lte ? [dateFilter.lte] : []),
      ],
    ),
  ]);

  // Aggregate by deadline type
  const typeMap = new Map<string, { met: number; missed: number; pending: number; waived: number }>();
  let totalMet = 0;
  let totalMissed = 0;
  let totalPending = 0;
  let totalWaived = 0;

  for (const d of deadlines) {
    let entry = typeMap.get(d.deadlineType);
    if (!entry) {
      entry = { met: 0, missed: 0, pending: 0, waived: 0 };
      typeMap.set(d.deadlineType, entry);
    }
    switch (d.status) {
      case 'MET':
        entry.met++;
        totalMet++;
        break;
      case 'MISSED':
        entry.missed++;
        totalMissed++;
        break;
      case 'PENDING':
        entry.pending++;
        totalPending++;
        break;
      case 'WAIVED':
        entry.waived++;
        totalWaived++;
        break;
    }
  }

  const byDeadlineType: DeadlineTypeStats[] = Array.from(typeMap.entries()).map(
    ([deadlineType, counts]) => {
      const total = counts.met + counts.missed + counts.pending + counts.waived;
      return {
        deadlineType,
        ...counts,
        total,
        adherenceRate: safeRate(counts.met, counts.met + counts.missed),
      };
    },
  );

  const worstPerformers: WorstPerformer[] = worstPerformerRows.map((r) => ({
    claimId: r.claim_id,
    claimNumber: r.claim_number,
    missedCount: Number(r.missed_count),
  }));

  return {
    orgId,
    startDate: options?.startDate ?? null,
    endDate: options?.endDate ?? null,
    overallAdherenceRate: safeRate(totalMet, totalMet + totalMissed),
    totalMet,
    totalMissed,
    totalPending,
    totalWaived,
    byDeadlineType,
    worstPerformers,
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// 4. DOI Audit Readiness Assessment
// ---------------------------------------------------------------------------

/**
 * Generate a DOI audit readiness assessment with composite score (0-100).
 *
 * Score breakdown:
 *   - Deadline adherence:          30 points
 *   - Investigation completeness:  25 points
 *   - Documentation:               20 points (claims with >= 1 document)
 *   - UPL compliance (1-blockRate): 15 points
 *   - Lien tracking:               10 points (liens with OMFS comparison)
 */
export async function generateAuditReadinessReport(orgId: string): Promise<AuditReadinessReport> {
  const [
    deadlineRows,
    investigationRows,
    docCountRows,
    totalClaimCount,
    uplBlockedCount,
    uplTotalCount,
    lienRows,
  ] = await Promise.all([
    // Deadline status breakdown
    prisma.regulatoryDeadline.groupBy({
      by: ['status'],
      where: { claim: { organizationId: orgId } },
      _count: { id: true },
    }),

    // Investigation item completion
    prisma.investigationItem.groupBy({
      by: ['isComplete'],
      where: { claim: { organizationId: orgId } },
      _count: { id: true },
    }),

    // Claims with at least one document
    prisma.document.groupBy({
      by: ['claimId'],
      where: { claim: { organizationId: orgId } },
    }),

    prisma.claim.count({ where: { organizationId: orgId } }),

    // UPL blocks
    prisma.auditEvent.count({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_OUTPUT_BLOCKED',
      },
    }),

    // Total UPL zone events
    prisma.auditEvent.count({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: { not: null },
      },
    }),

    // Lien tracking: count total and those with OMFS comparison
    prisma.lien.groupBy({
      by: ['status'],
      where: { claim: { organizationId: orgId } },
      _count: { id: true },
    }),
  ]);

  // --- Deadline adherence score (0-30) ---
  const deadlineCounts = { MET: 0, MISSED: 0 };
  for (const row of deadlineRows) {
    if (row.status === 'MET') deadlineCounts.MET = row._count.id;
    if (row.status === 'MISSED') deadlineCounts.MISSED = row._count.id;
  }
  const deadlineRate = safeRate(deadlineCounts.MET, deadlineCounts.MET + deadlineCounts.MISSED);
  const deadlineScore = clamp(Math.round(deadlineRate * 30), 0, 30);

  // --- Investigation completeness score (0-25) ---
  const invCompleteRow = investigationRows.find((r) => r.isComplete);
  const invIncompleteRow = investigationRows.find((r) => !r.isComplete);
  const invComplete = invCompleteRow?._count.id ?? 0;
  const invIncomplete = invIncompleteRow?._count.id ?? 0;
  const invRate = safeRate(invComplete, invComplete + invIncomplete);
  const investigationScore = clamp(Math.round(invRate * 25), 0, 25);

  // --- Documentation score (0-20) ---
  const claimsWithDocs = docCountRows.length;
  const docRate = safeRate(claimsWithDocs, totalClaimCount);
  const documentationScore = clamp(Math.round(docRate * 20), 0, 20);

  // --- UPL compliance score (0-15) ---
  const blockRate = safeRate(uplBlockedCount, uplTotalCount || 1);
  const uplScore = clamp(Math.round((1 - blockRate) * 15), 0, 15);

  // --- Lien tracking score (0-10) ---
  // Liens that have progressed past RECEIVED status indicate active tracking
  let totalLiens = 0;
  let trackedLiens = 0;
  for (const row of lienRows) {
    totalLiens += row._count.id;
    if (row.status !== 'RECEIVED') {
      trackedLiens += row._count.id;
    }
  }
  const lienRate = safeRate(trackedLiens, totalLiens);
  const lienScore = clamp(Math.round(lienRate * 10), 0, 10);

  const compositeScore = deadlineScore + investigationScore + documentationScore + uplScore + lienScore;

  const categories: AuditReadinessCategory[] = [
    {
      category: 'Deadline Adherence',
      score: deadlineScore,
      maxScore: 30,
      details: `${String(deadlineCounts.MET)} met / ${String(deadlineCounts.MET + deadlineCounts.MISSED)} decided (${String(Math.round(deadlineRate * 100))}%)`,
    },
    {
      category: 'Investigation Completeness',
      score: investigationScore,
      maxScore: 25,
      details: `${String(invComplete)} complete / ${String(invComplete + invIncomplete)} total (${String(Math.round(invRate * 100))}%)`,
    },
    {
      category: 'Documentation',
      score: documentationScore,
      maxScore: 20,
      details: `${String(claimsWithDocs)} / ${String(totalClaimCount)} claims have documents (${String(Math.round(docRate * 100))}%)`,
    },
    {
      category: 'UPL Compliance',
      score: uplScore,
      maxScore: 15,
      details: `${String(uplBlockedCount)} blocks / ${String(uplTotalCount)} classifications (${String(Math.round((1 - blockRate) * 100))}% compliant)`,
    },
    {
      category: 'Lien Tracking',
      score: lienScore,
      maxScore: 10,
      details: `${String(trackedLiens)} / ${String(totalLiens)} liens tracked past intake (${String(Math.round(lienRate * 100))}%)`,
    },
  ];

  return {
    orgId,
    compositeScore,
    categories,
    generatedAt: new Date(),
  };
}
