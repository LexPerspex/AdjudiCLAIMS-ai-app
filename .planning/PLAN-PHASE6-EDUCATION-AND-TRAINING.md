# Phase 6 — Education & Training System

## Context

AdjudiCLAIMS's core philosophy: **"The product IS the training program."** Insurance companies experience 25-40% annual examiner turnover. New examiners make decisions without understanding the regulatory framework. Phase 6 builds the education backbone — Tier 1 dismissable terms, Tier 2 always-present regulatory education, 4 mandatory training modules with gated assessments, and 5 MVP decision workflows. Every deadline cited. Every regulation explained. Every decision transparent.

**Source documents:**
- `docs/product/ADJUDICLAIMS_REGULATORY_EDUCATION_SPEC.md` (57 entries)
- `docs/product/ADJUDICLAIMS_ONBOARDING_AND_TRAINING.md` (4 modules)
- `docs/product/ADJUDICLAIMS_DECISION_WORKFLOWS.md` (20 workflows, 5 MVP)
- `docs/foundations/WC_CLAIMS_EXAMINER_ROLES_AND_DUTIES.md` (legal duties)
- `docs/product/PRD_ADJUDICLAIMS.md` §6.5 (education requirements)

---

## Architecture Decisions

1. **Content as TypeScript constants** — 85 Tier 1 terms, 57 Tier 2 entries, 4 training modules, 5 workflow definitions are static regulatory content (like `INITIAL_DEADLINES` in `deadline-generator.ts`). Stored as typed constants in `server/data/`. User-specific state (dismissals, completions, progress) goes in DB.

2. **WorkflowProgress as new Prisma model** — Per-claim, per-user workflow state needs its own model rather than JSON on existing models.

3. **Training gate as preHandler** — Follows `requireAuth()` pattern in `server/middleware/rbac.ts`. Applied per-route, not globally, so health/auth/training/education routes stay exempt.

4. **SessionUser extension** — Add `isTrainingComplete` to session to avoid DB round-trip on every request. Set during login from EducationProfile.

---

## File Inventory

### New Files (15)

| # | File | Purpose |
|---|------|---------|
| 1 | `server/data/tier1-terms.ts` | ~85 dismissable term definitions (6 categories) |
| 2 | `server/data/tier2-education.ts` | 57 always-present education entries from spec |
| 3 | `server/data/training-modules.ts` | 4 training module definitions + 53 assessment questions |
| 4 | `server/data/workflow-definitions.ts` | 5 MVP workflow step definitions |
| 5 | `server/services/education-profile.service.ts` | Profile CRUD, term dismissal, mode management |
| 6 | `server/services/training-module.service.ts` | Module content, assessment grading, gate check |
| 7 | `server/services/workflow-engine.service.ts` | Workflow lifecycle (start, step, skip, progress) |
| 8 | `server/middleware/training-gate.ts` | preHandler: block untrained users (403) |
| 9 | `server/routes/education.ts` | Education profile + term dismissal endpoints |
| 10 | `server/routes/training.ts` | Training module + assessment endpoints |
| 11 | `server/routes/workflows.ts` | Decision workflow endpoints |
| 12 | `tests/unit/education-profile.test.ts` | ~25 tests |
| 13 | `tests/unit/training-module.test.ts` | ~28 tests |
| 14 | `tests/unit/workflow-engine.test.ts` | ~22 tests |
| 15 | `tests/unit/training-gate.test.ts` | ~10 tests |

### Modified Files (5)

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add `WorkflowProgress` model + `WorkflowStepStatus` enum |
| 2 | `server/middleware/rbac.ts` | Add `isTrainingComplete` to `SessionUser` |
| 3 | `server/routes/auth.ts` | Fetch education profile during login → set session flag |
| 4 | `server/index.ts` | Register 3 new route plugins |
| 5 | All existing test files | Add `isTrainingComplete: true` to mock users |

---

## Data Model: Content Structure

### Tier 1 Terms (~85)

