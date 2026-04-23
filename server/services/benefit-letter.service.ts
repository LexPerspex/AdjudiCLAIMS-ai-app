/**
 * Benefit-payment + LC 3761 employer-notification letter service.
 *
 * AJC-16 — Phase 10. Wraps the existing `letter-template.service.ts` to
 * provide payment-aware letter generation for issued benefit payments
 * (TD/PD/death benefit/SJDB voucher) and structured LC 3761 employer
 * notifications for ongoing claim events (benefit award, coverage decision).
 *
 * All letters are GREEN zone — factual recitations of payment data and
 * statutory citations only. No legal analysis, no recommendations.
 *
 * Statutory anchors:
 *   - LC 4650, LC 4658, LC 4700, LC 4658.7 — benefit payment authorities
 *   - LC 3761 — employer's right to notice of material claim developments
 *   - LC 5402 — coverage decision statutory framework
 */

import type { FastifyRequest } from 'fastify';
import type { PaymentType } from '@prisma/client';
import { prisma } from '../db.js';
import { generateLetter, type GeneratedLetterRecord } from './letter-template.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Discriminated event type for LC 3761 employer notifications.
 *
 * BENEFIT_AWARD — informs employer that a benefit has been awarded
 * (e.g., TD started, PD assessed, SJDB issued).
 *
 * CLAIM_DECISION — informs employer of the coverage determination
 * (accepted, denied, delayed). Factual recitation of decision basis
 * only — never includes legal analysis.
 */
export type EmployerNotificationEvent =
  | {
      type: 'BENEFIT_AWARD';
      /** Underlying benefit type (TD/PD/DEATH/SJDB). */
      benefitType: PaymentType;
      /** Award amount as a number (will be formatted as $X,XXX.XX). */
      benefitAmount: number;
      /** ISO date when the award becomes effective (YYYY-MM-DD). */
      effectiveDate: string;
    }
  | {
      type: 'CLAIM_DECISION';
      /** Coverage decision outcome. */
      decisionType: 'ACCEPTED' | 'DENIED' | 'DELAYED';
      /** ISO date when the decision was made (YYYY-MM-DD). */
      decisionDate: string;
      /**
       * Factual basis for the decision. Examiner-supplied text — must be
       * factual recitation only (e.g., "Claim accepted following completion
       * of investigation. AOE/COE established for lumbar spine injury per
       * QME report dated YYYY-MM-DD.") No legal analysis or conclusions.
       */
      decisionBasis: string;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Decimal/number as USD with two decimal places and thousands
 * separators (no leading $ — the template has the $).
 *
 * Accepts: Decimal-like (object with toString() returning numeric string),
 * number, or string.
 */
export function formatMoney(value: number | string | { toString: () => string }): string {
  const raw = typeof value === 'string' ? value : value.toString();
  const num = Number(raw);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a Date to ISO YYYY-MM-DD. Returns 'N/A' for null/undefined.
 */
export function formatIsoDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d.toISOString().split('T')[0] ?? 'N/A';
}

/**
 * Map a PaymentType enum value to a human-readable label suitable for
 * inclusion in a letter to a claimant.
 */
export function paymentTypeLabel(type: PaymentType): string {
  switch (type) {
    case 'TD':
      return 'Temporary Disability (TD)';
    case 'PD':
      return 'Permanent Disability (PD)';
    case 'DEATH_BENEFIT':
      return 'Death Benefit';
    case 'SJDB_VOUCHER':
      return 'Supplemental Job Displacement Benefit (SJDB)';
    default:
      // Defensive — should never hit because all enum values are exhaustive,
      // but if a future enum value is added we render the raw value rather
      // than throw, so letter generation degrades gracefully.
      return String(type);
  }
}

/**
 * Map a CLAIM_DECISION decisionType to a human-readable label.
 */
export function decisionTypeLabel(decisionType: 'ACCEPTED' | 'DENIED' | 'DELAYED'): string {
  switch (decisionType) {
    case 'ACCEPTED':
      return 'Accepted';
    case 'DENIED':
      return 'Denied';
    case 'DELAYED':
      return 'Delayed (under investigation)';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a per-payment benefit letter for a specific BenefitPayment row.
 *
 * Hydrates the letter from the payment record (type, amount, period, date)
 * and the parent claim (claimant name, employer, insurer, examiner). The
 * letter is persisted via the existing `letter-template.service.generateLetter`
 * path which records the audit event (`LETTER_GENERATED`).
 *
 * @throws Error if the payment is not found.
 */
export async function generateBenefitPaymentLetter(
  userId: string,
  paymentId: string,
  request: FastifyRequest,
): Promise<GeneratedLetterRecord> {
  const payment = await prisma.benefitPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      claimId: true,
      paymentType: true,
      amount: true,
      paymentDate: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  if (!payment) {
    throw new Error(`Benefit payment not found: ${paymentId}`);
  }

  const overrides: Record<string, string> = {
    paymentType: paymentTypeLabel(payment.paymentType),
    paymentAmount: formatMoney(payment.amount),
    periodStart: formatIsoDate(payment.periodStart),
    periodEnd: formatIsoDate(payment.periodEnd),
    paymentDate: formatIsoDate(payment.paymentDate),
    paymentId: payment.id,
  };

  return generateLetter(userId, payment.claimId, 'benefit-payment-letter', request, overrides);
}

/**
 * Generate an LC 3761 employer notification letter for a claim event.
 *
 * The event is one of two structured types — BENEFIT_AWARD or CLAIM_DECISION
 * — each carrying its own factual fields. The function routes to the
 * appropriate template and populates the event-specific overrides.
 *
 * The persisted letter records the event payload in `populatedData` for
 * audit traceability.
 *
 * @throws Error if the claim is not found (via the underlying generateLetter call).
 */
export async function generateEmployerNotification(
  userId: string,
  claimId: string,
  event: EmployerNotificationEvent,
  request: FastifyRequest,
): Promise<GeneratedLetterRecord> {
  if (event.type === 'BENEFIT_AWARD') {
    const overrides: Record<string, string> = {
      benefitType: paymentTypeLabel(event.benefitType),
      benefitAmount: formatMoney(event.benefitAmount),
      effectiveDate: event.effectiveDate,
    };
    return generateLetter(
      userId,
      claimId,
      'employer-notification-benefit-award',
      request,
      overrides,
    );
  }

  // CLAIM_DECISION
  const overrides: Record<string, string> = {
    decisionType: decisionTypeLabel(event.decisionType),
    decisionDate: event.decisionDate,
    decisionBasis: event.decisionBasis,
  };
  return generateLetter(
    userId,
    claimId,
    'employer-notification-claim-decision',
    request,
    overrides,
  );
}
