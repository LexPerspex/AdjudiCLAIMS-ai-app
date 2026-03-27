import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Ongoing education service tests — Layer 3 continuous education.
 *
 * Tests:
 *   1. Regulatory changes listed correctly
 *   2. Acknowledging a change removes it from pending
 *   3. Monthly review detects due/not-due status
 *   4. Quarterly refresher scoring works
 *   5. Refresher status tracks completions
 *
 * Regulatory authority: 10 CCR 2695.6 — ongoing training standards.
 */

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockEducationProfile: Record<string, {
  userId: string;
  acknowledgedChanges: string[];
  monthlyReviewsCompleted: Record<string, unknown> | null;
  quarterlyRefreshers: Record<string, unknown> | null;
  auditTrainingCompleted: Record<string, unknown> | null;
  lastRecertificationDate: Date | null;
}> = {};

vi.mock('../../server/db.js', () => ({
  prisma: {
    educationProfile: {
      upsert: vi.fn(({ where, create }: {
        where: { userId: string };
        create: { userId: string };
      }) => {
        const userId = where.userId;
        if (!mockEducationProfile[userId]) {
          mockEducationProfile[userId] = {
            userId: create.userId,
            acknowledgedChanges: [],
            monthlyReviewsCompleted: null,
            quarterlyRefreshers: null,
            auditTrainingCompleted: null,
            lastRecertificationDate: null,
          };
        }
        return mockEducationProfile[userId];
      }),
      findUnique: vi.fn(({ where }: { where: { userId: string } }) => {
        return mockEducationProfile[where.userId] ?? null;
      }),
      findUniqueOrThrow: vi.fn(({ where }: { where: { userId: string } }) => {
        const profile = mockEducationProfile[where.userId];
        if (!profile) throw new Error('Not found');
        return profile;
      }),
      update: vi.fn(({ where, data }: {
        where: { userId: string };
        data: Record<string, unknown>;
      }) => {
        const userId = where.userId;
        const profile = mockEducationProfile[userId];
        if (!profile) throw new Error('Not found');

        if (data.acknowledgedChanges && typeof data.acknowledgedChanges === 'object') {
          const pushData = data.acknowledgedChanges as { push?: string };
          if (pushData.push) {
            profile.acknowledgedChanges.push(pushData.push);
          }
        }
        if (data.monthlyReviewsCompleted !== undefined) {
          profile.monthlyReviewsCompleted = data.monthlyReviewsCompleted as Record<string, unknown>;
        }
        if (data.quarterlyRefreshers !== undefined) {
          profile.quarterlyRefreshers = data.quarterlyRefreshers as Record<string, unknown>;
        }

        return profile;
      }),
    },
    deadline: {
      findMany: vi.fn(() => []),
    },
    claim: {
      findMany: vi.fn(() => []),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  getActiveRegulatoryChanges,
  acknowledgeChange,
  getPendingChanges,
  isMonthlyReviewDue,
  completeMonthlyReview,
  generateMonthlyReview,
  getCurrentRefresher,
  submitRefresherAssessment,
  getRefresherStatus,
  getRequiredAuditTraining,
} from '../../server/services/ongoing-education.service.js';

import { REGULATORY_CHANGES } from '../../server/data/regulatory-changes.js';
import { QUARTERLY_REFRESHERS } from '../../server/data/quarterly-refreshers.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear mock profiles between tests
  for (const key of Object.keys(mockEducationProfile)) {
    Reflect.deleteProperty(mockEducationProfile, key);
  }
});

const TEST_USER_ID = 'user-ongoing-1';
const TEST_ORG_ID = 'org-1';

// ---------------------------------------------------------------------------
// Regulatory change tests
// ---------------------------------------------------------------------------

describe('Regulatory changes', () => {
  it('lists all active regulatory changes', () => {
    const changes = getActiveRegulatoryChanges();
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes[0]).toHaveProperty('id');
    expect(changes[0]).toHaveProperty('title');
    expect(changes[0]).toHaveProperty('effectiveDate');
    expect(changes[0]).toHaveProperty('affectedStatutes');
    expect(changes[0]).toHaveProperty('urgency');
  });

  it('returns all changes as pending for a new user', async () => {
    const pending = await getPendingChanges(TEST_USER_ID);
    expect(pending.length).toBe(REGULATORY_CHANGES.length);
  });

  it('acknowledging a change removes it from pending', async () => {
    // Create profile first
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const changeId = (REGULATORY_CHANGES[0] as (typeof REGULATORY_CHANGES)[number]).id;
    await acknowledgeChange(TEST_USER_ID, changeId);

    const pending = await getPendingChanges(TEST_USER_ID);
    const pendingIds = pending.map((c) => c.id);
    expect(pendingIds).not.toContain(changeId);
    expect(pending.length).toBe(REGULATORY_CHANGES.length - 1);
  });

  it('throws for unknown change ID', async () => {
    await expect(
      acknowledgeChange(TEST_USER_ID, 'rc-nonexistent'),
    ).rejects.toThrow('Unknown regulatory change');
  });

  it('acknowledging an already-acknowledged change is a no-op', async () => {
    const changeId = (REGULATORY_CHANGES[0] as (typeof REGULATORY_CHANGES)[number]).id;
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [changeId],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    // Should not throw or duplicate
    await acknowledgeChange(TEST_USER_ID, changeId);
    expect(mockEducationProfile[TEST_USER_ID].acknowledgedChanges.filter((id) => id === changeId).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Monthly review tests
// ---------------------------------------------------------------------------

describe('Monthly compliance review', () => {
  it('detects monthly review as due for a new user', async () => {
    const isDue = await isMonthlyReviewDue(TEST_USER_ID);
    expect(isDue).toBe(true);
  });

  it('detects monthly review as not due after completion', async () => {
    const now = new Date();
    const currentMonth = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: {
        [currentMonth]: { completedAt: now.toISOString(), missedDeadlineCount: 0 },
      },
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const isDue = await isMonthlyReviewDue(TEST_USER_ID);
    expect(isDue).toBe(false);
  });

  it('generates a monthly review with required fields', async () => {
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const review = await generateMonthlyReview(TEST_USER_ID, TEST_ORG_ID);
    expect(review).toHaveProperty('month');
    expect(review).toHaveProperty('userId', TEST_USER_ID);
    expect(review).toHaveProperty('organizationId', TEST_ORG_ID);
    expect(review).toHaveProperty('missedDeadlines');
    expect(review).toHaveProperty('approachingDeadlines');
    expect(review).toHaveProperty('claimsWithoutRecentActivity');
    expect(review).toHaveProperty('generatedAt');
    expect(Array.isArray(review.missedDeadlines)).toBe(true);
  });

  it('completes monthly review and persists', async () => {
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    await completeMonthlyReview(TEST_USER_ID, '2026-03');
    expect(mockEducationProfile[TEST_USER_ID].monthlyReviewsCompleted).toHaveProperty('2026-03');
  });

  it('rejects invalid month format', async () => {
    await expect(
      completeMonthlyReview(TEST_USER_ID, 'March 2026'),
    ).rejects.toThrow('Invalid month format');
  });
});

// ---------------------------------------------------------------------------
// Quarterly refresher tests
// ---------------------------------------------------------------------------

describe('Quarterly refreshers', () => {
  it('has valid refresher data with correct structure', () => {
    expect(QUARTERLY_REFRESHERS.length).toBeGreaterThanOrEqual(2);
    for (const refresher of QUARTERLY_REFRESHERS) {
      expect(refresher).toHaveProperty('id');
      expect(refresher).toHaveProperty('quarter');
      expect(refresher).toHaveProperty('title');
      expect(refresher).toHaveProperty('passingScore');
      expect(refresher.questions.length).toBe(refresher.totalQuestions);
      for (const q of refresher.questions) {
        expect(q).toHaveProperty('correctOptionId');
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('getCurrentRefresher strips correctOptionId', () => {
    // This depends on the current date matching a quarter with data.
    // We test the stripping logic directly.
    const refresher = getCurrentRefresher();
    if (refresher) {
      for (const q of refresher.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
        expect(q).toHaveProperty('questionText');
        expect(q).toHaveProperty('options');
      }
    }
    // If no refresher for current quarter, null is valid
    expect(refresher === null || typeof refresher === 'object').toBe(true);
  });

  it('scores a refresher assessment correctly — all correct', async () => {
    const refresher = (QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number]); // Q1 2026
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const allCorrectAnswers: Record<string, string> = {};
    for (const q of refresher.questions) {
      allCorrectAnswers[q.id] = q.correctOptionId;
    }

    const result = await submitRefresherAssessment(
      TEST_USER_ID,
      refresher.quarter,
      allCorrectAnswers,
    );

    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(refresher.totalQuestions);
    expect(result.totalQuestions).toBe(refresher.totalQuestions);
  });

  it('scores a refresher assessment correctly — all wrong', async () => {
    const refresher = (QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number]);
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const allWrongAnswers: Record<string, string> = {};
    for (const q of refresher.questions) {
      // Pick a wrong answer
      const wrongOption = q.options.find((o) => o.id !== q.correctOptionId);
      allWrongAnswers[q.id] = (wrongOption as NonNullable<typeof wrongOption>).id;
    }

    const result = await submitRefresherAssessment(
      TEST_USER_ID,
      refresher.quarter,
      allWrongAnswers,
    );

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(0);
  });

  it('throws for unknown quarter', async () => {
    await expect(
      submitRefresherAssessment(TEST_USER_ID, '2099-Q4', {}),
    ).rejects.toThrow('Quarterly refresher not found');
  });

  it('throws for incomplete answers', async () => {
    const refresher = (QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number]);
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    // Only answer the first question
    const partial: Record<string, string> = {
      [(refresher.questions[0] as (typeof refresher.questions)[number]).id]: (refresher.questions[0] as (typeof refresher.questions)[number]).correctOptionId,
    };

    await expect(
      submitRefresherAssessment(TEST_USER_ID, refresher.quarter, partial),
    ).rejects.toThrow('Refresher assessment incomplete');
  });

  it('tracks refresher status with completions', async () => {
    const refresher = (QUARTERLY_REFRESHERS[0] as (typeof QUARTERLY_REFRESHERS)[number]);
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: {
        [refresher.quarter]: {
          completedAt: new Date().toISOString(),
          score: 1.0,
          passed: true,
        },
      },
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const status = await getRefresherStatus(TEST_USER_ID);
    expect(status).toHaveProperty('completedRefreshers');
    expect(status.completedRefreshers).toHaveProperty(refresher.quarter);
    expect((status.completedRefreshers[refresher.quarter] as NonNullable<(typeof status.completedRefreshers)[string]>).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit-triggered training tests
// ---------------------------------------------------------------------------

describe('Audit-triggered training', () => {
  it('returns empty array for MVP (no audit integration)', async () => {
    mockEducationProfile[TEST_USER_ID] = {
      userId: TEST_USER_ID,
      acknowledgedChanges: [],
      monthlyReviewsCompleted: null,
      quarterlyRefreshers: null,
      auditTrainingCompleted: null,
      lastRecertificationDate: null,
    };

    const requirements = await getRequiredAuditTraining(TEST_USER_ID);
    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Data integrity tests
// ---------------------------------------------------------------------------

describe('Regulatory change data integrity', () => {
  it('all changes have required fields', () => {
    for (const change of REGULATORY_CHANGES) {
      expect(change.id).toBeTruthy();
      expect(change.title).toBeTruthy();
      expect(change.description).toBeTruthy();
      expect(change.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(change.affectedStatutes.length).toBeGreaterThan(0);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(change.urgency);
    }
  });

  it('all change IDs are unique', () => {
    const ids = REGULATORY_CHANGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
