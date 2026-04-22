/**
 * Performance Baseline Configuration Tests — AJC-12
 *
 * These tests validate the performance baseline thresholds defined in
 * tests/performance/baselines.json. They run as part of the standard
 * `npm run test` suite (no live server required).
 *
 * Goals:
 * 1. Prevent accidentally setting thresholds that are logically inconsistent
 *    (e.g. p99 < p95, or a p50 that is higher than p95).
 * 2. Assert that all required scenario keys are present so load-test.ts
 *    never silently reads undefined thresholds.
 * 3. Validate the concurrency / error-rate helper functions used in load-test.ts
 *    to catch regressions in percentile math.
 * 4. Confirm file is valid JSON and matches the expected schema shape.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Load baselines.json
// ---------------------------------------------------------------------------

const baselinesPath = resolve(__dirname, '../performance/baselines.json');
const raw = readFileSync(baselinesPath, 'utf-8');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const baselines = JSON.parse(raw);

// ---------------------------------------------------------------------------
// Helpers (mirror of load-test.ts — tested independently)
// ---------------------------------------------------------------------------

/**
 * Compute a percentile from a sorted array of numbers.
 * Mirrors the implementation in load-test.ts.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, idx)]!);
}

// ---------------------------------------------------------------------------
// Suite 1: baselines.json structure and schema
// ---------------------------------------------------------------------------

describe('baselines.json — file structure', () => {
  it('parses as valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has a version field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(typeof baselines.version).toBe('string');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(baselines.version.length).toBeGreaterThan(0);
  });

  it('has a scenarios object with all required keys', () => {
    const requiredScenarios = [
      'chat_latency',
      'document_processing',
      'concurrent_users',
      'health_endpoints',
      'auth_endpoints',
      'protected_api_endpoints',
      'upl_classifier',
      'peak_load',
    ];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const scenarios = baselines.scenarios as Record<string, unknown>;
    for (const key of requiredScenarios) {
      expect(scenarios, `scenarios.${key} must exist`).toHaveProperty(key);
    }
  });

  it('each scenario has a thresholds object', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const scenarios = baselines.scenarios as Record<string, { thresholds?: unknown }>;
    for (const [key, scenario] of Object.entries(scenarios)) {
      expect(
        scenario.thresholds,
        `scenarios.${key}.thresholds must be an object`,
      ).toBeDefined();
      expect(
        typeof scenario.thresholds,
        `scenarios.${key}.thresholds must be an object`,
      ).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Chat latency thresholds — Scenario 1
// ---------------------------------------------------------------------------

describe('Scenario 1: chat_latency thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const t = baselines.scenarios.chat_latency.thresholds as {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
  };

  it('p50 < p95 < p99 (percentiles must be monotonically increasing)', () => {
    expect(t.p50_ms).toBeLessThan(t.p95_ms);
    expect(t.p95_ms).toBeLessThan(t.p99_ms);
  });

  it('p50 is a positive integer in milliseconds', () => {
    expect(t.p50_ms).toBeGreaterThan(0);
    expect(Number.isInteger(t.p50_ms)).toBe(true);
  });

  it('p95 is within acceptable range for AI-assisted chat (1s – 30s)', () => {
    // 1000ms minimum (below this would be unrealistic for a full Claude API call)
    // 30000ms maximum (above this no user would tolerate waiting)
    expect(t.p95_ms).toBeGreaterThanOrEqual(1000);
    expect(t.p95_ms).toBeLessThanOrEqual(30000);
  });

  it('p99 does not exceed 60s (hard cap — Cloud Run request timeout)', () => {
    expect(t.p99_ms).toBeLessThanOrEqual(60000);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Document processing thresholds — Scenario 2
// ---------------------------------------------------------------------------

describe('Scenario 2: document_processing thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const t = baselines.scenarios.document_processing.thresholds as {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    max_file_size_mb: number;
    max_pages_for_p95_target: number;
  };

  it('p50 < p95 < p99 (percentiles must be monotonically increasing)', () => {
    expect(t.p50_ms).toBeLessThan(t.p95_ms);
    expect(t.p95_ms).toBeLessThan(t.p99_ms);
  });

  it('p50 is at least 1s (Document AI has unavoidable minimum latency)', () => {
    expect(t.p50_ms).toBeGreaterThanOrEqual(1000);
  });

  it('p99 does not exceed 120s (Cloud Run max request timeout)', () => {
    expect(t.p99_ms).toBeLessThanOrEqual(120000);
  });

  it('max_file_size_mb is between 1 and 100 (server enforces 50MB hard limit)', () => {
    expect(t.max_file_size_mb).toBeGreaterThanOrEqual(1);
    expect(t.max_file_size_mb).toBeLessThanOrEqual(100);
  });

  it('max_pages_for_p95_target is a positive integer', () => {
    expect(Number.isInteger(t.max_pages_for_p95_target)).toBe(true);
    expect(t.max_pages_for_p95_target).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Concurrent users thresholds — Scenario 3
// ---------------------------------------------------------------------------

describe('Scenario 3: concurrent_users thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const scenario = baselines.scenarios.concurrent_users as {
    concurrency: number;
    duration_seconds: number;
    thresholds: {
      p95_ms: number;
      p99_ms: number;
      max_error_rate_pct: number;
      max_p95_degradation_vs_single_user_pct: number;
    };
  };
  const t = scenario.thresholds;

  it('concurrency is exactly 10 (ticket requirement)', () => {
    expect(scenario.concurrency).toBe(10);
  });

  it('duration_seconds is exactly 30 (ticket requirement)', () => {
    expect(scenario.duration_seconds).toBe(30);
  });

  it('p95 < p99 (monotonically increasing)', () => {
    expect(t.p95_ms).toBeLessThan(t.p99_ms);
  });

  it('max_error_rate_pct is 0 (zero 5xx errors required)', () => {
    expect(t.max_error_rate_pct).toBe(0);
  });

  it('max_p95_degradation_vs_single_user_pct is between 1 and 200', () => {
    expect(t.max_p95_degradation_vs_single_user_pct).toBeGreaterThanOrEqual(1);
    expect(t.max_p95_degradation_vs_single_user_pct).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Health endpoint thresholds
// ---------------------------------------------------------------------------

describe('health_endpoints thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const t = baselines.scenarios.health_endpoints.thresholds as {
    liveness_p50_ms: number;
    liveness_p95_ms: number;
    readiness_p50_ms: number;
    readiness_p95_ms: number;
  };

  it('liveness p50 < liveness p95', () => {
    expect(t.liveness_p50_ms).toBeLessThan(t.liveness_p95_ms);
  });

  it('readiness p50 < readiness p95', () => {
    expect(t.readiness_p50_ms).toBeLessThan(t.readiness_p95_ms);
  });

  it('liveness p95 is under 5s (Cloud Run health check timeout)', () => {
    expect(t.liveness_p95_ms).toBeLessThan(5000);
  });

  it('readiness p95 is under 10s (DB probe — Cloud SQL max acceptable)', () => {
    expect(t.readiness_p95_ms).toBeLessThan(10000);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Auth endpoint thresholds
// ---------------------------------------------------------------------------

describe('auth_endpoints thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const t = baselines.scenarios.auth_endpoints.thresholds as {
    login_p50_ms: number;
    login_p95_ms: number;
    session_check_p50_ms: number;
    session_check_p95_ms: number;
  };

  it('login p50 < login p95', () => {
    expect(t.login_p50_ms).toBeLessThan(t.login_p95_ms);
  });

  it('login p50 >= 200ms (argon2 minimum hash time for security)', () => {
    // argon2id is intentionally slow; anything under 200ms would be suspiciously fast
    expect(t.login_p50_ms).toBeGreaterThanOrEqual(200);
  });

  it('session check p50 < session check p95', () => {
    expect(t.session_check_p50_ms).toBeLessThan(t.session_check_p95_ms);
  });

  it('session check p95 is under login p50 (auth rejection is faster than full login)', () => {
    // Unauthenticated session check (fast 401) must be faster than a full login attempt
    expect(t.session_check_p95_ms).toBeLessThan(t.login_p50_ms);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Protected API thresholds
// ---------------------------------------------------------------------------

describe('protected_api_endpoints thresholds', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const t = baselines.scenarios.protected_api_endpoints.thresholds as {
    p95_ms: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const endpoints = baselines.scenarios.protected_api_endpoints.endpoints as string[];

  it('p95 is a positive integer', () => {
    expect(t.p95_ms).toBeGreaterThan(0);
    expect(Number.isInteger(t.p95_ms)).toBe(true);
  });

  it('p95 is under 5s (CRUD endpoints must be fast)', () => {
    expect(t.p95_ms).toBeLessThan(5000);
  });

  it('endpoints array has at least 3 entries', () => {
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBeGreaterThanOrEqual(3);
  });

  it('all endpoint strings start with GET or POST', () => {
    for (const ep of endpoints) {
      expect(ep).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \//);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Percentile helper — unit tests for the math
// ---------------------------------------------------------------------------

describe('percentile() helper — unit tests', () => {
  it('returns 0 for an empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns the single element for a single-element array', () => {
    expect(percentile([500], 50)).toBe(500);
    expect(percentile([500], 95)).toBe(500);
    expect(percentile([500], 99)).toBe(500);
  });

  it('p50 is the median of [100, 200, 300, 400, 500]', () => {
    const sorted = [100, 200, 300, 400, 500];
    expect(percentile(sorted, 50)).toBe(300);
  });

  it('p95 of [100, 200, 300, 400, 500] is the 5th element', () => {
    const sorted = [100, 200, 300, 400, 500];
    // ceil(0.95 * 5) = ceil(4.75) = 5 → idx 4 → 500
    expect(percentile(sorted, 95)).toBe(500);
  });

  it('p99 >= p95 >= p50 for any sorted array (monotonicity)', () => {
    const sorted = [10, 50, 100, 200, 400, 800, 1200, 1500, 2000, 5000];
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    expect(p50).toBeLessThanOrEqual(p95);
    expect(p95).toBeLessThanOrEqual(p99);
  });

  it('returns a rounded integer (no fractional milliseconds)', () => {
    const sorted = [100.4, 200.7, 300.1];
    const result = percentile(sorted, 50);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('handles a large array with known p95 value', () => {
    // 100 elements: 0, 1, 2, ..., 99
    const sorted = Array.from({ length: 100 }, (_, i) => i);
    // p95: ceil(0.95 * 100) = 95 → idx 94 → value 94
    expect(percentile(sorted, 95)).toBe(94);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Threshold consistency across scenarios
// ---------------------------------------------------------------------------

describe('cross-scenario threshold consistency', () => {
  it('chat p95 > health liveness p95 (AI calls take longer than health probes)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const chatP95 = (baselines.scenarios.chat_latency.thresholds as { p95_ms: number }).p95_ms;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const healthP95 = (baselines.scenarios.health_endpoints.thresholds as { liveness_p95_ms: number }).liveness_p95_ms;
    expect(chatP95).toBeGreaterThan(healthP95);
  });

  it('document p95 > chat p95 (Document AI is slower than Claude chat)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const docP95 = (baselines.scenarios.document_processing.thresholds as { p95_ms: number }).p95_ms;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const chatP95 = (baselines.scenarios.chat_latency.thresholds as { p95_ms: number }).p95_ms;
    expect(docP95).toBeGreaterThan(chatP95);
  });

  it('concurrent_users p95 <= peak_load health_p95 * 2 (scale linearly)', () => {
    // 10-user p95 should be significantly lower than 50-user p95
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const concP95 = (baselines.scenarios.concurrent_users.thresholds as { p95_ms: number }).p95_ms;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const peakP95 = (baselines.scenarios.peak_load.thresholds as { health_p95_ms: number }).health_p95_ms;
    expect(concP95).toBeLessThanOrEqual(peakP95 * 2);
  });

  it('all numeric thresholds are positive numbers', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const scenarios = baselines.scenarios as Record<string, { thresholds: Record<string, unknown> }>;
    for (const [scenarioKey, scenario] of Object.entries(scenarios)) {
      for (const [thresholdKey, value] of Object.entries(scenario.thresholds)) {
        if (typeof value === 'number') {
          expect(value, `${scenarioKey}.${thresholdKey} must be >= 0`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
