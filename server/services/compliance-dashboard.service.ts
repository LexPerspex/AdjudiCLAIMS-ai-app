/**
 * Compliance dashboard service — aggregate metrics for examiner, supervisor,
 * and admin compliance views.
 *
 * Queries are read-only and scope data to the authenticated user or org.
 * Metrics are computed in application code (not DB aggregations) except for
 * simple counts, keeping the logic auditable and testable.
 *
 * doiAuditReadinessScore is a composite 0–100 score:
 *   - Deadline adherence:        40 points
 *   - Investigation completion:  30 points
 *   - Documentation (docs/claim): 20 points (approximated via document count)
 *   - UPL score (1 − block rate): 10 points
 *
 * GREEN zone disclaimer: "Metrics computed from system data. Consult qualified
 * counsel for regulatory compliance determinations."
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Deadline adherence metrics for a user or organization.
 *
 * adherenceRate is computed as met / (met + missed), excluding pending and waived
 * deadlines from the denominator. This ensures that unresolved deadlines do not
 * artificially inflate or deflate the compliance rate.
 */
export interface DeadlineAdherence {
  /** Number of deadlines met on time. */
  met: number;
  /** Number of deadlines that were missed (past due without completion). */
  missed: number;
  /** Number of deadlines still pending (not yet due). */
  pending: number;
  /** Total deadline count (met + missed + pending + waived). */
  total: number;
  /** Adherence rate: met / (met + missed). Range 0-1. */
  adherenceRate: number; // 0–1
}

/**
 * UPL (Unauthorized Practice of Law) zone distribution summary.
 *
 * Tracks how many queries were classified into each zone, plus how many
 * responses were blocked by the output validator. The blocked count comes
 * from UPL_OUTPUT_BLOCKED audit events, which may exceed the red count
 * because output validation can block GREEN/YELLOW responses too.
 */
export interface UplSummary {
  /** Number of queries classified as GREEN (factual, safe). */
  green: number;
  /** Number of queries classified as YELLOW (borderline, requires disclaimer). */
  yellow: number;
  /** Number of queries classified as RED (legal advice, blocked). */
  red: number;
  /** Number of AI outputs blocked by the output validator. */
  blocked: number;
  /** Total queries classified (green + yellow + red). */
  total: number;
}

/**
 * Compliance metrics for a single claims examiner.
 *
 * Scoped to the examiner's own assigned claims and chat activity.
 * Used by the examiner dashboard to show personal compliance posture.
 */
export interface ExaminerComplianceMetrics {
  /** Deadline met/missed/pending breakdown for the examiner's assigned claims. */
  deadlineAdherence: DeadlineAdherence;
  /** UPL zone distribution for the examiner's chat queries. */
  uplSummary: UplSummary;
  /** Count of claims in OPEN or UNDER_INVESTIGATION status assigned to this examiner. */
  activeClaimsCount: number;
}

// ---------------------------------------------------------------------------

export interface TeamDeadlineAdherence {
  met: number;
  missed: number;
  pending: number;
  adherenceRate: number; // 0–1
}

export interface TeamUplCompliance {
  greenRate: number; // 0–1
  yellowRate: number; // 0–1
  redRate: number; // 0–1
  blockRate: number; // 0–1
}

export interface TrainingCompletion {
  complete: number;
  incomplete: number;
  total: number;
  completionRate: number; // 0–1
}

export interface ExaminerBreakdown {
  userId: string;
  name: string;
  deadlineAdherence: DeadlineAdherence;
  uplBlockRate: number; // 0–1
}

export interface SupervisorTeamMetrics {
  teamDeadlineAdherence: TeamDeadlineAdherence;
  teamUplCompliance: TeamUplCompliance;
  trainingCompletion: TrainingCompletion;
  examinerBreakdown: ExaminerBreakdown[];
}

// ---------------------------------------------------------------------------

/**
 * DOI audit readiness score breakdown by category.
 *
 * Weights reflect regulatory importance: deadline adherence is weighted highest (40pts)
 * because missed deadlines are the most common DOI audit finding. Investigation
 * completeness (30pts) is next because incomplete investigations underpin bad faith claims.
 * Documentation (20pts) and UPL compliance (10pts) round out the composite score.
 *
 * Total: 40 + 30 + 20 + 10 = 100 points maximum.
 */
export interface ComplianceScoreBreakdown {
  /** Deadline adherence score: adherenceRate * 40. Range 0-40. */
  deadlineScore: number; // 0–40
  /** Investigation completion score: completionRate * 30. Range 0-30. */
  investigationScore: number; // 0–30
  /** Documentation score: fraction of claims with >= 1 document * 20. Range 0-20. */
  documentationScore: number; // 0–20
  /** UPL compliance score: (1 - blockRate) * 10. Range 0-10. */
  uplScore: number; // 0–10
}

