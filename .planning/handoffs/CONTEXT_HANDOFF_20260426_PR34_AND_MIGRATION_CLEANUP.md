# Context Handoff — PR #34 + PlanetScale MCP migration cleanup

**Date:** 2026-04-26
**Author:** Claude (Opus 4.7, 1M context)
**Branch:** `fix/cloud-run-boot-crashes` @ `8236efc` (pushed; PR #34 open & MERGEABLE)
**Predecessor handoff:** `.planning/handoffs/CONTEXT_HANDOFF_20260426_STAGING_DEPLOY.md`

---

## TL;DR

- Predecessor handoff was executed: 4 boot-crash fixes are committed on `fix/cloud-run-boot-crashes`, pushed, and opened as **PR #34** (`MERGEABLE`, all CI checks GREEN — typecheck + test, both 2x).
- Abandoned Cloud Run service in `adjudica-app-473308` was deleted.
- Pivoted away from Secret-Manager-stashed admin DATABASE_URLs → using **PlanetScale MCP** (`execute_read_query` / `execute_write_query`) which mints short-lived creds per call.
- **Blocker for next session:** PlanetScale MCP token still rejected after `/mcp` reconnect (process held stale token). User restarted Claude Code — verify by re-running `mcp__planetscale__planetscale_list_organizations`.

---

## State of every open thread

### 1. PR #34 — boot fix
- URL: https://github.com/Glass-Box-Solutions-Inc/AdjudiCLAIMS-ai-app/pull/34
- Title: `fix: unblock Cloud Run boot — prisma engines + RR7 SSR adapter + double-listen + cors-collision`
- Status: `OPEN`, `MERGEABLE`, CI = 4/4 SUCCESS (typecheck x2, test x2)
- Awaiting: 1 approving review (branch protection requires it), then squash-merge.
- Approval is not blocked on Claude — request from the team lead. **Do not merge without explicit user permission per CLAUDE.md guardrail.**

### 2. Production redeploy — NOT started
- Plan was option (b) "real cut": let CI build a new image from the merge commit on `main`, then deploy to `adjudiclaims-prod`.
- Cloud Run prod service is still crash-looping on revision `00001-xf9` (pre-unified-server). Same 4 root causes.
- After PR #34 merges:
  - Verify Cloud Build trigger fires for `adjudiclaims-prod` on `main` push (handoff #1 noted "Cloud Build triggers on `main` push" was never wired — check before relying on it; may need manual `gcloud builds submit`).
  - Update Cloud Run service:
    ```bash
    gcloud run services update adjudiclaims-app \
      --project=adjudiclaims-prod \
      --region=us-west1 \
      --image=us-west1-docker.pkg.dev/adjudiclaims-prod/adjudiclaims/app:<merge-sha>
    ```
  - Prod IAM may also need the same one-time `storage.objectUser` + logs-bucket grant as staging for builds (per predecessor handoff §"Memory updates worth making").

### 3. PlanetScale migration tracking — partially diagnosed
- Confirmed via `prisma migrate status` (using temporarily-stashed admin URL):
  - **DB has applied:** `20260419063906_init` (a single collapsed baseline migration — no longer in repo)
  - **Local repo has 4 migrations the DB has never tracked:**
    - `20260330_init_postgresql`
    - `20260330_add_auth_and_soft_delete_fields`
    - `20260423031032_add_benefit_letter_types`
    - `20260423045225_training_sandbox_synthetic_claims`
  - Tables themselves are all present (34 of them) — only the `_prisma_migrations` tracking table is wrong.
- **Decision still needed before any cleanup:**
  - Option A: `prisma migrate resolve --applied <name>` for each of the 4 local migrations; leave/delete the orphan `20260419063906_init` row.
  - Option B: Reset `_prisma_migrations` entirely to match repo (more invasive; wipes the DB's notion of history).
  - Recommend A — it's the documented Prisma "baseline" path.
- This applies to BOTH staging and prod (assume prod is in the same shape; verify first).

### 4. PlanetScale MCP — still showing `invalid_token` after restart
- `~/.claude/.credentials.json` shows token has correct scopes (`manage_passwords`, `manage_production_branch_passwords`, `read_branches`, `read_databases`, etc.) and `expiresAt` 2026-05-24 (not expired).
- After `/mcp` reauth on 2026-04-26, system warned: *"Authentication successful, but server reconnection failed. You may need to manually restart Claude Code"*. User restarted but next session needs to verify by running `mcp__planetscale__planetscale_list_organizations`.
- If still rejected after restart: check the access token is being read fresh from `~/.claude/.credentials.json` (not cached); may need to delete `mcpOAuth.planetscale|<id>` block entirely and re-auth from zero.

### 5. Exposed staging admin password — REVOKE NEXT SESSION
- During the abandoned Secret-Manager approach, user screenshotted PlanetScale admin connection page → I read it → password was visible in conversation context.
- Role name: **`main-2026-04-26-segzux`** in PlanetScale `glass-box-solutions/adjudiclaims-staging` `main` branch.
- Stashed temporarily as Secret Manager entry `adjudiclaims-db-url-admin` in `adjudiclaims-staging` project (single version, automatic replication).
- **TO DO next session, in order:**
  1. Once MCP works, verify we can do all migration cleanup via MCP queries (no need for the long-lived URL).
  2. Revoke the `main-2026-04-26-segzux` PlanetScale role:
     - PlanetScale UI → glass-box-solutions/adjudiclaims-staging → Settings → Passwords → revoke
     - OR via MCP if a `delete_password` tool surfaces (none seen so far in loaded tools).
  3. Delete the unneeded GCP secret:
     ```bash
     gcloud secrets delete adjudiclaims-db-url-admin --project=adjudiclaims-staging --quiet
     ```

---

## What changed in the working tree this session

- **Committed (on `fix/cloud-run-boot-crashes`):** `prisma/schema.prisma`, `server/index.ts`, `server/production.ts` — all 4 root-cause fixes from predecessor handoff.
- **Untracked:**
  - `.planning/handoffs/CONTEXT_HANDOFF_20260426_STAGING_DEPLOY.md` (predecessor)
  - `.planning/handoffs/CONTEXT_HANDOFF_20260426_PR34_AND_MIGRATION_CLEANUP.md` (this file)
- **Branch state:** on `fix/cloud-run-boot-crashes`, fully synced with origin.

The two handoff files belong on `main` for institutional memory but were not committed because (a) they were created while on the fix branch and (b) we only have one ticket-in-flight here. Either commit them on `main` directly, or stage them onto a tiny separate `docs/` PR.

---

## Cloud infrastructure — current state (no changes since predecessor)

- **Staging Cloud Run:** `adjudiclaims-staging` in `adjudiclaims-staging` / us-west1 — image `7307afb-fixes-5`, all-green serving. Not yet redeployed from PR #34's merge image (won't be — staging is already validated).
- **Prod Cloud Run:** `adjudiclaims-app` in `adjudiclaims-prod` / us-west1 — still on broken revision `00001-xf9`. Crash-looping. Needs the merge-commit image after PR #34 lands.
- **Abandoned Cloud Run in `adjudica-app-473308`:** ✅ deleted.
- **PlanetScale:** prod = `adjudiclaims` (PS-5), staging = `adjudiclaims-staging` (PS-10), both Postgres on AWS us-west-2 in `glass-box-solutions` org.

---

## Task list (carried over for next session)

| # | Status | Task |
|---|---|---|
| 1 | ✅ done | Verify typecheck passes |
| 2 | ✅ done | Create branch + commit + push + open PR for 4 boot fixes |
| 3 | 🔄 in-progress | PlanetScale MCP re-auth (verify after restart) |
| 4 | ✅ done | Delete abandoned `adjudiclaims-staging` Cloud Run in `adjudica-app-473308` |
| 5 | ⏳ pending | Revoke exposed staging admin password + delete unneeded `adjudiclaims-db-url-admin` secret |
| 6 | ⏳ pending | Clean up `_prisma_migrations` tracking on staging via MCP (`migrate resolve --applied` x4) |
| 7 | ⏳ pending | Run `prisma migrate deploy` (or equivalent resolve) on prod via MCP before Cloud Run redeploy |

Add to the next session as new tasks:
- Get PR #34 reviewed + merged (with explicit user permission)
- Cloud Build / Cloud Run prod redeploy from merge commit
- Update STATE.md to reflect "Cloud Build triggers on main push" status (currently inaccurate per predecessor handoff §open questions)
- Decide whether to wire actual Cloud Build triggers in `adjudiclaims-staging` and `adjudiclaims-prod` (currently manual `gcloud builds submit`)

---

## Open questions for the next session (from predecessor + new)

1. Approver for PR #34? (1 review required by branch protection.)
2. Roll the `7307afb-fixes-5` image to prod, OR rebuild from PR #34 merge commit? (User chose (b); reconfirm after merge lands.)
3. Once staging migration tracking is repaired, do we want to do the same dry-run inspection on prod *before* `migrate deploy`, or trust that prod schema matches staging?
4. Update STATE.md / cut MVP 1.0 release tag — when?

---

## Quick smoke-test commands for next session

```bash
# 1. Verify PlanetScale MCP works
# (run via Claude tool: mcp__planetscale__planetscale_list_organizations)

# 2. Verify PR #34 still mergeable
gh pr view 34 --json state,mergeable,statusCheckRollup --jq '{state, mergeable, checks: [.statusCheckRollup[] | {name, conclusion}]}'

# 3. Verify staging is still green
curl -s https://adjudiclaims-staging-734869918010.us-west1.run.app/api/health
curl -s https://adjudiclaims-staging-734869918010.us-west1.run.app/api/health/db

# 4. Verify prod is still down (expected: 5xx or crash-loop)
curl -s -o /dev/null -w "%{http_code}\n" https://adjudiclaims-app-26ivcga4xa-uw.a.run.app/api/health
```
