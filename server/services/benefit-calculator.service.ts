/**
 * Benefit Calculator Service
 *
 * Pure arithmetic calculations for California Workers' Compensation benefits.
 * This is a GREEN zone feature -- factual data, statutory formulas, no legal analysis.
 *
 * Statutory authorities:
 * - LC 4653: TD rate = 2/3 AWE, subject to statutory min/max per injury year
 * - LC 4650: TD payments due every 14 days; first payment within 14 days of employer knowledge
 * - LC 4650(c): 10% self-imposed penalty for late TD payments
 * - LC 4700-4706: Death benefits for total and partial dependents
 *
 * All monetary values are in USD. Rates are DWC-published statutory min/max values.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a TD (Temporary Disability) rate calculation.
 *
 * The TD rate is derived from the statutory formula: 2/3 of AWE (Average Weekly
 * Earnings), clamped to DWC-published min/max bounds per LC 4653. The 2/3 fraction
 * was chosen by the legislature as a balance between wage replacement and return-to-work
 * incentive -- it provides meaningful income support without fully replacing wages.
 *
 * Clamping flags (wasClampedToMin/wasClampedToMax) are exposed so the UI can explain
 * to the examiner why the calculated rate differs from the raw 2/3 * AWE result.
 */
export interface TdRateResult {
  /** Average Weekly Earnings used as the calculation input. */
  awe: number;
  /** Final TD weekly rate after statutory min/max clamping per LC 4653. */
  tdRate: number;
  /** DWC-published minimum weekly TD rate for the injury year. */
  statutoryMin: number;
  /** DWC-published maximum weekly TD rate for the injury year. */
  statutoryMax: number;
  /** True if the raw rate (2/3 AWE) fell below the statutory minimum. */
  wasClampedToMin: boolean;
  /** True if the raw rate (2/3 AWE) exceeded the statutory maximum. */
  wasClampedToMax: boolean;
  /** The injury year used for rate table lookup (may differ from actual year if fallback was used). */
  injuryYear: number;
  /** Statutory citation for the formula applied (always 'LC 4653'). */
  statutoryAuthority: string;
}

/**
 * A single entry in a TD payment schedule.
 *
 * Represents one biweekly payment cycle per LC 4650. Each payment covers a 14-day
 * period, with the amount equal to 2x the weekly TD rate (biweekly payment).
 * The final payment may be prorated if the TD period does not end on a cycle boundary.
 *
 * Late detection: when actualPaymentDates are provided, each payment is compared
 * against its due date. Late payments incur a 10% self-imposed penalty per LC 4650(c).
 */
export interface PaymentScheduleEntry {
  /** Sequential payment number (1-indexed). */
  paymentNumber: number;
  /** Date this payment is due (14 days after period start per LC 4650). */
  dueDate: Date;
  /** Payment amount in USD (biweekly rate, or prorated for partial final period). */
  amount: number;
  /** First day of the 14-day period this payment covers. */
  periodStart: Date;
  /** Last day of the 14-day period this payment covers. */
  periodEnd: Date;
  /** True if the actual payment date (when provided) exceeded the due date. */
  isLate: boolean;
  /** 10% self-imposed penalty amount per LC 4650(c) if payment was late; 0 otherwise. */
  penaltyAmount: number;
}

/**
 * Complete TD benefit calculation result combining rate, schedule, and totals.
 *
 * This is a GREEN zone output — pure arithmetic on statutory formulas with
 * no legal analysis. The disclaimer must always be included in any UI display.
 */
export interface TdCalculationResult {
  /** The TD rate calculation details. */
  rate: TdRateResult;
  /** Date the first TD payment is due (startDate + 14 days per LC 4650). */
  firstPaymentDue: Date;
  /** Ordered array of biweekly payment schedule entries. */
  schedule: PaymentScheduleEntry[];
  /** Sum of all payment amounts in USD. */
  totalAmount: number;
  /** Sum of all late payment penalties in USD (per LC 4650(c)). */
  totalPenalty: number;
  /** Mandatory GREEN zone disclaimer for UI display. */
  disclaimer: string;
}

/**
 * Death benefit calculation result per LC 4700-4706.
 *
 * Total dependents receive the full statutory amount for the injury year.
 * Partial dependents receive a proportional share based on degree of dependency.
 * Weekly payments are made at the statutory max TD rate until the total is exhausted.
 */
