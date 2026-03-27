import { describe, it, expect } from 'vitest';

/**
 * OMFS Comparison Service tests.
 *
 * Tests the pure OMFS rate lookup and bill comparison logic.
 * No mocking needed — these are pure functions with a stub rate table.
 *
 * Verifies:
 * - Known CPT codes return correct OMFS rates
 * - Unknown CPT codes return null rate
 * - Bill comparison identifies overcharges correctly
 * - Bill comparison handles mixed known/unknown CPT codes
 * - Disclaimer is always present
 * - isStubData flag is true in stub mode
 * - Aggregate totals and discrepancy percentages are correct
 */

import {
  lookupOmfsRate,
  compareBillToOmfs,
} from '../../server/services/omfs-comparison.service.js';

// ==========================================================================
// lookupOmfsRate
// ==========================================================================

describe('OMFS Comparison Service — lookupOmfsRate', () => {
  it('returns correct rate for known CPT code 99213 (office visit)', () => {
    const result = lookupOmfsRate('99213');

    expect(result.cptCode).toBe('99213');
    expect(result.omfsRate).toBe(78.42);
    expect(result.description).toContain('Office visit');
    expect(result.feeScheduleSection).toBe('RBRVS');
    expect(result.effectiveDate).toBeDefined();
  });

  it('returns correct rate for known CPT code 72148 (MRI lumbar)', () => {
    const result = lookupOmfsRate('72148');

    expect(result.cptCode).toBe('72148');
    expect(result.omfsRate).toBe(289.50);
    expect(result.description).toContain('MRI lumbar');
  });

  it('returns correct rate for known CPT code 27447 (total knee replacement)', () => {
    const result = lookupOmfsRate('27447');

    expect(result.cptCode).toBe('27447');
    expect(result.omfsRate).toBe(1245.00);
  });

  it('returns correct rate for known CPT code 64483 (epidural injection)', () => {
    const result = lookupOmfsRate('64483');

    expect(result.cptCode).toBe('64483');
    expect(result.omfsRate).toBe(215.30);
  });

  it('returns null rate for unknown CPT code', () => {
    const result = lookupOmfsRate('99999');

    expect(result.cptCode).toBe('99999');
    expect(result.omfsRate).toBeNull();
    expect(result.feeScheduleSection).toBe('UNKNOWN');
  });

  it('returns all 12 stub CPT codes with non-null rates', () => {
    const knownCodes = [
      '99213', '99214', '97110', '97140', '97530',
      '72148', '72141', '20610', '64483', '99203',
      '27447', '29881',
    ];

    for (const code of knownCodes) {
      const result = lookupOmfsRate(code);
      expect(result.omfsRate).not.toBeNull();
      expect(result.omfsRate).toBeGreaterThan(0);
    }
  });
});

// ==========================================================================
// compareBillToOmfs
// ==========================================================================

describe('OMFS Comparison Service — compareBillToOmfs', () => {
  it('identifies overcharge when billed amount exceeds OMFS rate', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 150.00, description: 'Office visit' },
    ]);

    expect(result.lineItems).toHaveLength(1);
    const item = (result.lineItems[0] as (typeof result.lineItems)[number]);
    expect(item.isOvercharge).toBe(true);
    expect(item.amountClaimed).toBe(150.00);
    expect(item.omfsAllowed).toBe(78.42);
    expect(item.overchargeAmount).toBe(71.58); // 150 - 78.42
  });

  it('does not flag overcharge when billed amount is at or below OMFS rate', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 78.42, description: 'Office visit' },
    ]);

    const item = (result.lineItems[0] as (typeof result.lineItems)[number]);
    expect(item.isOvercharge).toBe(false);
    expect(item.overchargeAmount).toBe(0);
  });

  it('does not flag overcharge when billed below OMFS rate', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 50.00, description: 'Office visit' },
    ]);

    const item = (result.lineItems[0] as (typeof result.lineItems)[number]);
    expect(item.isOvercharge).toBe(false);
    expect(item.overchargeAmount).toBe(0);
  });

  it('handles unknown CPT codes with null omfsAllowed', () => {
    const result = compareBillToOmfs([
      { cptCode: '99999', amount: 500.00, description: 'Unknown procedure' },
    ]);

    const item = (result.lineItems[0] as (typeof result.lineItems)[number]);
    expect(item.omfsAllowed).toBeNull();
    expect(item.isOvercharge).toBe(false);
    expect(item.overchargeAmount).toBe(0);
  });

  it('computes correct aggregate totals for multiple line items', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 150.00, description: 'Office visit' },       // OMFS: 78.42
      { cptCode: '97110', amount: 60.00, description: 'Therapeutic exercises' }, // OMFS: 42.15
      { cptCode: '72148', amount: 400.00, description: 'MRI lumbar' },          // OMFS: 289.50
    ]);

    expect(result.lineItems).toHaveLength(3);
    expect(result.totalClaimed).toBe(610.00);
    expect(result.totalOmfsAllowed).toBe(410.07); // 78.42 + 42.15 + 289.50
    expect(result.totalDiscrepancy).toBe(199.93); // 610 - 410.07
    expect(result.discrepancyPercent).toBeGreaterThan(0);
  });

  it('handles mixed known and unknown CPT codes', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 150.00, description: 'Office visit' },
      { cptCode: '99999', amount: 500.00, description: 'Unknown procedure' },
    ]);

    expect(result.lineItems).toHaveLength(2);
    // Only the known code contributes to totalOmfsAllowed
    expect(result.totalOmfsAllowed).toBe(78.42);
    // Total claimed includes both
    expect(result.totalClaimed).toBe(650.00);
  });

  it('always includes the OMFS disclaimer', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 100.00, description: 'Visit' },
    ]);

    expect(result.disclaimer).toContain('OMFS rate comparison');
    expect(result.disclaimer).toContain('8 CCR 9789.10');
    expect(result.disclaimer).toContain('defense counsel');
  });

  it('sets isStubData to true in stub mode', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 100.00, description: 'Visit' },
    ]);

    expect(result.isStubData).toBe(true);
  });

  it('handles empty line items array', () => {
    const result = compareBillToOmfs([]);

    expect(result.lineItems).toHaveLength(0);
    expect(result.totalClaimed).toBe(0);
    expect(result.totalOmfsAllowed).toBe(0);
    expect(result.totalDiscrepancy).toBe(0);
    expect(result.discrepancyPercent).toBe(0);
    expect(result.disclaimer).toBeDefined();
  });

  it('computes discrepancy percent relative to OMFS allowed', () => {
    const result = compareBillToOmfs([
      { cptCode: '99214', amount: 235.26, description: 'Visit' }, // 2x OMFS rate of 117.63
    ]);

    // discrepancy = 235.26 - 117.63 = 117.63
    // percent = (117.63 / 117.63) * 100 = 100
    expect(result.discrepancyPercent).toBe(100);
  });

  it('rounds currency values to 2 decimal places', () => {
    const result = compareBillToOmfs([
      { cptCode: '99213', amount: 100.005, description: 'Visit' },
    ]);

    // amountClaimed should be rounded
    expect((result.lineItems[0] as (typeof result.lineItems)[number]).amountClaimed).toBe(100.01);
  });
});
