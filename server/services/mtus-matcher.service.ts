/**
 * @Developed & Documented by Glass Box Solutions, Inc. using human ingenuity and modern technology
 *
 * MTUS (Medical Treatment Utilization Schedule) guideline matching service.
 *
 * Matches treatment requests against MTUS guidelines for utilization-review
 * reference. The MTUS knowledge base is a curated set of 41 guideline entries
 * spanning every major MTUS chapter (8 CCR §9792.20 through §9792.27),
 * adopting ACOEM and ODG evidence-based guidelines as required by California
 * Labor Code §4604.5 and §5307.27.
 *
 * UPL zone: GREEN — purely factual guideline matching.
 * The UR physician makes the clinical authorization decision per LC §4610.
 * AdjudiCLAIMS surfaces the published criteria; it never authorizes or denies
 * treatment.
 *
 * Two execution paths:
 *   1. `matchMtusGuidelines` — pure synchronous lookup against the bundled
 *       knowledge base (41 entries from `server/data/mtus-guidelines.ts`).
 *   2. `matchMtusGuidelinesFromKb` — async path that first tries a live KB
 *       (vector similarity over MTUS source-typed entries); falls back to
 *       the bundled knowledge base when the KB is unavailable.
 */

import { searchRegulatory, isKbAvailable } from '../lib/kb-client.js';
import {
  MTUS_GUIDELINES,
  BODY_PART_TO_CATEGORY,
  CPT_TO_CATEGORY,
  getAllMtusGuidelines,
  type MtusGuidelineEntry,
  type MtusCategory,
} from '../data/mtus-guidelines.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MtusMatchRequest {
  bodyPart: string;
  diagnosis?: string;
  treatmentDescription: string;
  cptCode?: string;
}

export interface MtusGuidelineMatch {
  guidelineId: string;
  title: string;
  relevance: number;
  guidelineText: string;
  sourceSection: string;
  recommendedFrequency?: string;
  recommendedDuration?: string;
  evidenceLevel?: string;
}

/**
 * Result of MTUS guideline matching for a treatment request.
 *
 * `isStubData` indicates whether the matches came from the bundled MTUS
 * knowledge base (`true`) or from a live KB vector search (`false`).
 *
 * The "stub" terminology is retained for backward compatibility — historically
 * the bundled data was a small placeholder. As of AJC-15 the bundled data is
 * the full 41-entry DWC MTUS knowledge base, so `isStubData=true` simply
 * means "served from bundled data" rather than "synthetic placeholder".
 */
export interface MtusMatchResult {
  /** Matched MTUS guidelines, ranked by relevance (descending). */
  matches: MtusGuidelineMatch[];
  /** The original match request (echoed for traceability). */
  query: MtusMatchRequest;
  /** Mandatory disclaimer about UR physician decision authority. */
  disclaimer: string;
  /** Always 'mtus' — identifies the KB source type. */
  sourceType: 'mtus';
  /** Number of guidelines matched. */
  totalMatches: number;
  /** True if results come from the bundled MTUS knowledge base (not live KB). */
  isStubData: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Disclaimer included on every MTUS match response (per LC 4610). */
export const MTUS_DISCLAIMER =
  'MTUS guideline matching is provided for utilization review reference only. ' +
  'Clinical decisions regarding treatment authorization must be made by the UR physician ' +
  'reviewer per LC 4610. AdjudiCLAIMS presents guideline criteria — it does not make ' +
  'treatment recommendations.';

/** Minimum similarity threshold for KB results to be returned. */
const MIN_SIMILARITY = 0.5;

// ---------------------------------------------------------------------------
// In-memory lookup table for getGuidelineDetail
// ---------------------------------------------------------------------------

/** Flat lookup map: guidelineId -> entry. Built once at module load. */
const ALL_GUIDELINES_BY_ID: Map<string, MtusGuidelineEntry> = new Map();

for (const entry of getAllMtusGuidelines()) {
  ALL_GUIDELINES_BY_ID.set(entry.guidelineId, entry);
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Normalize a body part / topic input string for alias lookup.
 */
function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Resolve a body-part text input to an MTUS category, or undefined if no
 * alias matches. Tries exact match first, then partial substring match.
 */
function resolveCategory(bodyPartInput: string): MtusCategory | undefined {
  const normalized = normalize(bodyPartInput);

  // Exact alias match
  const exact = BODY_PART_TO_CATEGORY[normalized];
  if (exact) return exact;

  // Partial substring match — input contains alias key, or alias contains input
  for (const [alias, category] of Object.entries(BODY_PART_TO_CATEGORY)) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return category;
    }
  }

