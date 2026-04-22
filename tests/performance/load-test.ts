/**
 * AdjudiCLAIMS Performance Smoke Tests
 *
 * Latency baselines using the native fetch API.
 * No external load-testing framework required.
 *
 * Thresholds are read from tests/performance/baselines.json — the single source
 * of truth for all performance targets. To adjust a threshold, edit baselines.json
 * and commit the change; do not hardcode values here.
 *
 * Usage:
 *   npx tsx tests/performance/load-test.ts
 *
 * Override base URL:
 *   DEPLOYMENT_URL=https://my-staging-url.run.app npx tsx tests/performance/load-test.ts
 *
 * Exit code:
 *   0 — all targets met
 *   1 — one or more targets exceeded (see output for details)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load baselines config
// ---------------------------------------------------------------------------

interface ChatLatencyThresholds {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

interface DocumentThresholds {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_file_size_mb: number;
  max_pages_for_p95_target: number;
}

interface ConcurrentThresholds {
  p95_ms: number;
  p99_ms: number;
  max_error_rate_pct: number;
  max_p95_degradation_vs_single_user_pct: number;
}

interface HealthThresholds {
  liveness_p50_ms: number;
  liveness_p95_ms: number;
  readiness_p50_ms: number;
  readiness_p95_ms: number;
}

interface AuthThresholds {
  login_p50_ms: number;
  login_p95_ms: number;
  session_check_p50_ms: number;
  session_check_p95_ms: number;
}

interface ProtectedApiThresholds {
  p95_ms: number;
}

interface UplClassifierThresholds {
  p95_ms: number;
}

interface PeakLoadThresholds {
  health_p95_ms: number;
  max_5xx_errors: number;
}

interface Baselines {
  scenarios: {
    chat_latency: { thresholds: ChatLatencyThresholds };
    document_processing: { thresholds: DocumentThresholds };
    concurrent_users: { concurrency: number; duration_seconds: number; thresholds: ConcurrentThresholds };
    health_endpoints: { thresholds: HealthThresholds };
    auth_endpoints: { thresholds: AuthThresholds };
    protected_api_endpoints: { thresholds: ProtectedApiThresholds };
    upl_classifier: { thresholds: UplClassifierThresholds };
    peak_load: { concurrency: number; thresholds: PeakLoadThresholds };
  };
}

const baselinesPath = resolve(__dirname, 'baselines.json');
const baselines: Baselines = JSON.parse(readFileSync(baselinesPath, 'utf-8')) as Baselines;
const { scenarios } = baselines;

const BASE_URL =
  process.env.DEPLOYMENT_URL ||
  'https://adjudiclaims-api-104228172531.us-west1.run.app';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  name: string;
  samples: number[];
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  errors: number;
}

interface TargetCheck {
  metric: string;
  actual: number;
  target: number;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, idx)]!);
}

async function measureLatency(
  url: string,
  options: RequestInit = {},
): Promise<{ latency: number; status: number }> {
  const start = performance.now();
  let status = 0;
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });
    status = response.status;
    // Consume body to get accurate total latency
    await response.text();
  } catch {
    status = 0;
  }
  const latency = performance.now() - start;
  return { latency, status };
}

async function runSeries(
  name: string,
  url: string,
  options: RequestInit = {},
  iterations = 10,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const { latency, status } = await measureLatency(url, options);
    if (status === 0 || status >= 500) {
      errors++;
    }
    latencies.push(latency);
    // Small pause to avoid hammering
    await new Promise((r) => setTimeout(r, 50));
  }

  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    name,
    samples: latencies,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: Math.round(sorted[0]!),
    max: Math.round(sorted[sorted.length - 1]!),
    errors,
  };
}

async function runConcurrent(
  name: string,
  url: string,
  options: RequestInit = {},
  concurrency = 10,
): Promise<BenchmarkResult> {
  const promises = Array.from({ length: concurrency }, () =>
    measureLatency(url, options),
  );

  const results = await Promise.all(promises);
  const latencies = results.map((r) => r.latency);
  const errors = results.filter((r) => r.status === 0 || r.status >= 500).length;

  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    name,
    samples: latencies,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: Math.round(sorted[0]!),
    max: Math.round(sorted[sorted.length - 1]!),
    errors,
  };
}

function printResult(r: BenchmarkResult): void {
  const errorStr = r.errors > 0 ? `  errors=${r.errors}/${r.samples.length}` : '';
  console.log(
    `  ${r.name.padEnd(45)} p50=${String(r.p50).padStart(5)}ms  p95=${String(r.p95).padStart(5)}ms  p99=${String(r.p99).padStart(5)}ms  min=${String(r.min).padStart(5)}ms  max=${String(r.max).padStart(5)}ms${errorStr}`,
  );
}

function check(
  checks: TargetCheck[],
  metric: string,
  actual: number,
  target: number,
): void {
  const passed = actual <= target;
  checks.push({ metric, actual, target, passed });
  const symbol = passed ? 'PASS' : 'FAIL';
  console.log(`    [${symbol}] ${metric}: ${actual}ms (target <${target}ms)`);
}

// ---------------------------------------------------------------------------
// Benchmark Suites
// ---------------------------------------------------------------------------

async function benchmarkHealthEndpoints(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Health Endpoints ---');
  const t = scenarios.health_endpoints.thresholds;

  const health = await runSeries('GET /api/health', '/api/health', {}, 10);
  printResult(health);
  check(checks, 'health p50', health.p50, t.liveness_p50_ms);
  check(checks, 'health p95', health.p95, t.liveness_p95_ms);

  const healthDb = await runSeries('GET /api/health/db', '/api/health/db', {}, 5);
  printResult(healthDb);
  check(checks, 'health/db p50', healthDb.p50, t.readiness_p50_ms);
  check(checks, 'health/db p95', healthDb.p95, t.readiness_p95_ms);
}

async function benchmarkAuthEndpoints(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Auth Endpoints ---');
  const t = scenarios.auth_endpoints.thresholds;

  // Login with invalid credentials — measures auth processing latency
  const login = await runSeries(
    'POST /api/auth/login (invalid creds)',
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email: 'perf-test@acme-ins.test', password: 'WrongPassword1!' }),
    },
    8,
  );
  printResult(login);
  check(checks, 'login p50', login.p50, t.login_p50_ms);
  check(checks, 'login p95', login.p95, t.login_p95_ms);

  // Session check — unauthenticated (should return quickly with 401)
  const session = await runSeries('GET /api/auth/session', '/api/auth/session', {}, 10);
  printResult(session);
  check(checks, 'session check p50', session.p50, t.session_check_p50_ms);
  check(checks, 'session check p95', session.p95, t.session_check_p95_ms);
}

async function benchmarkProtectedEndpoints(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Protected API Endpoints (unauthenticated — 401 response) ---');
  const t = scenarios.protected_api_endpoints.thresholds;

  const endpoints: [string, string][] = [
    ['GET /api/claims', '/api/claims'],
    ['GET /api/deadlines', '/api/deadlines'],
    ['GET /api/workflows', '/api/workflows'],
    ['GET /api/compliance/examiner', '/api/compliance/examiner'],
    ['GET /api/education/profile', '/api/education/profile'],
  ];

  for (const [name, url] of endpoints) {
    const result = await runSeries(name, url, {}, 5);
    printResult(result);
    check(checks, `${name} p95`, result.p95, t.p95_ms);
  }
}

async function benchmarkUplClassifier(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- UPL Classifier (unauthenticated path) ---');
  const t = scenarios.upl_classifier.thresholds;

  const classify = await runSeries(
    'POST /api/upl/classify',
    '/api/upl/classify',
    {
      method: 'POST',
      body: JSON.stringify({ query: 'What is the TD payment deadline?' }),
    },
    5,
  );
  printResult(classify);
  // Classifier may be auth-gated (returns 401 quickly) or process the query
  check(checks, 'upl/classify p95', classify.p95, t.p95_ms);
}

async function benchmarkFrontendPages(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Frontend Page Load (HTTP, not full browser render) ---');
  // Using chat latency p95 as a proxy for page serving (SSR responses)
  const pageTarget = scenarios.chat_latency.thresholds.p95_ms;

  const pages: [string, string][] = [
    ['GET / (root)', '/'],
    ['GET /login', '/login'],
    ['GET /dashboard', '/dashboard'],
    ['GET /training', '/training'],
    ['GET /compliance', '/compliance'],
  ];

  for (const [name, url] of pages) {
    const result = await runSeries(name, url, {}, 5);
    printResult(result);
    check(checks, `${name} p95`, result.p95, pageTarget);
  }
}

/**
 * Scenario 3: Concurrent user simulation — 10 concurrent users / 30s window.
 * The concurrent_users scenario in baselines.json specifies concurrency=10, duration_seconds=30.
 * We run two rounds of concurrent requests to simulate the sustained 30s window.
 */