export interface DeathBenefitResult {
  /** Total death benefit amount in USD for this dependency type. */
  totalBenefit: number;
  /** Weekly payment rate (set to the max TD rate for the injury year). */
  weeklyRate: number;
  /** Estimated number of weeks to exhaust the total benefit at the weekly rate. */
  totalWeeks: number;
  /** Whether the beneficiary is a total or partial dependent. */
  dependentType: 'TOTAL' | 'PARTIAL';
  /** Statutory citation (always 'LC 4700-4706'). */
  statutoryAuthority: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GREEN_ZONE_DISCLAIMER =
  'This benefit calculation applies the statutory formula to the data provided. ' +
  'It is arithmetic only. Verify inputs against source documents.';

/**
 * DWC-published statutory TD rate min/max by injury year.
 *
 * Per LC 4653, TD = 2/3 AWE, clamped to these bounds. Updated annually by DWC.
 */
const TD_RATE_TABLE: Record<number, { min: number; max: number }> = {
  2024: { min: 230.95, max: 1619.15 },
  2025: { min: 242.86, max: 1694.57 },
  2026: { min: 252.43, max: 1761.71 },
};

/**
 * Death benefit totals by injury year for total dependents.
 * LC 4702. These are the total death benefit amounts payable to total dependents.
 */
const DEATH_BENEFIT_TABLE: Record<number, number> = {
  2024: 290000,
  2025: 310000,
  2026: 320000,
};

/** Payment cycle in calendar days per LC 4650. */
const PAYMENT_CYCLE_DAYS = 14;

/** Late payment penalty rate per LC 4650(c). */
const LATE_PENALTY_RATE = 0.10;

/** TD rate fraction: 2/3 of AWE per LC 4653. */
const TD_RATE_FRACTION = 2 / 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round a monetary value to 2 decimal places.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Add calendar days to a date, returning a new Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the injury year from a date of injury.
 */
function getInjuryYear(dateOfInjury: Date): number {
  return dateOfInjury.getFullYear();
}

/**
 * Look up the statutory min/max for a given injury year.
 * Falls back to the nearest available year if the exact year is not in the table.
 */
function getRateTableEntry(injuryYear: number): { min: number; max: number; resolvedYear: number } {
  const entry = TD_RATE_TABLE[injuryYear];
  if (entry) {
    return { ...entry, resolvedYear: injuryYear };
  }

  // Fall back to the nearest year in the table
  const years = Object.keys(TD_RATE_TABLE).map(Number).sort((a, b) => a - b);
  const closest = years.reduce((prev, curr) =>
    Math.abs(curr - injuryYear) < Math.abs(prev - injuryYear) ? curr : prev,
  );
  const fallback = TD_RATE_TABLE[closest];
  if (!fallback) {
    throw new Error(`No TD rate table entry found for injury year ${String(injuryYear)}`);
  }
  return { ...fallback, resolvedYear: closest };
}

/**
 * Look up the death benefit total for a given injury year.
 * Falls back to the nearest available year if the exact year is not in the table.
 */
function getDeathBenefitTotal(injuryYear: number): number {
  const entry = DEATH_BENEFIT_TABLE[injuryYear];
  if (entry !== undefined) {
    return entry;
  }

  const years = Object.keys(DEATH_BENEFIT_TABLE).map(Number).sort((a, b) => a - b);
  const closest = years.reduce((prev, curr) =>
    Math.abs(curr - injuryYear) < Math.abs(prev - injuryYear) ? curr : prev,
  );
  const fallback = DEATH_BENEFIT_TABLE[closest];
  if (fallback === undefined) {
    throw new Error(`No death benefit table entry found for injury year ${String(injuryYear)}`);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Exported calculation functions
// ---------------------------------------------------------------------------

/**
 * Calculate the TD (Temporary Disability) weekly benefit rate.
 *
 * Formula: TD Rate = max(min(AWE * 2/3, statutoryMax), statutoryMin)
 * Authority: LC 4653
 *
 * @param awe - Average Weekly Earnings
 * @param dateOfInjury - Date of injury (determines which year's rate table to use)
 */
export function calculateTdRate(awe: number, dateOfInjury: Date): TdRateResult {
  if (awe < 0) {
    throw new Error('AWE cannot be negative');
  }

  const injuryYear = getInjuryYear(dateOfInjury);
  const { min: statutoryMin, max: statutoryMax, resolvedYear } = getRateTableEntry(injuryYear);

  const rawRate = roundCurrency(awe * TD_RATE_FRACTION);
  let tdRate = rawRate;
  let wasClampedToMin = false;
  let wasClampedToMax = false;

  if (rawRate < statutoryMin) {
    tdRate = statutoryMin;
    wasClampedToMin = true;
  } else if (rawRate > statutoryMax) {
    tdRate = statutoryMax;
    wasClampedToMax = true;
  }

  return {
    awe,
    tdRate,
    statutoryMin,
    statutoryMax,
    wasClampedToMin,
    wasClampedToMax,
    injuryYear: resolvedYear,
    statutoryAuthority: 'LC 4653',
  };
}

/**
 * Generate a payment schedule for TD benefit payments.
 *
 * Per LC 4650, the first payment is due within 14 calendar days of the start
 * date (employer knowledge / date of TD). Subsequent payments are due every
 * 14 calendar days thereafter.
 *
 * If actualPaymentDates are provided, each payment is checked against its
 * due date to determine if it was late. Late payments incur a 10% self-imposed
 * penalty per LC 4650(c).
 *
 * @param tdRate - The calculated TD weekly rate
 * @param startDate - First day of TD (date employer had knowledge)
 * @param endDate - Last day of TD period
 * @param actualPaymentDates - Optional array of actual payment dates for late detection
 */
export function generatePaymentSchedule(
  tdRate: number,
  startDate: Date,
  endDate: Date,
  actualPaymentDates?: Date[],
): PaymentScheduleEntry[] {
  const schedule: PaymentScheduleEntry[] = [];

  // Each payment covers a 14-day period (2 weeks of TD)
  // Payment amount = tdRate * 2 (biweekly = 2 weeks of the weekly rate)
  const biweeklyAmount = roundCurrency(tdRate * 2);
  let periodStart = new Date(startDate);
  let paymentNumber = 0;

  while (periodStart <= endDate) {
    paymentNumber++;

    // Period end is 13 days after period start (14-day period inclusive)
    let periodEnd = addDays(periodStart, 13);

    // If the period extends beyond the end date, truncate and prorate
    let amount = biweeklyAmount;
    if (periodEnd > endDate) {
      periodEnd = new Date(endDate);
      const actualDays =
        Math.floor((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      amount = roundCurrency((actualDays / 14) * biweeklyAmount);
    }

    // Due date: 14 days after period start
    const dueDate = addDays(periodStart, PAYMENT_CYCLE_DAYS);

    // Determine if payment was late
    let isLate = false;
    let penaltyAmount = 0;

    if (actualPaymentDates) {
      const actualDate = actualPaymentDates[paymentNumber - 1];
      if (actualDate && actualDate > dueDate) {
        isLate = true;
        penaltyAmount = roundCurrency(amount * LATE_PENALTY_RATE);
      }
    }

    schedule.push({
      paymentNumber,
      dueDate,
      amount,
      periodStart: new Date(periodStart),
      periodEnd,
      isLate,
      penaltyAmount,
    });

    // Advance to next period
    periodStart = addDays(periodStart, 14);
  }

  return schedule;
}

/**
 * Full TD benefit calculation: rate + payment schedule.
 *
 * Combines calculateTdRate and generatePaymentSchedule into a single result
 * with totals and the mandatory GREEN zone disclaimer.
 */
export function calculateTdBenefit(input: {
  awe: number;
  dateOfInjury: Date;
  startDate: Date;
  endDate?: Date;
  actualPaymentDates?: Date[];
}): TdCalculationResult {
  const { awe, dateOfInjury, startDate, actualPaymentDates } = input;

  // Default endDate to 104 weeks (728 days) from start -- the statutory max TD period
  const endDate = input.endDate ?? addDays(startDate, 728);

  const rate = calculateTdRate(awe, dateOfInjury);
  const firstPaymentDue = addDays(startDate, PAYMENT_CYCLE_DAYS);
  const schedule = generatePaymentSchedule(rate.tdRate, startDate, endDate, actualPaymentDates);

  const totalAmount = roundCurrency(
    schedule.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const totalPenalty = roundCurrency(
    schedule.reduce((sum, entry) => sum + entry.penaltyAmount, 0),
  );

  return {
    rate,
    firstPaymentDue,
    schedule,
    totalAmount,
    totalPenalty,
    disclaimer: GREEN_ZONE_DISCLAIMER,
  };
}

/**
 * Calculate death benefits per LC 4700-4706.
 *
 * Total dependents receive the full statutory amount. Partial dependents
 * receive a proportional share based on the degree of dependency.
 *
 * The weekly rate is derived from the statutory max TD rate for the injury
 * year. Death benefit payments are typically made at the TD rate until the
 * total statutory amount is exhausted.
 */
export function calculateDeathBenefit(input: {
  dateOfInjury: Date;
  numberOfDependents: number;
  dependentType: 'TOTAL' | 'PARTIAL';
  partialPercentage?: number;
}): DeathBenefitResult {
  const { dateOfInjury, numberOfDependents, dependentType, partialPercentage } = input;

  if (numberOfDependents < 1) {
    throw new Error('Number of dependents must be at least 1');
  }

  const injuryYear = getInjuryYear(dateOfInjury);
  const baseBenefit = getDeathBenefitTotal(injuryYear);

  let totalBenefit: number;

  if (dependentType === 'TOTAL') {
    totalBenefit = baseBenefit;
  } else {
    // Partial dependents receive a proportional share
    const pct = partialPercentage ?? 50;
    if (pct < 0 || pct > 100) {
      throw new Error('Partial percentage must be between 0 and 100');
    }
    totalBenefit = roundCurrency(baseBenefit * (pct / 100));
  }

  // Death benefits are paid at the max TD rate for the injury year until exhausted
  const { max: maxTdRate } = getRateTableEntry(injuryYear);
  const weeklyRate = maxTdRate;
  const totalWeeks = Math.ceil(totalBenefit / weeklyRate);

  return {
    totalBenefit,
    weeklyRate,
    totalWeeks,
    dependentType,
    statutoryAuthority: 'LC 4700-4706',
  };
}