  return undefined;
}

/**
 * Find guideline matches in the bundled knowledge base for the given request.
 *
 * Resolution order:
 *   1. Body-part alias lookup (`BODY_PART_TO_CATEGORY`)
 *   2. CPT code lookup (`CPT_TO_CATEGORY`) when no body-part match
 *   3. Empty result if no resolution
 */
function findBundledMatches(request: MtusMatchRequest): MtusGuidelineEntry[] {
  // 1. Try body part alias
  let category = resolveCategory(request.bodyPart);

  // 2. Fall back to CPT mapping
  if (!category && request.cptCode) {
    category = CPT_TO_CATEGORY[request.cptCode];
  }

  if (!category) {
    return [];
  }

  // Return a defensive copy so callers can't mutate the source data
  return MTUS_GUIDELINES[category].map((g) => ({ ...g }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match a treatment request against MTUS guidelines using the bundled
 * 41-entry knowledge base (synchronous).
 *
 * Use this when no live KB is available, or when you specifically want the
 * bundled, deterministic dataset (e.g., in tests).
 *
 * @param request - The treatment match request.
 * @returns MTUS guideline matches with the mandatory LC 4610 disclaimer.
 */
export function matchMtusGuidelines(request: MtusMatchRequest): MtusMatchResult {
  const matches = findBundledMatches(request);
  return {
    matches,
    query: request,
    disclaimer: MTUS_DISCLAIMER,
    sourceType: 'mtus',
    totalMatches: matches.length,
    isStubData: true,
  };
}

/**
 * Match a treatment request against MTUS guidelines — live KB with bundled
 * fallback (asynchronous).
 *
 * Tries the live KB first via vector similarity search filtered to
 * `source_type='mtus'`. Falls back to the bundled 41-entry knowledge base
 * when the KB is unavailable, returns no results above threshold, or errors.
 *
 * KB result mapping:
 *   - `id` → `guidelineId`
 *   - `title` (or `sectionNumber`) → `title`
 *   - `similarity` → `relevance`
 *   - `fullText` → `guidelineText`
 *   - `sectionNumber` → `sourceSection`
 *   - `tags` containing `evidence:*` → `evidenceLevel`
 *
 * @param request - The treatment match request.
 * @returns MTUS guideline matches with the mandatory LC 4610 disclaimer.
 */
export async function matchMtusGuidelinesFromKb(
  request: MtusMatchRequest,
): Promise<MtusMatchResult> {
  // Attempt live KB lookup first
  try {
    const kbAvailable = await isKbAvailable();

    if (kbAvailable) {
      const query = [request.bodyPart, request.diagnosis ?? '', request.treatmentDescription]
        .filter(Boolean)
        .join(' ');

      const kbResults = await searchRegulatory(query, ['mtus'], 10);

      const aboveThreshold = kbResults.filter(
        (r) => (r.similarity ?? 1) >= MIN_SIMILARITY,
      );

      if (aboveThreshold.length > 0) {
        const matches: MtusGuidelineMatch[] = aboveThreshold.map((r) => ({
          guidelineId: r.id,
          title: r.title ?? r.sectionNumber,
          relevance: r.similarity ?? 1,
          guidelineText: r.fullText,
          sourceSection: r.sectionNumber,
          recommendedFrequency: undefined,
          recommendedDuration: undefined,
          evidenceLevel: r.tags.find((t) => t.startsWith('evidence:'))?.replace('evidence:', ''),
        }));

        return {
          matches,
          query: request,
          disclaimer: MTUS_DISCLAIMER,
          sourceType: 'mtus',
          totalMatches: matches.length,
          isStubData: false,
        };
      }
    }
  } catch (err) {
    // KB unavailable or returned an error — fall through to bundled data
    console.warn(
      '[mtus-matcher] KB lookup failed, using bundled knowledge base:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Bundled knowledge-base fallback
  return matchMtusGuidelines(request);
}

/**
 * Get detailed information for a specific guideline by ID.
 *
 * Returns the entry from the bundled 41-entry knowledge base, or null when
 * the ID is unknown. Used by the GET `/api/mtus/guidelines/:id` route.
 *
 * @param guidelineId - The guideline identifier (e.g., "mtus-lowback-001").
 * @returns The guideline entry, or null if not found.
 */
export function getGuidelineDetail(
  guidelineId: string,
): MtusGuidelineMatch | null {
  return ALL_GUIDELINES_BY_ID.get(guidelineId) ?? null;
}