/**
 * Full admin compliance report extending team metrics with DOI audit readiness.
 *
 * The composite score (0-100) indicates organizational readiness for a
 * California Department of Insurance market conduct examination. Scores below
 * 70 indicate material compliance gaps that require remediation.
 */
export interface AdminComplianceReport extends SupervisorTeamMetrics {
  /** Composite DOI audit readiness score (0-100). */
  doiAuditReadinessScore: number; // 0–100
  /** Per-category breakdown of the composite score. */
  complianceScoreBreakdown: ComplianceScoreBreakdown;
}

// ---------------------------------------------------------------------------

export interface ZoneDistribution {
  green: number;
  yellow: number;
  red: number;
}

export interface BlocksPerPeriod {
  period: string;
  count: number;
}

/**
 * UPL monitoring dashboard metrics for an organization.
 *
 * adversarialDetectionRate approximates the fraction of RED-zone queries that
 * also triggered a validation failure, serving as a rough signal for whether
 * users are attempting to circumvent UPL protections. High rates warrant
 * policy review and possible additional training.
 */
export interface UplMonitoringMetrics {
  /** Distribution of queries across GREEN/YELLOW/RED zones. */
  zoneDistribution: ZoneDistribution;
  /** Daily count of blocked outputs over the reporting period. */
  blocksPerPeriod: BlocksPerPeriod[];
  /** Ratio of validation failures to RED-zone queries (0-1). */
  adversarialDetectionRate: number; // 0–1
}

export interface UplDashboardOptions {
  startDate?: string;
  endDate?: string;
  period?: string;
}