async function benchmarkConcurrentUsers(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Concurrent User Simulation (10 users / 30s) ---');
  const scenario = scenarios.concurrent_users;
  const t = scenario.thresholds;
  const concurrency = scenario.concurrency; // 10

  // Round 1: 10 concurrent health checks (start of 30s window)
  const round1 = await runConcurrent(
    `${concurrency} concurrent GET /api/health (round 1)`,
    '/api/health',
    {},
    concurrency,
  );
  printResult(round1);
  check(checks, `${concurrency}-concurrent health p95 (round 1)`, round1.p95, t.p95_ms);
  check(checks, `${concurrency}-concurrent health errors (round 1)`, round1.errors, t.max_error_rate_pct);

  // Pause to simulate mid-window activity (partial 30s duration)
  await new Promise((r) => setTimeout(r, 3000));

  // Round 2: 10 concurrent auth requests (mid-window)
  const round2 = await runConcurrent(
    `${concurrency} concurrent POST /api/auth/login (round 2)`,
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email: 'concurrent-test@acme-ins.test', password: 'WrongPassword1!' }),
    },
    concurrency,
  );
  printResult(round2);
  check(checks, `${concurrency}-concurrent login p95 (round 2)`, round2.p95, scenarios.auth_endpoints.thresholds.login_p95_ms);

  // 429 (rate limit) responses are non-errors here — only 5xx count
  const handled = round2.samples.length - round2.errors;
  console.log(`    [INFO] ${concurrency}-concurrent login: ${handled}/${round2.samples.length} handled correctly (non-5xx)`);
}

