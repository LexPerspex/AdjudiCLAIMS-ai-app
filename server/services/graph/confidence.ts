/**
 * Graph confidence math utilities.
 *
 * Mathematical foundation for edge confidence scoring in the AdjudiCLAIMS
 * knowledge graph. Implements noisy-OR combination, chain confidence,
 * Hebbian learning, exponential decay, and maturity scoring.
 *
 * All confidence values are clamped to [0, 1].
 * All weight values are clamped to [0.5, 2.0] (Hebbian range).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum Hebbian weight (upper clamp for edge weights). */
const MAX_WEIGHT = 2.0;

/** Minimum Hebbian weight (lower clamp — edges never fully disappear). */
const MIN_WEIGHT = 0.5;

/** Base weight that decay converges toward (neutral, not zero). */
const BASE_WEIGHT = 1.0;

/** Examiner-domain facet weights for overall maturity scoring. */
export const EXAMINER_FACET_WEIGHTS = {
  medical: 0.30,
  insuranceBenefit: 0.25,
  employment: 0.20,
  regulatory: 0.15,
  evidential: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MaturityLabel = 'NASCENT' | 'GROWING' | 'MATURE' | 'COMPLETE';

export type ConfidenceLabel = 'verified' | 'confident' | 'suggested' | 'ai_generated';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamp a confidence value to [0, 1]. */
function clampConfidence(value: number): number {
  return clamp(value, 0, 1);
}

/** Clamp a Hebbian weight to [MIN_WEIGHT, MAX_WEIGHT]. */
function clampWeight(value: number): number {
  return clamp(value, MIN_WEIGHT, MAX_WEIGHT);
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Noisy-OR combination of independent confidence sources.
 *
 * Formula: `confidence = 1 - ∏(1 - p_i)`
 *
 * Multiple independent sources each contribute evidence. The result
 * approaches 1.0 as more sources confirm the same edge.
 *
 * @param confidences - Array of confidence values from independent sources.
 * @returns Combined confidence in [0, 1]. Empty array returns 0.
 */
export function noisyOr(confidences: number[]): number {
  if (confidences.length === 0) return 0;

  const product = confidences.reduce(
    (acc, p) => acc * (1 - clampConfidence(p)),
    1,
  );

  return clampConfidence(1 - product);
}

/**
 * Chain confidence for multi-hop graph traversal.
 *
 * Formula: `product = ∏(p_i)`
 *
 * Confidence decreases with each hop — a chain is only as strong
 * as its weakest link (multiplicatively).
 *
 * @param confidences - Array of per-hop confidence values.
 * @returns Chain confidence in [0, 1]. Empty array returns 1 (identity).
 */
export function chainConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 1;

  const product = confidences.reduce(
    (acc, p) => acc * clampConfidence(p),
    1,
  );

  return clampConfidence(product);
}

/**
 * Apply a neuro-plastic weight to a confidence value.
 *
 * Formula: `result = confidence * weight`
 *
 * @param confidence - Base confidence in [0, 1].
 * @param weight - Hebbian weight, typically in [0.5, 2.0].
 * @returns Weighted confidence clamped to [0, 1].
 */
export function weightedConfidence(confidence: number, weight: number): number {
  return clampConfidence(clampConfidence(confidence) * weight);
}

/**
 * Hebbian strengthening on edge traversal.
 *
 * Formula: `newWeight = currentWeight + learningRate * (maxWeight - currentWeight)`
 *
 * Edges that are traversed frequently grow stronger, converging
 * toward MAX_WEIGHT asymptotically.
 *
 * @param currentWeight - Current edge weight.
 * @param learningRate - Learning rate (default 0.1).
 * @returns Strengthened weight clamped to [0.5, 2.0].
 */
export function hebbianStrengthen(
  currentWeight: number,
  learningRate: number = 0.1,
): number {
  const newWeight = currentWeight + learningRate * (MAX_WEIGHT - currentWeight);
  return clampWeight(newWeight);
}

/**
 * Exponential decay toward base weight.
 *
 * Formula: `newWeight = baseWeight + (currentWeight - baseWeight) * 0.5^(days/halfLife)`
 *
 * Edges that are not traversed decay toward BASE_WEIGHT (neutral, not zero).
 * This ensures unused edges fade to neutral rather than disappearing.
 *
 * @param currentWeight - Current edge weight.
 * @param daysSinceTraversal - Number of days since last traversal.
 * @param halfLifeDays - Half-life in days (default 30).
 * @returns Decayed weight clamped to [0.5, 2.0].
 */
export function lazyDecay(
  currentWeight: number,
  daysSinceTraversal: number,
  halfLifeDays: number = 30,
): number {
  const decayFactor = Math.pow(0.5, daysSinceTraversal / halfLifeDays);
  const newWeight = BASE_WEIGHT + (currentWeight - BASE_WEIGHT) * decayFactor;
  return clampWeight(newWeight);
}

/**
 * Single-facet maturity score.
 *
 * Formula: `score = min(actual / expected, 1.0)`
 *
 * @param counts - Object with actual and expected counts.
 * @returns Maturity score in [0, 1]. If expected is 0, returns 1.0.
 */
export function maturityScore(counts: { actual: number; expected: number }): number {
  if (counts.expected === 0) return 1.0;
  if (counts.actual === 0) return 0;
  return clampConfidence(counts.actual / counts.expected);
}

/**
 * Overall maturity as a weighted average of facet scores.
 *
 * @param facetScores - Map of facet name to score in [0, 1].
 * @param facetWeights - Map of facet name to weight (should sum to ~1.0).
 * @returns Object with numeric score and MaturityLabel.
 */
export function overallMaturity(
  facetScores: Record<string, number>,
  facetWeights: Record<string, number>,
): { score: number; label: MaturityLabel } {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [facet, weight] of Object.entries(facetWeights)) {
    const score = facetScores[facet] ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? clampConfidence(weightedSum / totalWeight) : 0;
  const label = maturityLabel(score);

  return { score, label };
}

/**
 * Map a numeric confidence to a human-readable trust badge.
 *
 * @param confidence - Confidence value in [0, 1].
 * @returns Trust label.
 */
export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.95) return 'verified';
  if (confidence >= 0.80) return 'confident';
  if (confidence >= 0.50) return 'suggested';
  return 'ai_generated';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function maturityLabel(score: number): MaturityLabel {
  if (score > 0.8) return 'COMPLETE';
  if (score >= 0.5) return 'MATURE';
  if (score >= 0.2) return 'GROWING';
  return 'NASCENT';
}
