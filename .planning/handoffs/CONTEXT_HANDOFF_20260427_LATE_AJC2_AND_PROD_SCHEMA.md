---
date: 2026-04-27
session: AJC-2 baseline consolidation, prod schema apply, staging cleanup
prior_handoffs:
  - .planning/handoffs/CONTEXT_HANDOFF_20260427_PSCALE_MCP_AND_TASKS_4_5_7.md
  - .planning/handoffs/CONTEXT_HANDOFF_20260426_POST_PR34_MERGE.md
---

# Handoff — 2026-04-27 (late session)

## TL;DR

All carry-over tasks from the morning handoff resolved. PR #36 merged. Prod PlanetScale Postgres now has the schema applied for the first time; staging is clean. The PlanetScale MCP issue is non-blocking — service-token CLI is the right admin path for this Postgres product.

## What changed this session

| Area | Change |
|------|--------|
| **PR #36** | Merged at `0760bfa`. Replaces broken lexically-misordered `20260330_init_postgresql` + `20260330_add_auth_and_soft_delete_fields` with a single `20260419063906_init` baseline migration generated from `prisma/schema.prisma` via `prisma migrate diff --from-empty`. 28 tables, 27 enums, 100 indexes, 46 FKs in 1017 lines. |
| **Prod PlanetScale (`adjudiclaims/main`)** | Schema applied for the first time. `prisma migrate deploy` cleanly applied `20260419063906_init`. The two later migrations (`20260423031032`, `20260423045225`) were marked applied via `migrate resolve --applied` because their schema state is already encoded in the new baseline (deploying them threw `42710 enum already exists`). Final state: 29 tables, 27 enums, 3 migration rows, "Database schema is up to date." |
| **Staging PlanetScale (`adjudiclaims-staging/main`)** | `_prisma_migrations` rows updated to match the new baseline naming: renamed `20260330_init_postgresql` → `20260419063906_init`; deleted `20260330_add_auth_and_soft_delete_fields` row (subsumed by baseline); deduped the duplicate `20260419063906_init` row that resulted (kept the older 2026-04-19 baseline row from the original direct-SQL apply, dropped the post-rename row). Final state: 3 migration rows matching prod. |
| **Staging admin credential cleanup** (Task 4) | PlanetScale role `main-2026-04-26-segzux` (id `jtq5sklvhzmu`) deleted from `adjudiclaims-staging/main`. GCP secret `adjudiclaims-db-url-admin` deleted from `adjudiclaims-staging` project. |
| **`scripts/pscale.sh`** | `exec /tmp/pscale "$@"` → `exec pscale "$@"`. CLI lives at `~/.local/bin/pscale`; old wrapper hardcoded a stale path. |
| **Local `v1.0.0-mvp` annotated tag** | Created at `0abcc81` ("MVP 1.0 — first prod-deployed build (Cloud Run revision 00002-pph)"). Not pushed — needs user permission. |

## What we discovered along the way

- **Migration ordering bug was real.** Prisma sorts migration directories lexically. `20260330_add_auth_and_soft_delete_fields` < `20260330_init_postgresql` because `_a` < `_i`. Any fresh `migrate deploy` against an empty DB ran `add_auth` first and failed with `42P01 relation "users" does not exist`. Staging worked only because the schema was applied via direct SQL on 2026-04-26 and migrations recorded post-hoc with `migrate resolve --applied`. Reproduced on prod cleanly.
- **AJC-2 ticket plan from prior session was the documented fix** but was only partially executed — the baseline `20260419063906_init` was applied to staging via direct SQL, but the repo-side delete-old-add-new commit was never made. PR #36 finishes that work.
- **Two later migrations are now redundant on disk.** `20260423031032_add_benefit_letter_types` (enum value adds) and `20260423045225_training_sandbox_synthetic_claims` (column adds + indexes) are pure schema changes that the new baseline already encodes (because `prisma migrate diff --from-empty` reads current `schema.prisma`, which already includes those changes). On any future fresh deploy they'll fail with "already exists" errors. Should be deleted in a follow-up PR (with coordinated `_prisma_migrations` row deletion on staging + prod).
- **Prod was not actually on PlanetScale before tonight.** `adjudiclaims-prod-database-url` secret pointed at PlanetScale, but the database itself was empty (0 tables). Cloud Run prod (revision `00002-pph` on `0abcc81`) was bound to an empty DB. Any DB-touching request would have 500'd. The `v1.0.0-mvp` tag is on a build that only became end-to-end functional after this session's `migrate deploy`.
- **Prod GCP project has three stale DB-URL secrets** pointing at a Cloud SQL host (`35.230.2.226`) that no longer exists: `adjudiclaims-db-url`, `DATABASE_URL`, `ADJUDICLAIMS_DATABASE_URL`. Not bound to Cloud Run. Safe to delete.
- **PlanetScale MCP `invalid_token` is server-side, not client-side.** Credential file is clean (`pscale_o…` token, refresh token present, expires 2026-05-27, scope includes manage_passwords + manage_production_branch_passwords). MCP returns 401 on every call regardless. Likely a product-line mismatch — the MCP scopes are designed for Vitess/MySQL, not the Postgres product. Service-token CLI (`pscale ... --service-token-id ...`) is the working admin path. Not a blocker.

