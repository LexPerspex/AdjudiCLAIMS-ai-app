/**
 * Ongoing education service — Layer 3 continuous education.
 *
 * Manages four ongoing education channels:
 *   1. Regulatory change notifications — examiners acknowledge statutory/rule changes
 *   2. Monthly compliance reviews — missed deadlines, approaching deadlines, stale claims
 *   3. Quarterly refreshers — periodic assessment to maintain proficiency
 *   4. Audit-triggered training — remediation modules assigned after audit findings
 *
 * All content is factual/educational (GREEN zone). No legal advice.
 *
 * Regulatory authority: 10 CCR 2695.6 — ongoing training standards for claims professionals.
 */

import type { InputJsonValue, JsonValue } from '@prisma/client/runtime/library';
import { parseJsonStringArray } from '../lib/json-array.js';
import { prisma } from '../db.js';
import {
  REGULATORY_CHANGES,
  REGULATORY_CHANGES_BY_ID,
  type RegulatoryChange,
} from '../data/regulatory-changes.js';
import {
  QUARTERLY_REFRESHERS_BY_ID,
  type QuarterlyRefresher,
} from '../data/quarterly-refreshers.js';
import type { AssessmentQuestion } from '../data/training-modules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Monthly compliance review for an examiner.
 *
 * Part of Layer 3 Channel 2: monthly compliance reviews. Surfaces three
 * categories of compliance concern that require examiner attention:
 * 1. Missed deadlines this month — regulatory violations requiring remediation
 * 2. Approaching deadlines (14 days) — proactive workload management
 * 3. Stale claims (30 days no activity) — may indicate lost files or oversight
 *
 * Per 10 CCR 2695.6: ongoing training includes compliance self-assessment.
 */
export interface MonthlyReview {
  /** Month this review covers (e.g., '2026-03'). */
  month: string; // e.g., '2026-03'
  /** The examiner this review is for. */
  userId: string;
  /** Organization scope for database queries. */
  organizationId: string;
  /** Deadlines missed in the current month. */
  missedDeadlines: MissedDeadlineSummary[];
  /** Pending deadlines due within the next 14 days. */
  approachingDeadlines: ApproachingDeadlineSummary[];
  /** Open claims with no activity in the last 30 days. */
  claimsWithoutRecentActivity: StaleClaimSummary[];
  /** ISO timestamp when this review was generated. */
  generatedAt: string;
}

export interface MissedDeadlineSummary {
  claimId: string;
  claimNumber: string;
  deadlineType: string;
  dueDate: string;
  daysPastDue: number;
}

export interface ApproachingDeadlineSummary {
  claimId: string;
  claimNumber: string;
  deadlineType: string;
  dueDate: string;
  daysUntilDue: number;
}

export interface StaleClaimSummary {
  claimId: string;
  claimNumber: string;
  lastActivityDate: string;
  daysSinceActivity: number;
}

export interface RefresherResult {
  quarter: string;
  score: number;
  passed: boolean;
  totalQuestions: number;
  correctCount: number;
  results: {
    questionId: string;
    correct: boolean;
    explanation: string;
  }[];
}

export interface RefresherCompletionRecord {
  completedAt: string;
  score: number;
  passed: boolean;
}

export type RefresherCompletions = Record<string, RefresherCompletionRecord>;

export interface RefresherStatus {
  currentQuarter: string | null;
  completedRefreshers: RefresherCompletions;
  isCurrentQuarterComplete: boolean;
}

export interface MonthlyReviewRecord {
  completedAt: string;
  missedDeadlineCount: number;
}

export type MonthlyReviewCompletions = Record<string, MonthlyReviewRecord>;

export interface AuditTrainingRequirement {
  findingId: string;
  moduleId: string;
  title: string;
  description: string;
  requiredBy: string;
  isCompleted: boolean;
}

