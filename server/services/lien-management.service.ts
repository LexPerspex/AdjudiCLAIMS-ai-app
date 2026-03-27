/**
 * Lien Management Service
 *
 * CRUD operations, status transitions, OMFS bill comparison, filing
 * compliance checks, and reserve impact calculations for liens filed
 * against workers' compensation claims.
 *
 * GREEN zone feature — lien tracking, fee schedule comparison, and
 * filing compliance are factual operations. Lien validity evaluation
 * or settlement strategy is RED zone and must be referred to counsel.
 *
 * Statutory authorities:
 * - LC 4903 — Lien filing requirements
 * - LC 4903.1 — Filing fee and activation fee requirements
 * - 8 CCR 9789.10 et seq. — OMFS rate schedule
 */

import type { LienStatus, LienType, FilingFeeStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { compareBillToOmfs, type BillComparisonResult } from './omfs-comparison.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateLienInput {
  lienClaimant: string;
  lienType: LienType;
  totalAmountClaimed: number;
  filingDate: string; // ISO date string
  filingFeeStatus?: FilingFeeStatus;
  wcabCaseNumber?: string;
  notes?: string;
}

export interface CreateLineItemInput {
  serviceDate: string; // ISO date string
  cptCode?: string;
  description: string;
  amountClaimed: number;
}

