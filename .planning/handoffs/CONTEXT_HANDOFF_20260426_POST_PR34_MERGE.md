# Context Handoff — Post-PR-#34 merge, prod redeploy + migration cleanup

**Date:** 2026-04-26
**Author:** Claude (Opus 4.7, 1M context)
**Branch:** `main` @ `0abcc81` (PR #34 merged)
**Predecessor handoffs:**
- `.planning/handoffs/CONTEXT_HANDOFF_20260426_STAGING_DEPLOY.md`
- `.planning/handoffs/CONTEXT_HANDOFF_20260426_PR34_AND_MIGRATION_CLEANUP.md`

---

## TL;DR

- **PR #34 is MERGED** into `main` as commit `0abcc81` at 2026-04-26 23:32:37Z. All 4 boot-crash fixes are now on `main`.
- Staging is healthy on the prior `7307afb-fixes-5` image. Prod (`adjudiclaims-app` in `adjudiclaims-prod`) is still HTTP 500 — needs a fresh image built from `0abcc81` and a Cloud Run service update.
- **Cloud Build triggers in `adjudiclaims-prod`: none.** A push to `main` does NOT auto-build. Prod redeploy must be a manual `gcloud builds submit` → `gcloud run services update`.
- **PlanetScale MCP still rejecting tokens** after a 2nd `/mcp` reauth this session. Same warning surfaces every time: "*Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.*" A full Claude Code restart did not help earlier; another restart is the next thing to try, and if that still fails, delete the `mcpOAuth.planetscale|<id>` block from `~/.claude/.credentials.json` outright and re-auth from zero.
- **Exposed staging admin password is still live** (`main-2026-04-26-segzux` in PlanetScale `glass-box-solutions/adjudiclaims-staging` `main` branch) and the `adjudiclaims-db-url-admin` secret in `adjudiclaims-staging` GCP project still exists. Both must be revoked/deleted next session.

---

## Smoke-test results from this session

| Check | Result |
|---|---|
| PR #34 status | OPEN → **MERGED** at `0abcc81` (2026-04-26 23:32:37Z) |
| Staging `/api/health` | `{"status":"ok","product":"AdjudiCLAIMS","version":"0.1.0"}` |
| Staging `/api/health/db` | `{"status":"ok","database":"connected"}` |
| Prod `/api/health` | HTTP 500 (still on broken revision `00001-xf9`) |
| PlanetScale MCP | `invalid_token` — both before and after `/mcp` reauth |
| Working tree | clean except for 3 untracked handoff files in `.planning/handoffs/` |

---

## State of every open thread

### 1. Prod redeploy from merge commit `0abcc81` — NOT started, awaiting permission
Plan (option (b) "real cut" — confirmed in predecessor handoff):

```bash
# Build the merge-commit image from main
gcloud builds submit \
  --project=adjudiclaims-prod \
  --region=us-west1 \
  --tag=us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:0abcc81 \
  .

# Roll Cloud Run prod to the new image
gcloud run services update adjudiclaims-app \
  --project=adjudiclaims-prod \
  --region=us-west1 \
  --image=us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:0abcc81

# Verify
curl -s https://adjudiclaims-app-26ivcga4xa-uw.a.run.app/api/health
curl -s https://adjudiclaims-app-26ivcga4xa-uw.a.run.app/api/health/db
```

**Pre-flight to verify before running build:**
- Artifact Registry repo `us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims` exists. (Likely yes — there must be at least the broken `00001-xf9` image somewhere; verify with `gcloud artifacts docker images list us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims --limit=5`.)
- Cloud Build SA in `adjudiclaims-prod` has the same one-time `storage.objectUser` + logs-bucket grants the staging build needed (predecessor handoff §"Memory updates worth making"). Likely needed; first build will fail loudly with the exact missing role if so.
- Confirm `Dockerfile` / `cloudbuild.yaml` at repo root are the same ones staging used successfully — they should be, since the unified-server fix was the boot bug, not a build-config bug.

**Do NOT trigger this without explicit user permission per CLAUDE.md guardrail.**

### 2. PlanetScale migration tracking cleanup — still pending
Status confirmed in predecessor handoff (DB has only `20260419063906_init`; repo has 4 newer migrations the DB has never seen, but tables are all present). Decision:

- **Option A (recommended):** `prisma migrate resolve --applied <name>` for each of the 4 local migrations.
  - `20260330_init_postgresql`
  - `20260330_add_auth_and_soft_delete_fields`
  - `20260423031032_add_benefit_letter_types`
  - `20260423045225_training_sandbox_synthetic_claims`

- This applies to BOTH staging and prod. Run on staging first; verify `prisma migrate status` shows clean before touching prod.
- Prod redeploy itself does NOT require this fix — Prisma client at boot doesn't run `migrate deploy`. But the next schema change shipping to prod will fail without it.

**Blocker:** needs PlanetScale MCP working (so we don't have to re-stash a long-lived admin URL in Secret Manager).

### 3. PlanetScale MCP — `invalid_token` persists across two `/mcp` reauths in two sessions
- 1st reauth (last session): warning *"Authentication successful, but server reconnection failed."* User restarted Claude Code. Did NOT fix it.
- 2nd reauth (this session): same warning. User did NOT restart yet — next thing to try.
- If a 3rd restart still fails: delete the `mcpOAuth.planetscale|<id>` block from `~/.claude/.credentials.json` entirely and re-auth from zero. Per predecessor handoff §4, the token has the right scopes (`manage_passwords`, `manage_production_branch_passwords`, `read_branches`, `read_databases`, …) and `expiresAt` 2026-05-24, so this is plausibly a stale-cache problem in the MCP client rather than an actual token problem.

### 4. Exposed staging admin password — STILL LIVE, REVOKE NEXT SESSION
Same as predecessor handoff §5 — no action taken this session. To do, in order:
1. Get PlanetScale MCP working (above).
2. Revoke role `main-2026-04-26-segzux` (PlanetScale UI → glass-box-solutions/adjudiclaims-staging → Settings → Passwords → revoke), or via MCP if a `delete_password` tool surfaces.
3. Delete the GCP secret:
   ```bash
   gcloud secrets delete adjudiclaims-db-url-admin --project=adjudiclaims-staging --quiet
   ```

### 5. Three handoff files sitting untracked on disk
```
.planning/handoffs/CONTEXT_HANDOFF_20260426_STAGING_DEPLOY.md          (predecessor #1)
.planning/handoffs/CONTEXT_HANDOFF_20260426_PR34_AND_MIGRATION_CLEANUP.md (predecessor #2)
.planning/handoffs/CONTEXT_HANDOFF_20260426_POST_PR34_MERGE.md        (this file)
```
All belong on `main` for institutional memory. Either commit them directly to `main` or stage onto a tiny `docs/` PR. Not blocking anything.

### 6. STATE.md drift
Predecessor handoffs flagged that STATE.md says "Cloud Build triggers on main push" — that is **not true** for `adjudiclaims-prod` (zero triggers exist). Same likely true for `adjudiclaims-staging` (not verified). Update STATE.md when you do the prod redeploy work.

---

## Cloud infrastructure — current state

| Service | Project | Region | State |
|---|---|---|---|
| `adjudiclaims-staging` | `adjudiclaims-staging` | `us-west1` | ✅ healthy on `7307afb-fixes-5` image |
| `adjudiclaims-app` (prod) | `adjudiclaims-prod` | `us-west1` | ❌ HTTP 500 on revision `00001-xf9` |
| (abandoned) Cloud Run in `adjudica-app-473308` | — | — | ✅ deleted last session |

**PlanetScale:** prod = `adjudiclaims` (PS-5), staging = `adjudiclaims-staging` (PS-10), both Postgres on AWS us-west-2 in `glass-box-solutions` org.

---

## Task list (carried over for next session)

| # | Status | Task |
|---|---|---|
| 1 | ✅ done | PR #34 merged into `main` as `0abcc81` |
| 2 | ⏳ pending | **Prod redeploy: build `0abcc81` image + update Cloud Run `adjudiclaims-app`** (needs explicit user permission) |
| 3 | ⏳ pending | Verify Artifact Registry repo + Cloud Build SA grants in `adjudiclaims-prod` before first build |
| 4 | ⏳ pending | Resolve PlanetScale MCP `invalid_token` (try restart → if still failing, nuke `mcpOAuth.planetscale|<id>` from credentials.json) |
| 5 | ⏳ pending | Revoke staging role `main-2026-04-26-segzux` + delete `adjudiclaims-db-url-admin` GCP secret |
| 6 | ⏳ pending | `prisma migrate resolve --applied` x4 on staging via MCP, then re-verify with `migrate status` |
| 7 | ⏳ pending | Same migration cleanup on prod (verify prod is in same shape as staging first) |
| 8 | ⏳ pending | Commit the 3 handoff files to `main` (or open small docs PR) |
| 9 | ⏳ pending | Update STATE.md — Cloud Build triggers status, prod redeploy outcome, next milestone |
| 10 | ⏳ pending | Decide whether to wire actual Cloud Build triggers on `main` for staging + prod (currently both manual) |
| 11 | ⏳ pending | Cut MVP 1.0 release tag once prod is verified green |

---

## Open questions for next session

1. After prod redeploy succeeds, do we want to wire real Cloud Build triggers (push-to-main → build → deploy) for staging + prod, or keep deploys manual for now?
2. Verify prod schema matches staging before running `migrate resolve` on prod, or trust they match?
3. Cut MVP 1.0 release tag once prod is verified green — when?
4. Once PlanetScale MCP works, do we want a `delete_password` tool in the MCP server's toolset (none currently surfaced), or just use the PlanetScale UI for that?

---

## Quick smoke-test commands for next session

```bash
# 1. Verify PlanetScale MCP works (after another restart)
# (run via Claude tool: mcp__planetscale__planetscale_list_organizations)

# 2. Verify prod is still down before redeploy
curl -s -o /dev/null -w "%{http_code}\n" https://adjudiclaims-app-26ivcga4xa-uw.a.run.app/api/health

# 3. Verify Artifact Registry repo exists in adjudiclaims-prod
gcloud artifacts docker images list us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims --limit=5 --project=adjudiclaims-prod

# 4. Verify staging is still green
curl -s https://adjudiclaims-staging-734869918010.us-west1.run.app/api/health
curl -s https://adjudiclaims-staging-734869918010.us-west1.run.app/api/health/db

# 5. Confirm main has merge commit
git log --oneline origin/main -3
# Expect: 0abcc81 fix: unblock Cloud Run boot — ... (#34)
```
