/**
 * Regulatory deadline engine — runtime management of claim deadlines.
 *
 * The deadline-generator creates deadlines at claim creation time.
 * This engine manages them at runtime: urgency classification,
 * business day calculation, recalculation, and auto-miss detection.
 *
 * All urgency calculations are pure functions for testability.
 * Business day calculations exclude weekends and CA state holidays.
 *
 * GREEN zone disclaimer: "Deadlines calculated from statutory requirements.
 * Verify underlying dates."
 */

import type { DeadlineType, DeadlineStatus, RegulatoryDeadline } from '@prisma/client';
import { prisma } from '../db.js';
import { UserRole } from '../middleware/rbac.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrgencyLevel = 'GREEN' | 'YELLOW' | 'RED' | 'OVERDUE';

export interface DeadlineWithUrgency {
  id: string;
  claimId: string;
  deadlineType: DeadlineType;
  dueDate: Date;
  status: DeadlineStatus;
  statutoryAuthority: string;
  urgency: UrgencyLevel;
  percentElapsed: number;
  daysRemaining: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface DeadlineSummary {
  total: number;
  pending: number;
  met: number;
  missed: number;
  waived: number;
  overdue: number;
  /** Count of RED + OVERDUE deadlines */
  urgentCount: number;
}

// ---------------------------------------------------------------------------
// California state holidays (observed dates used for business day calc)
// ---------------------------------------------------------------------------

/**
 * Returns CA state holidays for a given year.
 *
 * Includes all holidays observed by the State of California that affect
 * regulatory deadline computation. Fixed-date holidays that fall on a
 * weekend are observed on the nearest weekday per standard CA rules.
 */
function getCAHolidays(year: number): Date[] {
  const holidays: Date[] = [];

  // New Year's Day — January 1
  holidays.push(observedDate(new Date(year, 0, 1)));

  // Martin Luther King Jr. Day — 3rd Monday of January
  holidays.push(nthWeekday(year, 0, 1, 3));

  // Presidents' Day — 3rd Monday of February
  holidays.push(nthWeekday(year, 1, 1, 3));

  // César Chávez Day — March 31
  holidays.push(observedDate(new Date(year, 2, 31)));

  // Memorial Day — Last Monday of May
  holidays.push(lastWeekday(year, 4, 1));

  // Juneteenth — June 19
  holidays.push(observedDate(new Date(year, 5, 19)));

  // Independence Day — July 4
  holidays.push(observedDate(new Date(year, 6, 4)));

  // Labor Day — 1st Monday of September
  holidays.push(nthWeekday(year, 8, 1, 1));

  // Indigenous Peoples' Day — 2nd Monday of October
  holidays.push(nthWeekday(year, 9, 1, 2));

  // Veterans Day — November 11
  holidays.push(observedDate(new Date(year, 10, 11)));

  // Thanksgiving — 4th Thursday of November
  holidays.push(nthWeekday(year, 10, 4, 4));

  // Day after Thanksgiving — 4th Friday of November
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const dayAfter = new Date(thanksgiving.getTime());
  dayAfter.setDate(dayAfter.getDate() + 1);
  holidays.push(dayAfter);

  // Christmas Day — December 25
  holidays.push(observedDate(new Date(year, 11, 25)));

  return holidays;
}

/** If a fixed holiday falls on Saturday, observe Friday. If Sunday, observe Monday. */
function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) {
    // Saturday → Friday
    const d = new Date(date.getTime());
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (day === 0) {
    // Sunday → Monday
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + 1);
    return d;
  }
  return date;
}

/** Get the nth occurrence of a weekday in a month (1-indexed). weekday: 0=Sun..6=Sat */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  let dayOfMonth = 1 + ((weekday - first.getDay() + 7) % 7);
  dayOfMonth += (n - 1) * 7;
  return new Date(year, month, dayOfMonth);
}

/** Get the last occurrence of a weekday in a month. weekday: 0=Sun..6=Sat */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0); // last day of month
  const diff = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - diff);
}

/** Format a Date as YYYY-MM-DD for holiday set comparison. */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

// Cache holiday sets by year to avoid recomputation
const holidayCache = new Map<number, Set<string>>();

