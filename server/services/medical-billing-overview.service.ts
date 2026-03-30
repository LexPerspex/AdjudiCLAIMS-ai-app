/**
 * Medical Billing Overview Service
 *
 * Aggregated medical cost picture for a workers' compensation claim:
 * - Lien summary with OMFS comparison totals
 * - Reserve vs. exposure analysis
 * - Per-provider billing summary
 * - Admitted vs. non-admitted body part cost breakdown
 * - Medical payment recording (direct payments and lien payments)
 * - Chronological billing timeline
 *
 * GREEN zone — factual cost aggregation and payment tracking.
 * YELLOW zone — admitted vs. non-admitted breakdown (statistical, with disclaimer).
 * RED zone — whether treatment for a denied body part is compensable
 *   (legal question — must refer to defense counsel).
 *
 * Statutory authorities:
 * - LC 4600 — Employer's duty to provide medical treatment
 * - LC 4903 — Lien filing requirements
 * - 8 CCR 9789.10 et seq. — OMFS fee schedule
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Prisma Decimal (or any numeric value) to a JS number. */
function d2n(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return Number(val);
}

// ---------------------------------------------------------------------------
// Medical Billing Overview
// ---------------------------------------------------------------------------

/**
 * Get a comprehensive medical billing overview for a claim.
 *
 * Runs parallel queries for performance and aggregates:
 * - Lien summary + OMFS comparison
 * - Reserve vs. exposure
 * - Per-provider cost breakdown
 * - Admitted vs. non-admitted body part amounts
 * - Full payment timeline
 */
