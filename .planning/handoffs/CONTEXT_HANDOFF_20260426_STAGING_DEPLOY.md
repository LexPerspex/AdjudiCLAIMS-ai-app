# Context Handoff — Staging Deploy & Boot-Crash Root Causes

**Date:** 2026-04-25 (UTC; per system clock 2026-04-26 early)
**Author:** Claude (Opus 4.7, 1M context)
**Branch when work began:** `main` @ `7307afb`
**Status:** Staging GREEN end-to-end. Production not yet redeployed. Local edits not yet committed.

---

## TL;DR

- Path A executed: dedicated `adjudiclaims-staging` GCP project now hosts a working Cloud Run service.
- **Four real production-blocking bugs found and fixed locally** (uncommitted) — these had been preventing every prior Cloud Run revision (staging *and* prod) from booting.
- Staging app at https://adjudiclaims-staging-734869918010.us-west1.run.app — **122/122 Playwright E2E tests pass.**
- Prod Cloud Run still crash-looping; same image (`7307afb-fixes-5`) needs to be pushed to `adjudiclaims-prod` Artifact Registry and deployed. **Awaiting explicit auth.**

---

## What works now

| Endpoint | Result |
|---|---|
| `GET /api/health` | 200 `{"status":"ok","product":"AdjudiCLAIMS","version":"0.1.0"}` |
| `GET /api/health/db` | 200 `{"status":"ok","database":"connected"}` |
| `GET /` (SSR) | 200 — full HTML, Inter fonts, Vite asset preloads |
| `GET /login` | 200 — full SSR HTML |
| Playwright E2E (122 tests, 21.3 min) | 122 passed, 2 flaky (passed on retry), 20 skipped, 0 failed |

---

## Real bugs found and fixed locally (NOT YET COMMITTED)

All four were on `main` since at least 2026-04-23 and explain why every Cloud Run revision since the unified-server rewrite (commit `9f38d7b`) crash-looped.

### 1. `prisma/schema.prisma` — missing OpenSSL 3.x engine

```diff
 generator client {
-  provider = "prisma-client-js"
+  provider      = "prisma-client-js"
+  binaryTargets = ["native", "debian-openssl-3.0.x"]
 }
```

**Symptom:** `PrismaClientInitializationError: Prisma Client could not locate the Query Engine for runtime "debian-openssl-3.0.x"`. Dockerfile uses `node:20-slim` (Debian 12 / OpenSSL 3.0.x); only the 1.1.x engine was bundled.

### 2. `server/production.ts` — Fastify route conflict on wildcard

```diff
- if (serverBuild) {
-   server.all('*', async (request, reply) => { ... })
- }
+ if (serverBuild) {
+   server.setNotFoundHandler(async (request, reply) => { ... })
+ }
```

**Symptom:** Fatal boot error `Method 'OPTIONS' already declared for route '/*' with constraints '{}'`. `@fastify/cors` registers `OPTIONS *` for preflight, then `server.all('*')` tried to re-declare it. `setNotFoundHandler` is also semantically correct — SSR is the fallback when no Fastify route matched.

### 3. `server/production.ts` — RR7 SSR adapter

```diff
- import { buildServer } from './index.js';
- /* ... */
- let serverBuild: { fetch?: (request: Request) => Promise<Response> } | null = null;
- /* ... */
- // Tried to call `serverBuild.fetch(...)`
+ import { createRequestListener } from '@react-router/node';
+ import type { ServerBuild } from 'react-router';
+ /* ... */
+ const rrListener = createRequestListener({ build: serverBuild, mode: 'production' });
+ /* In setNotFoundHandler: */
+ reply.hijack();
+ await rrListener(request.raw, reply.raw);
```

**Symptom:** Even after fix #2 registered, `/` returned Fastify default 404. RR7's `ServerBuild` exposes `routes/assets/entry/...`, not a `.fetch` handler. The `else` branch in the old code (`await serverBuild!(nodeReq, nodeRes)`) was also dead — `ServerBuild` isn't a function.

### 4. `server/index.ts` — auto-start guard inverted (THE root cause of every prod exit(1))

```diff
- const isMainModule =
-   typeof process.env['VITEST'] === 'undefined' &&
-   typeof process.env['TEST'] === 'undefined';
-
- if (isMainModule) {
+ import { fileURLToPath } from 'url';
+ const isDirectEntry =
+   typeof process.argv[1] === 'string' &&
+   fileURLToPath(import.meta.url) === process.argv[1];
+
+ if (isDirectEntry) {
    start().catch((err: unknown) => {
      console.error('Fatal startup error:', err);
      process.exit(1);
    });
  }
```

**Symptom:** `EADDRINUSE: address already in use 0.0.0.0:8080` ~400ms after first listen.
**Why:** `server/index.ts` exports `buildServer` AND auto-runs `start()` (which does its own `server.listen()`) when imported. The `VITEST/TEST` env check was true in production → `start()` ran. Then `server/production.ts` (which imports `buildServer`) ALSO called `server.listen()`. Two listens on the same port = EADDRINUSE = readiness check fail = `Container called exit(1)`.

