---
date: 2026-04-27
session: PlanetScale MCP triage; carry-over tasks 4 / 5 / 7 still open
prior_handoffs:
  - .planning/handoffs/CONTEXT_HANDOFF_20260426_POST_PR34_MERGE.md
  - .planning/handoffs/CONTEXT_HANDOFF_20260426_PR34_AND_MIGRATION_CLEANUP.md
  - .planning/handoffs/CONTEXT_HANDOFF_20260426_STAGING_DEPLOY.md
---

# Handoff — 2026-04-27

## TL;DR

Three carry-over tasks from the 2026-04-26 deploy session are still open:
**(4)** revoke staging admin DB password + delete `adjudiclaims-db-url-admin` secret,
**(5)** `prisma migrate resolve --applied` for 4 unrecorded migrations on staging then prod,
**(7)** cut MVP 1.0 release tag.

PlanetScale MCP is the blocker on (4) and (5). This session **diagnosed and partially fixed** the MCP auth — see the next section. Do not retry MCP from this session; restart Claude Code first.

PR #35 (docs handoffs) is **already merged** — `gh pr view 35` confirms `MERGED`. Strike that from any pending list.

---

## What changed this session

| Area | Change |
|------|--------|
| `~/.claude/.credentials.json` | Removed empty PlanetScale OAuth stub `planetscale\|b4aa0b9d0ae7d2f7` (zero-length accessToken, no refresh token). Backup at `~/.claude/.credentials.json.bak-2026-04-27-pre-stub-delete`. The valid entry `planetscale\|ed5bb75f92269a4e` (56-char `pscale...` token, refresh token present, expires `1779891508036` = 2026-05-23) is what remains. |
| Repo files | None. No commits, no pushes, no branch changes. Branch `docs/post-pr34-handoffs-and-state-refresh` is unchanged. |
| Cloud / DB | None — no production or staging mutations. |

---

## PlanetScale MCP diagnosis (READ BEFORE RETRYING)

**Symptom:** Every `mcp__planetscale__*` call returns
```
{"error":"invalid_token","error_description":"The access token is invalid","state":"unauthorized"}
```
even after `/mcp` reports "Authentication successful. Reconnected to planetscale."

**Root cause this session:** `~/.claude/.credentials.json` had **two** PlanetScale OAuth entries simultaneously:

| Key | accessToken length | refreshToken | expiresAt |
|-----|-------------------:|--------------|-----------|
| `planetscale\|b4aa0b9d0ae7d2f7` | **0** (empty stub) | none | null |
| `planetscale\|ed5bb75f92269a4e` | 56 (real `pscale...`) | yes | 2026-05-23 |

The MCP HTTP client was selecting the stub (likely first-match by serverName), so every call sent an empty bearer token, which the PlanetScale OAuth server rejects as `invalid_token`. `claude mcp list` reported "Connected" because the stub *exists*, not because its token works.

**Action taken:** stub deleted via
```
jq 'del(.mcpOAuth["planetscale|b4aa0b9d0ae7d2f7"])' ~/.claude/.credentials.json
```
Backup saved as `~/.claude/.credentials.json.bak-2026-04-27-pre-stub-delete`. After deletion the file contains only the valid entry — but **MCP calls still failed in this session** because the in-process MCP client had already cached the stub. A **Claude Code restart is required** for the MCP HTTP transport to re-read credentials and pick the valid entry.

### What to do next session

1. **Restart Claude Code** (do NOT skip — without it the cached stub is still in memory).
2. Verify the stub stayed deleted:
   ```bash
   jq '.mcpOAuth | to_entries[] | select(.key | startswith("planetscale")) | {key, accessTokenLen: (.value.accessToken | length)}' ~/.claude/.credentials.json
   ```
   Should return exactly one entry with `accessTokenLen: 56`.
3. Smoke-test MCP: `mcp__planetscale__planetscale_list_organizations`. Expect Glass Box org back, NOT `invalid_token`.
4. **If invalid_token persists**, the empty stub may have re-appeared from a stale `/mcp` flow. Re-delete and retry. **Do not nuke the entire `mcpOAuth` block** — that will also invalidate Notion / Stripe / Linear tokens.
5. **Fallback if MCP still won't work after one more cycle:** abandon MCP for this work, use the live `adjudiclaims-db-url-admin` secret directly (still present in `adjudiclaims-staging` — confirmed this session via `gcloud secrets list`). Run migrations via `psql` or `prisma migrate resolve` against that URL, then proceed with task 4 to revoke + delete it.

### Other MCP servers in same broken state