export async function getMedicalBillingOverview(claimId: string) {
  // Parallel queries for performance
  const [claim, liens, medicalPayments, , bodyParts] = await Promise.all([
    prisma.claim.findUniqueOrThrow({
      where: { id: claimId },
      select: {
        currentReserveMedical: true,
        currentReserveLien: true,
        totalPaidMedical: true,
      },
    }),
    prisma.lien.findMany({
      where: { claimId },
      include: { lineItems: { include: { bodyPart: true } } },
    }),
    prisma.medicalPayment.findMany({
      where: { claimId },
      include: { bodyPart: true },
      orderBy: { paymentDate: 'desc' },
    }),
    prisma.benefitPayment.findMany({
      where: { claimId },
    }),
    prisma.claimBodyPart.findMany({
      where: { claimId },
    }),
  ]);

  // --- Lien Summary ---
  const ACTIVE_STATUSES = [
    'RECEIVED',
    'UNDER_REVIEW',
    'OMFS_COMPARED',
    'NEGOTIATING',
    'DISPUTED',
    'WCAB_HEARING',
  ];
  const activeLiens = liens.filter((l) => ACTIVE_STATUSES.includes(l.status));
  const resolvedLiens = liens.filter((l) => !ACTIVE_STATUSES.includes(l.status));

  const lienSummary = {
    totalLiens: liens.length,
    activeLiens: activeLiens.length,
    resolvedLiens: resolvedLiens.length,
    totalBilled: liens.reduce((sum, l) => sum + d2n(l.totalAmountClaimed), 0),
    totalOmfsAllowed: liens.reduce((sum, l) => sum + d2n(l.totalOmfsAllowed), 0),
    totalResolved: resolvedLiens.reduce((sum, l) => sum + d2n(l.resolvedAmount), 0),
    totalOutstanding: activeLiens.reduce((sum, l) => sum + d2n(l.totalAmountClaimed), 0),
    byStatus: Object.fromEntries(
      Object.entries(
        liens.reduce(
          (acc, l) => {
            acc[l.status] = (acc[l.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      ),
    ),
  };

  // --- OMFS Summary ---
  const allLineItems = liens.flatMap((l) => l.lineItems);
  const comparedItems = allLineItems.filter((li) => li.omfsRate !== null);
  const omfsSummary = {
    totalLineItems: allLineItems.length,
    comparedLineItems: comparedItems.length,
    totalBilled: allLineItems.reduce((sum, li) => sum + d2n(li.amountClaimed), 0),
    totalOmfsAllowed: comparedItems.reduce((sum, li) => sum + d2n(li.omfsRate), 0),
    totalDiscrepancy: allLineItems.reduce((sum, li) => sum + d2n(li.overchargeAmount), 0),
    overchargeCount: allLineItems.filter((li) => li.isOvercharge).length,
  };

  // --- Reserve vs Exposure ---
  const reserveVsExposure = {
    currentMedicalReserve: d2n(claim.currentReserveMedical),
    currentLienReserve: d2n(claim.currentReserveLien),
    totalOutstandingLiens: lienSummary.totalOutstanding,
    totalMedicalPaid: d2n(claim.totalPaidMedical),
    netExposure: lienSummary.totalOutstanding - d2n(claim.currentReserveLien),
  };

  // --- Provider Summary ---
  const providerMap = new Map<
    string,
    { totalBilled: number; totalPaid: number; lienCount: number }
  >();
  for (const lien of liens) {
    const name = lien.lienClaimant;
    const entry = providerMap.get(name) ?? { totalBilled: 0, totalPaid: 0, lienCount: 0 };
    entry.totalBilled += d2n(lien.totalAmountClaimed);
    entry.totalPaid += d2n(lien.resolvedAmount);
    entry.lienCount += 1;
    providerMap.set(name, entry);
  }
  for (const mp of medicalPayments) {
    if (!mp.lienId) {
      // direct payments only — avoid double-counting lien payments
      const entry = providerMap.get(mp.providerName) ?? { totalBilled: 0, totalPaid: 0, lienCount: 0 };
      entry.totalPaid += d2n(mp.amount);
      providerMap.set(mp.providerName, entry);
    }
  }
  const providerSummary = Array.from(providerMap.entries())
    .map(([name, data]) => ({
      providerName: name,
      ...data,
      outstanding: data.totalBilled - data.totalPaid,
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // --- Admitted vs Non-Admitted ---
  const bodyPartMap = new Map(bodyParts.map((bp) => [bp.id, bp]));
  let admittedTotal = 0;
  let deniedTotal = 0;
  let pendingTotal = 0;
  let unlinkedTotal = 0;

  for (const li of allLineItems) {
    const amount = d2n(li.amountClaimed);
    const bp = li.bodyPartId ? bodyPartMap.get(li.bodyPartId) : null;
    if (!bp) {
      unlinkedTotal += amount;
    } else if (bp.status === 'ADMITTED') {
      admittedTotal += amount;
    } else if (bp.status === 'DENIED') {
      deniedTotal += amount;
    } else {
      pendingTotal += amount;
    }
  }
  for (const mp of medicalPayments) {
    const amount = d2n(mp.amount);
    const bp = mp.bodyPartId ? bodyPartMap.get(mp.bodyPartId) : null;
    if (!bp) {
      unlinkedTotal += amount;
    } else if (bp.status === 'ADMITTED') {
      admittedTotal += amount;
    } else if (bp.status === 'DENIED') {
      deniedTotal += amount;
    } else {
      pendingTotal += amount;
    }
  }
  const admittedVsNonAdmitted = {
    admittedTotal,
    deniedTotal,
    pendingTotal,
    unlinkedTotal,
    disclaimer:
      'Whether treatment for a non-admitted body part is compensable is a legal question. ' +
      'Consult defense counsel.',
  };

  // --- Billing Timeline ---
  type TimelineEvent = {
    date: Date;
    type: string;
    description: string;
    amount?: number;
  };
  const timeline: TimelineEvent[] = [];

  for (const l of liens) {
    timeline.push({
      date: l.filingDate,
      type: 'LIEN_FILED',
      description: `Lien filed by ${l.lienClaimant} (${l.lienType})`,
      amount: d2n(l.totalAmountClaimed),
    });
    if (l.resolvedAt) {
      timeline.push({
        date: l.resolvedAt,
        type: 'LIEN_RESOLVED',
        description: `Lien resolved: ${l.lienClaimant} — ${l.status}`,
        amount: d2n(l.resolvedAmount),
      });
    }
  }
  for (const mp of medicalPayments) {
    timeline.push({
      date: mp.paymentDate,
      type: 'MEDICAL_PAYMENT',
      description: `Payment to ${mp.providerName}: ${mp.description}`,
      amount: d2n(mp.amount),
    });
  }
  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    lienSummary,
    omfsSummary,
    reserveVsExposure,
    providerSummary,
    admittedVsNonAdmitted,
    medicalPayments: medicalPayments.map((mp) => ({
      ...mp,
      amount: d2n(mp.amount),
      bodyPartName: mp.bodyPart?.bodyPartName ?? null,
      bodyPartStatus: mp.bodyPart?.status ?? null,
    })),
    timeline,
  };
}

// ---------------------------------------------------------------------------
// Medical Payment Recording
// ---------------------------------------------------------------------------

export interface RecordMedicalPaymentInput {
  claimId: string;
  bodyPartId?: string;
  lienId?: string;
  providerName: string;
  paymentType: 'DIRECT_PAYMENT' | 'LIEN_PAYMENT' | 'PHARMACY' | 'DME' | 'DIAGNOSTICS';
  amount: number;
  paymentDate: Date;
  serviceDate?: Date;
  cptCode?: string;
  description: string;
  checkNumber?: string;
  notes?: string;
}

/**
 * Record a medical payment (direct or lien-based).
 */
export async function recordMedicalPayment(input: RecordMedicalPaymentInput) {
  return prisma.medicalPayment.create({ data: input });
}

/**
 * Get medical payments for a claim with optional filters.
 */
export async function getMedicalPayments(
  claimId: string,
  filters?: {
    bodyPartId?: string;
    providerName?: string;
    fromDate?: Date;
    toDate?: Date;
  },
) {
  return prisma.medicalPayment.findMany({
    where: {
      claimId,
      ...(filters?.bodyPartId ? { bodyPartId: filters.bodyPartId } : {}),
      ...(filters?.providerName ? { providerName: filters.providerName } : {}),
      ...(filters?.fromDate ?? filters?.toDate
        ? {
            paymentDate: {
              ...(filters?.fromDate ? { gte: filters.fromDate } : {}),
              ...(filters?.toDate ? { lte: filters.toDate } : {}),
            },
          }
        : {}),
    },
    include: { bodyPart: true, lien: true },
    orderBy: { paymentDate: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Provider Summary
// ---------------------------------------------------------------------------

/**
 * Get per-provider billing and payment summary for a claim.
 *
 * Aggregates lien amounts and direct medical payments by provider name.
 * Lien payments are not double-counted with direct payment records.
 */
export async function getProviderSummary(claimId: string) {
  const [liens, payments] = await Promise.all([
    prisma.lien.findMany({ where: { claimId } }),
    prisma.medicalPayment.findMany({ where: { claimId } }),
  ]);

  const map = new Map<
    string,
    { totalBilled: number; totalPaid: number; lienCount: number; paymentCount: number }
  >();

  for (const l of liens) {
    const e = map.get(l.lienClaimant) ?? {
      totalBilled: 0,
      totalPaid: 0,
      lienCount: 0,
      paymentCount: 0,
    };
    e.totalBilled += Number(l.totalAmountClaimed);
    e.totalPaid += Number(l.resolvedAmount ?? 0);
    e.lienCount += 1;
    map.set(l.lienClaimant, e);
  }
  for (const p of payments) {
    if (!p.lienId) {
      const e = map.get(p.providerName) ?? {
        totalBilled: 0,
        totalPaid: 0,
        lienCount: 0,
        paymentCount: 0,
      };
      e.totalPaid += Number(p.amount);
      e.paymentCount += 1;
      map.set(p.providerName, e);
    }
  }

  return Array.from(map.entries())
    .map(([name, data]) => ({
      providerName: name,
      ...data,
      outstanding: data.totalBilled - data.totalPaid,
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled);
}