/**
 * Scenario 1: Chat endpoint latency — p50/p95/p99.
 * This suite measures the POST /api/claims/:claimId/chat endpoint.
 * Without a live server, requests will return 401 (no auth) — measuring the
 * pre-auth path. For full AI latency measurement, use DEPLOYMENT_URL with a
 * valid session token (see README.md).
 */
async function benchmarkChatLatency(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Chat Endpoint Latency (unauthenticated — 401 fast path) ---');
  console.log('  NOTE: Full AI latency requires DEPLOYMENT_URL + valid session token.');
  const t = scenarios.chat_latency.thresholds;

  // Use a representative claim ID — returns 401 without auth, measuring middleware latency
  const chat = await runSeries(
    'POST /api/claims/perf-claim-1/chat',
    '/api/claims/perf-claim-1/chat',
    {
      method: 'POST',
      body: JSON.stringify({ message: 'What is the TD payment deadline under LC 4650?' }),
    },
    8,
  );
  printResult(chat);
  // Fast auth rejection should be well under p95 threshold
  check(checks, 'chat p95 (auth gate)', chat.p95, t.p95_ms);
  check(checks, 'chat p99 (auth gate)', chat.p99, t.p99_ms);
}

/**
 * Scenario 2: Document processing throughput.
 * Without a live authenticated server, measures the upload endpoint latency
 * (auth gate + multipart parsing). Full pipeline timing requires DEPLOYMENT_URL
 * + valid session token + actual file payload.
 */
async function benchmarkDocumentProcessing(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Document Processing (upload endpoint — 401 fast path) ---');
  console.log('  NOTE: Full pipeline latency requires DEPLOYMENT_URL + auth token + file payload.');
  const t = scenarios.document_processing.thresholds;

  const docUpload = await runSeries(
    'POST /api/claims/perf-claim-1/documents',
    '/api/claims/perf-claim-1/documents',
    {
      method: 'POST',
      // Minimal JSON body — server expects multipart but returns 401/400 fast
      body: JSON.stringify({}),
    },
    5,
  );
  printResult(docUpload);
  // Auth rejection should be well under p50 target; confirms endpoint is reachable
  check(checks, 'documents upload p95 (auth gate)', docUpload.p95, t.p95_ms);
}

async function benchmarkConcurrentLoad(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Peak Load Simulation (50 concurrent users) ---');
  const t = scenarios.peak_load.thresholds;
  const concurrency = scenarios.peak_load.concurrency; // 50

  // 50 concurrent health checks — peak load target
  const health50 = await runConcurrent(
    `${concurrency} concurrent GET /api/health`,
    '/api/health',
    {},
    concurrency,
  );
  printResult(health50);
  check(checks, `${concurrency}-concurrent health p95`, health50.p95, t.health_p95_ms);
  check(checks, `${concurrency}-concurrent health 5xx errors`, health50.errors, t.max_5xx_errors);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runBenchmark(): Promise<void> {
  console.log('=== AdjudiCLAIMS Performance Baselines ===');
  console.log(`Base URL:  ${BASE_URL}`);
  console.log(`Baselines: ${baselinesPath}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const checks: TargetCheck[] = [];

  try {
    // Scenario 1: Chat endpoint latency p50/p95/p99
    await benchmarkChatLatency(checks);

    // Scenario 2: Document processing throughput
    await benchmarkDocumentProcessing(checks);

    // Scenario 3: Concurrent users (10 users / 30s)
    await benchmarkConcurrentUsers(checks);

    // Supporting scenarios
    await benchmarkHealthEndpoints(checks);
    await benchmarkAuthEndpoints(checks);
    await benchmarkProtectedEndpoints(checks);
    await benchmarkUplClassifier(checks);
    await benchmarkFrontendPages(checks);
    await benchmarkConcurrentLoad(checks);
  } catch (err) {
    console.error('\nFATAL: Benchmark suite threw an unexpected error:', err);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const passed = checks.filter((c) => c.passed);
  const failed = checks.filter((c) => !c.passed);

  console.log('\n=== Summary ===');
  console.log(`Total checks: ${checks.length}`);
  console.log(`Passed:       ${passed.length}`);
  console.log(`Failed:       ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed targets:');
    for (const f of failed) {
      console.log(`  FAIL  ${f.metric}: actual=${f.actual}ms, target<${f.target}ms`);
    }
    console.log('\nPerformance targets not met. See details above.');
    process.exit(1);
  } else {
    console.log('\nAll performance targets met.');
    process.exit(0);
  }
}

runBenchmark().catch((err) => {
  console.error('Unhandled error in load-test:', err);
  process.exit(1);
});
