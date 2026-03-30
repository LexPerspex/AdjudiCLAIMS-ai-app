/**
 * OMFS (Official Medical Fee Schedule) Bill Comparison Service
 *
 * Compares medical lien bill amounts against OMFS rates to identify
 * overcharges. This is a GREEN zone feature -- factual fee schedule
 * comparison with no legal analysis.
 *
 * Statutory authority: 8 CCR 9789.10 et seq.
 *
 * Rate lookup strategy (fastest-first):
 *   1. Local stub table — 42 common CPT codes, instant
 *   2. Process-lifetime cache — KB lookups cached to avoid repeat API calls
 *   3. Live KB API — POST /api/knowledge/search/regulatory with source_type='omfs'
 *   4. Null — rate not determinable, include in output with omfsRate=null
 */

import { searchRegulatory } from '../lib/kb-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of an OMFS rate lookup for a single CPT code.
 *
 * In stub mode, rates come from a built-in table of ~12 common CPT codes.
 * Unknown CPT codes return omfsRate=null, indicating the rate could not be
 * determined. The disclaimer is required because fee schedules change annually
 * and examiners must verify against the current DWC-published edition.
 */
export interface OmfsRateLookup {
  /** The CPT code that was looked up. */
  cptCode: string;
  /** OMFS allowed rate in USD, or null if the code is not in the rate table. */
  omfsRate: number | null;
  /** Human-readable description of the CPT code. */
  description: string;
  /** OMFS fee schedule section (e.g., 'RBRVS' for physician services). */
  feeScheduleSection: string;
  /** Effective date of the rate (YYYY-MM-DD format). */
  effectiveDate?: string;
}

export interface BillComparisonLineItem {
  cptCode: string;
  description: string;
  amountClaimed: number;
  omfsAllowed: number | null;
  isOvercharge: boolean;
  overchargeAmount: number;
}

/**
 * Aggregate bill comparison result with per-item and total discrepancy data.
 *
 * The disclaimer is mandatory on every display of comparison results because
 * fee schedule disputes may have legal implications that require defense
 * counsel involvement (per 8 CCR 9789.10 et seq.).
 */
