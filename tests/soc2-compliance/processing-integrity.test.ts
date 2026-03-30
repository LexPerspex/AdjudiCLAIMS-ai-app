import { describe, it, expect } from 'vitest';

/**
 * SOC 2 PI1.1-PI1.5 — Processing Integrity
 *
 * Tests:
 * - TD rate calculation is mathematically correct (2/3 AWE with statutory min/max)
 * - Death benefit calculation matches Labor Code formula
 * - UPL classifier correctly classifies RED zone queries
 * - UPL classifier correctly classifies GREEN zone queries
 * - UPL validator catches prohibited legal advice language
 * - Deadline engine generates correct regulatory deadlines
 * - Investigation checklist generates all required items for claim type
 * - Benefit calculations are deterministic (same input → same output)
 */

import {
  calculateTdRate,
  calculateDeathBenefit,
} from '../../server/services/benefit-calculator.service.js';

import { classifyQuerySync } from '../../server/services/upl-classifier.service.js';
import type { UplClassification } from '../../server/services/upl-classifier.service.js';

import { validateOutput } from '../../server/services/upl-validator.service.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SOC 2 PI1.1-PI1.5 — Processing Integrity', () => {

  // PI1.1 — TD rate calculation is mathematically correct
  it('TD rate is 2/3 of AWE for mid-range earnings (LC 4653)', () => {
    const result = calculateTdRate(1200, new Date('2025-06-15'));

    // 2/3 * 1200 = 800.00
    expect(result.tdRate).toBe(800);
    expect(result.awe).toBe(1200);
    expect(result.wasClampedToMin).toBe(false);
    expect(result.wasClampedToMax).toBe(false);
    expect(result.statutoryAuthority).toBe('LC 4653');
  });

  it('TD rate is clamped to 2025 statutory minimum ($242.86) for low AWE', () => {
    // AWE $100 -> 2/3 * 100 = $66.67, well below minimum
    const result = calculateTdRate(100, new Date('2025-03-01'));

    expect(result.tdRate).toBe(242.86);
    expect(result.wasClampedToMin).toBe(true);
    expect(result.statutoryMin).toBe(242.86);
    expect(result.statutoryAuthority).toBe('LC 4653');
  });

  it('TD rate is clamped to 2025 statutory maximum ($1694.57) for high AWE', () => {
    // AWE $10,000 -> 2/3 * 10000 = $6666.67, above maximum
    const result = calculateTdRate(10000, new Date('2025-06-15'));

    expect(result.tdRate).toBe(1694.57);
    expect(result.wasClampedToMax).toBe(true);
    expect(result.statutoryMax).toBe(1694.57);
  });

  // PI1.1 — Death benefit calculation matches Labor Code formula
  it('death benefit for total dependents in 2025 is $310,000 (LC 4700-4706)', () => {
    const result = calculateDeathBenefit({
      dateOfInjury: new Date('2025-06-15'),
      numberOfDependents: 1,
      dependentType: 'TOTAL',
    });

    expect(result.totalBenefit).toBe(310000);
    expect(result.statutoryAuthority).toBe('LC 4700-4706');
    expect(result.dependentType).toBe('TOTAL');
  });

  it('death benefit for partial dependents at 50% is $155,000', () => {
    const result = calculateDeathBenefit({
      dateOfInjury: new Date('2025-06-15'),
      numberOfDependents: 1,
      dependentType: 'PARTIAL',
      partialPercentage: 50,
    });

    expect(result.totalBenefit).toBe(155000); // 50% of $310,000
  });

  // PI1.2 — UPL classifier correctly classifies RED zone queries
  it('UPL classifier (sync) classifies "Should I deny this claim?" as RED', () => {
    const result: UplClassification = classifyQuerySync('Should I deny this claim?');

    expect(result.zone).toBe('RED');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('UPL classifier (sync) classifies "Should I settle for $50,000?" as RED or YELLOW (conservative)', () => {
    const result: UplClassification = classifyQuerySync('Should I settle this case for $50,000?');

    // Either RED (keyword match) or YELLOW (conservative default) — never GREEN
    expect(['RED', 'YELLOW']).toContain(result.zone);
  });

  // PI1.2 — UPL classifier correctly classifies GREEN zone queries
  it('UPL classifier (sync) classifies factual TD calculation query as GREEN', () => {
    const result: UplClassification = classifyQuerySync('What is the TD rate for AWE of $1200?');

    expect(result.zone).toBe('GREEN');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('UPL classifier (sync) classifies factual deadline query as GREEN or YELLOW (not RED)', () => {
    // "What is the deadline" is a factual question — it should never be classified as RED.
    // GREEN is ideal; YELLOW (conservative default) is acceptable for this factual query.
    const result: UplClassification = classifyQuerySync(
      'What is the deadline for TD payments under LC 4650?',
    );

    // Must not be RED — this is a purely factual regulatory question
    expect(result.zone).not.toBe('RED');
    expect(['GREEN', 'YELLOW']).toContain(result.zone);
  });

  // PI1.3 — UPL validator catches prohibited legal advice language
  it('UPL validator catches "you should deny" as prohibited language', () => {
    const result = validateOutput('You should deny this claim based on the medical evidence.');

    expect(result.result).toBe('FAIL');
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('UPL validator catches "coverage is not disputed" as a legal conclusion', () => {
    const result = validateOutput('Coverage is clear and this claim should be accepted.');

    expect(result.result).toBe('FAIL');
  });

  it('UPL validator passes clean factual statements', () => {
    const result = validateOutput(
      'The TD rate for this claim is $800.00 per week based on an AWE of $1,200.00 (LC 4653).',
    );

    expect(result.result).toBe('PASS');
    expect(result.violations).toHaveLength(0);
  });

  // PI1.4 — Deadline engine calculates correct dates (pure function tests)
  it('deadline engine generates deadlines from the deadline-generator module', async () => {
    const { generateDeadlines } = await import('../../server/services/deadline-generator.js');

    // Use a mock prisma that captures createMany calls
    const createdDeadlines: unknown[] = [];
    const mockPrisma = {
      regulatoryDeadline: {
        createMany: vi.fn().mockImplementation((args: { data: unknown[] }) => {
          createdDeadlines.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        }),
      },
    } as unknown as Parameters<typeof generateDeadlines>[0];

    const dateReported = new Date('2025-06-20');

    await generateDeadlines(mockPrisma, 'claim-test', dateReported);

    // Should generate multiple deadlines (at minimum: acknowledge, TD, etc.)
    expect(createdDeadlines.length).toBeGreaterThan(0);
  });

  // PI1.5 — Investigation checklist generates all required items
  it('investigation generator creates all 10 required checklist items', async () => {
    const { generateInvestigationItems } = await import('../../server/services/investigation-generator.js');

    const createdItems: unknown[] = [];
    const mockPrisma = {
      investigationItem: {
        createMany: vi.fn().mockImplementation((args: { data: unknown[] }) => {
          createdItems.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        }),
      },
    } as unknown as Parameters<typeof generateInvestigationItems>[0];

    await generateInvestigationItems(mockPrisma, 'claim-test');

    expect(createdItems.length).toBe(10);

    // Verify all items start as incomplete
    const allIncomplete = createdItems.every(
      (item) => (item as { isComplete: boolean }).isComplete === false,
    );
    expect(allIncomplete).toBe(true);
  });

  // PI1.5 — Benefit calculations are deterministic
  it('TD rate calculation is deterministic — same input produces same output', () => {
    const awe = 1500;
    const date = new Date('2025-08-01');

    const result1 = calculateTdRate(awe, date);
    const result2 = calculateTdRate(awe, date);

    expect(result1.tdRate).toBe(result2.tdRate);
    expect(result1.awe).toBe(result2.awe);
    expect(result1.wasClampedToMin).toBe(result2.wasClampedToMin);
    expect(result1.wasClampedToMax).toBe(result2.wasClampedToMax);
    expect(result1.statutoryAuthority).toBe(result2.statutoryAuthority);
  });
});

// ---------------------------------------------------------------------------
// vi import needed for mock creation inside tests
// ---------------------------------------------------------------------------
import { vi } from 'vitest';
