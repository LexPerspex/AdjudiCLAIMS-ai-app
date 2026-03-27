/**
 * Tests for graph confidence math utilities.
 *
 * Covers noisy-OR combination, chain confidence, weighted confidence,
 * Hebbian learning, exponential decay, maturity scoring, and confidence
 * label mapping — including edge cases and boundary values.
 */

import { describe, it, expect } from 'vitest';

import {
  noisyOr,
  chainConfidence,
  weightedConfidence,
  hebbianStrengthen,
  lazyDecay,
  maturityScore,
  overallMaturity,
  confidenceLabel,
  EXAMINER_FACET_WEIGHTS,
} from '../../../server/services/graph/confidence.js';

// ---------------------------------------------------------------------------
// noisyOr
// ---------------------------------------------------------------------------

describe('noisyOr', () => {
  it('returns 0 for empty array', () => {
    expect(noisyOr([])).toBe(0);
  });

  it('returns the single value for a single-element array', () => {
    expect(noisyOr([0.7])).toBeCloseTo(0.7, 10);
  });

  it('combines two independent sources', () => {
    // 1 - (1-0.6)(1-0.7) = 1 - 0.4*0.3 = 1 - 0.12 = 0.88
    expect(noisyOr([0.6, 0.7])).toBeCloseTo(0.88, 10);
  });

  it('combines three sources', () => {
    // 1 - (0.4)(0.3)(0.2) = 1 - 0.024 = 0.976
    expect(noisyOr([0.6, 0.7, 0.8])).toBeCloseTo(0.976, 10);
  });

  it('returns 0 when all inputs are 0', () => {
    expect(noisyOr([0, 0, 0])).toBe(0);
  });

  it('returns 1 when any input is 1', () => {
    expect(noisyOr([0.5, 1.0, 0.3])).toBe(1);
  });

  it('returns 1 when all inputs are 1', () => {
    expect(noisyOr([1, 1, 1])).toBe(1);
  });

  it('clamps negative inputs to 0', () => {
    // Negative treated as 0 → noisyOr([0, 0.5]) = 0.5
    expect(noisyOr([-0.3, 0.5])).toBeCloseTo(0.5, 10);
  });

  it('clamps inputs above 1 to 1', () => {
    // 1.5 clamped to 1 → noisyOr([1, 0.5]) = 1
    expect(noisyOr([1.5, 0.5])).toBe(1);
  });

  it('approaches 1 with many moderate sources', () => {
    const sources = Array.from({ length: 10 }, () => 0.3);
    // 1 - 0.7^10 ≈ 0.9718
    expect(noisyOr(sources)).toBeCloseTo(1 - Math.pow(0.7, 10), 6);
  });
});

// ---------------------------------------------------------------------------
// chainConfidence
// ---------------------------------------------------------------------------

describe('chainConfidence', () => {
  it('returns 1 for empty array (multiplicative identity)', () => {
    expect(chainConfidence([])).toBe(1);
  });

  it('returns the single value for one hop', () => {
    expect(chainConfidence([0.9])).toBeCloseTo(0.9, 10);
  });

  it('multiplies two hops', () => {
    expect(chainConfidence([0.9, 0.8])).toBeCloseTo(0.72, 10);
  });

  it('decreases with each hop', () => {
    const two = chainConfidence([0.9, 0.8]);
    const three = chainConfidence([0.9, 0.8, 0.7]);
    expect(three).toBeLessThan(two);
    expect(three).toBeCloseTo(0.504, 10);
  });

  it('returns 0 when any hop is 0', () => {
    expect(chainConfidence([0.9, 0, 0.8])).toBe(0);
  });

  it('returns 1 when all hops are 1', () => {
    expect(chainConfidence([1, 1, 1])).toBe(1);
  });

  it('clamps negative inputs to 0', () => {
    expect(chainConfidence([0.9, -0.5])).toBe(0);
  });

  it('clamps inputs above 1 to 1', () => {
    expect(chainConfidence([0.9, 1.5])).toBeCloseTo(0.9, 10);
  });
});

// ---------------------------------------------------------------------------
// weightedConfidence
// ---------------------------------------------------------------------------

describe('weightedConfidence', () => {
  it('multiplies confidence by weight', () => {
    expect(weightedConfidence(0.8, 1.5)).toBeCloseTo(1.0, 10); // 1.2 clamped to 1
  });

  it('returns 0 for zero confidence', () => {
    expect(weightedConfidence(0, 1.5)).toBe(0);
  });

  it('clamps result to 1 when product exceeds 1', () => {
    expect(weightedConfidence(0.9, 2.0)).toBe(1);
  });

  it('reduces confidence with weight < 1', () => {
    expect(weightedConfidence(0.8, 0.5)).toBeCloseTo(0.4, 10);
  });

  it('neutral weight (1.0) preserves confidence', () => {
    expect(weightedConfidence(0.7, 1.0)).toBeCloseTo(0.7, 10);
  });
});