This is **why prod's `adjudiclaims-app` Cloud Run service has been crash-looping all day** — same code path. Fix #4 alone unblocks prod once the new image is deployed there.

---

## Staging infrastructure (Path A) — provisioned

**Cloud Run service**
- Project: `adjudiclaims-staging`
- Service name: `adjudiclaims-staging`
- Region: `us-west1`
- URL: `https://adjudiclaims-staging-734869918010.us-west1.run.app`
- Image (current): `us-west1-docker.pkg.dev/adjudiclaims-staging/adjudiclaims/app:7307afb-fixes-5`
- Service account: `adjudiclaims-app@adjudiclaims-staging.iam.gserviceaccount.com`
- Min/max instances: 0 / 3
- CPU/Memory: 1 vCPU / 1 GiB
- Allow-unauthenticated: yes (lock down later for production traffic)
- Env vars (plain): `NODE_ENV=staging`, `VERTEX_AI_PROJECT=adjudiclaims-staging`
- Secrets wired (project-local): `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` (from `adjudiclaims-anthropic-key`), `DOCUMENT_AI_PROCESSOR` (from `adjudiclaims-document-ai-processor`), `SENTRY_DSN` (from `adjudiclaims-sentry-dsn`), `TEMPORAL_API_KEY` (from `adjudiclaims-temporal-api-key`)

**IAM grants made**
- `adjudiclaims-build@adjudiclaims-staging` — added `roles/storage.objectUser` (project-level) — needed to read source archive from Cloud Build GCS staging bucket
- `adjudiclaims-build@adjudiclaims-staging` — added `roles/storage.admin` on `gs://734869918010-us-west1-cloudbuild-logs` (bucket-scoped only) — needed by Cloud Build preflight when using a non-default SA

**Buckets created**
- `gs://734869918010-us-west1-cloudbuild-logs` (us-west1, uniform-bucket-level-access) — Cloud Build logs

**Known IAM gap (non-blocking):** `adjudiclaims-build` lacks `roles/logging.logWriter`. Builds succeed (we use GCS-only logs) but `gcloud builds cancel` and some telemetry surfaces fail.

---

## Database state (PlanetScale Postgres)

| Database | URL | Branch | State |
|---|---|---|---|
| Prod | https://app.planetscale.com/glass-box-solutions/adjudiclaims | `main` | PS-5 cluster, 2 replicas, `kind=postgresql`, region AWS us-west-2 |
| Staging | https://app.planetscale.com/glass-box-solutions/adjudiclaims-staging | `main` | PS-10 cluster, 2 replicas, AWS us-west-2 |

**Backups:** Both have automated 12-hour backups, all `state=success` over last 5 days. Most recent prod backup: 2026-04-25 13:53 UTC (~3h before deploy work). **Pre-#4 backup gate is satisfied.**

**Staging schema state (inspected via Prisma Client over the runtime DATABASE_URL):**
- 34 tables present in `public` schema (full Prisma model set: `users`, `claims`, `documents`, `audit_events`, `_prisma_migrations`, `graph_*`, `coverage_determinations`, `medical_payments`, `liens`, `lien_line_items`, `chat_*`, `workflow_progress`, etc.)
- `prisma migrate status` reports "0/4 migrations applied" — table tracking is out of sync with reality
- Direct `SELECT FROM public._prisma_migrations` returns `permission denied for schema public` — runtime role is not the schema owner

**Implication for #4 (prod migrate deploy):**
- The runtime `DATABASE_URL` cannot run DDL — it's app-tier only.
- Need an **admin DATABASE_URL** from PlanetScale to:
  - Run `prisma migrate deploy` (and resolve the staging tracking gap with `migrate resolve --applied`)
  - Apply any future schema changes
- Currently no admin URL is in GCP Secret Manager — needs to be issued from PlanetScale's "Connection strings" UI with admin role.

---

## Production state — UNCHANGED, still crash-looping