```typescript
interface Tier1Term {
  id: string;                    // 'benefits_awe', 'medical_qme'
  abbreviation: string;          // 'AWE'
  fullName: string;              // 'Average Weekly Earnings'
  definition: string;            // Plain English, zero-knowledge baseline
  category: 'BENEFITS' | 'MEDICAL' | 'LEGAL_PROCESS' | 'REGULATORY_BODIES' | 'CLAIM_LIFECYCLE' | 'DOCUMENTS_FORMS';
  featureContexts: FeatureContext[];
}
```

Categories: Benefits (~15), Medical (~20), Legal Process (~15), Regulatory Bodies (~10), Claim Lifecycle (~15), Documents/Forms (~10)

### Tier 2 Education (57 entries)

```typescript
interface Tier2EducationEntry {
  id: string;                    // 'ins_790_03_h_1'
  title: string;
  authority: string;             // 'Cal. Ins. Code § 790.03(h)(1)'
  standard: string;              // What it means in practice
  consequence: string;           // What happens if violated
  commonMistake: string;
  productHelps: string;
  youMust: string;
  escalationTrigger: string;
  featureContexts: FeatureContext[];
}
```

4 parts: Insurance Code §790.03(h) (16), CCR Title 10 (15), Labor Code (16), CCR Title 8 (10)

### Training Modules (4)

| Module | Duration | Questions | Passing | Type |
|--------|----------|-----------|---------|------|
| 1: CA WC Framework | 30 min | 15 MC | 80% (12/15) | Multiple choice |
| 2: Legal Obligations | 30 min | 10 scenario | 80% (8/10) | Scenario-based |
| 3: UPL Boundary | 20 min | 20 classification | **90%** (18/20) | Zone classification |
| 4: Using AdjudiCLAIMS | 20 min | 8 checkpoints | **100%** (8/8) | Interactive |

### Workflows (5 MVP)

| # | Workflow | Steps | UPL Zone | Authority |
|---|----------|-------|----------|-----------|
| 1 | New Claim Intake | 7 | GREEN | 10 CCR 2695.5(b), LC 5401 |
| 2 | Three-Point Contact | 5 | GREEN | 10 CCR 2695.5(e), 8 CCR 10109 |
| 3 | Coverage Determination | 5+3 branches | GREEN/YELLOW | 10 CCR 2695.7(b), LC 5402 |
| 4 | TD Benefit Initiation | 7 | GREEN | LC 4650, LC 4653 |
| 5 | Denial Issuance | 6 | GREEN/YELLOW | 10 CCR 2695.7(b)(1) |

---

## Schema Addition

```prisma
enum WorkflowStepStatus {
  PENDING
  COMPLETED
  SKIPPED
  @@map("workflow_step_status")
}

model WorkflowProgress {
  id           String    @id @default(cuid())
  claimId      String    @map("claim_id")
  userId       String    @map("user_id")
  workflowId   String    @map("workflow_id")
  stepStatuses Json      @default("[]") @map("step_statuses")
  isComplete   Boolean   @default(false) @map("is_complete")
  startedAt    DateTime  @default(now()) @map("started_at")
  completedAt  DateTime? @map("completed_at")

  claim Claim @relation(fields: [claimId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  @@unique([claimId, userId, workflowId])
  @@map("workflow_progress")
}
```

---

## API Endpoints