function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(getCAHolidays(year).map(dateKey));
    holidayCache.set(year, set);
  }
  return set.has(dateKey(date));
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !isHoliday(date);
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Add business days to a date, skipping weekends and CA state holidays.
 *
 * Used for UR deadline types (e.g., 5 business days for prospective UR).
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      added++;
    }
  }
  return result;
}

/**
 * Classify the urgency of a deadline based on elapsed time.
 *
 * Urgency levels:
 * - GREEN:   < 50% of time elapsed
 * - YELLOW:  50% - 80% elapsed
 * - RED:     > 80% elapsed (but not yet overdue)
 * - OVERDUE: past the due date
 *
 * This is a pure function with no database access, suitable for unit testing.
 *
 * @param createdAt - When the deadline was created
 * @param dueDate   - When the deadline is due
 * @param now       - Current time (defaults to Date.now(), injectable for testing)
 */
export function classifyUrgency(
  createdAt: Date,
  dueDate: Date,
  now?: Date,
): { urgency: UrgencyLevel; percentElapsed: number; daysRemaining: number } {
  const currentTime = now ?? new Date();

  const totalMs = dueDate.getTime() - createdAt.getTime();
  const elapsedMs = currentTime.getTime() - createdAt.getTime();

  // Calculate days remaining (never negative)
  const msRemaining = dueDate.getTime() - currentTime.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  // Past due
  if (currentTime.getTime() >= dueDate.getTime()) {
    return {
      urgency: 'OVERDUE',
      percentElapsed: 100,
      daysRemaining: 0,
    };
  }

  // Calculate percentage elapsed
  const percentElapsed = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;

  let urgency: UrgencyLevel;
  if (percentElapsed < 50) {
    urgency = 'GREEN';
  } else if (percentElapsed <= 80) {
    urgency = 'YELLOW';
  } else {
    urgency = 'RED';
  }

  return { urgency, percentElapsed, daysRemaining };
}

// ---------------------------------------------------------------------------
// Database functions
// ---------------------------------------------------------------------------

/** Enrich a raw deadline record with urgency classification. */
function enrichDeadline(deadline: RegulatoryDeadline, now?: Date): DeadlineWithUrgency {
  // Completed deadlines don't need urgency classification
  if (deadline.status === 'MET' || deadline.status === 'WAIVED') {
    return {
      id: deadline.id,
      claimId: deadline.claimId,
      deadlineType: deadline.deadlineType,
      dueDate: deadline.dueDate,
      status: deadline.status,
      statutoryAuthority: deadline.statutoryAuthority,
      urgency: 'GREEN',
      percentElapsed: 100,
      daysRemaining: 0,
      createdAt: deadline.createdAt,
      completedAt: deadline.completedAt,
    };
  }

  const { urgency, percentElapsed, daysRemaining } = classifyUrgency(
    deadline.createdAt,
    deadline.dueDate,
    now,
  );

  return {
    id: deadline.id,
    claimId: deadline.claimId,
    deadlineType: deadline.deadlineType,
    dueDate: deadline.dueDate,
    status: urgency === 'OVERDUE' && deadline.status === 'PENDING' ? 'MISSED' : deadline.status,
    statutoryAuthority: deadline.statutoryAuthority,
    urgency,
    percentElapsed,
    daysRemaining,
    createdAt: deadline.createdAt,
    completedAt: deadline.completedAt,
  };
}

/**
 * Urgency sort order for dashboard display — most urgent first.
 */
const URGENCY_ORDER: Record<UrgencyLevel, number> = {
  OVERDUE: 0,
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
};

/**
 * Get all deadlines for a specific claim, enriched with urgency classification.
 */
export async function getClaimDeadlines(claimId: string): Promise<DeadlineWithUrgency[]> {
  const deadlines = await prisma.regulatoryDeadline.findMany({
    where: { claimId },
    orderBy: { dueDate: 'asc' },
  });

  const now = new Date();
  return deadlines.map((d) => enrichDeadline(d, now));
}

/**
 * Get all deadlines visible to a user across their claims, sorted by urgency.
 *
 * - CLAIMS_EXAMINER: only deadlines for their assigned claims
 * - CLAIMS_SUPERVISOR / CLAIMS_ADMIN: all deadlines in their org
 */
