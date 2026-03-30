/**
 * Comparable Claims Service — Statistical analysis for YELLOW zone reference data.
 *
 * Provides statistical settlement and outcome ranges based on body part and
 * injury type. Uses mock statistical data modeled on realistic CA workers'
 * compensation claim patterns until actual carrier data is available.
 *
 * UPL Classification: YELLOW zone — statistical data with mandatory disclaimer.
 * Every result MUST include a disclaimer directing the examiner to defense
 * counsel. This service MUST NOT predict individual claim outcomes.
 *
 * Statutory reference: Cal. Ins. Code §790.03(h) — unfair claims settlement
 * practices require fair investigation and evaluation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparableClaimsRequest {
  /** Reported body parts (e.g., ['lumbar spine', 'knee']). */
  bodyParts: string[];
  /** Injury mechanism type. */
  injuryType: 'SPECIFIC' | 'CUMULATIVE' | 'OCCUPATIONAL_DISEASE';
  /** Date of injury — used for inflation/trend adjustments (reserved). */
  dateOfInjury: Date;
  /** Current total reserves (optional — used for context only, not calculation). */
  currentReserves?: number;
}

export interface ComparableClaimsResult {
  /** Number of comparable claims in the statistical sample. */
  sampleSize: number;
  /** Settlement amount percentile distribution in dollars. */
  settlementRange: {
    p25: number;
    median: number;
    p75: number;
    p90: number;
  };
  /** Average TD duration distribution in weeks. */
  averageTdDuration: {
    weeks: number;
    median: number;
  };
  /** Average PD rating distribution. */
  averagePdRating: {
    wpi: number;
    pdRating: number;
  };
  /** Outcome bucket distribution (as percentages summing to 1.0). */
  outcomeBucketed: {
    settled: number;
    award: number;
    denied: number;
    withdrawn: number;
  };
  /**
   * YELLOW zone disclaimer — ALWAYS present per UPL compliance.
   * Must appear on every result delivered to a claims examiner.
   */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// UPL Disclaimer — MANDATORY on every result
// ---------------------------------------------------------------------------

const YELLOW_ZONE_DISCLAIMER =
  'Statistical comparison only. These ranges reflect historical patterns and ' +
  'do not predict individual claim outcomes. Settlement decisions require ' +
  'defense counsel guidance per Cal. Ins. Code §790.03(h).';

// ---------------------------------------------------------------------------
// Body part statistical profiles
// ---------------------------------------------------------------------------

/**
 * Statistical profile for a body part region.
 * All dollar amounts in USD. TD duration in weeks. WPI as percent (0-100).
 */
interface BodyPartProfile {
  /** Canonical label for this body part group. */
  label: string;
  /** Keywords used to match incoming body part strings. */
  keywords: string[];
  /** Sample size in the mock dataset. */
  sampleSize: number;
  /** Settlement percentile distribution (USD). */
  settlement: { p25: number; median: number; p75: number; p90: number };
  /** TD duration distribution (weeks). */
  td: { mean: number; median: number };
  /** PD rating distribution (WPI %). */
  pd: { wpiMean: number; pdRatingMean: number };
  /** Outcome distribution (fractions summing to 1.0). */
  outcomes: { settled: number; award: number; denied: number; withdrawn: number };
}

const BODY_PART_PROFILES: BodyPartProfile[] = [
  {
    label: 'Lumbar Spine',
    keywords: ['lumbar', 'low back', 'lower back', 'lumbosacral', 'l1', 'l2', 'l3', 'l4', 'l5'],
    sampleSize: 2840,
    settlement: { p25: 35000, median: 58000, p75: 82000, p90: 115000 },
    td: { mean: 26, median: 22 },
    pd: { wpiMean: 11.4, pdRatingMean: 14.2 },
    outcomes: { settled: 0.62, award: 0.21, denied: 0.11, withdrawn: 0.06 },
  },
  {
    label: 'Cervical Spine',
    keywords: ['cervical', 'neck', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'cervicothoracic'],
    sampleSize: 2210,
    settlement: { p25: 28000, median: 48000, p75: 69000, p90: 98000 },
    td: { mean: 22, median: 18 },
    pd: { wpiMean: 9.2, pdRatingMean: 11.5 },
    outcomes: { settled: 0.60, award: 0.22, denied: 0.12, withdrawn: 0.06 },
  },
  {
    label: 'Shoulder',
    keywords: ['shoulder', 'rotator cuff', 'acromioclavicular', 'glenohumeral', 'ac joint', 'supraspinatus', 'infraspinatus'],
    sampleSize: 1950,
    settlement: { p25: 18000, median: 38000, p75: 56000, p90: 82000 },
    td: { mean: 18, median: 15 },
    pd: { wpiMean: 7.8, pdRatingMean: 9.7 },
    outcomes: { settled: 0.65, award: 0.18, denied: 0.10, withdrawn: 0.07 },
  },
  {
    label: 'Knee',
    keywords: ['knee', 'meniscus', 'acl', 'mcl', 'pcl', 'patella', 'patellar', 'tibiofemoral'],
    sampleSize: 1680,
    settlement: { p25: 14000, median: 30000, p75: 46000, p90: 68000 },
    td: { mean: 16, median: 14 },
    pd: { wpiMean: 6.5, pdRatingMean: 8.1 },
    outcomes: { settled: 0.67, award: 0.17, denied: 0.10, withdrawn: 0.06 },
  },
  {
    label: 'Wrist/Hand',
    keywords: ['wrist', 'hand', 'finger', 'thumb', 'carpal', 'carpal tunnel', 'metacarpal', 'phalanx', 'phalange'],
    sampleSize: 1420,
    settlement: { p25: 10000, median: 23000, p75: 36000, p90: 52000 },
    td: { mean: 12, median: 10 },
    pd: { wpiMean: 5.2, pdRatingMean: 6.5 },
    outcomes: { settled: 0.68, award: 0.15, denied: 0.11, withdrawn: 0.06 },
  },
  {
    label: 'Thoracic Spine',
    keywords: ['thoracic', 'mid back', 'middle back', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'],
    sampleSize: 820,
    settlement: { p25: 20000, median: 38000, p75: 58000, p90: 82000 },
    td: { mean: 18, median: 15 },
    pd: { wpiMean: 7.5, pdRatingMean: 9.4 },
    outcomes: { settled: 0.60, award: 0.22, denied: 0.12, withdrawn: 0.06 },
  },
  {
    label: 'Hip',
    keywords: ['hip', 'femur', 'acetabulum', 'greater trochanter', 'ilium', 'sacroiliac', 'si joint'],
    sampleSize: 780,
    settlement: { p25: 22000, median: 42000, p75: 65000, p90: 92000 },
    td: { mean: 20, median: 17 },
    pd: { wpiMean: 8.5, pdRatingMean: 10.6 },
    outcomes: { settled: 0.62, award: 0.20, denied: 0.11, withdrawn: 0.07 },
  },
  {
    label: 'Elbow/Forearm',
    keywords: ['elbow', 'forearm', 'radius', 'ulna', 'lateral epicondyle', 'medial epicondyle', 'epicondylitis', 'tennis elbow'],
    sampleSize: 960,
    settlement: { p25: 12000, median: 26000, p75: 40000, p90: 58000 },
    td: { mean: 13, median: 11 },
    pd: { wpiMean: 5.8, pdRatingMean: 7.2 },
    outcomes: { settled: 0.66, award: 0.17, denied: 0.11, withdrawn: 0.06 },
  },
  {
    label: 'Ankle/Foot',
    keywords: ['ankle', 'foot', 'heel', 'achilles', 'plantar', 'calcaneus', 'fibula', 'tibia', 'metatarsal', 'tarsal'],
    sampleSize: 1100,
    settlement: { p25: 11000, median: 24000, p75: 38000, p90: 55000 },
    td: { mean: 14, median: 12 },
    pd: { wpiMean: 5.5, pdRatingMean: 6.9 },
    outcomes: { settled: 0.66, award: 0.16, denied: 0.11, withdrawn: 0.07 },
  },
  {
    label: 'Psyche/Mental Health',
    keywords: ['psyche', 'psychiatric', 'psychological', 'ptsd', 'anxiety', 'depression', 'stress', 'mental health'],
    sampleSize: 640,
    settlement: { p25: 25000, median: 48000, p75: 78000, p90: 118000 },
    td: { mean: 32, median: 28 },
    pd: { wpiMean: 14.2, pdRatingMean: 17.8 },
    outcomes: { settled: 0.52, award: 0.28, denied: 0.14, withdrawn: 0.06 },
  },
];

/**
 * Weighted-average profile used when no specific body part match is found
 * or as a fallback for the "default/unknown" case.
 */
const DEFAULT_PROFILE: BodyPartProfile = {
  label: 'General/Multiple Body Parts',
  keywords: [],
  sampleSize: 1500,
  settlement: { p25: 20000, median: 40000, p75: 62000, p90: 90000 },
  td: { mean: 20, median: 17 },
  pd: { wpiMean: 8.5, pdRatingMean: 10.6 },
  outcomes: { settled: 0.62, award: 0.20, denied: 0.11, withdrawn: 0.07 },
};

// ---------------------------------------------------------------------------
// Multipliers
// ---------------------------------------------------------------------------

/**
 * Cumulative trauma multiplier — applied to settlement ranges per clinical
 * evidence that CT claims involve longer TD, higher WPI, and greater litigation.
 */
const CUMULATIVE_TRAUMA_MULTIPLIER = 1.30;

/**
 * Occupational disease multiplier — similar elevated range to CT but with
 * higher denial rates due to causation complexity.
 */
const OCCUPATIONAL_DISEASE_MULTIPLIER = 1.25;

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Find the best matching body part profile for a given body part string.
 * Performs case-insensitive keyword matching.
 */
function matchBodyPartProfile(bodyPart: string): BodyPartProfile | null {
  const normalized = bodyPart.toLowerCase().trim();
  for (const profile of BODY_PART_PROFILES) {
    for (const keyword of profile.keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        return profile;
      }
    }
  }
  return null;
}

/**
 * Blend multiple profiles into a single weighted-average profile.
 * Weights are proportional to sample size.
 */
function blendProfiles(profiles: BodyPartProfile[]): BodyPartProfile {
  if (profiles.length === 0) return DEFAULT_PROFILE;
  if (profiles.length === 1) return profiles[0]!;

  const totalSamples = profiles.reduce((sum, p) => sum + p.sampleSize, 0);

  const weighted = <T extends number>(fn: (p: BodyPartProfile) => T): number =>
    profiles.reduce((sum, p) => sum + fn(p) * (p.sampleSize / totalSamples), 0);

  return {
    label: profiles.map((p) => p.label).join(' + '),
    keywords: [],
    sampleSize: totalSamples,
    settlement: {
      p25: Math.round(weighted((p) => p.settlement.p25)),
      median: Math.round(weighted((p) => p.settlement.median)),
      p75: Math.round(weighted((p) => p.settlement.p75)),
      p90: Math.round(weighted((p) => p.settlement.p90)),
    },
    td: {
      mean: Math.round(weighted((p) => p.td.mean)),
      median: Math.round(weighted((p) => p.td.median)),
    },
    pd: {
      wpiMean: Math.round(weighted((p) => p.pd.wpiMean) * 10) / 10,
      pdRatingMean: Math.round(weighted((p) => p.pd.pdRatingMean) * 10) / 10,
    },
    outcomes: {
      settled: Math.round(weighted((p) => p.outcomes.settled) * 1000) / 1000,
      award: Math.round(weighted((p) => p.outcomes.award) * 1000) / 1000,
      denied: Math.round(weighted((p) => p.outcomes.denied) * 1000) / 1000,
      withdrawn: Math.round(weighted((p) => p.outcomes.withdrawn) * 1000) / 1000,
    },
  };
}

/**
 * Apply injury type multiplier to settlement and TD ranges.
 */
function applyInjuryTypeMultiplier(
  profile: BodyPartProfile,
  injuryType: ComparableClaimsRequest['injuryType'],
): BodyPartProfile {
  const multiplier =
    injuryType === 'CUMULATIVE'
      ? CUMULATIVE_TRAUMA_MULTIPLIER
      : injuryType === 'OCCUPATIONAL_DISEASE'
      ? OCCUPATIONAL_DISEASE_MULTIPLIER
      : 1.0;

  if (multiplier === 1.0) return profile;

  return {
    ...profile,
    settlement: {
      p25: Math.round(profile.settlement.p25 * multiplier),
      median: Math.round(profile.settlement.median * multiplier),
      p75: Math.round(profile.settlement.p75 * multiplier),
      p90: Math.round(profile.settlement.p90 * multiplier),
    },
    td: {
      mean: Math.round(profile.td.mean * multiplier),
      median: Math.round(profile.td.median * multiplier),
    },
    // Adjust denial rate upward for occupational disease (causation disputes)
    outcomes:
      injuryType === 'OCCUPATIONAL_DISEASE'
        ? {
            settled: Math.round((profile.outcomes.settled * 0.9) * 1000) / 1000,
            award: Math.round((profile.outcomes.award * 0.9) * 1000) / 1000,
            denied: Math.round((profile.outcomes.denied * 1.6) * 1000) / 1000,
            withdrawn: profile.outcomes.withdrawn,
          }
        : profile.outcomes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return statistical comparable claims data for the given request.
 *
 * YELLOW zone function — the result ALWAYS contains the required disclaimer.
 * This function is synchronous; it does not query the database. Statistical
 * profiles are static until carrier data integration is available.
 *
 * @param request - Body parts, injury type, date of injury, and optional reserves.
 * @returns Statistical ranges with mandatory YELLOW zone disclaimer.
 */
export function getComparableClaims(request: ComparableClaimsRequest): ComparableClaimsResult {
  const { bodyParts, injuryType } = request;

  // Match each body part to a profile
  const matchedProfiles: BodyPartProfile[] = [];
  for (const part of bodyParts) {
    const profile = matchBodyPartProfile(part);
    if (profile && !matchedProfiles.some((p) => p.label === profile.label)) {
      matchedProfiles.push(profile);
    }
  }

  // Blend profiles (or use default if no matches found)
  const blended = matchedProfiles.length > 0
    ? blendProfiles(matchedProfiles)
    : DEFAULT_PROFILE;

  // Apply injury type multiplier
  const adjusted = applyInjuryTypeMultiplier(blended, injuryType);

  return {
    sampleSize: adjusted.sampleSize,
    settlementRange: adjusted.settlement,
    averageTdDuration: {
      weeks: adjusted.td.mean,
      median: adjusted.td.median,
    },
    averagePdRating: {
      wpi: adjusted.pd.wpiMean,
      pdRating: adjusted.pd.pdRatingMean,
    },
    outcomeBucketed: adjusted.outcomes,
    disclaimer: YELLOW_ZONE_DISCLAIMER,
  };
}