## Operational pattern that worked

For any prod/staging DB admin op:

```bash
PLANETSCALE_SERVICE_TOKEN_ID=$(gcloud secrets versions access latest --secret=planetscale-service-token-id --project=adjudica-internal)
PLANETSCALE_SERVICE_TOKEN=$(gcloud secrets versions access latest --secret=planetscale-service-token --project=adjudica-internal)
export PLANETSCALE_SERVICE_TOKEN_ID PLANETSCALE_SERVICE_TOKEN

# Create temp admin with TTL
ROLE_JSON=$(pscale role create <db> <branch> "<purpose>-$(date +%Y-%m-%d)" \
  --inherited-roles postgres --ttl 30m \
  --org glass-box-solutions --format json)
URL="postgresql://$(jq -r '.username' <<<$ROLE_JSON):$(jq -r '.password' <<<$ROLE_JSON)@$(jq -r '.access_host_url' <<<$ROLE_JSON):5432/postgres?sslmode=verify-full"
ROLE_ID=$(jq -r '.id' <<<$ROLE_JSON)

# Do the work
DATABASE_URL="$URL" npx prisma migrate ...
# or
psql "$URL" -c "..."

# Cleanup (reassign first if the role created tables/objects)
pscale role reassign <db> <branch> "$ROLE_ID" --successor postgres --force --org glass-box-solutions
pscale role delete <db> <branch> "$ROLE_ID" --org glass-box-solutions --force
```

If the role only read or modified existing data (no CREATE/ALTER), `reassign` is unnecessary and `role delete` succeeds directly.

## Open items for next session

| # | Item | Impact |
|---|------|--------|
| 1 | Delete the two redundant migrations (`20260423031032_add_benefit_letter_types`, `20260423045225_training_sandbox_synthetic_claims`) — coordinated with `_prisma_migrations` row deletion on staging + prod | Removes the latent "already exists" failure for any future fresh deploy |
| 2 | Push `v1.0.0-mvp` tag to origin (`git push origin v1.0.0-mvp`) | Marker for first end-to-end functional prod build |
| 3 | Delete three stale prod DB-URL secrets in `adjudiclaims-prod` | Clean up sprawl; secrets point at non-existent Cloud SQL host |
| 4 | End-to-end smoke test prod with a logged-in user flow | Verify the app actually works now that schema is applied |
| 5 | Decide on Cloud Build triggers for `main` push vs. document the manual deploy runbook | One or the other — currently no triggers exist |

## Files referenced

- `.planning/STATE.md` — refreshed in this commit
- `.planning/handoffs/CONTEXT_HANDOFF_20260427_PSCALE_MCP_AND_TASKS_4_5_7.md` — morning-session midpoint snapshot (its tasks 4 / 5 / 7 are now all closed)
- `prisma/migrations/20260419063906_init/migration.sql` — new single-file baseline (PR #36)
- `scripts/pscale.sh` — fixed wrapper

## Note on the prior morning handoff

The morning handoff (`CONTEXT_HANDOFF_20260427_PSCALE_MCP_AND_TASKS_4_5_7.md`) framed PlanetScale MCP as the blocker for tasks 4 and 5. That framing was wrong — service-token CLI is the right admin path for PlanetScale Postgres, MCP is irrelevant. Tasks 4 / 5 / 7 all closed this session via service-token CLI plus a coordinated AJC-2 finish.