### Education (`/api/education/*`) — NO training gate

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/education/profile` | Get user's education state |
| GET | `/api/education/terms` | Get all Tier 1 terms with dismissal state |
| POST | `/api/education/terms/:termId/dismiss` | Dismiss a Tier 1 term |
| POST | `/api/education/terms/reenable` | Re-enable dismissed terms (all or by category) |
| GET | `/api/education/content/:featureId` | Get Tier 2 entries for a feature |
| GET | `/api/education/mode` | Get current mode (NEW/STANDARD) |

### Training (`/api/training/*`) — NO training gate

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/training/status` | Training completion status |
| GET | `/api/training/modules` | List modules with completion state |
| GET | `/api/training/modules/:moduleId` | Module content (no answers!) |
| POST | `/api/training/modules/:moduleId/submit` | Submit assessment, get graded result |

### Workflows (`/api/workflows/*`, `/api/claims/:claimId/workflows/*`) — WITH training gate

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/workflows` | List available workflows |
| GET | `/api/workflows/:workflowId` | Get workflow definition |
| POST | `/api/claims/:claimId/workflows/:workflowId/start` | Start workflow for claim |
| PATCH | `/api/claims/:claimId/workflows/:workflowId/steps/:stepId` | Complete or skip step |
| GET | `/api/claims/:claimId/workflows/:workflowId/progress` | Get progress |

---

## Services

### education-profile.service.ts
- `getOrCreateProfile(userId)` — upsert EducationProfile
- `dismissTerm(userId, termId)` — validate against TIER1_TERMS, push to dismissedTerms
- `reEnableTerms(userId, category?)` — remove from dismissedTerms
- `getTermsWithDismissalState(userId)` — merge static terms + user dismissals
- `getEducationMode(userId)` — 'NEW' if learningModeExpiry > now, else 'STANDARD'
- `getEducationContentForFeature(featureId)` — pure function, filter TIER2 by context
- `activateNewExaminerMode(userId)` — set learningModeExpiry = now + 30 days

### training-module.service.ts
- `getModule(moduleId)` — static lookup (strip correctOptionId for client)
- `getAllModules()` — all 4 modules
- `getTrainingStatus(userId)` — per-module completion from EducationProfile JSON
- `submitAssessment(userId, moduleId, answers)` — grade, check passing score, update DB
- `checkTrainingGate(userId)` — read isTrainingComplete from profile

### workflow-engine.service.ts
- `getWorkflow(workflowId)` — static lookup
- `startWorkflow(userId, claimId, workflowId)` — create WorkflowProgress
- `completeStep(userId, claimId, workflowId, stepId)` — update step status
- `skipStep(userId, claimId, workflowId, stepId, reason)` — mark skipped with reason
- `getWorkflowProgress(userId, claimId, workflowId)` — merge definitions + progress

---

## Execution Waves

### Wave 1: Content data + schema (parallel, no dependencies)
- `server/data/tier1-terms.ts` — 85 terms
- `server/data/tier2-education.ts` — 57 entries
- `server/data/training-modules.ts` — 4 modules + 53 questions
- `server/data/workflow-definitions.ts` — 5 workflows
- `prisma/schema.prisma` — WorkflowProgress model
- `server/middleware/rbac.ts` — add isTrainingComplete to SessionUser

### Wave 2: Services + middleware (depends on Wave 1)
- `server/services/education-profile.service.ts`
- `server/services/training-module.service.ts`
- `server/services/workflow-engine.service.ts`
- `server/middleware/training-gate.ts`

### Wave 3: Routes + integration (depends on Wave 2)
- `server/routes/education.ts`
- `server/routes/training.ts`
- `server/routes/workflows.ts`
- `server/routes/auth.ts` — modify login to set isTrainingComplete
- `server/index.ts` — register 3 new plugins

### Wave 4: Tests + existing test updates (depends on Wave 3)
- `tests/unit/education-profile.test.ts`
- `tests/unit/training-module.test.ts`
- `tests/unit/workflow-engine.test.ts`
- `tests/unit/training-gate.test.ts`
- Update all existing test mock users with `isTrainingComplete: true`

---

## Training Gate Scope

**Exempt (requireAuth only):** health, auth, training, education
**Protected (requireAuth + requireTrainingComplete):** claims, documents, calculator, deadlines, investigation, chat, UPL, workflows

Training gate integration into existing routes is done in Wave 4 alongside test updates to avoid breaking existing tests.

---

## Verification

1. `npm run typecheck` — 0 errors
2. `npm run lint` — 0 errors
3. `npm run test` — all tests pass (target: ~1,214 = 1,129 existing + ~85 new)
4. Phase 6 exit criteria from plan file:
   - Tier 1 dismissable terms render and dismiss correctly (~85 terms)
   - Tier 2 always-present entries accessible for all decision-point features
   - Pre-use training gate blocks untrained users
   - All 4 training modules functional with assessments
   - New examiner mode activates for new users
   - 5 MVP workflows functional end-to-end
   - All education interactions logged to audit trail
