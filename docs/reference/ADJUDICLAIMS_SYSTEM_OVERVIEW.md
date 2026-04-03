# AdjudiCLAIMS by Glass Box — Complete System Overview

> **"From Black Box to Glass Box."** Augmented Intelligence for CA Workers' Compensation Claims Professionals.
> Every deadline cited. Every regulation explained. Every decision transparent.

**Generated:** 2026-04-03
**Status:** MVP ~85% complete — 3,068 tests passing (100%)
**Organization:** [Glass-Box-Solutions-Inc](https://github.com/Glass-Box-Solutions-Inc) / [LexPerspex](https://github.com/LexPerspex)

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [Development Environment](#development-environment)
3. [System Architecture](#system-architecture)
4. [The Database — 31 Models](#the-database--31-models)
5. [The Backend — 80+ API Endpoints](#the-backend--80-api-endpoints)
6. [The 5-Layer Middleware Stack](#the-5-layer-middleware-stack)
7. [The AI System](#the-ai-system)
8. [The Frontend — 25 Routes](#the-frontend--25-routes)
9. [UPL Compliance — The Foundational Legal Constraint](#upl-compliance--the-foundational-legal-constraint)
10. [Security](#security)
11. [HIPAA Compliance](#hipaa-compliance)
12. [SOC 2 Compliance](#soc-2-compliance)
13. [Education System](#education-system--the-product-is-the-training)
14. [Workflow Automation](#workflow-automation)
15. [Reporting & DOI Audit Readiness](#reporting--doi-audit-readiness)
16. [Document Processing Pipeline](#document-processing-pipeline)
17. [Build Status](#current-build-status)
18. [What This System Cannot Do](#what-this-system-cannot-do-by-design)

---

## The Big Picture

AdjudiCLAIMS is an **AI-powered claims management information tool** for California Workers' Compensation claims examiners. Built by Glass Box Solutions, Inc. under the development alias LexPerspex, it is Phase 2 of the Adjudica platform (Phase 1 serves defense attorneys).

The core philosophy is captured in the company tagline: **"From Black Box to Glass Box."** Every AI output must be transparent, cited, and explainable. The system is not an oracle that tells you what to do — it is a glass box that shows you everything it knows, where it came from, and why it said it. **The product IS the training program.**

The app is currently **~85% complete toward MVP**, with **3,068 tests at 100% pass rate**, zero TypeScript errors, zero lint errors, and a working CI/CD pipeline. Three blockers remain before production:
1. Cloud Run staging deployment needs verification
2. `npx prisma migrate deploy` needs to run on production databases
3. UPL review package needs licensed CA attorney written sign-off

### What It Is

- Factual data analysis and document summarization
- Regulatory deadline tracking with statutory citations
- Benefit calculations (TD rate, payment schedules, death benefits)
- Medical record extraction (diagnoses, WPI, restrictions)
- MTUS guideline matching for utilization review
- Investigation completeness tracking
- Contextual regulatory education at every decision point
- AI-assisted drafting of administrative correspondence
- Coverage determination (AOE/COE) per body part tracking
- Medical billing overview with OMFS comparison
- Lien management with line-item fee schedule comparison
- Compliance reporting and DOI audit readiness scoring

### What It Is NOT

- **NOT a legal advisor** — Claims examiners are not attorneys. AI cannot provide legal advice.
- **NOT a claims automation system** — The examiner makes all substantive decisions.
- **NOT a replacement for defense counsel** — Legal issues are referred to licensed attorneys.
- **NOT a black box** — Every output cites its source. Every regulation is explained.

---

## Development Environment

### Local Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend (Vite dev server) | React Router 7 (SSR) | 4900 |
| Backend API | Fastify 5 | 4901 |
| Database | PostgreSQL 16 (Docker Compose) | 5444 |
| Workflow engine | Temporal | 7233 |

Developers run `npm run dev` for the frontend and API together, and `docker-compose up` for PostgreSQL. The full stack also runs two **Temporal worker processes**: a **document worker** (async OCR/classification/embedding pipeline) and an **LLM worker** (async AI generation tasks). Both start with `npm run dev:all`.

### Key Technologies

| Layer | Technology |
|---|---|
| Frontend | React Router 7, TanStack Query 5, Zustand 5, Tailwind CSS 4 |
| Backend | Fastify 5, Prisma 6, PostgreSQL 16 |
| AI — Chat/Classification | Anthropic Claude (via SDK 0.80) |
| AI — RAG/Embeddings | Google Vertex AI (Voyage Large 2, 1024-dim) |
| Document Processing | Google Document AI (OCR) |
| File Storage | Google Cloud Storage |
| Async Orchestration | Temporal 1.15 |
| Password Hashing | Argon2id |
| MFA | TOTP via RFC 6238 (`@otplib/preset-default`) |
| Error Tracking | Sentry 10.46 |
| Schema Validation | Zod 4.3 |
| Form Management | React Hook Form 7 |
| Icons | Lucide React 1.7 |

### NPM Scripts

```bash
npm run dev          # Start Vite dev server (frontend + API)
npm run dev:all      # Dev + both Temporal workers
npm run build        # Production build
npm run typecheck    # TypeScript strict check (zero-error gate)
npm run lint         # ESLint
npm run format       # Prettier

npm run test         # Unit + SOC 2 tests (Vitest)
npm run test:integration  # Integration tests (30s timeout)
npm run test:upl     # UPL compliance acceptance (60s timeout)
npm run test:all     # All suites in sequence
npm run test:rag-eval # RAG retrieval quality evaluation

npx prisma migrate dev     # Apply migrations (development)
npx prisma migrate deploy  # Apply migrations (production)
npx prisma generate        # Regenerate Prisma client
npx prisma studio          # Open Prisma Studio
```

### CI/CD: 10-Step Google Cloud Build Pipeline

1. `npm ci` (stubs local sibling classifier package)
2. `npx prisma generate`
3. `npm run typecheck` (zero-error gate)
4. `npm run test` (unit + SOC 2)
5. `npm run test:upl` (UPL acceptance)
6. `docker build` (multi-stage: deps → build → production, `node:20-slim`, non-root user `appuser` uid 1001)
7. Push image to GCP Artifact Registry
8. Deploy API service to Cloud Run (1–10 instances, 1 CPU, 1 GB RAM)
9. Deploy document worker (1–5 instances, 2 GB RAM, no CPU throttling)
10. Deploy LLM worker (1–5 instances, 1 GB RAM, no CPU throttling)

All secrets (DB URL, API keys, session secret, Sentry DSN, Temporal API key) come from **GCP Secret Manager**. Nothing is hardcoded.

---

## System Architecture

```
Browser
  └→ React Router 7 SSR (25 route files, ~9,100 LOC)
       └→ Fastify 5 REST API (~38,800 LOC)
             ├→ 25 route modules (80+ endpoints)
             ├→ 60+ service files (business logic)
             ├→ 5 middleware layers (auth, RBAC, training gate, claim access, audit)
             ├→ Prisma 6 ORM → PostgreSQL 16 (31 models, ~500 columns)
             ├→ Anthropic Claude API (primary LLM)
             ├→ Google Vertex AI Vector Search (embeddings, 1024-dim Voyage Large 2)
             ├→ Google Document AI (OCR)
             ├→ Google Cloud Storage (document files)
             └→ Temporal Workers (async document + LLM pipelines)
```

The frontend and API share a Node.js process in development. In production, three separate Cloud Run services run from the same Docker image: the **API server**, the **document processing worker**, and the **LLM worker**.

---

## The Database — 31 Models

PostgreSQL 16 via **Prisma 6 ORM**. Two migrations: initial schema and an auth/soft-delete migration.

> **Note on embeddings:** Despite PostgreSQL 16 supporting pgvector, the actual 1024-dimensional vectors (Voyage Large 2) are stored externally in **Google Vertex AI Vector Search**. PostgreSQL stores only text and metadata. The `embeddingModel` fields are pointers to the external vector store, not inline vectors. This is intentional for scalability.

### Tenancy & Users

**Organization** — Top-level multi-tenant container. Type: `CARRIER`, `TPA`, `SELF_INSURED`. Every claim, user, and audit event is scoped to an organization.

**User** — Stores Argon2id hashed password, email verification state, TOTP MFA secret and enabled flag, failed login count, lockout timestamp, last login, password changed date, role (`CLAIMS_EXAMINER`, `CLAIMS_SUPERVISOR`, `CLAIMS_ADMIN`), and soft-delete fields.

### Claims

**Claim** — The central entity. Tracks claimant name, date of injury, affected body parts (JSON), employer, insurer, status (`OPEN`, `UNDER_INVESTIGATION`, `ACCEPTED`, `DENIED`, `CLOSED`, `REOPENED`), financial reserves (Decimal precision: indemnity / medical / legal / lien), total paid amounts, key dates, and flags: `isLitigated`, `hasApplicantAttorney`, `isCumulativeTrauma`. Soft-deleted.

### Documents & RAG Infrastructure

**Document** — File metadata, OCR status (`PENDING → PROCESSING → COMPLETE / FAILED`), document type (24 types), classification confidence, access level (`SHARED`, `ATTORNEY_ONLY`, `EXAMINER_ONLY`), and privilege flags: `containsLegalAnalysis`, `containsWorkProduct`, `containsPrivileged`.

**DocumentChunk** — The RAG retrieval unit. 512-token chunks with 60-token overlap, 3-level heading structure, parent-child indexing (parent chunks at 2048 tokens for broader LLM context), token count, and a `contextPrefix` field included in embeddings but excluded from LLM responses.

**ExtractedField** — Structured data from documents (dates, dollar amounts, names, WPI ratings, diagnoses) with per-field confidence scores and source page references.

**TimelineEvent** — Auto-generated chronological events from document dates and claim actions.

### Processing & Tracking

**RegulatoryDeadline** — One record per statutory deadline type per claim. 10 deadline types: 15-day acknowledgment, 40-day determination, first TD payment, subsequent TD payments, and utilization review variants. Stores `dueDate`, `status` (`PENDING / MET / MISSED / WAIVED`), and `statutoryAuthority` citation (e.g., `"10 CCR 2695.5(b)"`). Unique constraint on `(claimId, deadlineType)`.

**InvestigationItem** — 10 checklist items per claim: three-point contact variants (employer, employee, treating physician), recorded statement, employer report, medical records, DWC-1, index bureau check, AWE verification, initial reserves set. Unique constraint on `(claimId, itemType)`.

**BenefitPayment** — TD/PD payment records. `isLate` and `penaltyAmount` (10% per LC 4650(c)) are computed automatically when the actual payment date exceeds the due date.

### Chat

**ChatSession** — Groups messages per user per claim.

**ChatMessage** — Individual messages with `uplZone` (`GREEN / YELLOW / RED`), `wasBlocked`, and `disclaimerApplied` baked into every AI response row — permanent immutable record of how the AI behaved.

### Education

**EducationProfile** — Per-user. Tracks dismissed Tier 1 terms (JSON array), training module completion (JSON map), `isTrainingComplete` gate, learning mode expiry, monthly compliance review history, quarterly refresher completion.

### Workflow & Audit

**WorkflowProgress** — Per-user, per-claim, per-workflow step tracking as JSON. Unique on `(claimId, userId, workflowId)`.

**AuditEvent** — Immutable, append-only. 60+ event types. No `updatedAt` column — physically cannot be updated. Captures user ID, claim ID, event type, structured event data (never PII content), UPL zone, IP address, user agent, and timestamp.

### Phase 10: Letters, Counsel, Liens

**GeneratedLetter** — Five letter types: TD benefit explanation, TD payment schedule, waiting period notice, employer notification (LC 3761), benefit adjustment notice.

**CounselReferral** — Factual summaries for defense counsel. Status: `PENDING → SENT → RESPONDED → CLOSED`. Contains the legal issue flagged (no analysis), factual summary, counsel email, and counsel response.

**Lien / LienLineItem** — Filed liens with a 10-stage workflow status (from `RECEIVED` through `RESOLVED_BY_ORDER`). Line items include CPT codes, amounts claimed, OMFS allowed rates, and automatic overcharge flag.

### AOE/COE & Medical Billing

**ClaimBodyPart** — One record per affected body part per claim. Status: `PENDING`, `ADMITTED`, `DENIED`, `UNDER_INVESTIGATION`.

**CoverageDetermination** — Append-only audit log of every status change on every body part. Records who made the determination, on what basis, and optional counsel referral linkage.

**MedicalPayment** — Direct payments and lien-based payments at body-part level, with CPT code, provider, service date, and payment type (`DIRECT_PAYMENT`, `LIEN_PAYMENT`, `PHARMACY`, `DME`, `DIAGNOSTICS`).

### Knowledge Graph (6 Models)

**GraphNode** — 13 node types: `PERSON`, `ORGANIZATION`, `BODY_PART`, `CLAIM`, `DOCUMENT`, `PROCEEDING`, `LEGAL_ISSUE`, `LIEN`, `SETTLEMENT`, `TREATMENT`, `MEDICATION`, `RATING`, `BENEFIT`. Stores canonical name, aliases JSON, properties JSON, source document IDs, confidence, and human-verification lock.

**GraphEdge** — 35+ relationship types. Implements **Hebbian neuro-plasticity**:
- `weight` decays 5% every 30-day cycle (half-rate if traversed within 30 days)
- `traversalCount` and `lastTraversedAt` track usage
- Edges below 0.1 confidence are zeroed and flagged for review
- Contradiction tracking when documents contain conflicting facts: `contradictionStatus` (`NONE / UNRESOLVED / HUMAN_CONFIRMED / HUMAN_REJECTED / AUTO_RESOLVED`)

**GraphSummary** — Natural language summaries of node clusters for LLM context injection.

**GraphMaturity** — 5-facet completeness score: medical, insurance/benefit, employment, regulatory, evidential. Label: `NASCENT → GROWING → MATURE → COMPLETE`.

**GraphStatusChange** — Immutable audit log of property changes on graph entities over time.

**GraphQuerySignal** — Tracks query routing, tier selection, escalation, latency, and success/failure for RAG quality observability.

---

## The Backend — 80+ API Endpoints

### Authentication (9 endpoints)

Full password-based auth with TOTP MFA:
- `POST /auth/register` — Creates account, triggers 24-hour email verification token
- `POST /auth/verify-email` — Token-based gate before first login
- `POST /auth/login` — Password check + account lockout (5 failures → 30-min lock) + optional MFA challenge
- `POST /auth/logout` — Session destruction
- `GET /auth/session` — Returns current authenticated user
- `POST /auth/change-password` — Requires current password verification
- `POST /auth/mfa/setup` — Generates TOTP secret + `otpauthUri` for QR code
- `POST /auth/mfa/verify-setup` — Verifies 6-digit TOTP code, persists secret, sets `mfaEnabled = true`
- `POST /auth/mfa/verify` — Completes MFA challenge during login, promotes `mfaPending` session

### Claims (4 endpoints)

Creating a claim automatically generates all regulatory deadline records and investigation checklist items.

- `GET /api/claims` — paginated list (examiners: assigned claims only; supervisors/admins: all org claims)
- `GET /api/claims/:id` — full claim detail
- `POST /api/claims` — create claim (auto-generates deadlines + investigation checklist)
- `PATCH /api/claims/:id` — update status, reserves, dates

### Documents (4 endpoints)

- `POST /api/claims/:id/documents` — multipart upload (50 MB max, PDF/DOCX/JPEG/PNG/TIFF). Returns `202 Accepted` immediately; processing pipeline runs asynchronously via Temporal.
- `GET /api/claims/:id/documents` — paginated list with OCR status, classification, privilege flags
- `GET /api/documents/:id` — full detail with extracted fields
- `DELETE /api/documents/:id` — supervisors/admins only

### AI Chat (4 endpoints)

- `POST /api/claims/:id/chat` — Core AI endpoint. Runs full 3-stage UPL pipeline: classify → generate → validate. Returns zone badge, citations, disclaimer, block status.
- `GET /api/claims/:id/chat/sessions` — list sessions (examiners: own sessions only)
- `GET /api/chat/sessions/:id/messages` — paginated message history
- `POST /api/claims/:id/counsel-referral` — generates 6-section factual summary for defense counsel

### Benefits Calculator (3 endpoints — GREEN zone, arithmetic only)

- `POST /api/calculator/td-rate` — TD rate from AWE and DOI per LC 4653
- `POST /api/calculator/td-benefit` — Full TD benefit with 14-day payment schedule per LC 4650
- `POST /api/calculator/death-benefit` — Death benefit calculation per LC 4700–4706

### Deadlines (3 endpoints)

- `GET /api/claims/:id/deadlines` — claim deadlines with real-time urgency classification
- `GET /api/deadlines` — cross-claim dashboard (filterable by urgency: OVERDUE / DUE_TODAY / DUE_SOON / UPCOMING)
- `PATCH /api/deadlines/:id` — mark `MET` or `WAIVED`

### Investigation (2 endpoints)

- `GET /api/claims/:id/investigation` — full checklist with completion percentage by category
- `PATCH /api/claims/:id/investigation/:itemId` — toggle complete/incomplete with timestamp

### Coverage / AOE-COE (5 endpoints)

- `GET/POST /api/claims/:id/body-parts` — list or add body parts
- `POST /api/claims/:id/coverage-determinations` — record a determination (admit/deny/investigate)
- `GET /api/claims/:id/coverage-determinations` — full determination history
- `GET /api/claims/:id/coverage-summary` — summary counts by status

### Workflows (5 endpoints)

- `GET /api/workflows` / `GET /api/workflows/:id` — workflow definitions catalog
- `POST /api/claims/:id/workflows/:wfId/start` — initiate a workflow
- `PATCH /api/claims/:id/workflows/:wfId/steps/:stepId` — complete or skip a step
- `GET /api/claims/:id/workflows/:wfId/progress` — current progress state

### Education & Training (~15 endpoints)

- Education profile (get/update), Tier 1 term dismissals and re-enablement
- Tier 2 regulatory content by feature context
- Regulatory change acknowledgment feed
- Monthly compliance review completion
- Quarterly refresher submission
- Training: list modules, get content (answer keys never exposed), submit assessment

### Compliance & Audit (8 endpoints)

- `GET /api/compliance/examiner` — personal compliance score and trend
- `GET /api/compliance/team` — org-wide metrics with UPL zone distribution (supervisors+)
- `GET /api/compliance/admin` — full DOI audit readiness score (admins only)
- `GET /api/audit/claim/:id` — claim-level audit trail with date range filtering
- `GET /api/audit/user/:id` — user activity audit (supervisors+)
- `GET /api/audit/upl` — UPL compliance events feed (supervisors+)
- `GET /api/audit/export` — export as JSON or CSV (admins only)

### Reports — DOI Audit-Ready (4 endpoints)

- `GET /api/reports/claim/:id/file-summary` — CCR 10101 claim file summary
- `GET /api/reports/claim/:id/activity-log` — CCR 10103 activity log with date range
- `GET /api/reports/deadline-adherence` — org-wide deadline adherence statistics
- `GET /api/reports/audit-readiness` — DOI audit readiness score

### Additional Endpoints

- `POST /api/mtus/match` / `GET /api/mtus/:id` — MTUS/ACOEM treatment guideline matching
- `POST /api/upl/classify` / `POST /api/upl/validate` — UPL classification and output validation
- Medical billing, lien management, letter generation, referrals, timeline, organizations, sandbox, DSAR/data management, health checks

---

## The 5-Layer Middleware Stack

Every authenticated, claim-scoped request passes through these layers in order:

1. **`requireAuth()`** — Returns 401 if no session cookie
2. **`requireRole(...roles)`** — Returns 403 if user role not in allowed list
3. **`requireTrainingComplete()`** — Returns 403 if `user.isTrainingComplete === false`. Exempt: health, auth, training, education endpoints.
4. **`verifyClaimAccess()`** — On claim-scoped routes: claim must exist in user's org; examiners must be assigned to the claim; supervisors/admins see all org claims.
5. **`logAuditEvent()`** — Immutable append-only audit. Failures never crash requests.

**Additional middleware:**
- **`anomaly-detection.ts`** — Passive sliding-window detection: failed auth spikes (>10/IP/15min), bulk data access (>50 records/user/15min), rapid claim switching (>20 distinct claim IDs/user/15min). Anomalies audit-logged as `ANOMALY_DETECTED`.

---

## The AI System

### The Three-Stage UPL Pipeline

Every chat message passes through three independent enforcement layers. None can bypass the others.

#### Stage 1 — Query Classification (pre-generation, ~0–1000ms)

**Regex pre-filter (~0ms):** 21 patterns across three categories:
- **7 RED patterns:** "should I deny?", "is this a strong claim?", coverage opinions, liability conclusions, settlement recommendations, case valuations, outcome predictions
- **7 GREEN patterns:** WPI inquiries, document summarization, deadline lookups, factual extractions, benefit calculations
- **7 ADVERSARIAL patterns:** role-play attempts ("pretend you're an attorney"), hypothetical framing, prompt injection ("ignore your instructions"), factual reframing ("as a factual matter, is this strong?"), confidentiality framing ("just between us")

Resolves ~60% of queries instantly at 85–95% confidence. **Conservative default: uncertain = RED.**

**LLM classification (~0.5–1s, for novel/borderline queries):** Claude Haiku at temperature 0 (deterministic), max 256 tokens. Returns `{"zone":"GREEN|YELLOW|RED","reason":"...","confidence":0.0}`. Falls back to keyword-only on API error. On any error, defaults to RED.

**If RED:** Return blocked message immediately. The generation LLM is never called.

#### Stage 2 — RAG Retrieval + Generation

**Document retrieval via Hybrid Search (Reciprocal Rank Fusion):**
- Vector similarity: Voyage Large 2 embeddings, Vertex AI Vector Search, top-50 candidates, weight **0.6**
- PostgreSQL FULLTEXT keyword search: top-50 results, weight **0.4**
- Fusion: `fusedScore = 0.6×(1/(60+rank_vector)) + 0.4×(1/(60+rank_keyword))`
- Returns top 5 chunks with parent content (2048-token windows) for broader LLM context
- **Access control enforced at DB query level:** `ATTORNEY_ONLY`, `containsLegalAnalysis`, `containsWorkProduct`, `containsPrivileged` documents excluded before retrieval

**Graph context:** If claim maturity > `NASCENT`, up to 20 nodes and 30 edges are injected, filtered through 5-layer examiner UPL access control.

**LLM generation:**
- Temperature: 0.3 | Max tokens: 4096
- System prompt: role-constrained examiner case chat prompt
- **Agentic tool loop:** up to 3 rounds, 5 tools:
  1. `search_documents` — Hybrid search with optional document type filter
  2. `query_graph` — Entity lookup by canonical name
  3. `calculate_benefit` — TD rate calculation given AWE and injury date
  4. `check_deadlines` — List regulatory deadlines by urgency
  5. `lookup_regulation` — Query in-memory regulatory KB by citation (e.g., "LC 4650")

RED zone blocks all tool execution (tools return "blocked" messages immediately).

#### Stage 3 — Output Validation (post-generation)

**24 prohibited output patterns** (regex scan, always runs):

| Category | Examples |
|---|---|
| Recommendation actions | "you should deny/accept/settle/refer/increase" |
| Direct recommendations | "I recommend", "I suggest" |
| Strategy advice | "best strategy/approach", "optimal approach" |
| Legal directives | "the law requires you to" |
| Case valuations | "claim/case is worth", "value range of $X to $Y" |
| Strength assessments | "strong/weak case/claim/position" |
| Case law references | "under [Case Name] v. [Name]", "based on [Case Name] ruling" |
| Coverage conclusions | "coverage exists/does not exist" |
| Liability assessments | "liability is/appears/seems clear/likely" |
| Outcome predictions | "will likely/probably win" |
| Compensability | "claim/injury is compensable", "arose out of employment" |
| Scope determinations | "falls within scope of employment" |
| Validity | "claim is valid/invalid/barred" |
| Attorney role claims | "as your legal advisor/attorney", "my legal analysis/opinion" |
| Defense strategy | "best defense strategy", "optimal approach is to deny" |

Any `CRITICAL` match → response blocked. Block message: *"The AI response was blocked because it contained language that may constitute legal advice."*

Optional Stage 3B: LLM validation for subtle advisory framing not caught by regex.

**YELLOW zone responses** get the appropriate feature-specific disclaimer appended before delivery:
- Comparable claims: "Statistical comparison only. These ranges do not predict individual outcomes. Settlement decisions require defense counsel guidance."
- Litigation risk: "Risk factors are based on statistical patterns. Risk evaluation for individual claims is a legal analysis function."
- Medical inconsistency: "Factual observation only. Legal significance requires counsel review."
- Subrogation: "Factual observation. Legal analysis required before initiating subrogation."
- Reserve analysis: "Factual and statistical. Not a reserve recommendation."

```
Flow Summary:

Query
  → Stage 1: Classify → RED? → Blocked message + "generate counsel referral?" offer
  → not RED
  → Stage 2: Hybrid RAG retrieval + LLM (up to 3 tool rounds)
  → Stage 3: Validate → FAIL? → Blocked message
  → YELLOW? → Append feature-specific disclaimer
  → Persist to DB (uplZone, wasBlocked, disclaimerApplied stored on every message)
  → Return with zone badge, citations, provenance
```

### The System Prompts (3 Distinct, ~4,100 Words Total)

**Examiner Case Chat (~1,800 words):** Primary prompt. Defines GREEN behaviors (summarize medical records, calculate benefits, present deadlines, match MTUS), YELLOW behaviors (flag cumulative trauma/apportionment/subrogation — data only, with disclaimer), RED behaviors (block legal conclusions, coverage opinions, settlement valuations, case law, outcome predictions). Every assertion must cite source documents by name and page. Forbidden language: "you should," "I recommend," "best strategy," "this claim is worth."

**Examiner Draft Chat (~1,700 words):** Document editing assistant. Can draft: benefit notification letters, employer correspondence, investigation checklists, compliance reports, medical summaries, counsel referrals. Cannot draft: denial letters with legal reasoning, settlement agreements, legal position statements, WCAB/court filings.

**Counsel Referral (~600 words):** Generates 6-section factual summaries for defense counsel (Claim Overview, Medical Evidence Summary, Benefits Status, Claim Timeline, Legal Issue Identified, Documents Available). Closes with: *"This factual summary is provided for defense counsel's review and legal analysis."* Zero legal analysis generated.

### The Regulatory Knowledge Base (In-Memory, ~100 Entries)

Defined in `server/data/regulatory-kb.ts`. Each entry: citation (e.g., `"LC 4650"`), title, full-text summary, enumerated key requirements, penalties/consequences, related citations, effective date, and examiner relevance note. Queried by the `lookup_regulation` agentic tool and cited inline in AI responses. Coverage: Labor Code (LC 3600, 4650, 4653, 4700–4706+), CCR Title 8 (UR, MTUS), CCR Title 10 (fair claims standards), Insurance Code.

### The Knowledge Graph

Six database models implement a dynamic knowledge graph that grows as documents are processed:

1. **Extract** 13 node types (persons, organizations, body parts, treatments, benefits, legal issues, etc.)
2. **Resolve** entities via 3-tier deduplication (exact match → fuzzy Levenshtein → semantic similarity)
3. **Link** with 35+ relationship types (`TREATS`, `EMPLOYS`, `PAYS`, `FILES_LIEN`, `ESTABLISHES`, `DECIDES`, etc.)
4. **Track contradictions** when documents state conflicting facts about the same relationship
5. **Decay** edge confidence via Hebbian learning (5%/30-day cycle, half-rate for recently traversed edges)
6. **Merge** near-duplicate nodes (>0.8 similarity within same claim + node type)
7. **Lock** human-verified nodes/edges from auto-decay or auto-merge

**Examiner graph access — 5 UPL filters** applied before any graph data reaches chat:
1. Remove nodes/edges sourced only from `ATTORNEY_ONLY` documents
2. Remove edges sourced only from privilege-flagged documents
3. Strip all properties from `LEGAL_ISSUE` and `SETTLEMENT` nodes except type/status/amount/date
4. Strip reasoning/analysis properties from `DECIDES` edges
5. Gate entire query on UPL zone (RED blocks all, YELLOW adds disclaimer)

Node confidence badges in the UI: "verified" (human-reviewed), "confident" (≥0.7), "suggested" (0.3–0.7), "ai_generated" (<0.3).

### Benefit Calculator (Pure GREEN Zone Arithmetic)

**TD Rate** = `max(min(AWE × 2/3, statutoryMax), statutoryMin)` per LC 4653.
- 2026 rates: Min $252.43/week, Max $1,761.71/week
- Outputs `wasClampedToMin` / `wasClampedToMax` flags so examiners understand statutory boundary hits

**Payment Schedule:** 14-day biweekly periods per LC 4650. First payment due 14 days after employer knowledge. Late detection: actual date vs. due date. Late payments automatically flag the 10% LC 4650(c) penalty.

**Death Benefits (LC 4700–4706):** Total dependents receive full statutory amount ($320,000 in 2026). Partial dependents receive proportional share. Paid at statutory max TD rate until exhausted.

Every calculation includes mandatory GREEN disclaimer: *"This benefit calculation applies the statutory formula to the data provided. It is arithmetic only. Verify inputs against source documents."*

### Comparable Claims (YELLOW Zone Statistical Data)

10 body-part profiles (Lumbar Spine, Cervical Spine, Shoulder, Knee, Wrist/Hand, Thoracic Spine, Hip, Elbow/Forearm, Ankle/Foot, Psyche/Mental Health) with:
- Settlement ranges (p25, median, p75, p90)
- Average TD duration (weeks)
- Average PD rating (WPI and PD%)
- Outcome distribution (% settled, award, denied, withdrawn)

Injury type multipliers: Cumulative Trauma 1.30×, Occupational Disease 1.25×, Specific Injury 1.0×.

Every result carries mandatory YELLOW disclaimer: *"Statistical comparison only. These ranges reflect historical patterns and do not predict individual claim outcomes. Settlement decisions require defense counsel guidance per Cal. Ins. Code §790.03(h)."*

---

## The Frontend — 25 Routes

### Authentication Flow
Login → MFA challenge (if enrolled) → **Training Gate** (mandatory 4-module quiz) → Dashboard. Registration → email verification → login.

### Training Gate
Mandatory 4-module quiz on Glass Box philosophy, UPL zones, examiner responsibilities, and AI transparency. Fully static (no API calls during the quiz). Passing sets `isTrainingComplete = true` — checked by middleware on every subsequent protected API call.

### Dashboard
Three panels: claims queue table (claim #, claimant, DOI, status, next deadline, days open), deadline summary (overdue/due soon/upcoming counts), and compliance score ring with 3 metrics.

### Claim Detail — 12 Tabs

| # | Tab | Key Features |
|---|---|---|
| 1 | **Overview** | Employer, DOI, examiner, carrier, policy, jurisdiction, body parts; financial reserves (inline editable); Knowledge Graph entities with confidence badges and provenance cards |
| 2 | **Coverage** | Per-body-part AOE/COE status (Admitted/Denied/Pending/Under Investigation); determination history timeline; counsel advice section; add body parts and record determinations inline |
| 3 | **Documents** | Drag-and-drop upload zone; documents table with real-time OCR status; file metadata; classification |
| 4 | **Deadlines** | Visual urgency timeline (red = overdue, amber = due soon, blue = upcoming); mark met / waive actions |
| 5 | **Investigation** | Progress bar with completion %; items grouped by category; toggle complete with timestamps; required-item highlighting |
| 6 | **Workflows** | Expandable workflow cards; step-by-step progress; statutory authority references; compliance notes; complete/skip actions |
| 7 | **Chat** | Full AI chat panel (see below) |
| 8–12 | **Letters, Liens, Medicals, Timeline, Referrals** | Routes implemented; UI in progress |

### The Chat Panel

Every AI message displays:
- **UPL Zone badge** — GREEN / YELLOW / RED color-coded on the message
- **RED zone:** Response replaced with "This question requires legal analysis..." + "Refer to Counsel" button
- **YELLOW zone:** Full response + ⚠️ italic disclaimer text beneath
- **GREEN zone:** Full response
- **Citations:** Expandable list — document name, excerpt, page number
- **Provenance cards:** Source document metadata with confidence badge
- **Typing indicator:** Animated dots while awaiting AI response
- **Session selector:** Dropdown if claim has multiple chat sessions
- **Footer:** "Privileged & Confidential" with version number

### Compliance Dashboard (Role-Aware)
- **Examiners:** Personal score ring, trend indicator, 3 compliance bars, training status
- **Supervisors/Admins:** Team score, UPL zone distribution (% of queries that were GREEN / YELLOW / RED), per-examiner score table

Auto-refreshes every 60 seconds.

### Education Hub — 3 Tabs
- **Glossary:** Searchable, category-grouped legal/regulatory terms with expandable definitions
- **Regulatory Education:** Entries with tier badges (Tier 1 dismissable vs. Tier 2 always-present), statutory authority, examiner consequences
- **Training:** Module list with completion status, required flag, duration, category filter

### Data Fetching
All API calls flow through a centralized `api.ts` wrapper that sets `Content-Type: application/json` and `credentials: include`. TanStack React Query provides caching (60-second stale time), automatic retry on failure, and invalidation on mutations. State management via Zustand (sidebar collapse state only — server state lives in React Query).

---

## UPL Compliance — The Foundational Legal Constraint

### Why It Exists

Under **Cal. Bus. & Prof. Code § 6125**, providing legal advice without a California bar license is a crime. Claims examiners handle legal-adjacent work daily but are not attorneys. An AI system deployed to examiners must not, under any circumstances, provide legal advice — even subtly.

### The Traffic-Light Framework

| Zone | Permitted | Example |
|---|---|---|
| **GREEN** | Factual, arithmetic, citations only | "The QME assigned 12% WPI for the lumbar spine per the 2025-03-01 report." |
| **YELLOW** | Statistical data with mandatory disclaimer | "Comparable lumbar claims resolved in $45K–$85K (p25–p75). ⚠️ Consult defense counsel before using in reserve discussions." |
| **RED** | Blocked — attorney referral only | "🛑 This requires legal analysis by a licensed attorney. Contact defense counsel." |

### 12 Non-Negotiable Acceptance Criteria

| # | Criterion | Test Method | Status |
|---|---|---|---|
| 1 | RED zone 100% blocked | 126+ legal advice queries | ✅ MET |
| 2 | GREEN zone ≤2% false positive | 126+ factual queries | ✅ MET |
| 3 | YELLOW zone 100% disclaimer | 62+ borderline queries | ✅ MET |
| 4 | Output validator 100% catch rate | 203 response variations | ✅ MET |
| 5 | Adversarial prompts 100% caught | 50+ injection attempts | ✅ MET |
| 6 | Attorney work product 0% retrieved | Examiner queries legal docs | ✅ MET |
| 7 | Case law KB 0% returned | Examiner queries case law | ✅ MET |
| 8 | All outputs cite sources | 500+ random outputs | ✅ MET |
| 9 | Benefit calculations 100% accurate | 50+ known scenarios | ✅ MET |
| 10 | Deadline calculations 100% accurate | 50+ known scenarios | ✅ MET |
| 11 | Audit trail 100% capture | All actions verified | ✅ MET |
| 12 | Licensed CA attorney written sign-off | Outside counsel review | ⏳ PENDING |

### Knowledge Base Access Control

Examiners cannot retrieve:
- **PDRS** (Permanent Disability Rating Schedule) — applying PDRS to specific claims is legal analysis
- **CRPC** (California Rules of Professional Conduct) — attorney ethics rules
- **Legal principles, case summaries, IRAC briefs** — reserved for licensed attorneys

---

## Security

### Authentication Security

| Control | Implementation |
|---|---|
| Password hashing | Argon2id (memory-hard, GPU-resistant) |
| Password requirements | 12+ chars, uppercase, lowercase, digit, special char |
| Account lockout | 5 failures → 30-minute lock |
| MFA | TOTP (RFC 6238), QR code generation |
| Email verification | UUID token, 24-hour expiry |
| Rate limiting | Global: 100 req/15 min; Login: 10 attempts/15 min |
| Session cookie | httpOnly, secure (prod), SameSite=lax, 8-hour maxAge, min 32-char secret |

### RBAC

Three roles: `CLAIMS_ADMIN > CLAIMS_SUPERVISOR > CLAIMS_EXAMINER`. Enforced at both the API layer (middleware) and the database query layer (org-scoped queries, claim assignment checks). Examiners cannot see claims not assigned to them — enforced in the database, not just the UI.

### Document Access Control

Applied at the **database query level** before data reaches the AI or UI. Excluded document types:
- `accessLevel = 'ATTORNEY_ONLY'`
- `containsLegalAnalysis = true`
- `containsWorkProduct = true`
- `containsPrivileged = true`

### Audit Logging — 60+ Event Types

| Category | Examples |
|---|---|
| Authentication | `USER_LOGIN`, `USER_LOGIN_FAILED`, `USER_ACCOUNT_LOCKED`, `USER_MFA_ENROLLED`, `USER_PASSWORD_CHANGED` |
| Claims | `CLAIM_CREATED`, `CLAIM_STATUS_CHANGED`, `COVERAGE_DETERMINATION`, `RESERVE_CHANGED` |
| Documents | `DOCUMENT_UPLOADED`, `DOCUMENT_CLASSIFIED`, `DOCUMENT_VIEWED`, `DOCUMENT_DELETED` |
| Chat & UPL | `CHAT_MESSAGE_SENT`, `CHAT_RESPONSE_GENERATED`, `UPL_ZONE_CLASSIFICATION`, `UPL_OUTPUT_BLOCKED`, `UPL_DISCLAIMER_INJECTED` |
| Calculations | `BENEFIT_CALCULATED`, `DEADLINE_CREATED`, `DEADLINE_MET`, `DEADLINE_MISSED` |
| Security | `PERMISSION_DENIED`, `ANOMALY_DETECTED`, `DATA_DELETION_REQUESTED` |

### Security Alerts

| Alert | Trigger | Severity |
|---|---|---|
| `FAILED_LOGIN_SPIKE` | >50 failed logins in 5 min | HIGH |
| `UPL_BLOCK_SPIKE` | >20 UPL blocks in 5 min | MEDIUM |
| `ERROR_RATE_SPIKE` | >10 HTTP 5xx in 5 min | HIGH |
| `HEALTH_CHECK_FAILURE` | Non-200 for >2 min | CRITICAL |
| `ANOMALY_DETECTED` | Anomaly detector fires | MEDIUM |

### Error Handling

Global Fastify error handler maps all error types to appropriate HTTP responses. Stack traces included in development, stripped in production. All errors Sentry-reported in production.

---

## HIPAA Compliance

AdjudiCLAIMS handles **Protected Health Information (PHI)**: claimant names, DOBs, injury dates, ICD-10 diagnosis codes, medical records, QME/AME reports, and WC claim numbers.

### Business Associate Agreements (BAAs)

BAAs executed with all PHI sub-processors:
- Google Cloud Platform (infrastructure, storage, compute)
- Google Cloud SQL
- Google Cloud Storage
- Anthropic (Claude) — **explicit no-training clause**
- Google Vertex AI — **explicit no-training clause**

AI sub-processors are contractually prohibited from using client data for training, fine-tuning, or evaluation.

### Minimum Necessary Standard (45 CFR § 164.502(b))

- Each role accesses only PHI required for their function
- AI queries receive only minimum PHI fields needed for the specific task
- PHI excluded from error logs, performance traces, monitoring dashboards
- Aggregate analytics use de-identified data only

### Data Retention

7-year retention after claim closure (plus 90-day grace period) per Cal. Lab. Code § 3762.

What gets purged: `DocumentChunk → Document → ChatSession` records.
What is **never** purged: `AuditEvent`, `RegulatoryDeadline`, `BenefitPayment` (compliance evidence and financial records).

### Breach Notification (45 CFR § 164.404)

- **Within 24 hours:** Internal investigation begins
- **Within 72 hours:** Customer notified via email + phone
- **Within 10 days:** Written notification to customer per BAA
- **Day 60 (hard deadline):** All notifications complete (affected individuals, HHS Secretary, CA Attorney General if applicable)

### Logging Policy

Audit events log document IDs, user IDs, counts, and metadata — **never message content or PHI text**. This is a hard architectural requirement.

---

## SOC 2 Compliance

Six test suites (69 tests) covering Trust Services Criteria:

| Suite | Controls Tested |
|---|---|
| `access-control.test.ts` | RBAC enforcement, claim-level authorization, org-scope isolation |
| `audit-trail.test.ts` | Immutable append-only logging for all 60+ event types |
| `availability.test.ts` | Health check endpoints, uptime targets |
| `data-protection.test.ts` | Encryption at rest/transit, Argon2id hashing |
| `privacy.test.ts` | DSAR handling, right-to-deletion implementation |
| `processing-integrity.test.ts` | Data accuracy, benefit calculation correctness |
| `change-management.test.ts` | CI/CD pipeline controls, deployment process |

---

## Education System — The Product IS the Training

Every deadline cited. Every regulation explained. Every decision transparent.

### Three-Tier Progressive Disclosure

**Tier 1 — Dismissable Basics (86 terms)**
Foundational terminology by category: BENEFITS, MEDICAL, LEGAL_PROCESS, REGULATORY_BODIES, CLAIM_LIFECYCLE, DOCUMENTS_FORMS. New examiners see these by default; each can be permanently dismissed once learned. Supervisors can re-enable by category for audits or refresher training.

**Tier 2 — Always-Present Regulatory Education (57 entries)**
These are **never hidden**. Statutory authority + examiner consequences at every decision point. Examples: why TD must be paid within 14 days (LC 4650 → 10% penalty), what happens if you miss the 40-day determination window, why AOE/COE evaluation is required before any determination. These are the Glass Box foundation.

**Tier 3 — Ongoing Education**
Monthly compliance reviews, quarterly refreshers (Q1–Q4 distinct question sets), audit-triggered training (specific findings require targeted module completion before closure), regulatory change acknowledgments.

### 4-Module Mandatory Training Gate (10 CCR 2695.6 Compliance)

Completion of all 4 modules is required before accessing any claims data:
1. Glass Box philosophy and transparent AI
2. UPL zones in practice
3. Examiner responsibilities and statutory duties
4. AI limitations and decision-making authority

Questions graded against server-side answer keys (never exposed to examinees). Passing score threshold enforced. Completion stored in `EducationProfile.isTrainingComplete`.

### 20 Decision Workflows

Step-by-step procedures for major claim lifecycle events:
- New Claim Intake (first 48 hours), Denial Letter Generation, AOE/COE Investigation, TD Benefit Initiation, Medical Treatment Authorization, UR Decision Handling, Lien Receipt and Processing, Settlement Preparation, WCAB Hearing Preparation, and 11 more.

Each workflow has: step descriptions, estimated minutes, statutory authority citation, compliance note, skip conditions with authority required for skipping, and UPL zone classification per step.

---

## Workflow Automation

Workflows are triggered either:
- **Manually:** Examiner initiates from the claim detail Workflows tab
- **Automatically:** Document type classification triggers relevant workflow (e.g., receiving a QME report triggers the QME Review workflow; receiving a UR denial triggers the UR Dispute workflow)

The `workflow-trigger-map.service` maps 24 document types to their associated workflow triggers. The `workflow-engine.service` manages step state transitions, completion tracking, and auto-advancement where applicable.

---

## Reporting & DOI Audit Readiness

The system generates California Department of Insurance audit-ready reports:

- **CCR 10101 Claim File Summary** — Complete claim file overview per regulatory requirements
- **CCR 10103 Activity Log** — Chronological activity log with date range filtering
- **Deadline Adherence Report** — Org-wide statistics on 15-day/40-day/14-day compliance rates
- **DOI Audit Readiness Score** — Composite score assessing preparedness for a regulatory audit

The compliance dashboard shows real-time UPL zone distribution — what percentage of AI queries per examiner and per org were GREEN vs. YELLOW vs. RED — helping supervisors identify whether examiners are inadvertently asking the AI for legal advice.

---

## Document Processing Pipeline

After upload, documents flow through an 8-stage async pipeline orchestrated by Temporal:

1. **OCR** — Google Document AI extracts text from PDFs and images
2. **Classification** — 12 primary document types, 150+ subtypes (medical report, QME/AME, denial letter, DWC-1, policy, wage statement, lien, etc.)
3. **Field Extraction** — Structured data: claimant name, DOI, employer, diagnoses, WPI ratings, work restrictions, dollar amounts, with per-field confidence scores
4. **Chunking** — 512-token chunks with 60-token overlap; heading-aware (3-level heading detection); atomic preservation (tables and procedures never split across chunks); parent-child indexing (2048-token parent chunks for broader LLM context); contextual prefix prepended to each chunk's embedding
5. **Embedding** — Voyage Large 2 via Vertex AI Vector Search (1024 dimensions), batch-processed in groups of 128
6. **Timeline Extraction** — Date references auto-generate `TimelineEvent` records
7. **Graph Enrichment** — Named entity recognition populates `GraphNode` and `GraphEdge` records; entity resolution merges near-duplicates
8. **Workflow Triggering** — Document type triggers relevant workflows automatically

OCR failure blocks downstream stages. Other stages continue independently if one fails. Each stage is fault-tolerant and idempotent.

---

## Test Suite (87 Files, 3,068 Tests)

| Suite | Files | What It Tests |
|---|---|---|
| Unit tests | 77 files | Services, routes, utilities, adapters, middleware |
| Integration tests | 1 file | Full document pipeline end-to-end |
| E2E tests (Playwright) | 4 specs | Login, dashboard, claim detail, chat, document upload |
| SOC 2 compliance | 6 files, 69 tests | Access control, audit trail, availability, data protection, privacy, processing integrity, change management |
| UPL acceptance | 2 files | 314 zone classification queries + 203 prohibited output variations |
| RAG evaluation | 1 file | Retrieval quality against labeled test dataset |
| Performance | 1 file | Load test baselines |

**Quality gates (all met):**
- 3,068 / 3,068 tests passing (100%)
- 0 TypeScript errors
- 0 lint errors
- Build succeeds
- >80% coverage on new code
- 0 secrets in code (security audit test)

---

## Current Build Status

### Phase Completion

| Phase | Status | Completion |
|---|---|---|
| 0: Infrastructure (Cloud Run, CI/CD, Dockerfile, Sentry) | ✅ Complete | 100% |
| 1: Auth & RBAC (argon2id, MFA/TOTP, lockout, DSAR) | ✅ Complete | ~100% |
| 2: Document Pipeline (OCR, classify, extract, embed) | ✅ Complete | 95% |
| 3: Core Claims Services (calculator, deadlines, investigation, workflows, coverage, medical billing) | ✅ Complete | 95% |
| 4: UPL Compliance (classifier, validator 24+ patterns, disclaimer, adversarial) | ✅ Complete | 98% |
| 5: Claims Chat (RAG, 5-tool agentic loop, draft generation, counsel referral) | ✅ Complete | 95% |
| 6: Education & Training (86 Tier 1 terms, 57 Tier 2 entries, 4 modules, 20 workflows, Q1–Q4 refreshers) | ✅ Complete | ~90% |
| 7: Compliance Dashboard | 🟡 Near Complete | ~80% |
| 8: Data Boundaries & KB (34-entry regulatory KB, per-body-part access) | 🟡 Near Complete | ~85% |
| 9: MVP Integration Testing (3,068 tests, 4 E2E specs, 314 UPL queries, 69 SOC 2 tests) | 🟡 Near Complete | ~80% |
| 10: Tier 2 Features (comparable claims, graph maintenance, email, doc templates) | 🟡 Partial | ~60% |
| 11: Tier 3 Features (litigation risk scoring, reserve analysis, CMS integration) | ❌ Not Started | 0% |

### Three Remaining MVP Blockers

1. **Cloud Run staging deployment** — `server/production.ts` committed; staging deployment needs verification
2. **Production database migration** — `npx prisma migrate deploy` on staging/production
3. **Legal counsel UPL review** — Package at `docs/legal/UPL_REVIEW_PACKAGE.md`; must be submitted to outside counsel for written sign-off before production use

---

## What This System Cannot Do (By Design)

- Cannot provide legal advice of any kind
- Cannot give case valuations or settlement recommendations
- Cannot make coverage determinations (admit/deny is the examiner's documented decision)
- Cannot interpret case law or Rules of Professional Conduct for examiners
- Cannot access attorney work product, attorney-client communications, or legal analysis documents
- Cannot predict litigation outcomes
- Cannot apply the PDRS directly to specific claims (PD rating application is legal analysis)
- Cannot replace defense counsel — RED zone queries redirect to counsel immediately

---

## Summary

AdjudiCLAIMS is a production-grade, legally constrained, transparent AI claims management system built on five core principles:

1. **Correctness over speed** — 3,068 tests, 12 hard UPL acceptance criteria, no workarounds
2. **Explainability over magic** — Zone badges, citations, provenance cards, confidence scores on every AI output
3. **Human in the loop, always** — AI assists; the examiner decides and documents
4. **The product IS the training** — 86 Tier 1 terms, 57 Tier 2 regulatory entries, 4 training modules, 20 decision workflows, monthly reviews, quarterly refreshers
5. **Glass Box, not black box** — From "the AI said so" to "the QME report on page 4 says the WPI is 12%, which under LC 4658 generates a PD payment of $X, and here is the statutory authority"

The UPL enforcement is three-layered and cannot be bypassed: query classifier (regex + LLM, conservative default RED) → constrained system prompt (factual language only, every assertion cited) → output validator (24 prohibited patterns, CRITICAL violations blocked). 11 of 12 acceptance criteria are verified by automated tests. The 12th requires a licensed California attorney's signature.

The architecture is: React Router 7 SSR + Fastify 5 + Prisma 6 + PostgreSQL 16 + Anthropic Claude + Google Vertex AI Vector Search + Google Document AI + Temporal for async orchestration. Multi-tenant, org-scoped, HIPAA-compliant, SOC 2-aligned, and fully audited.

---

*Developed & documented by Glass Box Solutions, Inc. using human ingenuity and modern technology.*
*Last updated: 2026-04-03*
