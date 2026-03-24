import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Benefit calculator tests.
 *
 * Tests the pure arithmetic calculation functions directly (unit tests)
 * AND the API endpoints via server.inject() (route tests).
 *
 * Verifies:
 * - TD rate = 2/3 AWE with statutory min/max clamping per LC 4653
 * - Different injury years use different rate tables
 * - Payment schedule generates correct 14-day periods per LC 4650
 * - Late payment detection and 10% penalty per LC 4650(c)
 * - Death benefit calculation per LC 4700-4706
 * - API input validation (negative AWE, missing fields)
 * - API authentication enforcement
 */

// ---------------------------------------------------------------------------
// Import pure calculation functions (no mocking needed -- pure arithmetic)
// ---------------------------------------------------------------------------

import {
  calculateTdRate,
  generatePaymentSchedule,
  calculateTdBenefit,
  calculateDeathBenefit,
} from '../../server/services/benefit-calculator.service.js';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-1',
  email: 'examiner@acme-ins.test',
  name: 'Jane Examiner',
  role: 'CLAIMS_EXAMINER' as const,
  organizationId: 'org-1',
  isActive: true,
};

// ---------------------------------------------------------------------------
// Mock Prisma (required by server routes that import db.js)
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
    },
    claim: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    document: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    timelineEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    regulatoryDeadline: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    investigationItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock storage and document pipeline services (imported transitively by server)
vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/mock'),
    download: vi.fn().mockResolvedValue(Buffer.from('mock')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/services/document-pipeline.service.js', () => ({
  processDocumentPipeline: vi.fn().mockResolvedValue({
    documentId: 'doc-1',
    ocrSuccess: true,
    classificationSuccess: true,
    extractionSuccess: true,
    embeddingSuccess: true,
    timelineSuccess: true,
    chunksCreated: 0,
    fieldsExtracted: 0,
    timelineEventsCreated: 0,
    errors: [],
  }),
}));

vi.mock('../../server/services/deadline-engine.service.js', () => ({
  getClaimDeadlines: vi.fn().mockResolvedValue([]),
  getDeadlineSummary: vi.fn().mockResolvedValue({ total: 0, pending: 0, met: 0, missed: 0 }),
  getAllUserDeadlines: vi.fn().mockResolvedValue([]),
  markDeadline: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../server/services/investigation-checklist.service.js', () => ({
  getInvestigationProgress: vi.fn().mockResolvedValue({
    items: [],
    totalItems: 0,
    completedItems: 0,
    progressPercentage: 0,
  }),
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemIncomplete: vi.fn().mockResolvedValue({}),
}));

// Dynamic import after mocks are in place
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: typeof MOCK_USER,
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);

  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ==========================================================================
// Unit tests: Pure calculation functions
// ==========================================================================