// Options accepted by getUplMonitoringMetrics (named-import route passes Date objects)
export interface UplMonitoringOptions {
  startDate?: Date;
  endDate?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000; // 4 decimal places
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Build a date range for a period.
 * Default: last 30 days.
 */
function buildDateRange(startDate?: string, endDate?: string) {
  const end = parseOptionalDate(endDate) ?? new Date();
  const start = parseOptionalDate(startDate) ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// ---------------------------------------------------------------------------
// 1. Examiner compliance metrics
// ---------------------------------------------------------------------------

/**
 * Compliance metrics for a single claims examiner.
 *
 * Deadline adherence and UPL summary are scoped to the examiner's own claims
 * and chat activity. Active claims include OPEN and UNDER_INVESTIGATION status.
 */
export async function getExaminerMetrics(
  userId: string,
  _orgId: string,
): Promise<ExaminerComplianceMetrics> {
  const [deadlineRows, uplRows, activeClaimsCount] = await Promise.all([
    // Deadline adherence across all claims assigned to this examiner
    prisma.regulatoryDeadline.groupBy({
      by: ['status'],
      where: {
        claim: { assignedExaminerId: userId },
      },
      _count: { id: true },
    }),

    // UPL zone distribution via audit events for this user
    prisma.auditEvent.groupBy({
      by: ['uplZone'],
      where: {
        userId,
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: { not: null },
      },
      _count: { id: true },
    }),

    // Active claims count — OPEN or UNDER_INVESTIGATION
    prisma.claim.count({
      where: {
        assignedExaminerId: userId,
        status: { in: ['OPEN', 'UNDER_INVESTIGATION'] },
      },
    }),
  ]);

  // Map deadline group-by to named counts
  const deadlineCounts = { MET: 0, MISSED: 0, PENDING: 0, WAIVED: 0 };
  for (const row of deadlineRows) {
    const s = row.status as keyof typeof deadlineCounts;
    if (s in deadlineCounts) deadlineCounts[s] = row._count.id;
  }
  const totalDeadlines =
    deadlineCounts.MET + deadlineCounts.MISSED + deadlineCounts.PENDING + deadlineCounts.WAIVED;

  const deadlineAdherence: DeadlineAdherence = {
    met: deadlineCounts.MET,
    missed: deadlineCounts.MISSED,
    pending: deadlineCounts.PENDING,
    total: totalDeadlines,
    adherenceRate: safeRate(deadlineCounts.MET, deadlineCounts.MET + deadlineCounts.MISSED),
  };

  // Map UPL zone group-by to named counts
  const zoneCounts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const row of uplRows) {
    const z = row.uplZone as string;
    if (z in zoneCounts) zoneCounts[z as keyof typeof zoneCounts] = row._count.id;
  }

  // Count explicit block events for this user
  const blockedCount = await prisma.auditEvent.count({
    where: { userId, eventType: 'UPL_OUTPUT_BLOCKED' },
  });

  const uplTotal = zoneCounts.GREEN + zoneCounts.YELLOW + zoneCounts.RED;

  const uplSummary: UplSummary = {
    green: zoneCounts.GREEN,
    yellow: zoneCounts.YELLOW,
    red: zoneCounts.RED,
    blocked: blockedCount,
    total: uplTotal,
  };

  return { deadlineAdherence, uplSummary, activeClaimsCount };
}

// ---------------------------------------------------------------------------
// 2. Supervisor team metrics
// ---------------------------------------------------------------------------

/**
 * Team-wide compliance metrics for a supervisor or admin.
 *
 * Scoped to the org. Includes per-examiner breakdown for all active users
 * with at least one assigned claim.
 */
export async function getTeamMetrics(orgId: string): Promise<SupervisorTeamMetrics> {
  const [
    orgDeadlineRows,
    orgUplRows,
    orgBlockedCount,
    educationProfiles,
    orgUserCount,
    examinerUsers,
  ] = await Promise.all([
    // Org-wide deadline status breakdown
    prisma.regulatoryDeadline.groupBy({
      by: ['status'],
      where: { claim: { organizationId: orgId } },
      _count: { id: true },
    }),

    // Org-wide UPL zone classification events
    prisma.auditEvent.groupBy({
      by: ['uplZone'],
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: { not: null },
      },
      _count: { id: true },
    }),

    // Org-wide blocked count
    prisma.auditEvent.count({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_OUTPUT_BLOCKED',
      },
    }),

    // Training completion — all education profiles in the org
    prisma.educationProfile.findMany({
      where: { user: { organizationId: orgId } },
      select: { isTrainingComplete: true },
    }),

    // Total active users in org (for training denominator)
    prisma.user.count({
      where: { organizationId: orgId, isActive: true },
    }),

    // Per-examiner users — just id and name; deadline data fetched separately
    prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        assignedClaims: { some: {} },
      },
      select: { id: true, name: true },
    }),
  ]);

  // --- Team deadline adherence ---
  const teamDeadlineCounts = { MET: 0, MISSED: 0, PENDING: 0, WAIVED: 0 };
  for (const row of orgDeadlineRows) {
    const s = row.status as keyof typeof teamDeadlineCounts;
    if (s in teamDeadlineCounts) teamDeadlineCounts[s] = row._count.id;
  }

  const teamDeadlineAdherence: TeamDeadlineAdherence = {
    met: teamDeadlineCounts.MET,
    missed: teamDeadlineCounts.MISSED,
    pending: teamDeadlineCounts.PENDING,
    adherenceRate: safeRate(
      teamDeadlineCounts.MET,
      teamDeadlineCounts.MET + teamDeadlineCounts.MISSED,
    ),
  };

  // --- Team UPL compliance ---
  const orgZoneCounts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const row of orgUplRows) {
    const z = row.uplZone as string;
    if (z in orgZoneCounts) orgZoneCounts[z as keyof typeof orgZoneCounts] = row._count.id;
  }
  const orgUplTotal = orgZoneCounts.GREEN + orgZoneCounts.YELLOW + orgZoneCounts.RED;

  const teamUplCompliance: TeamUplCompliance = {
    greenRate: safeRate(orgZoneCounts.GREEN, orgUplTotal),
    yellowRate: safeRate(orgZoneCounts.YELLOW, orgUplTotal),
    redRate: safeRate(orgZoneCounts.RED, orgUplTotal),
    blockRate: safeRate(orgBlockedCount, orgUplTotal || 1),
  };

  // --- Training completion ---
  const completeCount = educationProfiles.filter((p) => p.isTrainingComplete).length;
  // Use orgUserCount as denominator — users without a profile are incomplete
  const trainingCompletion: TrainingCompletion = {
    complete: completeCount,
    incomplete: orgUserCount - completeCount,
    total: orgUserCount,
    completionRate: safeRate(completeCount, orgUserCount),
  };

  // --- Per-examiner breakdown ---
  // Batch: per-user deadline counts, UPL blocks, and zone totals
  const [perExaminerDeadlineRows, perUserBlockRows, perUserZoneRows] = await Promise.all([
    prisma.regulatoryDeadline.groupBy({
      by: ['status'],
      where: {
        claim: {
          organizationId: orgId,
          assignedExaminerId: { in: examinerUsers.map((u) => u.id) },
        },
      },
      _count: { id: true },
    }),

    prisma.auditEvent.groupBy({
      by: ['userId'],
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_OUTPUT_BLOCKED',
      },
      _count: { id: true },
    }),

    prisma.auditEvent.groupBy({
      by: ['userId'],
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: { not: null },
      },
      _count: { id: true },
    }),
  ]);

  // Build per-examiner deadline lookup from org-level groupBy
  // (For a more granular per-user breakdown we query per user below)
  const blocksByUser = new Map<string, number>(
    perUserBlockRows.map((r) => [r.userId, r._count.id]),
  );
  const zoneEventsByUser = new Map<string, number>(
    perUserZoneRows.map((r) => [r.userId, r._count.id]),
  );

  // For per-examiner deadline breakdown, we need per-user deadline groupBy.
  // Fetch once per org rather than N queries.
  const perExaminerDeadlineByUser = await prisma.$queryRawUnsafe<
    Array<{ assigned_examiner_id: string; status: string; cnt: bigint }>
  >(
    `
    SELECT c.assigned_examiner_id, rd.status, CAST(COUNT(rd.id) AS SIGNED) AS cnt
    FROM regulatory_deadlines rd
    JOIN claims c ON c.id = rd.claim_id
    WHERE c.organization_id = ?
    GROUP BY c.assigned_examiner_id, rd.status
    `,
    orgId,
  );

  // Index by userId → status → count
  const deadlineByUser = new Map<string, Record<string, number>>();
  for (const row of perExaminerDeadlineByUser) {
    let byStatus = deadlineByUser.get(row.assigned_examiner_id);
    if (!byStatus) {
      byStatus = {};
      deadlineByUser.set(row.assigned_examiner_id, byStatus);
    }
    byStatus[row.status] = Number(row.cnt);
  }

  const examinerBreakdown: ExaminerBreakdown[] = examinerUsers.map((examiner) => {
    const byStatus = deadlineByUser.get(examiner.id) ?? {};
    const met = byStatus['MET'] ?? 0;
    const missed = byStatus['MISSED'] ?? 0;
    const pending = byStatus['PENDING'] ?? 0;
    const waived = byStatus['WAIVED'] ?? 0;
    const total = met + missed + pending + waived;

    const userBlockCount = blocksByUser.get(examiner.id) ?? 0;
    const userZoneTotal = zoneEventsByUser.get(examiner.id) ?? 0;

    return {
      userId: examiner.id,
      name: examiner.name,
      deadlineAdherence: {
        met,
        missed,
        pending,
        total,
        adherenceRate: safeRate(met, met + missed),
      },
      uplBlockRate: safeRate(userBlockCount, userZoneTotal || 1),
    };
  });

  // Silence unused variable (aggregated separately above, kept for future use)
  void perExaminerDeadlineRows;

  return {
    teamDeadlineAdherence,
    teamUplCompliance,
    trainingCompletion,
    examinerBreakdown,
  };
}

