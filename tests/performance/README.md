# AdjudiCLAIMS Performance Test Specification

> Sprint 5 — Performance Baselines and Load Targets

---

## Overview

This directory contains performance smoke tests and load targets for the AdjudiCLAIMS
deployment. These tests are run against the live deployment URL (Cloud Run, production or
staging) and are not intended to replace full load testing infrastructure — they establish
measurable baselines and catch regressions before release.

**Run command:**
```bash
npx tsx tests/performance/load-test.ts
```

**Override base URL:**
```bash
DEPLOYMENT_URL=https://my-staging-url.run.app npx tsx tests/performance/load-test.ts
```

---

## Latency Targets

### Chat Response (AI-assisted, RAG-powered)

| Percentile | Target | Rationale |
|------------|--------|-----------|
| p50 | < 2 s | Median user experience — must feel fast |
| p95 | < 5 s | 95th percentile — acceptable for AI responses |
| p99 | < 10 s | 99th percentile — edge cases (cold starts, large documents) |

These targets apply to the full round-trip: query classification → RAG retrieval →
Claude API call → output validation → response to client.

### Document Upload + OCR (Google Document AI)

| Percentile | Target | Rationale |
|------------|--------|-----------|
| p50 | < 15 s | Typical single-page medical report |
| p95 | < 30 s | Multi-page reports, complex layouts |
| p99 | < 60 s | Very large documents (50+ pages) |

### Page Load Time (React Router 7 SSR)

| Percentile | Target | Rationale |
|------------|--------|-----------|
| p50 | < 1.5 s | First Contentful Paint target |
| p95 | < 3 s | 95th percentile — includes cold starts on Cloud Run |
| p99 | < 5 s | Accounts for slow connections |

Measured from navigation start to `networkidle` (Playwright `waitUntil`).

### API Endpoint Latency (non-AI)

| Endpoint | p50 Target | p95 Target |
|----------|------------|------------|
| GET /api/health | < 100 ms | < 300 ms |
| GET /api/health/db | < 200 ms | < 500 ms |
| GET /api/claims | < 300 ms | < 800 ms |
| GET /api/deadlines | < 300 ms | < 800 ms |
| GET /api/compliance/examiner | < 300 ms | < 800 ms |
| POST /api/auth/login | < 500 ms | < 1.5 s |
| POST /api/upl/classify | < 800 ms | < 2 s |

---

## Concurrency Target

**50 simultaneous users** without measurable degradation:

- p95 response time must not increase by more than 50% vs. single-user baseline.
- Zero 500 errors under 50-user load.
- No database connection pool exhaustion (Cloud SQL connection limit respected).

Cloud Run configuration required:
- `--min-instances 1` (eliminates cold starts for concurrent load)
- `--concurrency 80` (default; 50 users fits within one instance)
- `--memory 1Gi` minimum (Node.js + Prisma + Claude SDK)

---

## Test Matrix

| Test | File | How to Run |
|------|------|------------|
| API latency baselines | `load-test.ts` | `npx tsx tests/performance/load-test.ts` |
| Concurrent request smoke | `load-test.ts` (concurrent section) | Same |
| Page load timing | `tests/e2e/deployment.spec.ts` (Performance section) | `npx playwright test` |
| Full flow timing | `tests/e2e/full-user-flow.spec.ts` | `npx playwright test` |

---

## Alerting Thresholds (Production)

These values trigger alerts in Cloud Monitoring:

| Metric | Warning | Critical |
|--------|---------|----------|
| p95 response time | > 3 s | > 8 s |
| Error rate (5xx) | > 0.1% | > 1% |
| Memory utilization | > 80% | > 95% |
| CPU utilization | > 70% | > 90% |
| DB connection pool | > 70% | > 90% |

---

## Known Constraints

1. **Cold starts** — Cloud Run instances may be cold. The first request after a period of
   inactivity can take 3-8 seconds. Use `--min-instances 1` in production to mitigate.

2. **Claude API latency** — Anthropic API p95 latency is outside our control. The 5 s p95
   chat target assumes normal API conditions. Claude API incidents are not counted against
   our SLA.

3. **Document AI** — Google Document AI p95 latency varies by document complexity and
   page count. The 30 s p95 target applies to documents up to 20 pages.

4. **Database cold queries** — The first query against a cold Prisma client (new instance)
   may take 500-800 ms extra. This is accounted for in p99 targets.

---

## CI Integration

Performance smoke tests are run as a post-deployment verification step in Cloud Build:

```yaml
- name: 'node:22'
  id: 'perf-smoke'
  entrypoint: 'npx'
  args: ['tsx', 'tests/performance/load-test.ts']
  env:
    - 'DEPLOYMENT_URL=$_CLOUD_RUN_URL'
```

A non-zero exit code from `load-test.ts` will fail the build and block promotion
to the next environment.
