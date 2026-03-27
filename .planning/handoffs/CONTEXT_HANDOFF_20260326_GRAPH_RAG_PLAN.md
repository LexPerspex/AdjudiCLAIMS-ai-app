# Context Handoff: Graph RAG Architecture + DocumentType Expansion
**Date:** 2026-03-26
**Branch:** feat/document-workflow-engine
**Agent:** Opus 4.6 (1M context)
**Status:** Plan approved, Phase G1 ready to start

---

## What Was Accomplished This Session

### 1. DocumentType Enum Expansion (16 → 25) — CODE COMPLETE

Gap analysis of real-world CA WC claims examiner document types against the 16-value Prisma enum revealed severe misclassifications:
- WCAB court orders classified as "correspondence"
- Liens classified as "billing"
- Offers of work (LC 4658 PD rate changes) classified as "correspondence"
- Discovery subpoenas classified as "legal correspondence"

**9 new values added:** WCAB_FILING, LIEN_CLAIM, DISCOVERY_REQUEST, RETURN_TO_WORK, PAYMENT_RECORD, DWC_OFFICIAL_FORM, WORK_PRODUCT, MEDICAL_CHRONOLOGY, CLAIM_ADMINISTRATION

**Files modified:**
- `prisma/schema.prisma` — 9 new enum values
- `server/services/classifier-taxonomy-map.ts` — ~65 new subtype mappings, 6 type-level fallback updates
- `server/services/document-classifier.service.ts` — 9 new keyword rules (24 total, up from 15)
- `tests/unit/classifier-taxonomy-map.test.ts` — 14 new test blocks
- `tests/unit/document-pipeline.test.ts` — Coverage test 15→24 types

**Test results:** 1,690 tests passing, 0 failures, 0 TypeScript errors

### 2. Neurosymbolic Graph RAG Architecture Plan — APPROVED

Complete architecture for adapting the attorney-side graph RAG (from PLAN-graph-rag-architecture.md) to AdjudiCLAIMS examiner context.

**Key decisions:**
- Shared ontology: 13 node types, 35 edge types, 190 SubtypeGraphTemplates
- Examiner-specific UPL access layer (5 filters)
- `claimId` scoping (not `matterId`)
- Examiner maturity facets: Medical (0.30), Insurance (0.25), Employment (0.20), Regulatory (0.15), Evidential (0.10)
- PostgreSQL-native (recursive CTEs + pgvector)
- Embedding model pending decision

**6 implementation phases (G1-G6) interleaved with existing A-F plan:**
- G1: Schema + Templates (parallel with A2)
- G2: Enrichment Pipeline
- G3: Access Layer + UPL
- G4: Workflow/Deadline/Investigation/Benefit Bridges
- G5: Trust UX (Examiner MVP)
- G6: Hybrid Retrieval + Neuro-Plasticity (Post-MVP)

**Plan file:** `/home/vncuser/.claude/plans/magical-pondering-twilight.md`

---

## Key Data Points

### Classifier Extraction Fields (from latest commit)
- 190 subtypes with extraction schemas
- 1,663 total field instances (775 unique field names)
- 406 date fields → timeline events
- 117 array fields → one-to-many graph entities
- 3 public functions: `getExtractionFields()`, `buildExtractionResponseSchema()`, `buildExtractionPrompt()`

### Extraction → Graph Mapping
- Person name fields → PERSON nodes (28 roles)
- Organization fields → ORGANIZATION nodes (13 types)
- Body part arrays → BODY_PART nodes with DWC codes
- Medical fields → TREATMENT, MEDICATION, RATING nodes
- Financial fields → BENEFIT, SETTLEMENT, LIEN nodes
- Date fields → Timeline events (14 event types identified)

---

## What's Next

### Immediate (G1 — can start now)
1. Prisma migration: GraphNode, GraphEdge, GraphSummary, GraphMaturity, GraphStatusChange + all graph enums
2. Template auto-generation pipeline from classifier's 190 subtypes
3. Ontology constraints + confidence math utilities
4. Unit tests

### Blocked On
- G2 requires G1 complete
- G3 requires G2 complete
- G4 requires G2 + A2 (trigger map) + C1 (active workflows)

---

## Uncommitted Changes (git status)

```
M  package-lock.json
M  package.json
M  server/services/document-classifier.service.ts
M  tests/unit/document-pipeline.test.ts
M  prisma/schema.prisma (DocumentType enum expansion)
?? .planning/handoffs/CONTEXT_HANDOFF_20260326_A1_COMPLETE.md
?? .planning/handoffs/CONTEXT_HANDOFF_20260326_ARCH_RESTRUCTURE.md
?? .planning/handoffs/CONTEXT_HANDOFF_20260326_GRAPH_RAG_PLAN.md
?? server/lib/llm/classifier-adapter.ts
?? server/services/classifier-taxonomy-map.ts
?? tests/unit/classifier-taxonomy-map.test.ts
```

All 1,690 tests passing. Ready to commit when approved.

---

## Reference Files

| File | Purpose |
|------|---------|
| `/home/vncuser/.claude/plans/magical-pondering-twilight.md` | Full graph RAG plan (approved) |
| `/home/vncuser/.claude/plans/hashed-sprouting-bunny.md` | Document-Workflow-Timeline Engine plan (A-F phases) |
| `/home/vncuser/adjudica-documentation/projects/adjudica-ai-app/planning/PLAN-graph-rag-architecture.md` | Attorney-side architecture (209KB, source of truth) |
| `/home/vncuser/Adjudica-classifier/src/research/extraction-schemas.ts` | Extraction field definitions (190 subtypes) |
| `/home/vncuser/Adjudica-classifier/src/research/data.ts` | All 190 research reports (~45K lines) |