// ---------------------------------------------------------------------------
// 3. Admin compliance report
// ---------------------------------------------------------------------------

/**
 * Full compliance report for an admin.
 *
 * Extends team metrics with a DOI audit readiness score (0–100)
 * and per-component score breakdown.
 *
 * Score weights:
 *   Deadline adherence:        40 points
 *   Investigation completion:  30 points
 *   Documentation completeness: 20 points  (≥1 doc per claim = full credit)
 *   UPL compliance (1−blockRate): 10 points
 */
export async function getAdminReport(orgId: string): Promise<AdminComplianceReport> {
  const [supervisorMetrics, investigationRows, docCountRows, totalClaimCount] = await Promise.all([
    getTeamMetrics(orgId),

    // Investigation item completion across all org claims
    prisma.investigationItem.groupBy({
      by: ['isComplete'],
      where: { claim: { organizationId: orgId } },
      _count: { id: true },
    }),

    // Claims with at least one document — used as documentation proxy
    prisma.document.groupBy({
      by: ['claimId'],
      where: { claim: { organizationId: orgId } },
    }),

    prisma.claim.count({ where: { organizationId: orgId } }),
  ]);

  // --- Investigation score (0–30) ---
  const invCompleteRow = investigationRows.find((r) => r.isComplete);
  const invIncompleteRow = investigationRows.find((r) => !r.isComplete);
  const invComplete = invCompleteRow?._count.id ?? 0;
  const invIncomplete = invIncompleteRow?._count.id ?? 0;
  const invTotal = invComplete + invIncomplete;
  const invRate = safeRate(invComplete, invTotal);
  const investigationScore = clamp(Math.round(invRate * 30), 0, 30);

  // --- Documentation score (0–20) ---
  // Proxy: what fraction of claims have at least one document
  const claimsWithDocs = docCountRows.length;
  const docRate = safeRate(claimsWithDocs, totalClaimCount);
  const documentationScore = clamp(Math.round(docRate * 20), 0, 20);

  // --- Deadline score (0–40) ---
  const deadlineScore = clamp(
    Math.round(supervisorMetrics.teamDeadlineAdherence.adherenceRate * 40),
    0,
    40,
  );

  // --- UPL score (0–10) ---
  const uplScore = clamp(
    Math.round((1 - supervisorMetrics.teamUplCompliance.blockRate) * 10),
    0,
    10,
  );

  const doiAuditReadinessScore = deadlineScore + investigationScore + documentationScore + uplScore;

  const complianceScoreBreakdown: ComplianceScoreBreakdown = {
    deadlineScore,
    investigationScore,
    documentationScore,
    uplScore,
  };

  return {
    ...supervisorMetrics,
    doiAuditReadinessScore,
    complianceScoreBreakdown,
  };
}

