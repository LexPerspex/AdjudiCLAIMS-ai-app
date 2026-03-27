/**
 * OMFS (Official Medical Fee Schedule) Bill Comparison Service
 *
 * Compares medical lien bill amounts against OMFS rates to identify
 * overcharges. This is a GREEN zone feature -- factual fee schedule
 * comparison with no legal analysis.
 *
 * Statutory authority: 8 CCR 9789.10 et seq.
 *
 * Stub mode: Since the Knowledge Base is external, this service uses a
 * realistic stub OMFS rate table for common CPT codes. When the KB
 * integration is live, lookupOmfsRate will query the KB instead.
 */

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
};

const STUB_EFFECTIVE_DATE = '2026-01-01';

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
 * Look up the OMFS rate for a CPT code.
 *
 * In stub mode, returns data from the built-in rate table. Unknown CPT
 * codes return omfsRate = null with a descriptive message.
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
 * Compare a list of billed line items against OMFS rates.
 *
 * Each line item is looked up in the OMFS rate table. If the billed
 * amount exceeds the OMFS allowed rate, it is flagged as an overcharge.
 * Line items with unknown CPT codes are included in totals with
 * omfsAllowed = null and overchargeAmount = 0.
 *
 * @param lineItems - Array of billed items with CPT code, amount, and description.
 * @returns Comparison result with per-item and aggregate discrepancy data.
 */
export function compareBillToOmfs(
  lineItems: { cptCode: string; amount: number; description: string }[],
): BillComparisonResult {
  const comparedItems: BillComparisonLineItem[] = [];
  let totalClaimed = 0;
  let totalOmfsAllowed = 0;

  for (const item of lineItems) {
    const lookup = lookupOmfsRate(item.cptCode);
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
      // Unknown CPT code -- include but cannot compare
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
    isStubData: true,
  };
}
