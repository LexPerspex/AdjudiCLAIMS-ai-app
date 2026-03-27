# Context Handoff — Phase A1 Complete (Classifier Integration)

## Date: 2026-03-26
## Branch: `feat/document-workflow-engine`
## Plan: `/home/vncuser/.claude/plans/hashed-sprouting-bunny.md`
## Previous Handoff: `.planning/handoffs/CONTEXT_HANDOFF_20260326_ARCH_RESTRUCTURE.md`

---

## What Was Accomplished This Session

### Phase A1: Document Classifier Integration (COMPLETE — uncommitted)

Rewrote the document classifier from a keyword-only stub to a production classifier that integrates with the `@adjudica/document-classifier` shared package.

**Files created:**
| File | Purpose |
|------|---------|
| `server/lib/llm/classifier-adapter.ts` | Bridges AdjudiCLAIMS's `ClaudeAdapter` to the classifier package's `IClassifierLLMAdapter` interface. Uses Claude Haiku. Handles zod v3/v4 type mismatch via structural typing (duck typing + `as any` cast). |
| `server/services/classifier-taxonomy-map.ts` | Maps classifier's 11 parent types + 188 subtypes → AdjudiCLAIMS's 16 Prisma `DocumentType` values. Subtype-first mapping (precise) with type-level fallback. Includes access level auto-detection. |
| `tests/unit/classifier-taxonomy-map.test.ts` | 26 tests: subtype mapping (12), type-level fallback (7), access level detection (7). |

**Files modified:**
| File | Changes |
|------|---------|
| `package.json` | Added `"@adjudica/document-classifier": "file:../Adjudica-classifier"` dependency (installed with `--legacy-peer-deps` due to pre-existing eslint peer dep conflict). |
| `server/services/document-classifier.service.ts` | Full rewrite. Keyword pre-filter (all 16 types, graduated confidence 0.55/0.7/0.9) + LLM fallback via `@adjudica/document-classifier` when keyword result is OTHER or low confidence. Access level detection on every classification. Persists access flags to Document record. |
| `tests/unit/document-pipeline.test.ts` | Updated classifier tests for new API: graduated confidence, `fileName` in select, access level assertions, full 15-type coverage test. |

**Architecture decisions:**
1. **Shared package via `file:` dependency** — `@adjudica/document-classifier` at `/home/vncuser/Adjudica-classifier` is consumed as a local package. No HTTP API — it's a direct TypeScript import.
2. **Zod v3/v4 bridge** — The classifier package uses zod v3, AdjudiCLAIMS uses zod v4. The adapter avoids importing `IClassifierLLMAdapter` directly and uses structural typing with an `as any` cast at the `DocumentClassifier` constructor call.
3. **Keyword-first, LLM-second** — Keywords are the fast path (no cost). LLM only fires when keywords produce OTHER or confidence < 0.55. Graceful degradation when `ANTHROPIC_API_KEY` is not set.
4. **Taxonomy mapping is subtype-first** — The classifier's specific subtypes (e.g., `QME_REPORT_INITIAL`) map to precise Prisma types (e.g., `AME_QME_REPORT`). Unknown subtypes fall back to the parent type mapping.
5. **Access level auto-detection** — Combines subtype-based detection (e.g., `DEPOSITION_TRANSCRIPT` → ATTORNEY_ONLY) with text pattern scanning for legal analysis, work product, and privileged communication indicators.

**No commits have been made yet.** All changes are unstaged on `feat/document-workflow-engine`.

---

## Test Baseline (Post-A1)

- **1,676 unit tests** passing (31 files) — was 1,646, added 30 new
- **224 UPL tests** passing (3 files) — unchanged
- **0 TypeScript errors**

---

## What Needs to Be Done Next

### Critical Path: ~~A1~~ → A2 → C1 → C2 → B1 → B2 → B3

### Phase A2: Classification → Workflow Trigger Map (NEXT)

**New service:** `server/services/workflow-trigger-map.service.ts`

Maps DocumentType → workflow IDs + optional document generation triggers. Called after document classification completes in the pipeline. Starts workflows via `workflow-engine.service.ts`.

| DocumentType (Prisma) | Triggered Workflow(s) | Generated Document(s) |
|---|---|---|
| `DWC1_CLAIM_FORM` | `new_claim_intake`, `three_point_contact` | Employer Notification LC 3761 |
| `MEDICAL_REPORT` | investigation update | Investigation Summary (if checklist progresses) |
| `AME_QME_REPORT` | `qme_ame_process` | (none — examiner reviews findings) |
| `UTILIZATION_REVIEW` | `ur_treatment_authorization` | (none — UR decision documented) |
| `BILLING_STATEMENT` | `lien_management` (if lien context) | OMFS Comparison Report |
| `WAGE_STATEMENT` | `reserve_setting` (recalc AWE) | TD Benefit Explanation Letter (updated) |
| `LEGAL_CORRESPONDENCE` | `counsel_referral` | Counsel Referral Summary |
| `IMAGING_REPORT` | investigation update | (none — added to medical evidence) |
| `DEPOSITION_TRANSCRIPT` | (flag for attorney review) | (none — ATTORNEY_ONLY access) |
| `BENEFIT_NOTICE` | `td_benefit_initiation` | Payment Schedule Letter |
| `SETTLEMENT_DOCUMENT` | (flag for attorney review) | (none — ATTORNEY_ONLY access) |
| `EMPLOYER_REPORT` | `three_point_contact` update | (none — investigation data) |
| `CORRESPONDENCE` | (route based on content) | Delay Notification (if deadline approaching) |

**Integration point:** After A2 is built, update `document-pipeline.service.ts` to call the trigger map after classification succeeds.

### Phase A3: Enhanced Timeline

Upgrade `timeline.service.ts` from date extraction to claim spine. Requires Prisma migration for `TimelineCategory` enum and new fields on `TimelineEvent`.

### Phases C1-C2: Active Workflows + Workflow→Generation Pipeline

Upgrade `workflow-engine.service.ts` from passive data to auto-triggered workflows. Workflow steps can produce document generation tasks.

### Phases B1-B3: Document Generation Engine

Template engine upgrade, GeneratedDocument model, document export.

### Phases D-F: Source Attribution, Chat Integration, KB Integration

---

## Key Files to Read Before Continuing

1. `/home/vncuser/.claude/plans/hashed-sprouting-bunny.md` — full approved plan
2. `server/services/document-classifier.service.ts` — **just rewritten** (keyword + LLM + access detection)
3. `server/services/classifier-taxonomy-map.ts` — **new** (taxonomy mapping + access level detection)
4. `server/lib/llm/classifier-adapter.ts` — **new** (LLM adapter bridge)
5. `server/services/document-pipeline.service.ts` — pipeline orchestrator (needs A2 integration)
6. `server/services/workflow-engine.service.ts` — workflow engine (needs C1 upgrade)
7. `server/data/workflow-definitions.ts` — 20 workflow definitions (workflow IDs for trigger map)
8. `server/services/letter-template.service.ts` — template engine (needs B1 upgrade)
9. `prisma/schema.prisma` — current schema (needs A3/B2 migrations)

## Dependencies Between Repos

| Repo | Path | Relationship |
|------|------|-------------|
| `Adjudica-classifier` | `/home/vncuser/Adjudica-classifier` | `file:` dependency — provides `DocumentClassifier`, taxonomy (11 types + 188 subtypes), research-enhanced prompts. Uses zod v3. |
| `adjudica-ai-app` | `/home/vncuser/adjudica-ai-app` | Sibling product (attorney side). Shares the same classifier package. Not a direct dependency of AdjudiCLAIMS. |
