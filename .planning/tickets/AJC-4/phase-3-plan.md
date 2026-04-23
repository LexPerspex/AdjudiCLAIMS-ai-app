# Implementation Plan: AJC-4
## Run Playwright E2E suite against staging URL (post-deployment gate)

### Objective
Wire the existing Playwright E2E suite (tests/e2e/, 4 specs) into GitHub Actions CI so it runs automatically against the staging Cloud Run URL whenever code is pushed/merged to the `staging` branch. Document what manual prerequisites must be completed before the job can fire against a live server.

### Files to Change

| Path | Change Type | Why |
|------|------------|-----|
| `.github/workflows/ci.yml` | CREATE | New GitHub Actions pipeline; does not exist yet |
| `package.json` | MODIFY | Add `test:e2e` npm script for `npx playwright test` |

### Implementation Steps

1. **Create `.github/` directory structure**
   - `.github/workflows/ci.yml`

2. **ci.yml — unit-test job (on all pushes/PRs)**
   - Trigger: `push` to any branch, `pull_request` to `main` or `staging`
   - Steps: checkout → Node 20 → npm ci → npx prisma generate → npm test
   - This preserves the existing quality gate from Cloud Build and adds it to GitHub Actions

3. **ci.yml — playwright-staging job (staging branch only)**
   - Trigger: `push` to `staging` branch only
   - Steps:
     a. Checkout
     b. Node 20 setup
     c. `npm ci --legacy-peer-deps --ignore-scripts`
     d. Create @adjudica/document-classifier stub (mirrors Cloud Build workaround)
     e. `npx prisma generate`
     f. `npx playwright install --with-deps chromium`
     g. `npx playwright test` with `DEPLOYMENT_URL` env var from GitHub Actions secret `STAGING_URL`
     h. Upload Playwright HTML report artifact on failure (always: failure)
   - Pre-requisite comments:
     - `STAGING_URL` GitHub Actions secret must be set to the Cloud Run URL
     - Cloud Build trigger for staging branch must be created manually (AJC-1 pre-req)
     - Staging Cloud SQL database must be migrated (`npx prisma migrate deploy`)
     - Cloud Run service must be healthy before job can pass

4. **package.json — add `test:e2e` script**
   - `"test:e2e": "npx playwright test"`
   - Consistent with existing test script conventions

### Notes
- The `playwright.config.ts` already reads `DEPLOYMENT_URL` env var — no changes needed there
- The staging URL from the ticket context is `adjudiclaims.glassboxsolutions.com`; the CI job sources it from the `STAGING_URL` secret so it can be updated without code changes
- Cloud Build is the primary CI/CD system (GCP); GitHub Actions is an additional gate for the GitHub PR workflow
- No Prisma migration needed — this is CI config only
- No new test files — the 4 existing specs in `tests/e2e/` are the target suite

### Risks
- Low risk: purely CI/infrastructure config, no application code changes
- GitHub Actions does NOT have access to GCP secrets by default — the `STAGING_URL` must be set as a GitHub Actions repository secret by Alex
- The `@adjudica/document-classifier` stub workaround from Cloud Build must be replicated in the GitHub Actions job
