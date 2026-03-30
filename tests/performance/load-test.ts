/**
 * AdjudiCLAIMS Performance Smoke Tests
 *
 * Simple latency baselines using the native fetch API.
 * No external load-testing framework required.
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

  const health = await runSeries('GET /api/health', '/api/health', {}, 10);
  printResult(health);
  check(checks, 'health p50', health.p50, 300);
  check(checks, 'health p95', health.p95, 1000);

  const healthDb = await runSeries('GET /api/health/db', '/api/health/db', {}, 5);
  printResult(healthDb);
  check(checks, 'health/db p50', healthDb.p50, 500);
  check(checks, 'health/db p95', healthDb.p95, 2000);
}

async function benchmarkAuthEndpoints(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Auth Endpoints ---');

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
  check(checks, 'login p50', login.p50, 1500);
  check(checks, 'login p95', login.p95, 3000);

  // Session check — unauthenticated (should return quickly with 401)
  const session = await runSeries('GET /api/auth/session', '/api/auth/session', {}, 10);
  printResult(session);
  check(checks, 'session check p50', session.p50, 300);
  check(checks, 'session check p95', session.p95, 800);
}

async function benchmarkProtectedEndpoints(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Protected API Endpoints (unauthenticated — 401 response) ---');

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
    check(checks, `${name} p95`, result.p95, 800);
  }
}

async function benchmarkUplClassifier(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- UPL Classifier (unauthenticated path) ---');

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
  check(checks, 'upl/classify p95', classify.p95, 2000);
}

async function benchmarkFrontendPages(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Frontend Page Load (HTTP, not full browser render) ---');

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
    check(checks, `${name} p95`, result.p95, 3000);
  }
}

async function benchmarkConcurrentLoad(checks: TargetCheck[]): Promise<void> {
  console.log('\n--- Concurrent Load Simulation ---');

  // 20 concurrent health checks
  const health20 = await runConcurrent(
    '20 concurrent GET /api/health',
    '/api/health',
    {},
    20,
  );
  printResult(health20);
  check(checks, '20-concurrent health p95', health20.p95, 1500);
  check(checks, '20-concurrent health errors', health20.errors, 0);

  // 20 concurrent login attempts (simulates simultaneous morning logins)
  const login20 = await runConcurrent(
    '20 concurrent POST /api/auth/login',
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email: 'concurrent-test@acme-ins.test', password: 'WrongPassword1!' }),
    },
    20,
  );
  printResult(login20);
  check(checks, '20-concurrent login p95', login20.p95, 5000);
  // 429 (rate limit) responses count as non-errors here — 5xx do not
  const rateLimitOrAuth = login20.samples.length - login20.errors;
  console.log(`    [INFO] 20-concurrent login: ${rateLimitOrAuth}/${login20.samples.length} handled correctly (non-5xx)`);

  // 50 concurrent requests to simulate peak load target
  console.log('\n  Peak Load: 50 concurrent health requests');
  const health50 = await runConcurrent(
    '50 concurrent GET /api/health',
    '/api/health',
    {},
    50,
  );
  printResult(health50);
  check(checks, '50-concurrent health p95', health50.p95, 3000);
  check(checks, '50-concurrent health errors (5xx)', health50.errors, 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runBenchmark(): Promise<void> {
  console.log('=== AdjudiCLAIMS Performance Baselines ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const checks: TargetCheck[] = [];

  try {
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
