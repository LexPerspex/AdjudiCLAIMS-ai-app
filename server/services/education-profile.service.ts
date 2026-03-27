/**
 * Education profile service — manages per-examiner education state.
 *
 * Tracks which Tier 1 terms a user has dismissed, whether the user is in
 * new-examiner learning mode, and which training modules they have completed.
 * Tier 2 content is always-present and is served here as a pure data lookup.
 *
 * Two-tier education model:
 *   Tier 1 — Dismissable term definitions (stored in EducationProfile.dismissedTerms)
 *   Tier 2 — Always-present regulatory education (never hidden; pure data lookup)
 *
 * UPL Note: All content returned by this service is factual/educational (GREEN zone).
 * No legal advice or legal conclusions are provided.
 */

import { prisma } from '../db.js';
import {
  TIER1_TERMS,
  TIER1_TERMS_BY_ID,
  TIER1_TERMS_BY_CATEGORY,
} from '../data/tier1-terms.js';
import type { Tier1Term, Tier1Category, FeatureContext } from '../data/tier1-terms.js';
import { getTier2ForFeature } from '../data/tier2-education.js';
import type { Tier2EducationEntry } from '../data/tier2-education.js';
import type { JsonValue } from '@prisma/client/runtime/library';
import { parseJsonStringArray } from '../lib/json-array.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Serialized education profile record for API responses.
 *
 * Tracks per-user education state: which Tier 1 terms have been dismissed,
 * which training modules are complete, and whether the user is in new-examiner
 * learning mode (30-day enhanced education window).
 *
 * The two-tier model:
 * - Tier 1 (dismissable): Basic term definitions that new examiners see by default.
 *   Once dismissed, a term stays hidden unless re-enabled. This reduces noise for
 *   experienced examiners while ensuring new examiners learn foundational concepts.
 * - Tier 2 (always-present): Regulatory education that is NEVER hidden. This is
 *   the Glass Box foundation — every decision point shows its statutory authority.
 */
export interface EducationProfileRecord {
  /** Unique profile ID. */
  id: string;
  /** The user this profile belongs to. */
  userId: string;
  /** Array of Tier 1 term IDs the user has dismissed. */
  dismissedTerms: string[];
  /** JSON record of completed training modules with scores and timestamps. */
  trainingModulesCompleted: Record<string, unknown> | null;
  /** True when all 4 mandatory training modules have been passed. */
  isTrainingComplete: boolean;
  /** Expiry date for new-examiner learning mode (null if not active). */
  learningModeExpiry: Date | null;
  /** When this profile was created. */
  createdAt: Date;
  /** Last modification timestamp. */
  updatedAt: Date;
}

export interface TermWithDismissalState {
  term: Tier1Term;
  isDismissed: boolean;
}

/**
 * Education mode for a user.
 *
 * 'NEW' — The user is within the 30-day new-examiner learning window. All Tier 1
 * terms are shown by default (even if not yet explicitly dismissed). This ensures
 * new examiners see foundational definitions during their onboarding period.
 *
 * 'STANDARD' — Normal operation. Tier 1 terms are only shown if not dismissed.
 */
export type EducationMode = 'NEW' | 'STANDARD';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEARNING_MODE_DAYS = 30;

