# Context Handoff — Architectural Restructuring (Document-Workflow-Timeline Engine)

## Date: 2026-03-26
## Branch: `feat/document-workflow-engine` (created from main)
## Plan: `/home/vncuser/.claude/plans/hashed-sprouting-bunny.md`

## What Was Accomplished in This Session

### Phase 10 (COMPLETE — on main)
- 8 features: 15 workflows, compliance reporting, letter generation, enhanced counsel referral, MTUS matching, ongoing education, lien management + OMFS comparison
- 1,870 tests (1,646 unit + 224 UPL), 0 type errors
- Commits: `90af9d5` through `3b4c329`

### Temporal + Sentry (COMPLETE — on main)
- 2 Temporal workers (document processing + LLM jobs), 4 workflows
- Sentry error tracking with activity interceptor
- Production deployment: Dockerfile (multi-stage, supports API + workers), cloudbuild.yaml (11-step CI/CD)
- `adjudiclaims` namespace registered on local Temporal server

### Documentation (COMPLETE — on main)
- Developer Guide (2,128 lines), User Guide (1,508 lines)
- Classifier Engineering Guide (1,327 lines), Classifier User Guide (631 lines)
- In-code JSDoc on 38 source files (930 lines)

## What Needs to Be Done Next

### Architectural Restructuring — Document-Workflow-Timeline Engine

The approved plan (in `.claude/plans/hashed-sprouting-bunny.md`) restructures AdjudiCLAIMS from disconnected backend endpoints into a cohesive document intake engine:

**Document In → Classify → Trigger Workflows → Generate Documents → Examiner Review → Export → Back on Timeline**

#### Critical Path: A1 → A2 → C1 → C2 → B1 → B2 → B3

#### Phase A: Document Intake Engine (START HERE)

**A1. Classifier Upgrade** (`server/services/document-classifier.service.ts`)
- Current: keyword stub (8 keyword rules, ~200 lines)
- Target: keyword pre-filter + LLM fallback (Claude Haiku)
- Also needs: access level auto-detection (ATTORNEY_ONLY, legal analysis, work product, privileged)
- No external dependencies — classifier lives in this repo

**A2. Classification→Workflow Trigger Map** (NEW service)
- `server/services/workflow-trigger-map.service.ts`
- Maps DocumentType → workflow IDs + optional document generation
- Called after document classification completes
- Starts workflows via workflow-engine.service.ts

**A3. Enhanced Timeline** (`server/services/timeline.service.ts`)
- Current: extracts date events from document OCR text
- Target: claim spine — every action (upload, workflow, deadline, payment, lien, generated doc) = timeline event
- Needs: TimelineEvent model enhancement (see schema changes below)

#### Phase B: Document Generation Engine

**B1. Template Engine Upgrade** — source attribution on every field
**B2. GeneratedDocument Model** — richer than GeneratedLetter (draft lifecycle, source map)
**B3. Document Export** — markdown → PDF/DOCX, saves back as secondary source

#### Phase C: Workflow Engine Upgrade

**C1. Active Workflows** — auto-trigger from classification + deadlines
**C2. Workflow→Generation Pipeline** — workflow steps produce documents

#### Phase D-F: Source Attribution, Chat Integration, KB Integration

### Required Schema Changes (NOT YET APPLIED)

```prisma
// Enhance TimelineEvent — add categories and source attribution
model TimelineEvent {
  // Existing fields...

  // New fields:
  category      TimelineCategory  // DOCUMENT, WORKFLOW, DEADLINE, PAYMENT, LIEN, CORRESPONDENCE, SYSTEM
  sourceDocumentId  String?       // For generated docs: link to source GeneratedDocument
  metadata      Json?             // Flexible event-specific data
}

enum TimelineCategory {
  DOCUMENT_RECEIVED
  DOCUMENT_CLASSIFIED
  WORKFLOW_STARTED
  WORKFLOW_COMPLETED
  WORKFLOW_STEP_COMPLETED
  DEADLINE_CREATED
  DEADLINE_MET
  DEADLINE_MISSED
  BENEFIT_PAYMENT
  LIEN_ACTION
  CORRESPONDENCE_GENERATED
  CORRESPONDENCE_EXPORTED
  SYSTEM_EVENT
}

// New model: GeneratedDocument (replaces GeneratedLetter for richer lifecycle)
model GeneratedDocument {
  id              String   @id
  claimId         String
  userId          String
  templateId      String
  documentType    String                  // What type of doc was generated
  triggerType     String                  // What triggered generation (workflow, manual, auto)
  triggerWorkflowId String?              // Which workflow triggered this

  // Content
  draftContent    String                  // Markdown with source annotations
  finalContent    String?                 // Examiner-edited final version

  // Source attribution
  sourceMap       Json                    // { field: { documentId, page, excerpt, confidence } }
  sourceDocs      String[]               // Document IDs used for population

  // Lifecycle
  status          GeneratedDocumentStatus // GENERATED → UNDER_REVIEW → FINALIZED → EXPORTED
  exportedDocumentId String?             // Points to Document record after export

  // Timestamps
  generatedAt     DateTime
  reviewedAt      DateTime?
  finalizedAt     DateTime?
  exportedAt      DateTime?
}

enum GeneratedDocumentStatus {
  GENERATED
  UNDER_REVIEW
  FINALIZED
  EXPORTED
}
```

### Audit Event Types to Add
- DOCUMENT_CLASSIFICATION_TRIGGERED
- WORKFLOW_AUTO_ACTIVATED
- DOCUMENT_GENERATION_TRIGGERED
- DOCUMENT_REVIEW_STARTED
- DOCUMENT_FINALIZED
- DOCUMENT_EXPORTED

## Test Baseline
- 1,646 unit tests passing
- 224 UPL tests passing
- 0 type errors

## Key Files to Read Before Continuing
1. `.claude/plans/hashed-sprouting-bunny.md` — the full approved plan
2. `server/services/document-classifier.service.ts` — current classifier (keyword stub)
3. `server/services/timeline.service.ts` — current timeline (date extraction only)
4. `server/services/document-pipeline.service.ts` — current pipeline (OCR→classify→extract→embed→timeline)
5. `server/services/workflow-engine.service.ts` — current workflow engine (passive data)
6. `server/services/letter-template.service.ts` — current template engine (simple token replace)
7. `server/data/workflow-definitions.ts` — 20 workflow definitions
8. `prisma/schema.prisma` — current schema