`jq` on `.credentials.json` shows the **stripe** and **linear** entries also have empty `accessToken` strings. They were not used this session, so impact is unknown — but if you hit `invalid_token` on those later, the diagnosis is identical.

---

## Carry-over tasks (still open)

### Task 4 — Revoke staging admin password + delete admin secret
- **What**: Revoke PlanetScale password `main-2026-04-26-segzux` on database `adjudiclaims-prod` (staging branch `main`), then `gcloud secrets delete adjudiclaims-db-url-admin --project=adjudiclaims-staging`.
- **Why**: Long-lived admin DB URL exists only because we needed it for the migration baseline. Once task 5 is complete (or moved to MCP), this credential is unnecessary attack surface.
- **Blocker**: PlanetScale MCP. After MCP works, use `mcp__planetscale__planetscale_*` to revoke; then `gcloud secrets delete` is independent and can run anytime.
- **Verify after**: `gcloud secrets list --project=adjudiclaims-staging --filter="name~admin"` returns empty; PlanetScale password list no longer shows `main-2026-04-26-segzux`.

### Task 5 — `prisma migrate resolve --applied` × 4 (staging then prod)
- **What**: 4 migrations exist on disk in `prisma/migrations/` but were never recorded in `_prisma_migrations` because the staging baseline was applied via direct SQL on 2026-04-26. Need to mark them applied so future `prisma migrate deploy` runs are clean.
- **Migration names**: see `.planning/handoffs/CONTEXT_HANDOFF_20260426_PR34_AND_MIGRATION_CLEANUP.md` for the canonical list of 4. (Re-confirm by diffing `ls prisma/migrations/` against `SELECT migration_name FROM _prisma_migrations` before running.)
- **Order**: staging first → verify `prisma migrate status` is clean → repeat against prod.
- **Blocker**: Same MCP issue as task 4. Without MCP, the only alternative is the admin secret URL — which means task 5 must complete *before* task 4's secret deletion if going that route.

### Task 7 — Cut MVP 1.0 release tag
- **What**: Tag `0abcc81` (current prod, verified green on revision `00002-pph`) as `v1.0.0-mvp` (or whatever name you want), push tag.
- **Why**: Marker for the first production-deployed build. No infra risk — pure git.
- **Blocker**: None. Can run independently of tasks 4 and 5.
- **Suggested commands**:
  ```bash
  git tag -a v1.0.0-mvp 0abcc81 -m "MVP 1.0 — first prod-deployed build (Cloud Run revision 00002-pph)"
  git push origin v1.0.0-mvp   # requires user permission per CLAUDE.md guardrails
  ```

---

## Current repo / infra state (snapshot)

| Thing | State |
|-------|-------|
| Branch | `docs/post-pr34-handoffs-and-state-refresh` (clean) |
| HEAD | `762c39d docs: post-PR-#34 handoffs + STATE.md refresh` |
| Open PRs | **none** (`gh pr list --state open` → empty) |
| Last merged PR | #35 (docs handoffs + STATE.md), already merged |
| Prod Cloud Run | `adjudiclaims-app-00002-pph` @ `https://adjudiclaims-app-26ivcga4xa-uw.a.run.app` (project `adjudiclaims-prod`) — green on `0abcc81` |
| Staging Cloud Run | `adjudiclaims-staging-00005-9bl` @ `https://adjudiclaims-staging-wmpgfirciq-uw.a.run.app` (project `adjudiclaims-staging`) |
| `adjudiclaims-db-url-admin` secret | **STILL PRESENT** in `adjudiclaims-staging` — task 4 deletes it |
| `adjudiclaims-db-url` secret | Present, in active use by staging service |

---

## Recommended order next session

1. **Restart Claude Code** → smoke-test PlanetScale MCP per the steps above.
2. **Task 5** (migration resolve) — staging first, verify clean, then prod.
3. **Task 4** (revoke password + delete secret) — only after task 5 is done.
4. **Task 7** (MVP tag + push) — independent; can also run first if you want a quick win.

If MCP refuses to work after one full reconnect cycle, fall back to admin-secret path: do task 5 → task 4 in one go (admin secret is consumed and then revoked in the same session).

---

## Files referenced

- `~/.claude/.credentials.json` — PlanetScale OAuth lives here; do NOT commit or paste contents
- `~/.claude/.credentials.json.bak-2026-04-27-pre-stub-delete` — backup before stub removal
- `.planning/handoffs/CONTEXT_HANDOFF_20260426_*.md` — prior session context (3 files)
- `.planning/STATE.md` — last refreshed 2026-04-26 post-PR-#34
- `prisma/migrations/` — source of truth for the 4 unrecorded migrations