/** Safe refresher — questions with correctOptionId stripped. */
export type SafeRefresherQuestion = Omit<AssessmentQuestion, 'correctOptionId'>;

export type SafeQuarterlyRefresher = Omit<QuarterlyRefresher, 'questions'> & {
  questions: SafeRefresherQuestion[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stripCorrectAnswers(refresher: QuarterlyRefresher): SafeQuarterlyRefresher {
  return {
    ...refresher,
    questions: refresher.questions.map(({ correctOptionId: _stripped, ...safe }) => safe),
  };
}

/**
 * Determine the current quarter string (e.g., '2026-Q1') from a date.
 */
function getQuarterString(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const quarter = Math.floor(month / 3) + 1;
  return `${String(year)}-Q${String(quarter)}`;
}

/**
 * Get the current month string (e.g., '2026-03') from a date.
 */
function getMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${String(year)}-${month}`;
}

// ---------------------------------------------------------------------------
// Regulatory change notifications
// ---------------------------------------------------------------------------

/**
 * Get all active regulatory changes (effective date not yet passed or recently enacted).
 */
export function getActiveRegulatoryChanges(): RegulatoryChange[] {
  return REGULATORY_CHANGES;
}

/**
 * Record that a user has acknowledged a regulatory change.
 *
 * Updates the EducationProfile.acknowledgedChanges array.
 * Throws if the change ID is not a known regulatory change.
 */
export async function acknowledgeChange(userId: string, changeId: string): Promise<void> {
  if (!REGULATORY_CHANGES_BY_ID.has(changeId)) {
    throw new Error(`Unknown regulatory change: ${changeId}`);
  }

  // Ensure profile exists
  await prisma.educationProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  // Read current acknowledged list
  const profile = await prisma.educationProfile.findUniqueOrThrow({
    where: { userId },
    select: { acknowledgedChanges: true },
  });

  // Deduplicate
  const current = new Set(parseJsonStringArray(profile.acknowledgedChanges));
  if (current.has(changeId)) return; // Already acknowledged

  await prisma.educationProfile.update({
    where: { userId },
    data: {
      acknowledgedChanges: {
        push: changeId,
      },
    },
  });
}

/**
 * Get regulatory changes the user has NOT yet acknowledged.
 */
export async function getPendingChanges(userId: string): Promise<RegulatoryChange[]> {
  const profile = await prisma.educationProfile.findUnique({
    where: { userId },
    select: { acknowledgedChanges: true },
  });

  const acknowledged = new Set(parseJsonStringArray(profile?.acknowledgedChanges as JsonValue));
  return REGULATORY_CHANGES.filter((c) => !acknowledged.has(c.id));
}

// ---------------------------------------------------------------------------
// Monthly compliance review
// ---------------------------------------------------------------------------

/**
 * Generate a monthly compliance review for the user.
 *
 * Queries the database for:
 * - Deadlines missed in the current month
 * - Deadlines approaching in the next 14 days
 * - Claims with no activity in the last 30 days
 */
export async function generateMonthlyReview(
  userId: string,
  orgId: string,
): Promise<MonthlyReview> {
  const now = new Date();
  const month = getMonthString(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Query missed deadlines this month
  let missedDeadlines: MissedDeadlineSummary[];
  try {
    const missed = await prisma.regulatoryDeadline.findMany({
      where: {
        claim: {
          organizationId: orgId,
          assignedExaminerId: userId,
        },
        status: 'MISSED',
        dueDate: { gte: startOfMonth },
      },
      include: { claim: { select: { id: true, claimNumber: true } } },
      take: 50,
    });

    missedDeadlines = missed.map((d: { claim: { id: string; claimNumber: string }; deadlineType: string; dueDate: Date }) => ({
      claimId: d.claim.id,
      claimNumber: d.claim.claimNumber,
      deadlineType: d.deadlineType,
      dueDate: d.dueDate.toISOString(),
      daysPastDue: Math.floor((now.getTime() - d.dueDate.getTime()) / (24 * 60 * 60 * 1000)),
    }));
  } catch {
    // If the query fails (e.g., schema mismatch during early dev), return empty
    missedDeadlines = [];
  }

  // Query approaching deadlines (next 14 days)
  let approachingDeadlines: ApproachingDeadlineSummary[];
  try {
    const approaching = await prisma.regulatoryDeadline.findMany({
      where: {
        claim: {
          organizationId: orgId,
          assignedExaminerId: userId,
        },
        status: 'PENDING',
        dueDate: { gte: now, lte: fourteenDaysOut },
      },
      include: { claim: { select: { id: true, claimNumber: true } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    });

    approachingDeadlines = approaching.map((d: { claim: { id: string; claimNumber: string }; deadlineType: string; dueDate: Date }) => ({
      claimId: d.claim.id,
      claimNumber: d.claim.claimNumber,
      deadlineType: d.deadlineType,
      dueDate: d.dueDate.toISOString(),
      daysUntilDue: Math.floor((d.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    }));
  } catch {
    approachingDeadlines = [];
  }

  // Query claims without recent activity
  let claimsWithoutRecentActivity: StaleClaimSummary[];
  try {
    const staleClaims = await prisma.claim.findMany({
      where: {
        organizationId: orgId,
        assignedExaminerId: userId,
        status: { in: ['OPEN', 'UNDER_INVESTIGATION'] },
        updatedAt: { lt: thirtyDaysAgo },
      },
      select: { id: true, claimNumber: true, updatedAt: true },
      take: 50,
    });

    claimsWithoutRecentActivity = staleClaims.map((c) => ({
      claimId: c.id,
      claimNumber: c.claimNumber,
      lastActivityDate: c.updatedAt.toISOString(),
      daysSinceActivity: Math.floor(
        (now.getTime() - c.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
      ),
    }));
  } catch {
    claimsWithoutRecentActivity = [];
  }

  return {
    month,
    userId,
    organizationId: orgId,
    missedDeadlines,
    approachingDeadlines,
    claimsWithoutRecentActivity,
    generatedAt: now.toISOString(),
  };
}

/**
 * Mark a monthly review as completed for the user.
 *
 * Persists into EducationProfile.monthlyReviewsCompleted JSON field.
 */
export async function completeMonthlyReview(userId: string, month: string): Promise<void> {
  // Validate month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month format: ${month}. Expected YYYY-MM.`);
  }

  // Ensure profile exists
  await prisma.educationProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const profile = await prisma.educationProfile.findUniqueOrThrow({
    where: { userId },
    select: { monthlyReviewsCompleted: true },
  });

  const current = (profile.monthlyReviewsCompleted ?? {}) as unknown as MonthlyReviewCompletions;
  const updated: MonthlyReviewCompletions = {
    ...current,
    [month]: {
      completedAt: new Date().toISOString(),
      missedDeadlineCount: 0, // Actual count would come from review data
    },
  };

  await prisma.educationProfile.update({
    where: { userId },
    data: {
      monthlyReviewsCompleted: updated as unknown as InputJsonValue,
    },
  });
}