// ---------------------------------------------------------------------------
// hebbianStrengthen
// ---------------------------------------------------------------------------

describe('hebbianStrengthen', () => {
  it('strengthens from neutral weight', () => {
    // 1.0 + 0.1 * (2.0 - 1.0) = 1.0 + 0.1 = 1.1
    expect(hebbianStrengthen(1.0)).toBeCloseTo(1.1, 10);
  });

  it('strengthens from minimum weight', () => {
    // 0.5 + 0.1 * (2.0 - 0.5) = 0.5 + 0.15 = 0.65
    expect(hebbianStrengthen(0.5)).toBeCloseTo(0.65, 10);
  });

  it('converges toward max weight', () => {
    // 1.9 + 0.1 * (2.0 - 1.9) = 1.9 + 0.01 = 1.91
    expect(hebbianStrengthen(1.9)).toBeCloseTo(1.91, 10);
  });

  it('does not exceed max weight', () => {
    expect(hebbianStrengthen(2.0)).toBeCloseTo(2.0, 10);
  });

  it('clamps result to min weight', () => {
    // Even with a very low current weight, result is clamped to 0.5
    expect(hebbianStrengthen(0.0, 0.01)).toBeGreaterThanOrEqual(0.5);
  });

  it('uses custom learning rate', () => {
    // 1.0 + 0.5 * (2.0 - 1.0) = 1.0 + 0.5 = 1.5
    expect(hebbianStrengthen(1.0, 0.5)).toBeCloseTo(1.5, 10);
  });

  it('repeated application converges toward 2.0', () => {
    let weight = 1.0;
    for (let i = 0; i < 100; i++) {
      weight = hebbianStrengthen(weight);
    }
    expect(weight).toBeCloseTo(2.0, 2);
  });
});

// ---------------------------------------------------------------------------
// lazyDecay
// ---------------------------------------------------------------------------

describe('lazyDecay', () => {
  it('no decay at 0 days', () => {
    expect(lazyDecay(1.5, 0)).toBeCloseTo(1.5, 10);
  });

  it('decays halfway to base at half-life', () => {
    // base=1.0, current=2.0 → after 30 days: 1.0 + (2.0-1.0)*0.5 = 1.5
    expect(lazyDecay(2.0, 30)).toBeCloseTo(1.5, 10);
  });

  it('decays to ~base at many half-lives', () => {
    // After 300 days (10 half-lives): practically at base
    expect(lazyDecay(2.0, 300)).toBeCloseTo(1.0, 2);
  });

  it('decays from below base (strengthened weight approaches base)', () => {
    // current=0.5, base=1.0 → after 30 days: 1.0 + (0.5-1.0)*0.5 = 1.0 - 0.25 = 0.75
    expect(lazyDecay(0.5, 30)).toBeCloseTo(0.75, 10);
  });

  it('stays at base weight when already at base', () => {
    expect(lazyDecay(1.0, 30)).toBeCloseTo(1.0, 10);
  });

  it('clamps result to min weight', () => {
    // Even extreme decay from a low weight stays at 0.5
    expect(lazyDecay(0.5, 1000)).toBeGreaterThanOrEqual(0.5);
  });

  it('clamps result to max weight', () => {
    expect(lazyDecay(2.0, 0)).toBeLessThanOrEqual(2.0);
  });

  it('uses custom half-life', () => {
    // half-life=10: after 10 days from 2.0 → 1.0 + 1.0*0.5 = 1.5
    expect(lazyDecay(2.0, 10, 10)).toBeCloseTo(1.5, 10);
  });
});

// ---------------------------------------------------------------------------
// maturityScore
// ---------------------------------------------------------------------------