export async function getAllUserDeadlines(
  userId: string,
  orgId: string,
  role: UserRole,
): Promise<DeadlineWithUrgency[]> {
  // Build claim filter based on role
  const claimWhere: Record<string, unknown> = {
    organizationId: orgId,
  };

  if (role === UserRole.CLAIMS_EXAMINER) {
    claimWhere['assignedExaminerId'] = userId;
  }

  const deadlines = await prisma.regulatoryDeadline.findMany({
    where: {
      claim: claimWhere,
    },
    orderBy: { dueDate: 'asc' },
  });

  const now = new Date();
  const enriched = deadlines.map((d) => enrichDeadline(d, now));

  // Sort by urgency (most urgent first), then by due date ascending
  enriched.sort((a, b) => {
    const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return enriched;
}

/**
 * Mark a deadline as MET or WAIVED.
 *
 * @param deadlineId - The deadline to update
 * @param status - MET or WAIVED
 * @param reason - Optional reason (particularly for WAIVED)
 */
export async function markDeadline(
  deadlineId: string,
  status: 'MET' | 'WAIVED',
  _reason?: string,
): Promise<RegulatoryDeadline> {
  return prisma.regulatoryDeadline.update({
    where: { id: deadlineId },
    data: {
      status,
      completedAt: new Date(),
    },
  });
}

/**
 * Get an aggregate summary of deadlines for a claim.
 */
export async function getDeadlineSummary(claimId: string): Promise<DeadlineSummary> {
  const deadlines = await getClaimDeadlines(claimId);

  const summary: DeadlineSummary = {
    total: deadlines.length,
    pending: 0,
    met: 0,
    missed: 0,
    waived: 0,
    overdue: 0,
    urgentCount: 0,
  };

  for (const d of deadlines) {
    switch (d.status) {
      case 'PENDING':
        summary.pending++;
        break;
      case 'MET':
        summary.met++;
        break;
      case 'MISSED':
        summary.missed++;
        break;
      case 'WAIVED':
        summary.waived++;
        break;
    }

    if (d.urgency === 'OVERDUE') {
      summary.overdue++;
    }

    if (d.urgency === 'RED' || d.urgency === 'OVERDUE') {
      summary.urgentCount++;
    }
  }

  return summary;
}

/**
 * Mapping of deadline types to their calendar day offsets from dateReceived.
 *
 * Matches the definitions in deadline-generator.ts. UR types use business days.
 */
const DEADLINE_DAYS: Record<DeadlineType, { days: number; businessDays: boolean }> = {
  ACKNOWLEDGE_15DAY: { days: 15, businessDays: false },
  DETERMINE_40DAY: { days: 40, businessDays: false },
  TD_FIRST_14DAY: { days: 14, businessDays: false },
  TD_SUBSEQUENT_14DAY: { days: 14, businessDays: false },
  DELAY_NOTICE_30DAY: { days: 30, businessDays: false },
  UR_PROSPECTIVE_5DAY: { days: 5, businessDays: true },
  UR_RETROSPECTIVE_30DAY: { days: 30, businessDays: true },
  EMPLOYER_NOTIFY_15DAY: { days: 15, businessDays: false },
};

/**
 * Recalculate all pending deadline due dates for a claim when the
 * dateReceived changes (e.g., data correction).
 *
 * Only recalculates PENDING deadlines — completed deadlines are immutable.
 */
export async function recalculateDeadlines(
  claimId: string,
  newDateReceived: Date,
): Promise<void> {
  const deadlines = await prisma.regulatoryDeadline.findMany({
    where: { claimId, status: 'PENDING' },
  });

  const updates = deadlines.map((d) => {
    const config = DEADLINE_DAYS[d.deadlineType];
    const newDueDate = config.businessDays
      ? addBusinessDays(newDateReceived, config.days)
      : addCalendarDays(newDateReceived, config.days);

    return prisma.regulatoryDeadline.update({
      where: { id: d.id },
      data: { dueDate: newDueDate },
    });
  });

  await Promise.all(updates);
}

/** Add calendar days to a date. */
function addCalendarDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// Re-export for use in tests
export { isHoliday as _isHoliday, getCAHolidays as _getCAHolidays };