// ---------------------------------------------------------------------------
// 4. UPL monitoring dashboard
// ---------------------------------------------------------------------------

/**
 * UPL monitoring dashboard for an org over the last 30 days (default).
 *
 * blocksPerPeriod is grouped by calendar day (UTC) and expressed as
 * 'YYYY-MM-DD' strings. adversarialDetectionRate approximates the fraction
 * of RED-zone queries that were also followed by a validation failure —
 * a rough signal for policy review.
 *
 * The period parameter ('day' | 'week' | 'month') is accepted for future
 * aggregation granularity but currently all blocksPerPeriod are daily.
 */
export async function getUplDashboard(
  orgId: string,
  options?: UplDashboardOptions,
): Promise<UplMonitoringMetrics> {
  const { start, end } = buildDateRange(options?.startDate, options?.endDate);

  const [zoneRows, blockEvents, validationFailCount, redZoneCount] = await Promise.all([
    // Zone distribution over time period
    prisma.auditEvent.groupBy({
      by: ['uplZone'],
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: { not: null },
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    }),

    // Individual block events for blocksPerPeriod bucketing
    prisma.auditEvent.findMany({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_OUTPUT_BLOCKED',
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),

    // Validation failure count for adversarial rate
    prisma.auditEvent.count({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_OUTPUT_VALIDATION_FAIL',
        createdAt: { gte: start, lte: end },
      },
    }),

    // RED zone classification count for adversarial rate denominator
    prisma.auditEvent.count({
      where: {
        user: { organizationId: orgId },
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: 'RED',
        createdAt: { gte: start, lte: end },
      },
    }),
  ]);

  // --- Zone distribution ---
  const zoneCounts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const row of zoneRows) {
    const z = row.uplZone as string;
    if (z in zoneCounts) zoneCounts[z as keyof typeof zoneCounts] = row._count.id;
  }

  // --- Blocks per day ---
  const dailyCounts = new Map<string, number>();
  for (const event of blockEvents) {
    const day = event.createdAt.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }
  const blocksPerPeriod: BlocksPerPeriod[] = Array.from(dailyCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));

  // --- Adversarial detection rate ---
  // Approximation: validation failures / RED zone queries
  const adversarialDetectionRate = safeRate(validationFailCount, redZoneCount || 1);

  return {
    zoneDistribution: { green: zoneCounts.GREEN, yellow: zoneCounts.YELLOW, red: zoneCounts.RED },
    blocksPerPeriod,
    adversarialDetectionRate,
  };
}

// ---------------------------------------------------------------------------
// Long-name aliases — for named-import route compatibility
// ---------------------------------------------------------------------------

/**
 * Alias: getExaminerMetrics under the canonical long name used by
 * server/routes/compliance.ts named imports.
 */
export function getExaminerComplianceMetrics(userId: string): Promise<ExaminerComplianceMetrics> {
  return getExaminerMetrics(userId, '');
}

/**
 * Alias: getTeamMetrics under the canonical long name.
 */
export const getSupervisorTeamMetrics = getTeamMetrics;

/**
 * Alias: getAdminReport under the canonical long name.
 */
export const getAdminComplianceReport = getAdminReport;

/**
 * Alias: getUplDashboard under the canonical long name.
 *
 * The named-import route passes Date objects; this wrapper converts to
 * ISO strings for the underlying getUplDashboard implementation.
 */
export function getUplMonitoringMetrics(
  orgId: string,
  options?: UplMonitoringOptions,
): Promise<UplMonitoringMetrics> {
  return getUplDashboard(orgId, {
    startDate: options?.startDate?.toISOString(),
    endDate: options?.endDate?.toISOString(),
  });
}