describe('Benefit Calculator Service — unit tests', () => {
  // -----------------------------------------------------------------------
  // calculateTdRate
  // -----------------------------------------------------------------------

  describe('calculateTdRate', () => {
    it('calculates 2/3 AWE for mid-range earnings (AWE $1200 -> TD $800)', () => {
      const result = calculateTdRate(1200, new Date('2025-06-15'));

      expect(result.awe).toBe(1200);
      expect(result.tdRate).toBe(800);
      expect(result.wasClampedToMin).toBe(false);
      expect(result.wasClampedToMax).toBe(false);
      expect(result.statutoryAuthority).toBe('LC 4653');
    });

    it('clamps to statutory minimum for low AWE', () => {
      // AWE $200 -> raw rate $133.33, below 2025 min of $242.86
      const result = calculateTdRate(200, new Date('2025-03-01'));

      expect(result.tdRate).toBe(242.86);
      expect(result.wasClampedToMin).toBe(true);
      expect(result.wasClampedToMax).toBe(false);
      expect(result.statutoryMin).toBe(242.86);
    });

    it('clamps to statutory maximum for high AWE', () => {
      // AWE $5000 -> raw rate $3333.33, above 2025 max of $1694.57
      const result = calculateTdRate(5000, new Date('2025-03-01'));

      expect(result.tdRate).toBe(1694.57);
      expect(result.wasClampedToMin).toBe(false);
      expect(result.wasClampedToMax).toBe(true);
      expect(result.statutoryMax).toBe(1694.57);
    });

    it('uses 2024 rate table for 2024 injury dates', () => {
      const result = calculateTdRate(200, new Date('2024-07-01'));

      expect(result.injuryYear).toBe(2024);
      expect(result.statutoryMin).toBe(230.95);
      expect(result.statutoryMax).toBe(1619.15);
      expect(result.tdRate).toBe(230.95); // clamped to min
      expect(result.wasClampedToMin).toBe(true);
    });

    it('uses 2025 rate table for 2025 injury dates', () => {
      const result = calculateTdRate(1200, new Date('2025-01-15'));

      expect(result.injuryYear).toBe(2025);
      expect(result.statutoryMin).toBe(242.86);
      expect(result.statutoryMax).toBe(1694.57);
      expect(result.tdRate).toBe(800); // mid-range, not clamped
    });

    it('uses 2026 rate table for 2026 injury dates', () => {
      const result = calculateTdRate(5000, new Date('2026-02-20'));

      expect(result.injuryYear).toBe(2026);
      expect(result.statutoryMin).toBe(252.43);
      expect(result.statutoryMax).toBe(1761.71);
      expect(result.tdRate).toBe(1761.71); // clamped to max
    });

    it('throws for negative AWE', () => {
      expect(() => calculateTdRate(-100, new Date('2025-01-01'))).toThrow('AWE cannot be negative');
    });

    it('handles zero AWE by clamping to minimum', () => {
      const result = calculateTdRate(0, new Date('2025-01-01'));

      expect(result.tdRate).toBe(242.86);
      expect(result.wasClampedToMin).toBe(true);
    });

    it('rounds the rate to 2 decimal places', () => {
      // AWE $1000 -> 2/3 * 1000 = 666.666... -> rounded to 666.67
      const result = calculateTdRate(1000, new Date('2025-06-01'));

      expect(result.tdRate).toBe(666.67);
    });

    it('falls back to nearest year for unknown injury year', () => {
      // 2023 is not in the table, should fall back to 2024
      const result = calculateTdRate(1200, new Date('2023-05-01'));

      expect(result.injuryYear).toBe(2024);
      expect(result.statutoryMin).toBe(230.95);
    });
  });

  // -----------------------------------------------------------------------
  // generatePaymentSchedule
  // -----------------------------------------------------------------------

  describe('generatePaymentSchedule', () => {
    it('generates correct number of 14-day payment periods', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-02-25'); // 55 days -> 4 periods (3 full + 1 partial)
      const tdRate = 800;

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate);

      expect(schedule.length).toBe(4);
    });

    it('first payment due date is 14 days after start', () => {
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-04-30');
      const tdRate = 800;

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate);
      const firstPayment = schedule[0];

      expect(firstPayment).toBeDefined();
      expect(firstPayment?.paymentNumber).toBe(1);
      // Due date = start + 14 days = March 15
      expect(firstPayment?.dueDate.toISOString().slice(0, 10)).toBe('2025-03-15');
    });

    it('calculates biweekly payment amount as 2x weekly rate', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-28'); // exactly 2 periods (28 days)
      const tdRate = 800;

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate);

      // Full biweekly payment = $800 * 2 = $1600
      expect(schedule[0]?.amount).toBe(1600);
      expect(schedule[1]?.amount).toBe(1600);
    });

    it('prorates the final partial period', () => {
      const startDate = new Date('2025-01-01');
      // 21 days: 1 full 14-day period + 7 remaining days
      const endDate = new Date('2025-01-21');
      const tdRate = 700;

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate);

      expect(schedule.length).toBe(2);

      // First period: full 14-day = $1400
      expect(schedule[0]?.amount).toBe(1400);

      // Second period: 7 days out of 14 = $700
      // (7/14) * 1400 = 700
      expect(schedule[1]?.amount).toBe(700);
    });

    it('flags late payments and calculates 10% penalty', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-28');
      const tdRate = 800;

      // Payment 1 due Jan 15, paid Jan 20 (late)
      // Payment 2 due Jan 29, paid Jan 25 (on time)
      const actualPaymentDates = [
        new Date('2025-01-20'), // 5 days late
        new Date('2025-01-25'), // 4 days early
      ];

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate, actualPaymentDates);

      expect(schedule[0]?.isLate).toBe(true);
      expect(schedule[0]?.penaltyAmount).toBe(160); // 10% of $1600

      expect(schedule[1]?.isLate).toBe(false);
      expect(schedule[1]?.penaltyAmount).toBe(0);
    });

    it('marks payment as on-time when paid on the due date', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-14');
      const tdRate = 800;

      // Paid exactly on due date
      const actualPaymentDates = [new Date('2025-01-15')];

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate, actualPaymentDates);

      expect(schedule[0]?.isLate).toBe(false);
      expect(schedule[0]?.penaltyAmount).toBe(0);
    });

    it('handles single-day TD period', () => {
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-03-01');
      const tdRate = 800;

      const schedule = generatePaymentSchedule(tdRate, startDate, endDate);

      // 1 day out of 14 -> prorated
      expect(schedule.length).toBe(1);
      expect(schedule[0]?.amount).toBe(Math.round((1 / 14) * 1600 * 100) / 100);
    });
  });

  // -----------------------------------------------------------------------
  // calculateTdBenefit
  // -----------------------------------------------------------------------

  describe('calculateTdBenefit', () => {
    it('returns rate, schedule, totals, and disclaimer', () => {
      const result = calculateTdBenefit({
        awe: 1200,
        dateOfInjury: new Date('2025-06-15'),
        startDate: new Date('2025-06-20'),
        endDate: new Date('2025-07-17'), // 27 days -> 2 periods
      });

      expect(result.rate.tdRate).toBe(800);
      expect(result.rate.statutoryAuthority).toBe('LC 4653');
      expect(result.schedule.length).toBe(2);
      expect(result.totalAmount).toBeGreaterThan(0);
      expect(result.totalPenalty).toBe(0);
      expect(result.disclaimer).toContain('arithmetic only');
    });

    it('first payment due is 14 days after start date', () => {
      const result = calculateTdBenefit({
        awe: 1200,
        dateOfInjury: new Date('2025-06-15'),
        startDate: new Date('2025-06-20'),
        endDate: new Date('2025-08-01'),
      });

      // June 20 + 14 days = July 4
      expect(result.firstPaymentDue.toISOString().slice(0, 10)).toBe('2025-07-04');
    });

    it('defaults endDate to 104 weeks (728 days) from start when not provided', () => {
      const result = calculateTdBenefit({
        awe: 1200,
        dateOfInjury: new Date('2025-06-15'),
        startDate: new Date('2025-06-20'),
        // no endDate
      });

      // 728 days from start = 729 calendar days inclusive -> 52 full periods + 1 partial = 53
      expect(result.schedule.length).toBe(53);
    });

    it('aggregates total penalty from late payments', () => {
      const result = calculateTdBenefit({
        awe: 1200,
        dateOfInjury: new Date('2025-06-15'),
        startDate: new Date('2025-06-20'),
        endDate: new Date('2025-07-17'),
        actualPaymentDates: [
          new Date('2025-07-10'), // payment 1 due July 4, paid July 10 (late)
          new Date('2025-07-15'), // payment 2 due July 18, paid July 15 (on time)
        ],
      });

      expect(result.totalPenalty).toBeGreaterThan(0);
      expect(result.schedule[0]?.isLate).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // calculateDeathBenefit
  // -----------------------------------------------------------------------

  describe('calculateDeathBenefit', () => {
    it('returns full statutory amount for total dependents', () => {
      const result = calculateDeathBenefit({
        dateOfInjury: new Date('2025-06-15'),
        numberOfDependents: 2,
        dependentType: 'TOTAL',
      });

      expect(result.totalBenefit).toBe(310000);
      expect(result.dependentType).toBe('TOTAL');
      expect(result.statutoryAuthority).toBe('LC 4700-4706');
      expect(result.weeklyRate).toBe(1694.57); // 2025 max TD rate
      expect(result.totalWeeks).toBe(Math.ceil(310000 / 1694.57));
    });

    it('calculates proportional benefit for partial dependents', () => {
      const result = calculateDeathBenefit({
        dateOfInjury: new Date('2025-06-15'),
        numberOfDependents: 1,
        dependentType: 'PARTIAL',
        partialPercentage: 60,
      });

      // 60% of $310,000 = $186,000
      expect(result.totalBenefit).toBe(186000);
      expect(result.dependentType).toBe('PARTIAL');
    });

    it('defaults partial percentage to 50% when not specified', () => {
      const result = calculateDeathBenefit({
        dateOfInjury: new Date('2025-06-15'),
        numberOfDependents: 1,
        dependentType: 'PARTIAL',
      });

      // 50% of $310,000 = $155,000
      expect(result.totalBenefit).toBe(155000);
    });

    it('uses correct death benefit table for each year', () => {
      const result2024 = calculateDeathBenefit({
        dateOfInjury: new Date('2024-03-01'),
        numberOfDependents: 1,
        dependentType: 'TOTAL',
      });
      const result2026 = calculateDeathBenefit({
        dateOfInjury: new Date('2026-03-01'),
        numberOfDependents: 1,
        dependentType: 'TOTAL',
      });

      expect(result2024.totalBenefit).toBe(290000);
      expect(result2026.totalBenefit).toBe(320000);
    });

    it('throws for zero dependents', () => {
      expect(() =>
        calculateDeathBenefit({
          dateOfInjury: new Date('2025-01-01'),
          numberOfDependents: 0,
          dependentType: 'TOTAL',
        }),
      ).toThrow('Number of dependents must be at least 1');
    });

    it('throws for partial percentage out of range', () => {
      expect(() =>
        calculateDeathBenefit({
          dateOfInjury: new Date('2025-01-01'),
          numberOfDependents: 1,
          dependentType: 'PARTIAL',
          partialPercentage: 150,
        }),
      ).toThrow('Partial percentage must be between 0 and 100');
    });
  });
});

// ==========================================================================
// Route tests: API endpoints via server.inject()
// ==========================================================================

describe('Benefit Calculator API routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/calculator/td-rate
  // -----------------------------------------------------------------------

  describe('POST /api/calculator/td-rate', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        payload: { awe: 1200, dateOfInjury: '2025-06-15' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('calculates TD rate for valid input', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        headers: { cookie },
        payload: { awe: 1200, dateOfInjury: '2025-06-15' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        awe: number;
        tdRate: number;
        statutoryMin: number;
        statutoryMax: number;
        wasClampedToMin: boolean;
        wasClampedToMax: boolean;
        injuryYear: number;
        statutoryAuthority: string;
      }>();

      expect(body.awe).toBe(1200);
      expect(body.tdRate).toBe(800);
      expect(body.wasClampedToMin).toBe(false);
      expect(body.wasClampedToMax).toBe(false);
      expect(body.injuryYear).toBe(2025);
      expect(body.statutoryAuthority).toBe('LC 4653');
    });

    it('returns 400 for negative AWE', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        headers: { cookie },
        payload: { awe: -500, dateOfInjury: '2025-06-15' },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for missing dateOfInjury', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        headers: { cookie },
        payload: { awe: 1200 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid date format', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        headers: { cookie },
        payload: { awe: 1200, dateOfInjury: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for zero AWE', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-rate',
        headers: { cookie },
        payload: { awe: 0, dateOfInjury: '2025-06-15' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/calculator/td-benefit
  // -----------------------------------------------------------------------

  describe('POST /api/calculator/td-benefit', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-benefit',
        payload: {
          awe: 1200,
          dateOfInjury: '2025-06-15',
          startDate: '2025-06-20',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns full TD benefit calculation', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-benefit',
        headers: { cookie },
        payload: {
          awe: 1200,
          dateOfInjury: '2025-06-15',
          startDate: '2025-06-20',
          endDate: '2025-07-17',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        rate: { tdRate: number; statutoryAuthority: string };
        firstPaymentDue: string;
        schedule: unknown[];
        totalAmount: number;
        totalPenalty: number;
        disclaimer: string;
      }>();

      expect(body.rate.tdRate).toBe(800);
      expect(body.rate.statutoryAuthority).toBe('LC 4653');
      expect(body.schedule.length).toBeGreaterThan(0);
      expect(body.totalAmount).toBeGreaterThan(0);
      expect(body.disclaimer).toContain('arithmetic only');
    });

    it('returns 400 for missing required fields', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/td-benefit',
        headers: { cookie },
        payload: { awe: 1200 }, // missing dateOfInjury and startDate
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/calculator/death-benefit
  // -----------------------------------------------------------------------

  describe('POST /api/calculator/death-benefit', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        payload: {
          dateOfInjury: '2025-06-15',
          numberOfDependents: 2,
          dependentType: 'TOTAL',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('calculates death benefit for total dependents', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        headers: { cookie },
        payload: {
          dateOfInjury: '2025-06-15',
          numberOfDependents: 2,
          dependentType: 'TOTAL',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        totalBenefit: number;
        weeklyRate: number;
        totalWeeks: number;
        dependentType: string;
        statutoryAuthority: string;
      }>();

      expect(body.totalBenefit).toBe(310000);
      expect(body.dependentType).toBe('TOTAL');
      expect(body.statutoryAuthority).toBe('LC 4700-4706');
    });

    it('calculates death benefit for partial dependents', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        headers: { cookie },
        payload: {
          dateOfInjury: '2025-06-15',
          numberOfDependents: 1,
          dependentType: 'PARTIAL',
          partialPercentage: 40,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ totalBenefit: number; dependentType: string }>();
      // 40% of $310,000 = $124,000
      expect(body.totalBenefit).toBe(124000);
      expect(body.dependentType).toBe('PARTIAL');
    });

    it('returns 400 for invalid dependentType', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        headers: { cookie },
        payload: {
          dateOfInjury: '2025-06-15',
          numberOfDependents: 1,
          dependentType: 'INVALID',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for zero numberOfDependents', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        headers: { cookie },
        payload: {
          dateOfInjury: '2025-06-15',
          numberOfDependents: 0,
          dependentType: 'TOTAL',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing dateOfInjury', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'POST',
        url: '/api/calculator/death-benefit',
        headers: { cookie },
        payload: {
          numberOfDependents: 1,
          dependentType: 'TOTAL',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
