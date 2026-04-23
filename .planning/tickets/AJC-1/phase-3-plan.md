# Implementation Plan: AJC-1 — Deploy unified Fastify+RR7 server to Cloud Run staging

## Context

The unified Fastify+RR7 server (`server/production.ts`) and `Dockerfile` are complete and correct on the main branch. The staging Cloud Run service (`adjudiclaims-api`) does not yet exist in the `adjudiclaims-staging` GCP project. All staging secrets are provisioned in `adjudica-internal` Secret Manager.

## Files to Create / Modify

### 1. CREATE `cloudbuild-staging.yaml`

A staging-specific Cloud Build configuration. Key differences from `cloudbuild.yaml`:
- `_ENVIRONMENT: staging`
- `_IMAGE_TAG: staging-latest` (separate Docker tag from production `latest`)
- Staging secrets: `adjudiclaims-staging-db-url`, `adjudiclaims-staging-anthropic-key`, `adjudiclaims-staging-session-secret`, `adjudiclaims-staging-sentry-dsn`, `adjudiclaims-staging-temporal-api-key`
- Cloud Run deploy target project: `adjudiclaims-staging` (via `--project` flag on gcloud run deploy)
- `--allow-unauthenticated` flag on the API service (staging access for team review)
- `--min-instances=0` for staging (cost optimization — no minimum instances)
- Workers (`allowFailure: true`) — same as production, as Temporal may not be configured on first deploy
- Artifact Registry remains in `adjudica-internal` (shared registry)
- Skip UPL compliance tests in staging builds (they require Anthropic API key and are covered in CI)

### 2. CREATE `.dockerignore`

Exclude files that should not be in the Docker build context:
- `node_modules/`
- `.git/`
- `marketing/`
- `.planning/`
- `tests/`
- `docs/`
- `*.md` (except package.json)
- `.env*`
- `.next/`
- `build/` (will be created fresh during Docker build)

### 3. MODIFY `.github/workflows/ci.yml` (on feature branch — ci.yml doesn't exist yet on this branch)

The ci.yml already exists on `main`. This feature branch needs to include it. The PR from this feature branch merges into `main` — the ci.yml is already on main, so no change needed to ci.yml.

**Note:** Per the user context, ci.yml is on main already. The staging PR trigger is handled by: the CI workflow triggers on `push: branches: [main, staging, dev, "feat/**"]` — staging pushes already run CI. No changes needed.

## Implementation Steps

1. Create `cloudbuild-staging.yaml` with all staging substitutions and correct secret names
2. Create `.dockerignore` to speed up builds and avoid accidentally copying sensitive files
3. Verify the Dockerfile CMD uses `npm run start` which calls `node --import tsx/esm server/production.ts`
4. Run `npm run test` and `npm run typecheck` to confirm all tests pass before commit

## Files to Change

| Path | Change Type | Why |
|------|-------------|-----|
| `cloudbuild-staging.yaml` | create | Deploy pipeline for staging environment |
| `.dockerignore` | create | Exclude non-production files from Docker build context |

## Tests to Write

| Test | Type | What it covers |
|------|------|----------------|
| None new required | — | Infrastructure config files; no application logic changes |

The existing unit tests + typecheck cover all application code. The new files are YAML/text configs with no testable application logic.

## Risk Flags

- **Secret names**: Staging secrets use `adjudiclaims-staging-*` naming — must match exactly what's in Secret Manager
- **Temporal address**: Staging Temporal address may differ from production. Using `temporal.adjudiclaims.internal:7233` for now (same as production) — workers have `allowFailure: true` so this won't block the API deploy
- **Cloud Run project**: Must use `--project=adjudiclaims-staging` flag in `gcloud run deploy` commands
- **IAM**: Cloud Build service account in `adjudiclaims-staging` needs `roles/run.admin` and `roles/iam.serviceAccountUser` — this is infrastructure setup outside this PR's scope; flag if deploy fails