describe('maturityScore', () => {
  it('returns 1.0 when expected is 0 (nothing needed)', () => {
    expect(maturityScore({ actual: 0, expected: 0 })).toBe(1.0);
  });

  it('returns 0 when actual is 0', () => {
    expect(maturityScore({ actual: 0, expected: 5 })).toBe(0);
  });

  it('returns ratio when actual < expected', () => {
    expect(maturityScore({ actual: 3, expected: 10 })).toBeCloseTo(0.3, 10);
  });

  it('caps at 1.0 when actual >= expected', () => {
    expect(maturityScore({ actual: 15, expected: 10 })).toBe(1.0);
  });

  it('returns 1.0 when actual equals expected', () => {
    expect(maturityScore({ actual: 10, expected: 10 })).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// overallMaturity
// ---------------------------------------------------------------------------

describe('overallMaturity', () => {
  const weights = { a: 0.5, b: 0.3, c: 0.2 };

  it('returns NASCENT for very low scores', () => {
    const result = overallMaturity({ a: 0.1, b: 0.1, c: 0.1 }, weights);
    expect(result.score).toBeCloseTo(0.1, 10);
    expect(result.label).toBe('NASCENT');
  });

  it('returns GROWING for scores in [0.2, 0.5)', () => {
    const result = overallMaturity({ a: 0.3, b: 0.3, c: 0.3 }, weights);
    expect(result.score).toBeCloseTo(0.3, 10);
    expect(result.label).toBe('GROWING');
  });

  it('returns MATURE for scores in [0.5, 0.8]', () => {
    const result = overallMaturity({ a: 0.7, b: 0.7, c: 0.7 }, weights);
    expect(result.score).toBeCloseTo(0.7, 10);
    expect(result.label).toBe('MATURE');
  });

  it('returns COMPLETE for scores > 0.8', () => {
    const result = overallMaturity({ a: 1.0, b: 1.0, c: 1.0 }, weights);
    expect(result.score).toBeCloseTo(1.0, 10);
    expect(result.label).toBe('COMPLETE');
  });

  it('handles missing facet scores (defaults to 0)', () => {
    const result = overallMaturity({ a: 1.0 }, weights);
    // (1.0*0.5 + 0*0.3 + 0*0.2) / 1.0 = 0.5
    expect(result.score).toBeCloseTo(0.5, 10);
    expect(result.label).toBe('MATURE');
  });

  it('handles empty weights', () => {
    const result = overallMaturity({ a: 1.0 }, {});
    expect(result.score).toBe(0);
    expect(result.label).toBe('NASCENT');
  });

  it('boundary: exactly 0.2 is GROWING', () => {
    // Need weighted average = exactly 0.2
    const result = overallMaturity({ x: 0.2 }, { x: 1.0 });
    expect(result.score).toBeCloseTo(0.2, 10);
    expect(result.label).toBe('GROWING');
  });

  it('boundary: exactly 0.5 is MATURE', () => {
    const result = overallMaturity({ x: 0.5 }, { x: 1.0 });
    expect(result.score).toBeCloseTo(0.5, 10);
    expect(result.label).toBe('MATURE');
  });

  it('boundary: exactly 0.8 is MATURE', () => {
    const result = overallMaturity({ x: 0.8 }, { x: 1.0 });
    expect(result.score).toBeCloseTo(0.8, 10);
    expect(result.label).toBe('MATURE');
  });

  it('boundary: just above 0.8 is COMPLETE', () => {
    const result = overallMaturity({ x: 0.81 }, { x: 1.0 });
    expect(result.label).toBe('COMPLETE');
  });

  it('works with EXAMINER_FACET_WEIGHTS', () => {
    const scores = {
      medical: 0.8,
      insuranceBenefit: 0.6,
      employment: 0.4,
      regulatory: 0.3,
      evidential: 0.2,
    };
    const result = overallMaturity(scores, { ...EXAMINER_FACET_WEIGHTS });
    // 0.8*0.30 + 0.6*0.25 + 0.4*0.20 + 0.3*0.15 + 0.2*0.10
    // = 0.24 + 0.15 + 0.08 + 0.045 + 0.02 = 0.535
    expect(result.score).toBeCloseTo(0.535, 6);
    expect(result.label).toBe('MATURE');
  });
});

// ---------------------------------------------------------------------------
// confidenceLabel
// ---------------------------------------------------------------------------

describe('confidenceLabel', () => {
  it('returns verified for >= 0.95', () => {
    expect(confidenceLabel(0.95)).toBe('verified');
    expect(confidenceLabel(1.0)).toBe('verified');
    expect(confidenceLabel(0.99)).toBe('verified');
  });

  it('returns confident for >= 0.80 and < 0.95', () => {
    expect(confidenceLabel(0.80)).toBe('confident');
    expect(confidenceLabel(0.94)).toBe('confident');
    expect(confidenceLabel(0.85)).toBe('confident');
  });

  it('returns suggested for >= 0.50 and < 0.80', () => {
    expect(confidenceLabel(0.50)).toBe('suggested');
    expect(confidenceLabel(0.79)).toBe('suggested');
    expect(confidenceLabel(0.65)).toBe('suggested');
  });

  it('returns ai_generated for < 0.50', () => {
    expect(confidenceLabel(0.49)).toBe('ai_generated');
    expect(confidenceLabel(0.0)).toBe('ai_generated');
    expect(confidenceLabel(0.25)).toBe('ai_generated');
  });

  it('boundary: 0.9499... is confident', () => {
    expect(confidenceLabel(0.9499)).toBe('confident');
  });

  it('boundary: 0.7999... is suggested', () => {
    expect(confidenceLabel(0.7999)).toBe('suggested');
  });

  it('boundary: 0.4999... is ai_generated', () => {
    expect(confidenceLabel(0.4999)).toBe('ai_generated');
  });
});
