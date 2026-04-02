import { describe, it, expect } from 'vitest';
import {
  getComparableClaims,
  type ComparableClaimsRequest,
  type ComparableClaimsResult,
} from '../../server/services/comparable-claims.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ComparableClaimsRequest> = {}): ComparableClaimsRequest {
  return {
    bodyParts: ['lumbar spine'],
    injuryType: 'SPECIFIC',
    dateOfInjury: new Date('2025-06-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comparable-claims.service', () => {
  describe('getComparableClaims', () => {
    it('returns a result with all required fields', () => {
      const result = getComparableClaims(makeRequest());

      expect(result).toHaveProperty('sampleSize');
      expect(result).toHaveProperty('settlementRange');
      expect(result).toHaveProperty('averageTdDuration');
      expect(result).toHaveProperty('averagePdRating');
      expect(result).toHaveProperty('outcomeBucketed');
      expect(result).toHaveProperty('disclaimer');
    });

    // -----------------------------------------------------------------------
    // UPL: YELLOW zone disclaimer
    // -----------------------------------------------------------------------

    it('ALWAYS includes the YELLOW zone disclaimer', () => {
      const result = getComparableClaims(makeRequest());
      expect(result.disclaimer).toBeTruthy();
      expect(result.disclaimer).toContain('defense counsel');
      expect(result.disclaimer).toContain('Cal. Ins. Code');
    });

    it('includes disclaimer even for unknown body parts', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['xyznonexistent'] }));
      expect(result.disclaimer).toBeTruthy();
      expect(result.disclaimer).toContain('defense counsel');
    });

    it('includes disclaimer for all injury types', () => {
      for (const injuryType of ['SPECIFIC', 'CUMULATIVE', 'OCCUPATIONAL_DISEASE'] as const) {
        const result = getComparableClaims(makeRequest({ injuryType }));
        expect(result.disclaimer).toBeTruthy();
      }
    });

    // -----------------------------------------------------------------------
    // Body part matching
    // -----------------------------------------------------------------------

    it('matches lumbar spine by keyword', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['lumbar spine'] }));
      expect(result.sampleSize).toBe(2840);
    });

    it('matches lumbar spine by partial keyword "low back"', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['low back'] }));
      expect(result.sampleSize).toBe(2840);
    });

    it('matches shoulder by keyword', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['shoulder'] }));
      expect(result.sampleSize).toBe(1950);
    });

    it('matches knee by keyword', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['knee'] }));
      expect(result.sampleSize).toBe(1680);
    });

    it('matches psyche by keyword', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['psychiatric'] }));
      expect(result.sampleSize).toBe(640);
    });

    it('falls back to default profile for unknown body part', () => {
      const result = getComparableClaims(makeRequest({ bodyParts: ['xyznonexistent'] }));
      expect(result.sampleSize).toBe(1500); // default profile
    });

    // -----------------------------------------------------------------------
    // Multi-body-part blending
    // -----------------------------------------------------------------------

    it('blends multiple body parts by sample-size weight', () => {
      const result = getComparableClaims(
        makeRequest({ bodyParts: ['lumbar spine', 'shoulder'] }),
      );
      // Blended sample = 2840 + 1950 = 4790
      expect(result.sampleSize).toBe(4790);
      // Median should be between lumbar (58000) and shoulder (38000)
      expect(result.settlementRange.median).toBeGreaterThan(38000);
      expect(result.settlementRange.median).toBeLessThan(58000);
    });

    it('deduplicates matching profiles for the same body part region', () => {
      // Both "lumbar" and "low back" match the same profile
      const result = getComparableClaims(
        makeRequest({ bodyParts: ['lumbar', 'low back'] }),
      );
      expect(result.sampleSize).toBe(2840); // Not doubled
    });

    // -----------------------------------------------------------------------
    // Injury type multipliers
    // -----------------------------------------------------------------------

    it('applies cumulative trauma multiplier (1.30x) to settlements', () => {
      const specific = getComparableClaims(makeRequest({ injuryType: 'SPECIFIC' }));
      const ct = getComparableClaims(makeRequest({ injuryType: 'CUMULATIVE' }));

      expect(ct.settlementRange.median).toBe(
        Math.round(specific.settlementRange.median * 1.30),
      );
    });

    it('applies occupational disease multiplier (1.25x) to settlements', () => {
      const specific = getComparableClaims(makeRequest({ injuryType: 'SPECIFIC' }));
      const od = getComparableClaims(makeRequest({ injuryType: 'OCCUPATIONAL_DISEASE' }));

      expect(od.settlementRange.median).toBe(
        Math.round(specific.settlementRange.median * 1.25),
      );
    });

    it('occupational disease increases denial rate', () => {
      const specific = getComparableClaims(makeRequest({ injuryType: 'SPECIFIC' }));
      const od = getComparableClaims(makeRequest({ injuryType: 'OCCUPATIONAL_DISEASE' }));

      expect(od.outcomeBucketed.denied).toBeGreaterThan(specific.outcomeBucketed.denied);
    });

    // -----------------------------------------------------------------------
    // Settlement range ordering
    // -----------------------------------------------------------------------

    it('settlement percentiles are in ascending order', () => {
      const result = getComparableClaims(makeRequest());
      const { p25, median, p75, p90 } = result.settlementRange;
      expect(p25).toBeLessThanOrEqual(median);
      expect(median).toBeLessThanOrEqual(p75);
      expect(p75).toBeLessThanOrEqual(p90);
    });

    // -----------------------------------------------------------------------
    // Outcome distribution
    // -----------------------------------------------------------------------

    it('outcome buckets sum to approximately 1.0', () => {
      const result = getComparableClaims(makeRequest());
      const { settled, award, denied, withdrawn } = result.outcomeBucketed;
      const total = settled + award + denied + withdrawn;
      expect(total).toBeCloseTo(1.0, 1);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('handles empty body parts array gracefully', () => {
      // The Zod schema requires min(1), but the service itself should handle it
      const result = getComparableClaims({
        bodyParts: [],
        injuryType: 'SPECIFIC',
        dateOfInjury: new Date(),
      });
      expect(result.sampleSize).toBe(1500); // default profile
      expect(result.disclaimer).toBeTruthy();
    });

    it('currentReserves is optional and does not affect result', () => {
      const without = getComparableClaims(makeRequest());
      const with100k = getComparableClaims(makeRequest({ currentReserves: 100000 }));
      expect(without.settlementRange.median).toBe(with100k.settlementRange.median);
    });
  });
});