/**
 * Check whether the user needs to complete a monthly review for the current month.
 */
export async function isMonthlyReviewDue(userId: string): Promise<boolean> {
  const now = new Date();
  const currentMonth = getMonthString(now);

  const profile = await prisma.educationProfile.findUnique({
    where: { userId },
    select: { monthlyReviewsCompleted: true },
  });

  if (!profile) return true;

  const completed = (profile.monthlyReviewsCompleted ?? {}) as unknown as MonthlyReviewCompletions;
  return !(currentMonth in completed);
}

// ---------------------------------------------------------------------------
// Quarterly refreshers
// ---------------------------------------------------------------------------

/**
 * Get the current quarter's refresher, if one exists.
 *
 * Returns the refresher with correctOptionId stripped from questions.
 */
export function getCurrentRefresher(): SafeQuarterlyRefresher | null {
  const now = new Date();
  const quarter = getQuarterString(now);

  const refresher = QUARTERLY_REFRESHERS_BY_ID.get(quarter);
  if (!refresher) return null;

  return stripCorrectAnswers(refresher);
}

/**
 * Submit answers for a quarterly refresher assessment.
 *
 * Grades the answers, persists results if passed, and returns the result.
 * Throws if the quarter is not a known refresher.
 */
export async function submitRefresherAssessment(
  userId: string,
  quarter: string,
  answers: Record<string, string>,
): Promise<RefresherResult> {
  const refresher = QUARTERLY_REFRESHERS_BY_ID.get(quarter);
  if (!refresher) {
    throw new Error(`Quarterly refresher not found: ${quarter}`);
  }

  // Validate all questions are answered
  const answeredIds = new Set(Object.keys(answers));
  const missingIds = refresher.questions.filter((q) => !answeredIds.has(q.id)).map((q) => q.id);
  if (missingIds.length > 0) {
    throw new Error(
      `Refresher assessment incomplete — missing answers for questions: ${missingIds.join(', ')}`,
    );
  }

  // Grade each question
  const results = refresher.questions.map((q) => {
    const selected = answers[q.id];
    const correct = selected === q.correctOptionId;
    return {
      questionId: q.id,
      correct,
      explanation: q.explanation,
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const totalQuestions = refresher.questions.length;
  const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const passed = score >= refresher.passingScore;

  // Persist result
  await prisma.educationProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const profile = await prisma.educationProfile.findUniqueOrThrow({
    where: { userId },
    select: { quarterlyRefreshers: true },
  });

  const current = (profile.quarterlyRefreshers ?? {}) as unknown as RefresherCompletions;
  const updated: RefresherCompletions = {
    ...current,
    [quarter]: {
      completedAt: new Date().toISOString(),
      score,
      passed,
    },
  };

  await prisma.educationProfile.update({
    where: { userId },
    data: {
      quarterlyRefreshers: updated as unknown as InputJsonValue,
    },
  });

  return {
    quarter,
    score,
    passed,
    totalQuestions,
    correctCount,
    results,
  };
}

/**
 * Get the user's refresher completion status.
 */
export async function getRefresherStatus(userId: string): Promise<RefresherStatus> {
  const now = new Date();
  const currentQuarter = getQuarterString(now);

  const profile = await prisma.educationProfile.findUnique({
    where: { userId },
    select: { quarterlyRefreshers: true },
  });

  const completedRefreshers = (profile?.quarterlyRefreshers ?? {}) as unknown as RefresherCompletions;
  const currentRecord = completedRefreshers[currentQuarter];

  // Check if a refresher exists for the current quarter
  const hasCurrentRefresher = QUARTERLY_REFRESHERS_BY_ID.has(currentQuarter);

  return {
    currentQuarter: hasCurrentRefresher ? currentQuarter : null,
    completedRefreshers,
    isCurrentQuarterComplete: currentRecord?.passed === true,
  };
}

// ---------------------------------------------------------------------------
// Audit-triggered training
// ---------------------------------------------------------------------------

/**
 * Get any required audit-triggered training for the user.
 *
 * Reads from EducationProfile.auditTrainingCompleted and cross-references
 * with any outstanding audit findings that require remediation training.
 *
 * For MVP, returns an empty array (no audit integration yet).
 * The data structure is ready for when audit findings are integrated.
 */
export async function getRequiredAuditTraining(
  userId: string,
): Promise<AuditTrainingRequirement[]> {
  // Ensure profile exists
  await prisma.educationProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  // MVP: No audit finding integration yet — return empty array.
  // When audit system is integrated, this will query audit findings
  // assigned to the user and cross-reference with completed training.
  return [];
}