function mapToRecord(raw: {
  id: string;
  userId: string;
  dismissedTerms: unknown;
  trainingModulesCompleted: unknown;
  isTrainingComplete: boolean;
  learningModeExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): EducationProfileRecord {
  return {
    id: raw.id,
    userId: raw.userId,
    dismissedTerms: parseJsonStringArray(raw.dismissedTerms as JsonValue),
    trainingModulesCompleted:
      raw.trainingModulesCompleted != null
        ? (raw.trainingModulesCompleted as Record<string, unknown>)
        : null,
    isTrainingComplete: raw.isTrainingComplete,
    learningModeExpiry: raw.learningModeExpiry,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get or create an EducationProfile for the given user.
 *
 * If no profile exists one is created with empty defaults (no dismissed terms,
 * no learning mode, training not complete).
 */
export async function getOrCreateProfile(userId: string): Promise<EducationProfileRecord> {
  const raw = await prisma.educationProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      id: true,
      userId: true,
      dismissedTerms: true,
      trainingModulesCompleted: true,
      isTrainingComplete: true,
      learningModeExpiry: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapToRecord(raw);
}

/**
 * Dismiss a Tier 1 term for a user.
 *
 * Validates that the termId exists in TIER1_TERMS_BY_ID before writing.
 * Deduplicates — calling with an already-dismissed termId is a no-op.
 *
 * @throws {Error} if termId is not a known Tier 1 term.
 */
export async function dismissTerm(
  userId: string,
  termId: string,
): Promise<EducationProfileRecord> {
  if (!TIER1_TERMS_BY_ID.has(termId)) {
    throw new Error(`Unknown Tier 1 term id: ${termId}`);
  }

  // Ensure profile exists before updating
  await getOrCreateProfile(userId);

  const raw = await prisma.educationProfile.update({
    where: { userId },
    data: {
      dismissedTerms: {
        push: termId,
      },
    },
    select: {
      id: true,
      userId: true,
      dismissedTerms: true,
      trainingModulesCompleted: true,
      isTrainingComplete: true,
      learningModeExpiry: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Prisma push does not deduplicate — normalize client-side
  const parsed = parseJsonStringArray(raw.dismissedTerms);
  const unique = [...new Set(parsed)];
  if (unique.length !== parsed.length) {
    const deduped = await prisma.educationProfile.update({
      where: { userId },
      data: { dismissedTerms: unique },
      select: {
        id: true,
        userId: true,
        dismissedTerms: true,
        trainingModulesCompleted: true,
        isTrainingComplete: true,
        learningModeExpiry: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return mapToRecord(deduped);
  }

  return mapToRecord(raw);
}

/**
 * Re-enable dismissed Tier 1 terms.
 *
 * If `category` is provided, only terms in that category are re-enabled.
 * If `category` is omitted, ALL dismissed terms are cleared.
 */
export async function reEnableTerms(
  userId: string,
  category?: Tier1Category,
): Promise<EducationProfileRecord> {
  await getOrCreateProfile(userId);

  let updatedDismissed: string[];

  if (category === undefined) {
    // Clear all dismissed terms
    updatedDismissed = [];
  } else {
    // Only remove terms that belong to the given category
    const categoryTermIds = new Set(
      TIER1_TERMS_BY_CATEGORY[category].map((t) => t.id),
    );

    const profile = await prisma.educationProfile.findUniqueOrThrow({
      where: { userId },
      select: { dismissedTerms: true },
    });

    updatedDismissed = parseJsonStringArray(profile.dismissedTerms).filter((id) => !categoryTermIds.has(id));
  }

  const raw = await prisma.educationProfile.update({
    where: { userId },
    data: { dismissedTerms: updatedDismissed },
    select: {
      id: true,
      userId: true,
      dismissedTerms: true,
      trainingModulesCompleted: true,
      isTrainingComplete: true,
      learningModeExpiry: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapToRecord(raw);
}

/**
 * Return all Tier 1 terms annotated with whether this user has dismissed them.
 *
 * Order matches TIER1_TERMS source order.
 */
export async function getTermsWithDismissalState(
  userId: string,
): Promise<TermWithDismissalState[]> {
  const profile = await getOrCreateProfile(userId);
  const dismissedSet = new Set(profile.dismissedTerms);

  return TIER1_TERMS.map((term) => ({
    term,
    isDismissed: dismissedSet.has(term.id),
  }));
}

/**
 * Return whether the user is currently in new-examiner learning mode.
 *
 * 'NEW'      — learningModeExpiry is set and is in the future
 * 'STANDARD' — no expiry set, or expiry has passed
 */
export async function getEducationMode(userId: string): Promise<EducationMode> {
  const profile = await getOrCreateProfile(userId);

  if (profile.learningModeExpiry !== null && profile.learningModeExpiry > new Date()) {
    return 'NEW';
  }

  return 'STANDARD';
}

/**
 * Get Tier 2 (always-present) education content for a given feature.
 *
 * Pure function — no database access. Delegates directly to getTier2ForFeature().
 * Tier 2 content is never personalized; it is the same for all users.
 */
export function getEducationContentForFeature(featureId: FeatureContext): Tier2EducationEntry[] {
  return getTier2ForFeature(featureId);
}

/**
 * Activate new-examiner learning mode for a user.
 *
 * Sets learningModeExpiry to now + 30 days. If the user is already in learning
 * mode, the expiry is extended from the current time (not the current expiry).
 */
export async function activateNewExaminerMode(userId: string): Promise<EducationProfileRecord> {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + LEARNING_MODE_DAYS);

  // Upsert so this works even if no profile exists yet
  const raw = await prisma.educationProfile.upsert({
    where: { userId },
    create: {
      userId,
      learningModeExpiry: expiry,
    },
    update: {
      learningModeExpiry: expiry,
    },
    select: {
      id: true,
      userId: true,
      dismissedTerms: true,
      trainingModulesCompleted: true,
      isTrainingComplete: true,
      learningModeExpiry: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapToRecord(raw);
}