export interface LienRecord {
  id: string;
  claimId: string;
  lienClaimant: string;
  lienType: LienType;
  totalAmountClaimed: number;
  totalOmfsAllowed: number | null;
  discrepancyAmount: number | null;
  filingDate: Date;
  filingFeeStatus: FilingFeeStatus;
  status: LienStatus;
  resolvedAmount: number | null;
  resolvedAt: Date | null;
  wcabCaseNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LienLineItemRecord {
  id: string;
  lienId: string;
  serviceDate: Date;
  cptCode: string | null;
  description: string;
  amountClaimed: number;
  omfsRate: number | null;
  isOvercharge: boolean;
  overchargeAmount: number | null;
}

export interface LienWithLineItems extends LienRecord {
  lineItems: LienLineItemRecord[];
}

export interface LienSummary {
  totalLiens: number;
  totalClaimed: number;
  totalOmfsAllowed: number;
  totalDiscrepancy: number;
  activeLienCount: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

export interface LienExposure {
  totalExposure: number;
  byType: Record<string, number>;
  activeLienCount: number;
}

// ---------------------------------------------------------------------------
// Status transition map
// ---------------------------------------------------------------------------

/**
 * Valid lien status transitions.
 *
 * The lifecycle follows the typical CA WC lien resolution path:
 *   RECEIVED → UNDER_REVIEW → OMFS_COMPARED → NEGOTIATING → resolution
 *
 * Key design choices:
 * - WITHDRAWN is reachable from any active state (liens can be withdrawn at any time)
 * - OMFS_COMPARED cannot go back to UNDER_REVIEW (comparison is irreversible)
 * - DISPUTED can still resolve to PAID_IN_FULL/PAID_REDUCED (settlement after dispute)
 * - Terminal states (PAID_IN_FULL, PAID_REDUCED, WITHDRAWN, RESOLVED_BY_ORDER) have no outgoing transitions
 *
 * Per LC 4903: lien claimants must follow this procedural path for WCAB resolution.
 */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['OMFS_COMPARED', 'WITHDRAWN'],
  OMFS_COMPARED: ['NEGOTIATING', 'PAID_IN_FULL', 'DISPUTED', 'WITHDRAWN'],
  NEGOTIATING: ['PAID_IN_FULL', 'PAID_REDUCED', 'DISPUTED', 'WITHDRAWN'],
  DISPUTED: ['WCAB_HEARING', 'WITHDRAWN', 'PAID_IN_FULL', 'PAID_REDUCED'],
  WCAB_HEARING: ['RESOLVED_BY_ORDER', 'WITHDRAWN'],
};

const RESOLVED_STATUSES: LienStatus[] = [
  'PAID_IN_FULL',
  'PAID_REDUCED',
  'WITHDRAWN',
  'RESOLVED_BY_ORDER',
];

const ACTIVE_STATUSES: LienStatus[] = [
  'RECEIVED',
  'UNDER_REVIEW',
  'OMFS_COMPARED',
  'NEGOTIATING',
  'DISPUTED',
  'WCAB_HEARING',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toLienRecord(raw: {
  id: string;
  claimId: string;
  lienClaimant: string;
  lienType: LienType;
  totalAmountClaimed: Prisma.Decimal;
  totalOmfsAllowed: Prisma.Decimal | null;
  discrepancyAmount: Prisma.Decimal | null;
  filingDate: Date;
  filingFeeStatus: FilingFeeStatus;
  status: LienStatus;
  resolvedAmount: Prisma.Decimal | null;
  resolvedAt: Date | null;
  wcabCaseNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LienRecord {
  return {
    ...raw,
    totalAmountClaimed: Number(raw.totalAmountClaimed),
    totalOmfsAllowed: decimalToNumber(raw.totalOmfsAllowed),
    discrepancyAmount: decimalToNumber(raw.discrepancyAmount),
    resolvedAmount: decimalToNumber(raw.resolvedAmount),
  };
}

function toLineItemRecord(raw: {
  id: string;
  lienId: string;
  serviceDate: Date;
  cptCode: string | null;
  description: string;
  amountClaimed: Prisma.Decimal;
  omfsRate: Prisma.Decimal | null;
  isOvercharge: boolean;
  overchargeAmount: Prisma.Decimal | null;
}): LienLineItemRecord {
  return {
    ...raw,
    amountClaimed: Number(raw.amountClaimed),
    omfsRate: decimalToNumber(raw.omfsRate),
    overchargeAmount: decimalToNumber(raw.overchargeAmount),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new lien for a claim.
 */
export async function createLien(claimId: string, data: CreateLienInput): Promise<LienRecord> {
  const raw = await prisma.lien.create({
    data: {
      claimId,
      lienClaimant: data.lienClaimant,
      lienType: data.lienType,
      totalAmountClaimed: data.totalAmountClaimed,
      filingDate: new Date(data.filingDate),
      filingFeeStatus: data.filingFeeStatus ?? 'UNKNOWN',
      wcabCaseNumber: data.wcabCaseNumber ?? null,
      notes: data.notes ?? null,
    },
  });

  return toLienRecord(raw);
}

/**
 * Get a single lien with its line items.
 */
export async function getLien(lienId: string): Promise<LienWithLineItems | null> {
  const raw = await prisma.lien.findUnique({
    where: { id: lienId },
    include: { lineItems: true },
  });

  if (!raw) return null;

  return {
    ...toLienRecord(raw),
    lineItems: raw.lineItems.map(toLineItemRecord),
  };
}

/**
 * Get all liens for a claim.
 */
export async function getClaimLiens(claimId: string): Promise<LienRecord[]> {
  const rows = await prisma.lien.findMany({
    where: { claimId },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toLienRecord);
}

/**
 * Update lien status with transition validation.
 */
export async function updateLienStatus(
  lienId: string,
  status: LienStatus,
  resolvedAmount?: number,
): Promise<LienRecord> {
  const existing = await prisma.lien.findUnique({
    where: { id: lienId },
    select: { status: true },
  });

  if (!existing) {
    throw new Error(`Lien ${lienId} not found`);
  }

  const allowed = VALID_STATUS_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(status)) {
    throw new Error(
      `Invalid status transition: ${existing.status} -> ${status}. ` +
      `Allowed transitions: ${(allowed ?? []).join(', ')}`,
    );
  }

  const isResolved = RESOLVED_STATUSES.includes(status);

  const raw = await prisma.lien.update({
    where: { id: lienId },
    data: {
      status,
      resolvedAmount: resolvedAmount !== undefined ? resolvedAmount : undefined,
      resolvedAt: isResolved ? new Date() : undefined,
    },
  });

  return toLienRecord(raw);
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

/**
 * Add line items to a lien.
 */
export async function addLineItems(
  lienId: string,
  items: CreateLineItemInput[],
): Promise<LienLineItemRecord[]> {
  // Verify lien exists
  const lien = await prisma.lien.findUnique({
    where: { id: lienId },
    select: { id: true },
  });

  if (!lien) {
    throw new Error(`Lien ${lienId} not found`);
  }

  const created: LienLineItemRecord[] = [];

  for (const item of items) {
    const raw = await prisma.lienLineItem.create({
      data: {
        lienId,
        serviceDate: new Date(item.serviceDate),
        cptCode: item.cptCode ?? null,
        description: item.description,
        amountClaimed: item.amountClaimed,
      },
    });

    created.push(toLineItemRecord(raw));
  }

  return created;
}

// ---------------------------------------------------------------------------
// OMFS comparison
// ---------------------------------------------------------------------------

/**
 * Run OMFS comparison on all line items of a lien.
 *
 * Updates each line item with OMFS rate, overcharge flag, and overcharge
 * amount. Also updates the lien's totalOmfsAllowed and discrepancyAmount.
 * Transitions the lien status to OMFS_COMPARED if currently UNDER_REVIEW.
 */
export async function runOmfsComparison(lienId: string): Promise<BillComparisonResult> {
  const lien = await prisma.lien.findUnique({
    where: { id: lienId },
    include: { lineItems: true },
  });

  if (!lien) {
    throw new Error(`Lien ${lienId} not found`);
  }

  if (lien.lineItems.length === 0) {
    throw new Error(`Lien ${lienId} has no line items to compare`);
  }

  // Build comparison input from line items
  const comparisonInput = lien.lineItems
    .filter((item): item is typeof item & { cptCode: string } => item.cptCode !== null)
    .map((item) => ({
      cptCode: item.cptCode,
      amount: Number(item.amountClaimed),
      description: item.description,
    }));

  const result = compareBillToOmfs(comparisonInput);

  // Update each line item with OMFS data
  for (const compared of result.lineItems) {
    const matchingItem = lien.lineItems.find(
      (li) => li.cptCode === compared.cptCode,
    );

    if (matchingItem) {
      await prisma.lienLineItem.update({
        where: { id: matchingItem.id },
        data: {
          omfsRate: compared.omfsAllowed,
          isOvercharge: compared.isOvercharge,
          overchargeAmount: compared.overchargeAmount,
        },
      });
    }
  }

  // Update lien totals
  const updateData: Prisma.LienUpdateInput = {
    totalOmfsAllowed: result.totalOmfsAllowed,
    discrepancyAmount: result.totalDiscrepancy,
  };

  // Auto-transition to OMFS_COMPARED if currently UNDER_REVIEW
  if (lien.status === 'UNDER_REVIEW') {
    updateData.status = 'OMFS_COMPARED';
  }

  await prisma.lien.update({
    where: { id: lienId },
    data: updateData,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Filing compliance (LC 4903.1)
// ---------------------------------------------------------------------------

/**
 * Check lien filing compliance per LC 4903.1.
 *
 * Verifies:
 * - Filing fee has been paid (required since 2013)
 * - Lien claimant is identified
 * - Filing date is present
 * - Line items are present (for medical liens)
 *
 * This is a factual compliance check (GREEN zone), not a legal validity
 * determination (RED zone).
 */
export async function checkFilingCompliance(
  lienId: string,
): Promise<{ isCompliant: boolean; issues: string[] }> {
  const lien = await prisma.lien.findUnique({
    where: { id: lienId },
    include: { lineItems: { select: { id: true } } },
  });

  if (!lien) {
    throw new Error(`Lien ${lienId} not found`);
  }

  const issues: string[] = [];

  // Filing fee check per LC 4903.1(c)
  if (lien.filingFeeStatus === 'NOT_PAID') {
    issues.push(
      'Filing fee not paid. LC 4903.1(c) requires a filing fee for lien claims ' +
      'filed on or after January 1, 2013.',
    );
  } else if (lien.filingFeeStatus === 'UNKNOWN') {
    issues.push(
      'Filing fee status unknown. Verify filing fee payment per LC 4903.1(c).',
    );
  }

  // Lien claimant identification
  if (!lien.lienClaimant || lien.lienClaimant.trim().length === 0) {
    issues.push('Lien claimant not identified.');
  }

  // Medical provider liens should have line items
  if (lien.lienType === 'MEDICAL_PROVIDER' && lien.lineItems.length === 0) {
    issues.push(
      'Medical provider lien has no line items. Itemized billing is required for ' +
      'OMFS comparison.',
    );
  }

  return {
    isCompliant: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Reserve impact
// ---------------------------------------------------------------------------

/**
 * Calculate total lien exposure for a claim.
 *
 * Sums all active (non-resolved) liens. Groups exposure by lien type.
 */
export async function calculateLienExposure(claimId: string): Promise<LienExposure> {
  const liens = await prisma.lien.findMany({
    where: {
      claimId,
      status: { in: ACTIVE_STATUSES },
    },
    select: {
      lienType: true,
      totalAmountClaimed: true,
    },
  });

  let totalExposure = 0;
  const byType: Record<string, number> = {};

  for (const lien of liens) {
    const amount = Number(lien.totalAmountClaimed);
    totalExposure += amount;

    const typeKey = lien.lienType as string;
    byType[typeKey] = (byType[typeKey] ?? 0) + amount;
  }

  return {
    totalExposure: Math.round(totalExposure * 100) / 100,
    byType,
    activeLienCount: liens.length,
  };
}

// ---------------------------------------------------------------------------
// Lien summary for claim dashboard
// ---------------------------------------------------------------------------

/**
 * Get a summary of all liens for a claim.
 *
 * Provides aggregate counts and amounts by status and type.
 */
export async function getLienSummary(claimId: string): Promise<LienSummary> {
  const liens = await prisma.lien.findMany({
    where: { claimId },
    select: {
      lienType: true,
      status: true,
      totalAmountClaimed: true,
      totalOmfsAllowed: true,
      discrepancyAmount: true,
    },
  });

  let totalClaimed = 0;
  let totalOmfsAllowed = 0;
  let totalDiscrepancy = 0;
  let activeLienCount = 0;
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const lien of liens) {
    const claimed = Number(lien.totalAmountClaimed);
    totalClaimed += claimed;

    if (lien.totalOmfsAllowed !== null) {
      totalOmfsAllowed += Number(lien.totalOmfsAllowed);
    }
    if (lien.discrepancyAmount !== null) {
      totalDiscrepancy += Number(lien.discrepancyAmount);
    }

    if (ACTIVE_STATUSES.includes(lien.status)) {
      activeLienCount++;
    }

    const statusKey = lien.status as string;
    byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;

    const typeKey = lien.lienType as string;
    byType[typeKey] = (byType[typeKey] ?? 0) + 1;
  }

  return {
    totalLiens: liens.length,
    totalClaimed: Math.round(totalClaimed * 100) / 100,
    totalOmfsAllowed: Math.round(totalOmfsAllowed * 100) / 100,
    totalDiscrepancy: Math.round(totalDiscrepancy * 100) / 100,
    activeLienCount,
    byStatus,
    byType,
  };
}

/**
 * Validate whether a status transition is allowed.
 *
 * Exported for use in route validation.
 */
export function isValidStatusTransition(from: LienStatus, to: LienStatus): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}
