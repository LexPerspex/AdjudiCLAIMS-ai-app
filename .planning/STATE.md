# AdjudiCLAIMS — Current State

**Last Updated:** 2026-04-27
**Branch:** main
**Last Merge:** PR #36 — `fix/AJC-2-baseline-migration` → `main` (single-file Prisma baseline; commit `0760bfa`)

---

## Phase Summary

| Phase | Status | Completion |
|-------|--------|------------|
| 0 Infrastructure | ✅ Complete | 100% |
| 1 Auth & RBAC | ✅ Complete | 100% |
| 2 Document Pipeline | ✅ Complete | 100% |
| 3 Core Claims Services | ✅ Complete | 100% |
| 4 UPL Compliance | ✅ Complete | 100% (counsel sign-off received 2026-04-23) |
| 5 Claims Chat | ✅ Complete | 100% |
| 6 Education & Training | ✅ Complete | ~95% |
| 7 Compliance Dashboard | ✅ Complete | ~95% |
| 8 Data Boundaries & KB | ✅ Complete | ~95% |
| 9 MVP Integration Testing | ✅ Complete | ~95% |
| 10 Tier 2 Features | ✅ Complete | ~95% |
| 11 Tier 3 Features | ❌ Not Started | 0% |

## Current Focus: Post-Deploy Cleanup

### Open Blockers (non-engineering)

1. **PlanetScale MCP still returns `invalid_token`** despite credential file being clean (valid `pscale_o…` token, refresh token present, expires 2026-05-27). Service-token CLI works (this is the path used for all admin ops); MCP path is non-functional. Likely a server-side issue with PlanetScale MCP not supporting the Postgres product. Operationally not a blocker — `pscale` CLI via service token is sufficient.
2. **No Cloud Build triggers in `adjudiclaims-prod`** — `gcloud builds triggers list` returns 0 at both regional and global scope. Deploys to prod are currently manual. Staging trigger state not verified.
3. **Three stale legacy DB-URL secrets in `adjudiclaims-prod`** (`adjudiclaims-db-url`, `DATABASE_URL`, `ADJUDICLAIMS_DATABASE_URL`) point at a Cloud SQL host (`35.230.2.226`) that no longer exists. Not used by Cloud Run (which is bound to `adjudiclaims-prod-database-url`). Safe to delete.
4. **Two redundant migrations on disk** (`20260423031032_add_benefit_letter_types`, `20260423045225_training_sandbox_synthetic_claims`) — both are pure schema changes already encoded in the new `20260419063906_init` baseline. Marked applied on prod via `migrate resolve --applied`. Future fresh deploys will hit "already exists" errors. Should be removed in a follow-up PR.

### Resolved (2026-04-27 late session)

- ~~Staging admin credential exposure~~ — PlanetScale role `main-2026-04-26-segzux` (id `jtq5sklvhzmu`) deleted from `adjudiclaims-staging/main`; GCP secret `adjudiclaims-db-url-admin` deleted from `adjudiclaims-staging` project (task 4)
- ~~PR #36 / AJC-2 baseline consolidation~~ — `fix/AJC-2-baseline-migration` merged at `0760bfa`; replaced two `20260330_*` migrations (broken lexical-sort order: `add_auth` ran before `init`) with single 1017-line `20260419063906_init` generated from `prisma/schema.prisma` via `prisma migrate diff --from-empty`
- ~~Prod schema applied~~ — `prisma migrate deploy` against empty `adjudiclaims/main` PlanetScale Postgres applied `20260419063906_init` cleanly (29 tables, 27 enums); `20260423031032_add_benefit_letter_types` and `20260423045225_training_sandbox_synthetic_claims` marked applied via `migrate resolve --applied` (their schema state is already encoded in the new baseline). `prisma migrate status` clean (3 migrations, "Database schema is up to date")
- ~~Staging migration tracking~~ — `_prisma_migrations` rows renamed: `20260330_init_postgresql` → `20260419063906_init`; `20260330_add_auth_and_soft_delete_fields` row deleted (subsumed by baseline); duplicate `20260419063906_init` row deduped (kept the older 2026-04-19 row, dropped the post-rename 2026-04-27 row). `prisma migrate status` clean
- ~~`scripts/pscale.sh` wrapper bug~~ — fixed `exec /tmp/pscale "$@"` → `exec pscale "$@"` (CLI lives at `~/.local/bin/pscale`)
- ~~Local `v1.0.0-mvp` git tag~~ — created at `0abcc81` (annotated; pushed: pending user authorization)
- ~~Temp admin role hygiene~~ — every temp PlanetScale admin role created during this session (`migrate-admin-2026-04-27`, `migrate-deploy-2026-04-27`, `post-ajc2-rename-2026-04-27`, `post-ajc2-dedupe-2026-04-27`, `post-ajc2-deploy-2026-04-27`) was reassigned-then-deleted; no lingering admin creds on either prod or staging branches

### Resolved (2026-04-26)