- Cloud Run service: `adjudiclaims-app` in `adjudiclaims-prod` / us-west1
- URL: https://adjudiclaims-app-26ivcga4xa-uw.a.run.app
- Stuck on revision `00001-xf9` from before the unified-server commit
- Same root causes (#1–#4 above). Fix is to push the staging-validated image to the prod Artifact Registry and deploy.

**Concrete next commands (DO NOT RUN without explicit confirmation):**

```bash
# Tag and push the validated image into the prod registry
gcloud artifacts docker tags add \
  us-west1-docker.pkg.dev/adjudiclaims-staging/adjudiclaims/app:7307afb-fixes-5 \
  us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:7307afb-fixes-5 \
  --project=adjudiclaims-staging

# Or rebuild from source against prod registry:
gcloud builds submit \
  --project=adjudiclaims-prod \
  --region=us-west1 \
  --service-account="projects/adjudiclaims-prod/serviceAccounts/adjudiclaims-build@adjudiclaims-prod.iam.gserviceaccount.com" \
  --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET \
  --tag=us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:7307afb-fixes-5 \
  --machine-type=e2-highcpu-8 \
  --timeout=20m \
  /home/vncuser/projects/AdjudiCLAIMS-ai-app

# Then update the prod Cloud Run service:
gcloud run services update adjudiclaims-app \
  --project=adjudiclaims-prod \
  --region=us-west1 \
  --image=us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:7307afb-fixes-5
```

**Note:** prod Cloud Run env config already references `adjudiclaims-prod-database-url`, `adjudiclaims-prod-session-secret`, `adjudiclaims-prod-anthropic-key` — those are the right secret names. SA is `adjudiclaims-app@adjudiclaims-prod.iam.gserviceaccount.com`. No env changes needed.

**Prod IAM may also need the same one-time `storage.objectUser` + logs-bucket grant as staging if rebuilding from source in the prod project.**

---

## What's still on the original STATE.md "outstanding work" list

| Item | Status |
|---|---|
| Deploy unified server to Cloud Run **staging** | ✅ Done (Path A; new project) |
| `prisma migrate deploy` against **staging** DB | ⚠️ Deferred — schema already there, tracking is stuck (needs admin DATABASE_URL to clean up) |
| Playwright E2E against staging URL | ✅ Done (122/122) |
| `prisma migrate deploy` against **production** DB | ⚠️ Awaiting admin DATABASE_URL |
| Cloud Run prod redeploy with the new image | ⚠️ Awaiting explicit auth |
| Cut MVP 1.0 release tag | Not started |

---

## Files modified locally (uncommitted)

```
prisma/schema.prisma           — added binaryTargets line (3 LOC)
server/production.ts           — RR7 SSR adapter rewrite (~30 LOC delta)
server/index.ts                — auto-start guard fix (~5 LOC delta)
```

`git diff main` will show these. Tests in `tests/` are unchanged. No lockfile changes.

**Recommended commit:** single PR titled
> `fix: unblock Cloud Run boot — prisma engines + RR7 SSR adapter + double-listen + cors-collision`

with body referencing each of the 4 root causes. CI is currently green at `7307afb`; this PR should keep it green (typecheck passes locally; same Dockerfile build path that just produced 5 successful Cloud Build images).

---

## Cloud Build history during this work (all in `adjudiclaims-staging` project, us-west1)

| Build ID | Tag | Outcome | Notes |
|---|---|---|---|
| `1a84e3ce-…` | `7307afb` | SUCCESS | First image; app crashed on Prisma engine missing |
| `323e2dcd-…` | `7307afb-prisma-engines` | SUCCESS | After fix #1; revealed fix #2 boot crash |
| `94144041-…` | `7307afb-fixes-2` | SUCCESS | After fixes #1+#2; revealed RR7 fetch handler missing |
| `35df644d-…` | `7307afb-fixes-3` | SUCCESS | After fixes #1–#3; revealed double-listen / `EADDRINUSE` |
| `14cd3147-…` | (cancelled) | CANCELLED | Mid-flight when I caught the typecheck error |
| `fc313f01-…` | `7307afb-fixes-5` | SUCCESS | All 4 fixes — currently deployed and serving |

---

## Memory updates worth making (for future sessions)

- **Production Cloud Run lives in** `adjudiclaims-prod` / us-west1, service `adjudiclaims-app`, image registry `us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app`. SA: `adjudiclaims-app@adjudiclaims-prod.iam.gserviceaccount.com`.
- **Staging Cloud Run lives in** `adjudiclaims-staging` / us-west1 (Path A), service `adjudiclaims-staging`, image registry `us-west1-docker.pkg.dev/adjudiclaims-staging/adjudiclaims/app`.
- The Cloud Run service `adjudiclaims-staging` in the **parent** `adjudica-app-473308` project is **abandoned and broken** — secrets it references don't exist there. Safe to delete after we're confident the new staging works.
- **PlanetScale databases:** prod = `adjudiclaims`, staging = `adjudiclaims-staging`, both in `glass-box-solutions` org, both Postgres on AWS us-west-2.
- **Cloud Build with non-default SA in this org** requires (a) `storage.objectUser` on the build SA at project level, (b) a regional logs bucket, and (c) `storage.admin` on that bucket for the build SA. Path A staging already has this; prod likely doesn't.

---

## Open questions for the next session

1. Is rolling the validated image to prod an acceptable v1.0 cut, or do we want a CI-built image from a real merge commit that includes the 4 fixes?
2. Who owns getting the admin `DATABASE_URL` from PlanetScale for migration tracking cleanup?
3. Do we keep the abandoned `adjudiclaims-staging` Cloud Run service in `adjudica-app-473308` (it's broken anyway) or delete it now?
4. STATE.md still says "Cloud Build triggers on `main` push" — that was never true. Update STATE.md or wire actual triggers in `adjudiclaims-staging` and `adjudiclaims-prod`?
