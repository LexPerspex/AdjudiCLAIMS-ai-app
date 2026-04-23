# Implementation Plan: AJC-2
# Apply Prisma 20260419_init migration to staging and production databases

## Context

The working tree has these migration-related changes relative to `main` (HEAD):

1. **Deleted (tracked in git, removed from disk):**
   - `prisma/migrations/20260330_init_postgresql/migration.sql`
   - `prisma/migrations/20260330_add_auth_and_soft_delete_fields/migration.sql`

2. **Modified (tracked, working copy differs):**
   - `prisma/migrations/migration_lock.toml` — added comment lines (cosmetic)
   - `prisma/schema.prisma` — upgraded from PlanetScale MySQL → PostgreSQL 15 + pgvector, new enums/models for Graph RAG architecture

3. **Untracked (exists on disk, not in git):**
   - `prisma/migrations/20260419063906_init/migration.sql` — 1,206-line single clean baseline migration replacing the two old ones

The staging database (`adjudiclaims-staging`) already has the new schema applied per STATE.md. The task is to make git reflect this reality.

## Plan

### Step 1 — Stage deletion of old migration files

```bash
git rm prisma/migrations/20260330_add_auth_and_soft_delete_fields/migration.sql
git rm prisma/migrations/20260330_init_postgresql/migration.sql
```

These broken/superseded migrations are already deleted on disk. Staging the `git rm` makes git track the deletion.

### Step 2 — Stage the new init migration

```bash
git add prisma/migrations/20260419063906_init/migration.sql
```

This is the single clean baseline migration that replaces both deleted migrations.

### Step 3 — Stage migration_lock.toml and schema.prisma

```bash
git add prisma/migrations/migration_lock.toml
git add prisma/schema.prisma
```

The lock file change is cosmetic (comment lines added). The schema.prisma change is substantive — reflects the upgraded PostgreSQL 15 + pgvector architecture with new Graph RAG models/enums.

### Step 4 — Run tests to verify nothing broken

```bash
npm run test
```

All 3,161 tests must pass (they do now — confirmed pre-plan).

### Step 5 — Commit

```bash
git commit -m "feat(AJC-2): add Prisma 20260419_init baseline migration

Replace two broken split migrations (20260330_init_postgresql and
20260330_add_auth_and_soft_delete_fields) with single clean baseline
migration 20260419063906_init.

Schema upgrade: PostgreSQL 15 + pgvector, full Graph RAG models
(GraphNode, GraphEdge, GraphEntityMerge, GraphRoutingMemory, ClaimFact,
FactCitation, ChatCitation), ContradictionType enum, Hebbian LTP fields.
Staging (adjudiclaims-staging) already has this schema applied.

Co-Authored-By: 4850Lex <4850Lex@users.noreply.github.com>"
git push origin feat/AJC-2-apply-prisma-20260419init-migration-to-s
```

### Step 6 — Verify commit

```bash
git log --oneline -3
git show --stat HEAD
```

## Files to Change

| Path | Change Type | Why |
|------|-------------|-----|
| `prisma/migrations/20260330_init_postgresql/migration.sql` | Deleted (git rm) | Superseded by 20260419_init baseline |
| `prisma/migrations/20260330_add_auth_and_soft_delete_fields/migration.sql` | Deleted (git rm) | Superseded by 20260419_init baseline |
| `prisma/migrations/20260419063906_init/migration.sql` | Added (new) | Single clean baseline migration for PostgreSQL 15 + pgvector |
| `prisma/migrations/migration_lock.toml` | Modified | Cosmetic comment lines added |
| `prisma/schema.prisma` | Modified | PostgreSQL 15 + pgvector upgrade, new Graph RAG models |

## Tests to Write

| Test | Type | What it covers |
|------|------|----------------|
| None new needed | — | This is a git/migration housekeeping commit. All 3,161 existing tests cover the schema correctness. No application logic changed. |

## Risk Flags

1. **schema.prisma changes are substantive**: The schema upgrade includes new Graph RAG models. These were already implemented and tested (3,161 tests pass). The PR captures the schema alongside the migration that reflects it — this is the correct pairing.
2. **No new application code changed**: This PR is purely migration + schema file management. Zero risk of UPL compliance regression.
3. **Staging already migrated**: Per STATE.md, staging was already reset and migrated to this schema. Production database provisioning is out of scope (noted in STATE.md as a separate blocker).
4. **The migration is NOT reversible without data loss**: The init migration creates all 34 tables fresh. A rollback would require `prisma migrate reset` which drops all data. This is acceptable for staging/pre-production environments only.