export interface BillComparisonResult {
  /** Per-item comparison results. */
  lineItems: BillComparisonLineItem[];
  /** Sum of all billed amounts in USD. */
  totalClaimed: number;
  /** Sum of all OMFS-allowed amounts in USD (only for known CPT codes). */
  totalOmfsAllowed: number;
  /** totalClaimed - totalOmfsAllowed in USD. */
  totalDiscrepancy: number;
  /** Discrepancy as a percentage of totalOmfsAllowed. */
  discrepancyPercent: number;
  /** Mandatory disclaimer for UI display (references 8 CCR 9789.10). */
  disclaimer: string;
  /** True if rates come from the built-in stub table (not live KB). */
  isStubData: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OMFS_DISCLAIMER =
  'OMFS rate comparison is provided for factual reference only. Fee schedule amounts are based on ' +
  'the Official Medical Fee Schedule (8 CCR 9789.10 et seq.). Examiners should verify rates against ' +
  'the current OMFS edition. Disputes over medical billing amounts may require consultation with ' +
  'defense counsel.';

/**
 * Stub OMFS rate table for common CPT codes.
 *
 * These are realistic but illustrative rates. When the KB integration
 * is live, this table will be replaced by live KB lookups.
 */
const STUB_OMFS_RATES: Record<string, { rate: number; description: string; section: string }> = {
  // -------------------------------------------------------------------------
  // Existing entries (unchanged)
  // -------------------------------------------------------------------------
  '99213': { rate: 78.42, description: 'Office visit, established patient, low complexity', section: 'RBRVS' },
  '99214': { rate: 117.63, description: 'Office visit, established patient, moderate complexity', section: 'RBRVS' },
  '97110': { rate: 42.15, description: 'Therapeutic exercises, each 15 min', section: 'RBRVS' },
  '97140': { rate: 38.72, description: 'Manual therapy techniques, each 15 min', section: 'RBRVS' },
  '97530': { rate: 44.89, description: 'Therapeutic activities, each 15 min', section: 'RBRVS' },
  '72148': { rate: 289.50, description: 'MRI lumbar spine without contrast', section: 'RBRVS' },
  '72141': { rate: 285.00, description: 'MRI cervical spine without contrast', section: 'RBRVS' },
  '20610': { rate: 95.80, description: 'Arthrocentesis/injection, major joint', section: 'RBRVS' },
  '64483': { rate: 215.30, description: 'Transforaminal epidural injection, lumbar/sacral', section: 'RBRVS' },
  '99203': { rate: 135.50, description: 'New patient visit, low complexity', section: 'RBRVS' },
  '27447': { rate: 1245.00, description: 'Total knee arthroplasty', section: 'RBRVS' },
  '29881': { rate: 685.00, description: 'Knee arthroscopy with meniscectomy', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Evaluation & Management — New patient visits (99201–99205)
  // -------------------------------------------------------------------------
  '99201': { rate: 58.15, description: 'New patient office visit, minimal complexity', section: 'RBRVS' },
  '99202': { rate: 95.20, description: 'New patient office visit, straightforward complexity', section: 'RBRVS' },
  // 99203 already exists
  '99204': { rate: 183.75, description: 'New patient office visit, moderate complexity', section: 'RBRVS' },
  '99205': { rate: 236.40, description: 'New patient office visit, high complexity', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Evaluation & Management — Established patient visits (99211–99215)
  // -------------------------------------------------------------------------
  '99211': { rate: 24.10, description: 'Office visit, established patient, minimal (nurse)', section: 'RBRVS' },
  '99212': { rate: 48.35, description: 'Office visit, established patient, straightforward', section: 'RBRVS' },
  // 99213 and 99214 already exist
  '99215': { rate: 158.40, description: 'Office visit, established patient, high complexity', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Evaluation & Management — Consultations (99241–99245)
  // -------------------------------------------------------------------------
  '99241': { rate: 62.50, description: 'Office consultation, minimal complexity', section: 'RBRVS' },
  '99242': { rate: 108.75, description: 'Office consultation, straightforward complexity', section: 'RBRVS' },
  '99243': { rate: 152.30, description: 'Office consultation, low complexity', section: 'RBRVS' },
  '99244': { rate: 218.60, description: 'Office consultation, moderate complexity', section: 'RBRVS' },
  '99245': { rate: 284.90, description: 'Office consultation, high complexity', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Physical Therapy (additional codes)
  // -------------------------------------------------------------------------
  '97112': { rate: 41.20, description: 'Neuromuscular re-education, each 15 min', section: 'RBRVS' },
  '97116': { rate: 38.45, description: 'Gait training, each 15 min', section: 'RBRVS' },
  '97150': { rate: 28.60, description: 'Therapeutic procedure, group (2+ patients)', section: 'RBRVS' },
  '97542': { rate: 44.10, description: 'Wheelchair management/propulsion training, each 15 min', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Injections (additional codes)
  // -------------------------------------------------------------------------
  '64493': { rate: 198.40, description: 'Injection, paravertebral facet joint, lumbar/sacral', section: 'RBRVS' },
  '20552': { rate: 88.25, description: 'Injection, trigger point, 1 or 2 muscles', section: 'RBRVS' },
  '20553': { rate: 102.15, description: 'Injection, trigger point, 3 or more muscles', section: 'RBRVS' },
  '62322': { rate: 245.80, description: 'Injection, lumbar or sacral epidural (without imaging)', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Imaging (additional codes)
  // -------------------------------------------------------------------------
  '72146': { rate: 287.20, description: 'MRI thoracic spine without contrast', section: 'RBRVS' },
  '73221': { rate: 310.50, description: 'MRI joint of upper extremity (shoulder/knee), without contrast', section: 'RBRVS' },
  '73721': { rate: 318.75, description: 'MRI joint of lower extremity (hip), without contrast', section: 'RBRVS' },
  '70553': { rate: 425.00, description: 'MRI brain with and without contrast', section: 'RBRVS' },
  '72131': { rate: 265.40, description: 'CT lumbar spine without contrast', section: 'RBRVS' },

  // -------------------------------------------------------------------------
  // Surgery — Common Workers' Compensation procedures (additional codes)
  // -------------------------------------------------------------------------
  '63030': { rate: 1480.25, description: 'Laminotomy with decompression, lumbar (single level)', section: 'RBRVS' },
  '63047': { rate: 1685.50, description: 'Laminectomy, lumbar, single segment', section: 'RBRVS' },
  '22612': { rate: 2340.00, description: 'Lumbar arthrodesis (fusion), posterior/posterolateral', section: 'RBRVS' },
  '29827': { rate: 1124.75, description: 'Arthroscopy, shoulder, surgical — rotator cuff repair', section: 'RBRVS' },
  '64721': { rate: 565.30, description: 'Neuroplasty/carpal tunnel release, median nerve', section: 'RBRVS' },
};

const STUB_EFFECTIVE_DATE = '2026-01-01';

/**
 * Process-lifetime cache for KB OMFS rate lookups.
 * Avoids repeated API calls for the same CPT code within a process lifecycle.
 * The cache is intentionally not bounded — OMFS has ~10k CPT codes maximum.
 */
const kbRateCache: Map<string, OmfsRateLookup> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Look up the OMFS rate for a CPT code from the local stub table only.
 *
 * Synchronous, no network call. Covers 42 common WC CPT codes.
 * Unknown codes return omfsRate=null.
 *
 * For live KB augmentation, use lookupOmfsRateFromKb().
 *
 * @param cptCode - The CPT procedure code to look up.
 * @returns Rate lookup result. omfsRate is null if the code is not in the stub table.
 */
export function lookupOmfsRate(cptCode: string): OmfsRateLookup {
  const entry = STUB_OMFS_RATES[cptCode];

  if (entry) {
    return {
      cptCode,
      omfsRate: entry.rate,
      description: entry.description,
      feeScheduleSection: entry.section,
      effectiveDate: STUB_EFFECTIVE_DATE,
    };
  }

  return {
    cptCode,
    omfsRate: null,
    description: 'CPT code not found in OMFS rate table',
    feeScheduleSection: 'UNKNOWN',
  };
}

/**
 * Look up the OMFS rate for a CPT code — stub table with live KB fallback.
 *
 * Lookup order (fastest-first):
 *   1. Local stub table (42 common codes) — synchronous, no network
 *   2. Process-lifetime KB cache — avoids re-querying same code
 *   3. Live KB API — searches OMFS sections for the CPT code
 *   4. Null result — rate not determinable
 *
 * @param cptCode - The CPT procedure code to look up.
 * @returns Rate lookup result. omfsRate is null if the code cannot be found.
 */
export async function lookupOmfsRateFromKb(cptCode: string): Promise<OmfsRateLookup> {
  // 1. Local stub table — fastest path, covers 42 common WC CPT codes
  const stubResult = lookupOmfsRate(cptCode);
  if (stubResult.omfsRate !== null) {
    return stubResult;
  }

  // 2. Process-lifetime cache — avoid repeated KB calls for the same code
  const cached = kbRateCache.get(cptCode);
  if (cached !== undefined) {
    return cached;
  }

  // 3. Live KB API
  try {
    const results = await searchRegulatory(
      `CPT ${cptCode} OMFS physician services`,
      ['omfs'],
      5,
    );

    if (results.length > 0) {
      // Extract a dollar amount from the fullText of the best result.
      // OMFS sections typically contain rates like "$123.45" or "123.45 per service".
      const bestResult = results[0]!;
      const dollarMatch = bestResult.fullText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
      const rate = dollarMatch ? parseFloat(dollarMatch[1]!.replace(',', '')) : null;

      const lookup: OmfsRateLookup = {
        cptCode,
        omfsRate: rate,
        description: bestResult.title ?? `OMFS rate for CPT ${cptCode}`,
        feeScheduleSection: bestResult.sectionNumber ?? 'OMFS',
        effectiveDate: bestResult.effectiveDate ?? undefined,
      };

      kbRateCache.set(cptCode, lookup);
      return lookup;
    }
  } catch (err) {
    // KB unavailable — fall through to null result
    console.warn(
      `[omfs-comparison] KB lookup failed for CPT ${cptCode}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. Null result — code not found anywhere
  const notFound: OmfsRateLookup = {
    cptCode,
    omfsRate: null,
    description: 'CPT code not found in OMFS rate table',
    feeScheduleSection: 'UNKNOWN',
  };
  // Cache the null result too to avoid hammering the KB for unknown codes
  kbRateCache.set(cptCode, notFound);
  return notFound;
}

/**
 * Core bill comparison logic shared by both the sync and async variants.
 */
function buildBillComparison(
  lineItems: { cptCode: string; amount: number; description: string }[],
  rateMap: Map<string, OmfsRateLookup>,
  anyKbData: boolean,
): BillComparisonResult {
  const comparedItems: BillComparisonLineItem[] = [];
  let totalClaimed = 0;
  let totalOmfsAllowed = 0;

  for (const item of lineItems) {
    const lookup = rateMap.get(item.cptCode) ?? {
      cptCode: item.cptCode,
      omfsRate: null,
      description: 'CPT code not found in OMFS rate table',
      feeScheduleSection: 'UNKNOWN',
    };

    const amountClaimed = roundCurrency(item.amount);
    totalClaimed += amountClaimed;

    if (lookup.omfsRate !== null) {
      const omfsAllowed = lookup.omfsRate;
      totalOmfsAllowed += omfsAllowed;
      const isOvercharge = amountClaimed > omfsAllowed;
      const overchargeAmount = isOvercharge ? roundCurrency(amountClaimed - omfsAllowed) : 0;

      comparedItems.push({
        cptCode: item.cptCode,
        description: item.description,
        amountClaimed,
        omfsAllowed,
        isOvercharge,
        overchargeAmount,
      });
    } else {
      comparedItems.push({
        cptCode: item.cptCode,
        description: item.description,
        amountClaimed,
        omfsAllowed: null,
        isOvercharge: false,
        overchargeAmount: 0,
      });
    }
  }

  totalClaimed = roundCurrency(totalClaimed);
  totalOmfsAllowed = roundCurrency(totalOmfsAllowed);
  const totalDiscrepancy = roundCurrency(totalClaimed - totalOmfsAllowed);
  const discrepancyPercent =
    totalOmfsAllowed > 0 ? roundCurrency((totalDiscrepancy / totalOmfsAllowed) * 100) : 0;

  return {
    lineItems: comparedItems,
    totalClaimed,
    totalOmfsAllowed,
    totalDiscrepancy,
    discrepancyPercent,
    disclaimer: OMFS_DISCLAIMER,
    isStubData: !anyKbData,
  };
}

/**
 * Compare a list of billed line items against OMFS rates (stub table only).
 *
 * Each line item is looked up in the local stub table. Unknown CPT codes
 * are included in output with omfsAllowed=null and overchargeAmount=0.
 *
 * For live KB augmentation on unknown CPT codes, use compareBillToOmfsFromKb().
 *
 * @param lineItems - Array of billed items with CPT code, amount, and description.
 * @returns Comparison result with per-item and aggregate discrepancy data.
 */
export function compareBillToOmfs(
  lineItems: { cptCode: string; amount: number; description: string }[],
): BillComparisonResult {
  const rateMap = new Map<string, OmfsRateLookup>();
  for (const item of lineItems) {
    rateMap.set(item.cptCode, lookupOmfsRate(item.cptCode));
  }
  return buildBillComparison(lineItems, rateMap, false);
}

/**
 * Compare a list of billed line items against OMFS rates — stub table with live KB fallback.
 *
 * For CPT codes not in the local stub table, queries the live KB API.
 * KB results are cached for the process lifetime to avoid repeat API calls.
 *
 * @param lineItems - Array of billed items with CPT code, amount, and description.
 * @returns Comparison result with per-item and aggregate discrepancy data.
 */
export async function compareBillToOmfsFromKb(
  lineItems: { cptCode: string; amount: number; description: string }[],
): Promise<BillComparisonResult> {
  const rateMap = new Map<string, OmfsRateLookup>();
  let anyKbData = false;

  for (const item of lineItems) {
    const lookup = await lookupOmfsRateFromKb(item.cptCode);
    rateMap.set(item.cptCode, lookup);
    // If the code is not in the stub table and has a rate, it came from the KB
    if (!STUB_OMFS_RATES[item.cptCode] && lookup.omfsRate !== null) {
      anyKbData = true;
    }
  }

  return buildBillComparison(lineItems, rateMap, anyKbData);
}