- ~~PR #34 merged~~ — `fix/cloud-run-boot-crashes` → `main` at `0abcc81` (4 boot-crash fixes: prisma OpenSSL 3.x engine, RR7 SSR adapter wildcard collision, double-listen, CORS plugin collision)
- ~~Production outage~~ — prod Cloud Run was crash-looping on revision `00001-xf9` (HTTP 500); redeployed manually this session to revision `adjudiclaims-app-00002-pph` from image `us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:0abcc81` (digest `sha256:beab7204bb19c891e4866cb6ed57f853c61ee6a344549e6694e9eb8573e50b43`); 100% traffic on new revision; both `/api/health` and `/api/health/db` returning 200 ok. Build ID `43ab6582-f109-4b3f-9231-e273e2f24cad` (4m30s)
- ~~Prod IAM gaps~~ — granted `roles/storage.objectUser` and `roles/artifactregistry.writer` to default Compute SA (`915841834222-compute@developer.gserviceaccount.com`) in `adjudiclaims-prod` to enable Cloud Build pushes
- ~~Staging deployment~~ — `adjudiclaims-staging` Cloud Run service healthy on `7307afb-fixes-5` image; 122/122 Playwright E2E tests passed end-to-end against the staging URL

### Resolved (2026-04-20 Batch)

- ~~23 AJC tickets~~ — `/process-backlog` run closed AJC-1, AJC-2, AJC-4–AJC-24 (all 23 in scope); ~30 PRs merged (see `docs/executions/batch-2026-04-20.md`)
- ~~Legal counsel UPL review~~ — Package approved verbatim by counsel on 2026-04-23 (AJC-3 closed)
- ~~Graph RAG G5 Trust UX~~ — Shipped in AJC-14 (confidence badges + entity panel)
- ~~MTUS guideline matching~~ — 11-entry placeholder replaced with 41-entry KB in AJC-15
- ~~Benefit payment letters~~ — PDF export + LC 3761 employer notifications shipped in AJC-16
- ~~Enhanced counsel referral~~ — Email integration with examiner CC + referral tracking UI shipped in AJC-17
- ~~Decision workflow audit~~ — All 20 workflows verified + 103 citation-integrity tests added in AJC-18
- ~~Training sandbox~~ — Per-user sandbox with 9 synthetic claims + multi-tenant safety shipped in AJC-19
- ~~Insurance Claims Case Generator~~ — 5-phase Python + Next.js package shipped across AJC-20–24
- ~~Regulatory KB expansion~~ — 33 → 50 entries in AJC-9
- ~~Compliance dashboard admin view~~ — Shipped in AJC-5
- ~~UPL analytics + org-boundary service + soft-delete guard~~ — Shipped in AJC-7, AJC-10

### Next Actions

1. Open follow-up PR to delete the two redundant on-disk migrations (`20260423031032_add_benefit_letter_types`, `20260423045225_training_sandbox_synthetic_claims`) now subsumed by the `20260419063906_init` baseline. Coordinate `_prisma_migrations` row deletion on staging/prod alongside the merge.
2. Push `v1.0.0-mvp` tag to origin (currently local-only at `0abcc81`).
3. Delete the three stale legacy DB-URL secrets from `adjudiclaims-prod` (`adjudiclaims-db-url`, `DATABASE_URL`, `ADJUDICLAIMS_DATABASE_URL`) — confirmed unused by Cloud Run, point at a non-existent Cloud SQL host.
4. Decide on Cloud Build triggers for `main` push (currently zero in `adjudiclaims-prod`) or codify the manual deploy runbook.
5. End-to-end sanity: hit `adjudiclaims-app` prod URL with a logged-in user flow now that the schema is applied — confirm the app actually works end-to-end (was previously broken on any DB-touching request).

## Quality Metrics

| Metric | Value |
|--------|-------|
| Test files | 101 |
| Tests passing | 3,521 / 3,521 |
| Typecheck errors | 0 |
| Build | succeeds |
| UPL RED blocked | 126/126 (100%) |
| UPL GREEN false positive | 0/126 (0%) |
| UPL YELLOW disclaimed | 62/62 (100%) |
| UPL output validator | 203/203 (100%) |
| SOC 2 compliance tests | 69 passing |
| Decision workflows | 20 (all with citation-integrity invariants) |
| Regulatory KB entries | 50 |
| MTUS guideline entries | 41 |
| Legal counsel sign-off | ✅ Received 2026-04-23 |

## New Features (2026-04-20 Batch)

- **Benefit Payment Letters (LC 3761)** — PDF generator + employer notification templates; org-scoped access control; Print + Download UI
- **Enhanced Counsel Referral** — Email integration (SendGrid + examiner CC), referral status tracking (PENDING→SENT→RESPONDED→CLOSED), chat-panel "Refer to Counsel" CTA, referrals tab UI
- **Training Sandbox** — Per-user `User.trainingModeEnabled` + `Claim.isSynthetic` + `syntheticOwnerId`; 9 curated synthetic scenarios (TRAIN-001 – TRAIN-009); enable/disable/reset routes; yellow sandbox banner
- **Decision Workflow Audit** — 103 new tests locking citation format, UPL zone invariants, step metadata integrity, and skippable-step rules
- **Insurance Claims Case Generator** — Standalone Python package (`packages/insurance-claims-case-generator/`): 13 scenarios, 24 PDF document types, FastAPI service with 6 endpoints, AdjudiCLAIMS integration client, GCP secrets, Dockerfile, Next.js 15 frontend
- **Graph RAG G5 Trust UX** — Confidence badges + entity panel in chat

---

@Developed & Documented by Glass Box Solutions, Inc. using human ingenuity and modern technology
