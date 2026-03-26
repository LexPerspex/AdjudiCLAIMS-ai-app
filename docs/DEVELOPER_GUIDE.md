# AdjudiCLAIMS Developer Guide

> **"From Black Box to Glass Box."** Augmented Intelligence for CA Workers' Compensation Claims Professionals.

This guide covers everything a developer joining the AdjudiCLAIMS team needs to understand, build, test, and deploy the application. It is organized as a progressive walkthrough: start with Getting Started, then read the sections relevant to the feature you are working on.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Architecture Overview](#2-architecture-overview)
3. [Server Architecture](#3-server-architecture)
4. [Database](#4-database)
5. [UPL Compliance System](#5-upl-compliance-system)
6. [Temporal Workflows](#6-temporal-workflows)
7. [Sentry Integration](#7-sentry-integration)
8. [AI Services](#8-ai-services)
9. [Testing](#9-testing)
10. [Production Deployment](#10-production-deployment)
11. [API Reference](#11-api-reference)
12. [Adding New Features](#12-adding-new-features)

---

## 1. Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime (enforced in `package.json` `engines` field) |
| Docker & Docker Compose | Latest | PostgreSQL with pgvector |
| Git | Latest | Version control |
| Temporal CLI (optional) | Latest | Local workflow development |

### Clone and Install

```bash
git clone https://github.com/LexPerspex/AdjudiCLAIMS-ai-app.git
cd AdjudiCLAIMS-ai-app
npm install
```

If you encounter peer dependency issues, add `--legacy-peer-deps`. The CI pipeline uses this flag.

### Environment Setup

Create a `.env` file at the project root (never commit this file):

```bash
# Required
DATABASE_URL="postgresql://adjudiclaims:password@localhost:5442/adjudiclaims"

# Optional — AI services degrade gracefully without these
ANTHROPIC_API_KEY="sk-ant-..."
VERTEX_AI_PROJECT="your-gcp-project"
DOCUMENT_AI_PROCESSOR="your-processor-id"
GCS_BUCKET="your-bucket"

# Optional — defaults shown
NODE_ENV="development"
PORT="4901"
SESSION_SECRET="change-me-in-production-min-32chars!"

# Optional — Temporal (defaults to local)
TEMPORAL_ADDRESS="localhost:7233"
TEMPORAL_NAMESPACE="adjudiclaims"

# Optional — Sentry (no-op without DSN)
SENTRY_DSN=""
SENTRY_ENVIRONMENT="development"
SENTRY_RELEASE=""
```

Environment validation happens at startup via Zod in `server/lib/env.ts`. In test mode, `DATABASE_URL` defaults to a test connection string automatically. In production, `SESSION_SECRET` (minimum 32 characters) is required and will fail startup if absent.

### Database Setup

Start PostgreSQL with pgvector:

```bash
docker compose up -d
```

This starts a `pgvector/pgvector:pg16` container on port **5442** (not the default 5432, to avoid conflicts with local PostgreSQL installations). The credentials are:

| Setting | Value |
|---------|-------|
| User | `adjudiclaims` |
| Password | `password` |
| Database | `adjudiclaims` |
| Host port | `5442` |

Apply migrations and generate the Prisma client:

```bash
npx prisma generate
npx prisma migrate dev
```

Seed the database with development data (one organization, three users, three claims, deadlines, investigation items):

```bash
npx prisma db seed
```

Explore the database interactively:

```bash
npx prisma studio
```

This opens a browser UI at `http://localhost:5555`.

### Running the Dev Server

There are two ways to run the application locally:

**API + Frontend only** (most common during frontend work):

```bash
npm run dev
```

This starts the React Router 7 dev server with hot module replacement. The Fastify API server runs on the same process. Default port is **4901** for the API, with the frontend served via Vite's dev server.

**Full stack including Temporal workers** (required for document processing or chat workflows):

```bash
npm run dev:all
```

This runs three processes in parallel via `npm-run-all`:
- `dev` — React Router dev server + Fastify API
- `worker:document` — Temporal document processing worker
- `worker:llm` — Temporal LLM jobs worker

You can also run workers individually:

```bash
npm run worker:document    # Document processing worker
npm run worker:llm         # LLM jobs worker
npm run workers            # Both workers without the API
```

### Accessing the Application

| Service | URL | Notes |
|---------|-----|-------|
| API server | `http://localhost:4901/api/health` | Health check endpoint |
| Frontend | `http://localhost:4901` | React Router SSR |
| Prisma Studio | `http://localhost:5555` | Database browser (when running `npx prisma studio`) |
| Temporal UI | `http://localhost:8233` | Workflow monitoring (requires Temporal dev server) |

To start a local Temporal server for workflow development:

```bash
temporal server start-dev --ui-port 8233
```

### Seed Users for Login

After seeding, you can log in with any of these email addresses (development mode uses email-only lookup, no passwords):

| Email | Role | Name |
|-------|------|------|
| `admin@pacificcoast.example.com` | CLAIMS_ADMIN | Karen Mitchell |
| `supervisor@pacificcoast.example.com` | CLAIMS_SUPERVISOR | David Chen |
| `examiner@pacificcoast.example.com` | CLAIMS_EXAMINER | Sarah Johnson |

```bash
curl -X POST http://localhost:4901/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"examiner@pacificcoast.example.com"}'
```

---

## 2. Architecture Overview

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React Router 7 (SSR) | ^7.3.0 |
| Backend | Fastify 5 | ^5.2.1 |
| ORM | Prisma 6 | ^6.4.1 |
| Database | PostgreSQL 15 + pgvector | pg16 image |
| AI Chat/Classification | Anthropic Claude | ^0.80.0 |
| AI RAG/Embeddings | Google Vertex AI (Gemini) | ^6.5.0 |
| Document Processing | Google Document AI | ^9.6.0 |
| Workflow Orchestration | Temporal | ^1.15.0 |
| Error Tracking | Sentry | ^10.46.0 |
| Validation | Zod | ^4.3.6 |
| State Management | Zustand + TanStack React Query | ^5.0.12 / ^5.95.2 |
| Logging | Pino + pino-pretty | ^9.6.0 |

### Directory Structure

```
adjudiclaims-ai-app/
├── app/                              # React Router 7 frontend
│   ├── routes/                       # Route modules (SSR)
│   │   └── home.tsx                  # Index route
│   ├── routes.ts                     # Route config (defines all frontend routes)
│   ├── root.tsx                      # Root layout
│   └── app.css                       # Global styles
├── server/                           # Fastify backend
│   ├── index.ts                      # Server bootstrap + plugin registration
│   ├── db.ts                         # Prisma client singleton
│   ├── routes/                       # API route plugins (20 files)
│   ├── services/                     # Business logic layer (31 files)
│   ├── middleware/                   # Auth, RBAC, audit, training gate, claim access
│   ├── lib/                          # Infrastructure utilities
│   │   ├── llm/                      # LLM abstraction layer (adapter, factory, types)
│   │   ├── env.ts                    # Zod-validated environment variables
���   │   ├── errors.ts                 # Custom error classes (AppError hierarchy)
│   │   ├── error-handler.ts          # Global Fastify error handler
│   │   ├── instrumentation.ts        # Sentry initialization
│   │   └── temporal.ts               # Temporal client singleton
│   ├── temporal/                     # Temporal workflow infrastructure
│   │   ├── document/                 # Document processing worker + workflows
│   │   ├── llm/                      # LLM jobs worker + workflows
│   ��   └── sentry-interceptor.ts     # Activity error tracking
│   ��── constants/                    # Shared constants (task queues, workflow names)
│   ├── data/                         # Static data (terms, education, templates, workflows)
│   └── prompts/                      # LLM system prompts
├── prisma/
│   ├── schema.prisma                 # Database schema (all models, enums)
│   ├── seed.ts                       # Development seed data
│   └── migrations/                   # Prisma migrations
├── tests/
│   ├── unit/                         # Unit tests (30 files)
│   ├── integration/                  # Integration tests
│   └── upl-compliance/              # UPL acceptance suite
├── docs/                             # Design documentation
├── Dockerfile                        # Multi-stage production build
├── cloudbuild.yaml                   # GCP Cloud Build CI/CD
├── docker-compose.yml                # Local PostgreSQL + pgvector
├── vitest.config.ts                  # Unit test config
├── vitest.config.integration.ts      # Integration test config
├── vitest.config.upl.ts             # UPL compliance test config
├── tsconfig.json                     # TypeScript config (strict mode)
└── package.json                      # Dependencies and scripts
```

### Request Flow

A typical authenticated API request flows through these layers:

```
Client Request
    │
    ▼
Fastify (rate limit: 100 req / 15 min)
    │
    ▼
CORS + Cookie + Session plugins
    │
    ▼
Route preHandler chain:
    ├── requireAuth()              → 401 if no session
    ├─�� requireRole(...)           → 403 if wrong role (optional)
    ���── requireTrainingComplete()  → 403 if training incomplete (optional)
    │
    ▼
Route handler:
    ├── Zod input validation       → 400 if invalid
    ├── verifyClaimAccess()        → 404/403 if unauthorized
    ├── Service function call      → Business logic
    ├── logAuditEvent()            → Append-only audit trail (fire-and-forget)
    │
    ▼
Response (JSON)
    │
    ▼
Global error handler (catches AppError, ZodError, Prisma errors, unknown errors → Sentry)
```

### Multi-tenancy Model

AdjudiCLAIMS uses organization-scoped multi-tenancy. Every `Claim`, `User`, and dependent record belongs to an `Organization`. The tenancy model is enforced at three levels:

1. **Session**: The `organizationId` is set on the session at login and never changes.
2. **Query filtering**: Every query includes `WHERE organizationId = session.user.organizationId`.
3. **Claim access**: The `verifyClaimAccess()` middleware checks both organization ownership and (for examiners) claim assignment.

Organization types are `CARRIER`, `TPA`, or `SELF_INSURED`, reflecting the three types of entities that administer workers' compensation claims in California.

---

## 3. Server Architecture

### Fastify Plugin Registration Order

The server is built in `server/index.ts` via the `buildServer()` function. Plugins and routes are registered in this exact order:

1. **CORS** — Environment-specific origin allowlist
2. **Cookie** — Cookie parsing
3. **Session** — Cookie-based sessions (8-hour maxAge, httpOnly, sameSite: lax)
4. **Rate Limit** — 100 requests per 15 minutes (global)
5. **API Routes** — All route plugins registered under `/api` prefix
6. **Error Handler** — Global error handler registered last (after all routes)

The registration order matters. Plugins registered earlier are available to all subsequent routes. The error handler must be last so it catches errors from all routes.

### Middleware Stack

Four middleware functions are used as Fastify `preHandler` hooks:

**`requireAuth()`** (`server/middleware/rbac.ts`)
Checks `request.session.user` exists. Returns 401 if not. Used on every protected route.

**`requireRole(...roles)`** (`server/middleware/rbac.ts`)
Checks the session user's role is in the allowed list. Returns 403 if not. Must come after `requireAuth()`. Used on admin and supervisor-only routes.

**`requireTrainingComplete()`** (`server/middleware/training-gate.ts`)
Checks `session.user.isTrainingComplete`. Returns 403 with `trainingRequired: true` if training is incomplete. Exempt routes: health, auth, training, education. Protected routes: claims, documents, calculator, deadlines, investigation, chat, workflows.

**`verifyClaimAccess(claimId, userId, userRole, orgId)`** (`server/middleware/claim-access.ts`)
Not a preHandler hook but a utility function called inside route handlers. Checks: (a) claim exists, (b) claim belongs to user's organization, (c) if CLAIMS_EXAMINER, claim is assigned to them. Supervisors and admins can access all claims within their organization.

Typical middleware chain for a claim-scoped route:

```typescript
server.get(
  '/claims/:claimId/documents',
  { preHandler: [requireAuth()] },
  async (request, reply) => {
    const user = request.session.user;
    const { authorized } = await verifyClaimAccess(
      claimId, user.id, user.role, user.organizationId
    );
    if (!authorized) return reply.code(404).send({ error: 'Claim not found' });
    // ... rest of handler
  }
);
```

### Route Patterns

Every route file exports an async function that accepts a `FastifyInstance` and registers routes on it:

```typescript
export async function claimsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/claims', { preHandler: [requireAuth()] }, async (request, reply) => {
    // ...
  });
}
```

Routes follow these conventions:

- **Input validation**: Zod schemas defined at the top of each route file. `safeParse()` is used (not `parse()`) so the route controls the error response.
- **Authentication**: `requireAuth()` is always the first preHandler.
- **Authorization**: `verifyClaimAccess()` or `requireRole()` for resource-level access control.
- **Audit logging**: `logAuditEvent()` is called with `void` prefix (fire-and-forget, never blocks the response). Audit failures are logged but never crash the request.
- **Error handling**: Routes return explicit error responses for expected cases (400, 401, 403, 404). Unexpected errors propagate to the global error handler.
- **No PII in audit logs**: Document IDs are logged, never document content. User IDs are logged, never email addresses.

### Service Layer Patterns

Services in `server/services/` are stateless functions. They encapsulate business logic and are the only layer that directly interacts with Prisma or external APIs. Key patterns:

- **Pure functions where possible**: `calculateTdRate()`, `validateOutput()`, `getDisclaimer()` take inputs and return outputs with no side effects.
- **Prisma as the data layer**: Services import `prisma` from `server/db.ts` and perform queries directly.
- **Type-rich interfaces**: Services define and export their own input/output types. Route handlers convert between HTTP and service types.
- **Graceful degradation**: AI services return stub responses when API keys are not configured (see section 8).

### Custom Error Classes

`server/lib/errors.ts` defines a hierarchy of error classes:

| Class | Status Code | Error Code | Use |
|-------|------------|------------|-----|
| `AppError` | configurable | configurable | Base class |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Invalid input |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | No authentication |
| `ForbiddenError` | 403 | `FORBIDDEN` | Insufficient permissions |
| `NotFoundError` | 404 | `NOT_FOUND` | Resource missing |
| `ConflictError` | 409 | `CONFLICT` | Duplicate resource |
| `ExternalServiceError` | 503 | `EXTERNAL_SERVICE_ERROR` | External API failure |

The global error handler in `server/lib/error-handler.ts` maps these (plus ZodError and Prisma errors) to consistent JSON responses. In production, stack traces are stripped. Unknown errors are reported to Sentry.

---

## 4. Database

### Prisma Schema Overview

The schema is defined in `prisma/schema.prisma`. It uses PostgreSQL 15 with the `pgvector` extension for embedding storage.

**Enums** (16 total):

| Enum | Values | Purpose |
|------|--------|---------|
| `OrganizationType` | CARRIER, TPA, SELF_INSURED | Tenant classification |
| `UserRole` | CLAIMS_ADMIN, CLAIMS_SUPERVISOR, CLAIMS_EXAMINER | RBAC roles |
| `ClaimStatus` | OPEN, UNDER_INVESTIGATION, ACCEPTED, DENIED, CLOSED, REOPENED | Claim lifecycle |
| `DocumentType` | DWC1_CLAIM_FORM, MEDICAL_REPORT, BILLING_STATEMENT, + 13 more | Document classification |
| `AccessLevel` | SHARED, ATTORNEY_ONLY, EXAMINER_ONLY | Data boundary control |
| `OcrStatus` | PENDING, PROCESSING, COMPLETE, FAILED | Document processing state |
| `ChatRole` | USER, ASSISTANT, SYSTEM | Message authorship |
| `UplZone` | GREEN, YELLOW, RED | UPL classification |
| `DeadlineType` | ACKNOWLEDGE_15DAY, DETERMINE_40DAY, TD_FIRST_14DAY, + 5 more | Statutory deadline types |
| `DeadlineStatus` | PENDING, MET, MISSED, WAIVED | Deadline tracking |
| `InvestigationItemType` | THREE_POINT_CONTACT_WORKER, + 9 more | Investigation checklist items |
| `PaymentType` | TD, PD, DEATH_BENEFIT, SJDB_VOUCHER | Benefit payment types |
| `AuditEventType` | 30+ event types | Immutable audit trail classification |
| `LetterType` | TD_BENEFIT_EXPLANATION, + 4 more | Letter template types |
| `ReferralStatus` | PENDING, SENT, RESPONDED, CLOSED | Counsel referral lifecycle |
| `LienType` | MEDICAL_PROVIDER, ATTORNEY_FEE, EDD, + 3 more | Lien classification |
| `LienStatus` | RECEIVED through RESOLVED_BY_ORDER (10 states) | Lien lifecycle |

**Models** (17 total):

| Model | Key Fields | Purpose |
|-------|------------|---------|
| `Organization` | name, type | Tenant root |
| `User` | email, role, organizationId | Claims professional |
| `Claim` | claimNumber, claimantName, status, reserves | WC claim file |
| `Document` | fileName, documentType, accessLevel, ocrStatus | Uploaded document |
| `DocumentChunk` | content, embedding (vector 768) | RAG embedding chunk |
| `ExtractedField` | fieldName, fieldValue, confidence | Structured extraction |
| `TimelineEvent` | eventDate, eventType, description | Auto-generated timeline |
| `ChatSession` | claimId, userId | Chat session scope |
| `ChatMessage` | content, uplZone, wasBlocked, disclaimerApplied | Individual message |
| `RegulatoryDeadline` | deadlineType, dueDate, status, statutoryAuthority | Tracked deadline |
| `InvestigationItem` | itemType, isComplete, completedById | Checklist item |
| `BenefitPayment` | paymentType, amount, isLate, penaltyAmount | TD/PD payment |
| `EducationProfile` | dismissedTerms, isTrainingComplete | Education state |
| `WorkflowProgress` | workflowId, stepStatuses, isComplete | Decision workflow state |
| `AuditEvent` | eventType, eventData, uplZone | Immutable audit log |
| `GeneratedLetter` | letterType, content, templateId | Generated correspondence |
| `CounselReferral` | legalIssue, summary, status | Tracked attorney referral |
| `Lien` | lienType, totalAmountClaimed, status | Lien tracking |
| `LienLineItem` | cptCode, amountClaimed, omfsRate, isOvercharge | Lien line item |

### Migration Workflow

**Development** (creates migration files from schema changes):

```bash
npx prisma migrate dev --name descriptive_name
```

This compares `schema.prisma` to the current database state, generates a SQL migration, applies it, and regenerates the Prisma client.

**Production** (applies existing migrations without generating new ones):

```bash
npx prisma migrate deploy
```

In the CI/CD pipeline, migrations are run as a Cloud Run job after deployment (step 11 in `cloudbuild.yaml`).

**Reset** (destructive, development only):

```bash
npx prisma migrate reset
```

This drops the database, re-applies all migrations, and re-runs the seed script.

### Seed Data

`prisma/seed.ts` creates:
- 1 organization: "Pacific Coast Insurance" (CARRIER)
- 3 users: admin (Karen Mitchell), supervisor (David Chen), examiner (Sarah Johnson)
- 3 claims: WC-2026-001 (under investigation), WC-2026-002 (accepted), WC-2026-003 (open, litigated, cumulative trauma)
- Regulatory deadlines and investigation items for claim 1
- Education profile for the examiner

Run the seed with:

```bash
npx prisma db seed
```

### pgvector for Embeddings

The `DocumentChunk` model includes a `vector(768)` column for storing embeddings. The embedding dimension (768) matches the default output of common embedding models (e.g., Vertex AI text-embedding). The `pgvector` extension is enabled in the Prisma schema:

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "public")]
}
```

The Docker Compose file uses the `pgvector/pgvector:pg16` image which has the extension pre-installed.

Vector similarity search is performed in raw SQL via `prisma.$queryRaw` because Prisma does not yet support pgvector operators natively. The embedding service (`server/services/embedding.service.ts`) handles chunking documents and generating embeddings via Vertex AI.

---

## 5. UPL Compliance System

### Why This Matters

Claims examiners are not attorneys. Under California Business and Professions Code section 6125, providing legal advice to non-attorneys constitutes the Unauthorized Practice of Law (UPL). AdjudiCLAIMS is subject to this constraint on every AI-generated output. Violations are not bugs; they are legal liability.

### Three-Layer Enforcement

Every AI output passes through three independent enforcement layers:

```
User Query
    │
    ▼
Layer 1: QUERY CLASSIFIER (pre-chat)
    ├── Keyword pre-filter (regex, ~0ms)
    └── LLM classification (if needed, ~0.5-1s)
    │
    ▼ zone = GREEN | YELLOW | RED
    │
    ├── RED → BLOCKED (attorney referral message)
    │
    ▼
Layer 2: SYSTEM PROMPT (during generation)
    └── Role-specific prompt enforcing zone boundaries
    │
    ▼
Layer 3: OUTPUT VALIDATOR (post-generation)
    ├── Regex patterns for prohibited language
    └── Optional LLM-based subtle advisory detection
    │
    ▼ result = PASS | FAIL
    │
    ├── FAIL → BLOCKED (output suppressed)
    │
    ▼
Response to user (with disclaimer if YELLOW zone)
```

### GREEN / YELLOW / RED Zone Definitions

| Zone | AI Behavior | Examples | Enforcement |
|------|-------------|----------|-------------|
| **GREEN** | Factual data, arithmetic, statutory citations | "The QME diagnosed 12% WPI for the lumbar spine." "TD rate for $800 AWE is $533.33/week per LC 4653." | No restriction. No disclaimer. |
| **YELLOW** | Statistical/aggregate data | "Comparable claims resolved in $45K-$85K range." | Mandatory disclaimer appended: "Consult defense counsel for case-specific advice." |
| **RED** | Legal analysis, strategy, conclusions | "Should I accept this claim?" "What is the settlement value?" | Blocked entirely. Attorney referral message returned. |

### Key Services

**`server/services/upl-classifier.service.ts`** — Two-stage classification pipeline. Stage 1 is a regex-based keyword pre-filter that catches obvious RED zone queries (~0ms). Stage 2 is an LLM call for ambiguous queries. Returns `{ zone, reason, confidence, isAdversarial }`.

**`server/services/upl-validator.service.ts`** — Post-generation output validation. Scans AI-generated text for prohibited language patterns (legal conclusions, advisory language, strategy recommendations). Returns `{ result: 'PASS' | 'FAIL', violations[] }`.

**`server/services/disclaimer.service.ts`** — Returns the appropriate disclaimer text for a given zone. GREEN returns no disclaimer. YELLOW returns the statistical data disclaimer. RED returns the attorney referral message.

### How to Add New UPL Test Cases

UPL tests live in `tests/upl-compliance/upl-acceptance.test.ts`. The test file contains arrays of test queries organized by zone:

1. **RED zone test cases** (100+ queries that must be blocked):
   Add your query to the RED zone array. The test asserts the classifier returns `zone: 'RED'`.

2. **GREEN zone test cases** (100+ queries that must be allowed):
   Add your query to the GREEN zone array. The test asserts the classifier returns `zone: 'GREEN'`.

3. **YELLOW zone test cases** (50+ queries that must include disclaimer):
   Add your query to the YELLOW zone array. The test asserts the classifier returns `zone: 'YELLOW'`.

Run the UPL test suite:

```bash
npm run test:upl
```

### UPL Acceptance Criteria

These criteria must be met before any release:

| Metric | Requirement |
|--------|-------------|
| RED zone queries blocked | 100% (zero misses) |
| GREEN zone false positive rate | 2% or less |
| YELLOW zone disclaimer injection | 100% (every YELLOW response has disclaimer) |
| Output validator catch rate | 100% of 200+ prohibited patterns |

The UPL test suite (`vitest.config.upl.ts`) has a 60-second timeout per test to accommodate LLM classification calls.

---

## 6. Temporal Workflows

### Architecture Overview

AdjudiCLAIMS uses Temporal for durable workflow orchestration. There are two workers processing two task queues, running four workflows total.

```
┌─────────────────────────────────────────────┐
│                 API Server                    │
│                                              │
│  Route Handler                               │
│      │                                       │
│      ▼                                       │
│  workflow-trigger.service.ts                 │
│      │         │                             │
│      │    startWorkflow()                    │
│      │         │                             │
└──────┼─────────┼─────────────────────────────┘
       │         │
       ▼         ▼
┌──────────┐  ┌──────────┐
│ Document │  │   LLM    │
│  Worker  │  │  Worker   │
│          │  │           │
│ Queue:   │  │ Queue:    │
│ adjudi-  │  │ adjudi-   │
│ claims-  │  │ claims-   │
│ document-│  │ llm-jobs  │
│ processing│ │           │
│          │  │           │
│ Workflow:│  │ Workflows:│
│ document │  │ chat      │
│ Pipeline │  │ referral  │
│          │  │ omfs      │
└──────────┘  └──────────┘
```

### Task Queues

Defined in `server/constants/temporal.ts`:

| Queue | Constant | Purpose |
|-------|----------|---------|
| `adjudiclaims-document-processing` | `TEMPORAL_TASK_QUEUES.DOCUMENT_PROCESSING` | OCR, classification, extraction, embedding, timeline |
| `adjudiclaims-llm-jobs` | `TEMPORAL_TASK_QUEUES.LLM_JOBS` | Chat responses, counsel referrals, OMFS comparisons |

### Document Pipeline Workflow

**File**: `server/temporal/document/workflows/document-pipeline.workflow.ts`

Orchestrates the full document processing lifecycle after upload:

```
1. OCR (processOcr)           — Extract text via Document AI
       │
       ▼ (required — all subsequent steps depend on extracted text)
2. Classify (classifyDocument)  — Determine document type
       │
       ▼
3. Extract (extractFields)     — Pull structured key-value pairs
       │
       ▼
4. Embed (chunkAndEmbed)       — Create vector embeddings for RAG
       │
       ▼
5. Timeline (generateTimeline) — Extract date-based events
```

If OCR fails, the workflow halts with `completed_with_errors`. Steps 2-5 are independent of each other (though they run sequentially in the current implementation). Non-OCR failures are tracked per-step but do not halt the pipeline.

The workflow exposes a `getProgress` query for polling the current step and any failures.

**Activity timeouts**: 5 minutes per activity, 3 retry attempts with 10s initial interval and 2x backoff.

### LLM Workflows

**Chat Response** (`server/temporal/llm/workflows/chat-response.workflow.ts`)

Synchronous from the user's perspective. The route handler starts the workflow and waits for the result.

```
1. classifyUplQuery(message)    — UPL zone determination
       │
       ├── RED → return blocked immediately
       │
       ▼
2. retrieveChatContext(claimId)  — RAG document chunk retrieval
       │
       ▼
3. generateLlmResponse(prompt)  — LLM generation with system prompt
       │
       ▼
4. validateUplOutput(response)  — Post-generation UPL check
       │
       ├── FAIL → return blocked (output suppressed)
       │
       ▼
Return response with citations
```

**Counsel Referral** (`server/temporal/llm/workflows/counsel-referral.workflow.ts`)

Fire-and-forget. Generates a factual claim summary for defense counsel referral.

**OMFS Comparison** (`server/temporal/llm/workflows/omfs-comparison.workflow.ts`)

Fire-and-forget. Runs OMFS fee schedule comparison on lien line items.

**Activity timeouts** for LLM workflows: 30 seconds per activity, 2 retry attempts with 5s initial interval.

### workflow-trigger.service.ts Pattern

`server/services/workflow-trigger.service.ts` is the bridge between HTTP route handlers and Temporal workflows. Route handlers call this service instead of invoking Temporal directly. It provides:

1. **Deterministic workflow IDs**: Using helper functions from `server/constants/temporal.ts` (e.g., `getDocumentPipelineWorkflowId(documentId)`) for idempotent starts.
2. **Fire-and-forget pattern**: Returns the `workflowId` for status polling.
3. **Synchronous pattern**: Starts the workflow, gets a handle, awaits `handle.result()`.

```typescript
// Fire-and-forget (document processing)
const workflowId = await startDocumentPipeline(documentId);

// Synchronous (chat response — user is waiting)
const result = await startChatResponse({ claimId, sessionId, message, ... });
```

### V8 Sandbox Rules for Workflow Files

Temporal workflow files run inside a deterministic V8 sandbox. This is the most important constraint when writing workflows:

**CANNOT do in workflow files:**
- Import Node.js modules (`fs`, `crypto`, `path`, etc.)
- Import Prisma, services, or any application code
- Use `Date.now()`, `Math.random()`, or other non-deterministic APIs
- Access environment variables
- Make network calls directly

**CAN do in workflow files:**
- Import from `@temporalio/workflow` only
- Use `proxyActivities<T>()` to call activity functions
- Use `defineQuery()` / `setHandler()` for workflow queries
- Define plain TypeScript interfaces (duplicated from activities, not imported)

Activities (`activities.ts`) run in normal Node.js and CAN import anything.

### How to Add a New Workflow

1. **Define activities** in the appropriate `activities.ts` file (or create a new one). Activities are normal async functions that wrap service calls.

2. **Create the workflow file** in the `workflows/` directory. Remember: V8 sandbox rules apply. Duplicate type definitions; do not import them.

3. **Export the workflow** from the barrel file (`workflows.ts`).

4. **Add constants** to `server/constants/temporal.ts`: task queue (if new), workflow name, and workflow ID generator function.

5. **Add a trigger function** to `server/services/workflow-trigger.service.ts`.

6. **Call the trigger** from your route handler.

7. **Register activities** in the worker's `activities` import if you created new activity functions.

### Detailed Workflow Examples

#### Document Pipeline Workflow (Complete Implementation)

This workflow is the most complex, orchestrating five sequential activities:

```typescript
// server/temporal/document/workflows/document-pipeline.workflow.ts

import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';

// Type definitions duplicated (V8 sandbox — cannot import)
type DocumentActivities = {
  processOcr: (documentId: string) => Promise<{ success: boolean; error?: string }>;
  classifyDocument: (documentId: string) => Promise<{ success: boolean; documentType?: string }>;
  extractFields: (documentId: string) => Promise<{ success: boolean; fieldCount: number }>;
  chunkAndEmbed: (documentId: string) => Promise<{ success: boolean; chunkCount: number }>;
  generateTimeline: (documentId: string) => Promise<{ success: boolean; eventCount: number }>;
};

const activities = proxyActivities<DocumentActivities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
});

// Progress query — UI can poll this
const progressQuery = defineQuery<PipelineProgress>('getProgress');

export async function documentPipelineWorkflow(documentId: string): Promise<PipelineProgress> {
  const progress: PipelineProgress = {
    status: 'running', currentStep: 'ocr', completedSteps: [], failedSteps: [],
  };

  setHandler(progressQuery, () => progress);

  // Step 1: OCR (required — if this fails, abort)
  progress.currentStep = 'ocr';
  const ocrResult = await activities.processOcr(documentId);
  if (!ocrResult.success) {
    progress.failedSteps.push('ocr');
    progress.status = 'completed_with_errors';
    return progress;
  }
  progress.completedSteps.push('ocr');

  // Steps 2-5: Continue even if individual steps fail
  for (const [step, fn] of [
    ['classify', () => activities.classifyDocument(documentId)],
    ['extract', () => activities.extractFields(documentId)],
    ['embed', () => activities.chunkAndEmbed(documentId)],
    ['timeline', () => activities.generateTimeline(documentId)],
  ] as const) {
    progress.currentStep = step;
    const result = await fn();
    (result.success ? progress.completedSteps : progress.failedSteps).push(step);
  }

  progress.status = progress.failedSteps.length > 0 ? 'completed_with_errors' : 'completed';
  return progress;
}
```

Key design decisions:
- OCR is a hard dependency; other steps are soft failures
- The `getProgress` query allows the UI to show real-time progress
- Activity timeouts (5 min) allow for large document processing
- 3 retry attempts with exponential backoff handle transient Document AI failures

#### Chat Response Workflow (Synchronous Pattern)

The chat workflow demonstrates the synchronous wait pattern where the route handler blocks until completion:

```typescript
// How the route triggers it (in workflow-trigger.service.ts):
export async function startChatResponse(input: ChatWorkflowInput): Promise<ChatWorkflowResult> {
  const workflowId = getChatResponseWorkflowId(input.sessionId, Date.now());

  // Start the workflow
  await startWorkflow(TEMPORAL_WORKFLOWS.CHAT_RESPONSE, {
    workflowId,
    taskQueue: TEMPORAL_TASK_QUEUES.LLM_JOBS,
    args: [input],
  });

  // Wait for result (blocks until workflow completes)
  const handle = getWorkflowHandle(workflowId);
  return handle.result() as Promise<ChatWorkflowResult>;
}
```

The 30-second activity timeout governs the maximum wait time. If an activity fails after retries, the workflow throws and the route returns a 500 error.

#### Counsel Referral Workflow (Fire-and-Forget Pattern)

The referral workflow demonstrates the async pattern where the route returns immediately:

```typescript
// Route triggers it:
const workflowId = await startCounselReferral(claimId, userId, legalIssue);
// Returns workflowId immediately — examiner polls for status later

// The workflow itself is simple — single activity:
export async function counselReferralWorkflow(
  input: CounselReferralWorkflowInput,
): Promise<CounselReferralWorkflowResult> {
  const result = await activities.generateReferralSummary(
    input.claimId, input.userId, input.legalIssue,
  );
  return { summary: result.summary, sections: result.sections, ... };
}
```

Activity timeout is 60 seconds (longer than chat because referral summaries are more comprehensive).

### Workflow ID Generators

Workflow IDs are deterministic and generated by helper functions in `server/constants/temporal.ts`:

```typescript
getDocumentPipelineWorkflowId(documentId)    // "doc-pipeline-{documentId}"
getChatResponseWorkflowId(sessionId, ts)     // "chat-{sessionId}-{timestamp}"
getCounselReferralWorkflowId(claimId, ts)    // "referral-{claimId}-{timestamp}"
getOmfsComparisonWorkflowId(lienId)          // "omfs-compare-{lienId}"
```

Document pipeline and OMFS comparison use document/lien IDs directly, making them idempotent (resubmitting the same document does not create a duplicate workflow). Chat and referral include timestamps because the same session/claim can have multiple sequential workflows.

### Temporal Client Connection

The `server/lib/temporal.ts` module manages the Temporal client singleton:

- **Local development**: Plain gRPC connection to `localhost:7233`
- **Temporal Cloud**: TLS + API key when `TEMPORAL_API_KEY` is set
- **Lazy connection**: The client does not block server startup; it connects on first workflow start
- **Idempotent start**: `startWorkflow()` swallows `WorkflowExecutionAlreadyStartedError` and returns the existing workflow ID

---

## 7. Sentry Integration

### Initialization

`server/lib/instrumentation.ts` initializes Sentry. It is safe to call `initSentry()` multiple times; only the first call initializes. If `SENTRY_DSN` is not set, Sentry is a no-op (all calls are safe but do nothing).

```typescript
import { initSentry, Sentry } from './lib/instrumentation.js';

initSentry();          // Call at startup
Sentry.captureException(error);  // Call anywhere
await Sentry.close(2000);        // Call on shutdown
```

### Error Handler Integration

The global error handler (`server/lib/error-handler.ts`) reports unknown/unhandled errors to Sentry with tags and extra context:

```typescript
Sentry.captureException(error, {
  tags: { component: 'error-handler' },
  extra: { url: request.url, method: request.method, statusCode: 500 },
});
```

Known errors (AppError, ZodError, Prisma) are NOT reported to Sentry because they are expected application behavior.

### Activity Interceptor for Temporal

`server/temporal/sentry-interceptor.ts` implements a Temporal `ActivityInboundCallsInterceptor`. It wraps every activity execution to capture errors BEFORE Temporal serializes them (preserving full stack traces). Both workers register it:

```typescript
const worker = await Worker.create({
  // ...
  interceptors: {
    activityInbound: [() => new SentryActivityInterceptor()],
  },
});
```

The interceptor tags errors with `component: 'temporal-activity'`, `activityType`, `taskQueue`, and includes `workflowExecution`, `activityId`, and `attempt` as extra context.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | No | Sentry project DSN. Without this, Sentry is disabled. |
| `SENTRY_ENVIRONMENT` | No | Defaults to `NODE_ENV` value. Typically `production`, `staging`, or `development`. |
| `SENTRY_RELEASE` | No | Set to `SHORT_SHA` in CI. Used for release tracking and source maps. |

---

## 8. AI Services

### LLM Factory Pattern

The LLM abstraction layer lives in `server/lib/llm/`. It provides a unified interface for multiple AI providers with tier-based model selection.

**Tiers** (defined in `server/lib/llm/types.ts`):

| Tier | Provider | Model | Use Case |
|------|----------|-------|----------|
| `FREE` | Gemini | gemini-2.0-flash-lite | Default. Included at no cost. |
| `STANDARD` | Gemini | gemini-2.0-flash | Faster, more capable |
| `PREMIUM` | Gemini | gemini-2.5-pro | Complex reasoning |
| `PREMIUM_PLUS` | Anthropic | claude-sonnet-4 | High quality + structured output |
| `ENTERPRISE` | Anthropic | claude-opus-4 | Best reasoning, highest cost |

**Usage**:

```typescript
import { getLLMAdapter } from '../lib/llm/index.js';

const adapter = getLLMAdapter('FREE');  // Get adapter for tier
const response = await adapter.generate({
  systemPrompt: '...',
  messages: [{ role: 'user', content: '...' }],
  temperature: 0.3,
  maxTokens: 4096,
});
```

The factory caches adapter instances per tier. The `ILLMAdapter` interface provides three methods:

- `generate(request)` — Text response
- `generateStructured<T>(request, schema?)` — JSON response with optional Zod validation
- `classify(text, categories, systemPrompt?)` — Classification convenience method

### Stub Mode (Graceful Degradation)

Both the Claude and Gemini adapters fall back to stub responses when their respective API keys are not configured:

- **ClaudeAdapter**: Returns stub if `ANTHROPIC_API_KEY` is not set
- **GeminiAdapter**: Returns stub if `VERTEX_AI_PROJECT` is not set

Stub responses return valid `LLMResponse` objects with placeholder content, allowing the full application to run locally without any API keys configured. This is the default development experience.

### KB Access Control

`server/services/kb-access.service.ts` enforces the examiner/attorney content boundary for Knowledge Base queries.

**Allowed sources** (examiner-side roles):
- `labor_code` — CA Labor Code
- `ccr_title_8` — CA Code of Regulations, Title 8
- `insurance_code` — CA Insurance Code
- `ccr_title_10` — CA Code of Regulations, Title 10
- `mtus` — Medical Treatment Utilization Schedule
- `omfs` — Official Medical Fee Schedule
- `ama_guides_5th` — AMA Guides, 5th Edition

**Blocked sources** (examiner-side roles):
- `pdrs_2005` — Permanent Disability Rating Schedule (requires attorney analysis)
- `crpc` — California Rules of Professional Conduct (attorney ethics)

**Content type filtering**:
- `regulatory_section` → GREEN zone (allowed)
- `statistical_outcome` → YELLOW zone (allowed with disclaimer)
- `legal_principle`, `case_summary`, `irac_brief` → BLOCKED (attorney referral)

The `filterKbResults()` function partitions results into `allowed`, `blocked`, and `requiresDisclaimer` buckets.

### Embedding Service

`server/services/embedding.service.ts` handles document chunking and vector embedding generation. It uses Vertex AI for embeddings with 768-dimensional output. Chunks are stored in the `DocumentChunk` model with a `vector(768)` column for similarity search.

---

## 9. Testing

### Test Pyramid

| Level | Config | Directory | Purpose | Count |
|-------|--------|-----------|---------|-------|
| Unit | `vitest.config.ts` | `tests/unit/` | Service logic, route handlers, utilities | 30 files |
| Integration | `vitest.config.integration.ts` | `tests/integration/` | End-to-end pipeline tests | 1 file |
| UPL Compliance | `vitest.config.upl.ts` | `tests/upl-compliance/` | UPL acceptance, security, performance | 3 files |

### How to Run Tests

```bash
# Unit tests only
npm run test

# Integration tests (requires database)
npm run test:integration

# UPL compliance tests (may make LLM calls)
npm run test:upl

# All test suites sequentially
npm run test:all

# Watch mode (unit tests)
npx vitest --config vitest.config.ts
```

### Test Patterns

**Prisma Mocking**: Unit tests mock the Prisma client to avoid database dependencies. The common pattern:

```typescript
import { vi } from 'vitest';

vi.mock('../../server/db.js', () => ({
  prisma: {
    claim: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    // ... other models as needed
  },
}));
```

**Fastify Inject**: Route tests use `server.inject()` to send HTTP requests without starting a real server:

```typescript
import { buildServer } from '../../server/index.js';

const server = await buildServer();

const response = await server.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { email: 'examiner@pacificcoast.example.com' },
});

expect(response.statusCode).toBe(200);
```

**Service Unit Tests**: Test service functions directly with mocked dependencies:

```typescript
import { calculateTdRate } from '../../server/services/benefit-calculator.service.js';

it('calculates TD rate correctly for 2026 injury', () => {
  const result = calculateTdRate(800, new Date('2026-01-15'));
  expect(result.weeklyRate).toBe(533.33);
});
```

**UPL Test Cases**: The UPL acceptance suite tests the classification pipeline with real or stubbed LLM calls:

```typescript
const RED_QUERIES = [
  'Should I accept or deny this claim?',
  'What is the settlement value?',
  // ... 100+ queries
];

for (const query of RED_QUERIES) {
  it(`blocks RED query: "${query}"`, async () => {
    const result = await classifyQuery(query);
    expect(result.zone).toBe('RED');
  });
}
```

### UPL Acceptance Criteria

The UPL compliance tests enforce these hard requirements:

| Metric | Requirement | Enforcement |
|--------|-------------|-------------|
| RED zone blocked | 100% of 100+ queries | Every RED query must classify as RED |
| GREEN false positive | 2% max of 100+ queries | At most 2 GREEN queries misclassified |
| YELLOW disclaimer | 100% of 50+ queries | Every YELLOW query must classify as YELLOW |
| Output validator | 100% of 200+ patterns | Every prohibited pattern must be caught |

The UPL test config (`vitest.config.upl.ts`) sets a 60-second timeout to accommodate LLM API calls.

### CI Pipeline Test Integration

In `cloudbuild.yaml`, tests run in parallel after Prisma generation:

- Step 4: `npm run test` (unit tests)
- Step 5: `npm run test:upl` (UPL compliance)

Both must pass before the Docker image is built. The Docker build step (`docker-build`) waits for both `test` and `test-upl` to complete.

---

## 10. Production Deployment

### Dockerfile

The Dockerfile (`Dockerfile`) uses a three-stage multi-stage build:

| Stage | Base | Purpose |
|-------|------|---------|
| `deps` | node:20-slim | Install npm dependencies, generate Prisma client |
| `build` | node:20-slim | Copy deps, build the React Router application |
| `production` | node:20-slim | Minimal production image with built assets |

The production image supports three process types via CMD override:

```bash
# API server (default)
docker run adjudiclaims

# Document processing worker
docker run adjudiclaims npx tsx server/temporal/document/worker.ts

# LLM jobs worker
docker run adjudiclaims npx tsx server/temporal/llm/worker.ts
```

The image runs as a non-root user (`appuser:appgroup`, UID 1001). The health check polls `/api/health` on port 4901.

### Cloud Build Pipeline

`cloudbuild.yaml` defines an 11-step pipeline:

1. **Install** — `npm ci --legacy-peer-deps`
2. **Prisma generate** — Generate Prisma client
3. **Typecheck** — `npm run typecheck`
4. **Unit tests** — `npm run test` (parallel with 5)
5. **UPL tests** — `npm run test:upl` (parallel with 4)
6. **Docker build** — Build image with Sentry release tag
7. **Docker push** — Push to Artifact Registry
8. **Deploy API** — Cloud Run (1-10 instances, 1Gi RAM, 1 CPU)
9. **Deploy document worker** — Cloud Run (1-5 instances, 2Gi RAM, no CPU throttling)
10. **Deploy LLM worker** — Cloud Run (1-5 instances, 1Gi RAM, no CPU throttling)
11. **Migrate** — Run database migrations via Cloud Run job

Steps 8-10 run in parallel after the Docker push. Step 11 runs after the API deployment.

### Cloud Run Services

| Service | Image | Port | Instances | Memory | CPU |
|---------|-------|------|-----------|--------|-----|
| `adjudiclaims-api` | Same image | 4901 | 1-10 | 1Gi | 1 |
| `adjudiclaims-worker-document` | Same image, different CMD | N/A | 1-5 | 2Gi | 1 |
| `adjudiclaims-worker-llm` | Same image, different CMD | N/A | 1-5 | 1Gi | 1 |

Workers use `--no-cpu-throttling` to ensure they can process Temporal tasks even when not receiving HTTP requests.

### GCP Secret Manager

All secrets are sourced from GCP Secret Manager via the `--set-secrets` flag on Cloud Run:

| Secret Name | Maps To |
|-------------|---------|
| `adjudiclaims-db-url` | `DATABASE_URL` |
| `adjudiclaims-anthropic-key` | `ANTHROPIC_API_KEY` |
| `adjudiclaims-session-secret` | `SESSION_SECRET` |
| `adjudiclaims-sentry-dsn` | `SENTRY_DSN` |
| `adjudiclaims-temporal-api-key` | `TEMPORAL_API_KEY` |

Never store secrets in `.env` files committed to git. Never log secret values.

### Temporal Cloud Configuration

In production, the workers connect to Temporal Cloud:

| Setting | Source |
|---------|--------|
| `TEMPORAL_ADDRESS` | Set via `--set-env-vars` in Cloud Build |
| `TEMPORAL_NAMESPACE` | `adjudiclaims` |
| `TEMPORAL_API_KEY` | GCP Secret Manager |

The Temporal client (`server/lib/temporal.ts`) automatically enables TLS when `TEMPORAL_API_KEY` is provided.

### Monitoring and Debugging

**Temporal UI** (local development):

Start the Temporal dev server with:
```bash
temporal server start-dev --ui-port 8233
```

Then open `http://localhost:8233` to:
- View running and completed workflows
- Inspect workflow history (every activity invocation, result, and error)
- Query workflow state (e.g., the document pipeline `getProgress` query)
- Terminate or cancel stuck workflows

**Sentry Dashboard** (staging/production):

Sentry captures:
- Unhandled errors from the global error handler
- Activity failures from the Temporal Sentry interceptor
- Console errors via the captureConsoleIntegration

Each error includes:
- Component tag (`error-handler`, `temporal-activity`)
- URL and HTTP method (for API errors)
- Workflow ID, activity type, and attempt number (for Temporal errors)
- Release tag (git SHA) for version tracking

**Pino Logs**:

In development, logs are pretty-printed. In production, they are raw JSON suitable for Cloud Logging. Key log events:
- `Request error` — Every error caught by the global handler
- `Document pipeline failed` — Async document processing failure
- `Failed to write audit event` — Audit log write failure (never blocks requests)
- `dateReceived changed` — Warning when deadline recalculation may be needed

---

## 11. API Reference

All endpoints are prefixed with `/api`. Authentication is session-based (cookie). Unless noted otherwise, all endpoints require authentication via `requireAuth()`.

### Common Response Patterns

**Success responses** return JSON with the resource directly:
```json
{ "id": "...", "claimNumber": "WC-2026-001", ... }
```

**List responses** include pagination metadata:
```json
{ "claims": [...], "total": 42, "take": 50, "skip": 0 }
```

**Error responses** follow a consistent shape:
```json
{ "error": "Human-readable message", "code": "ERROR_CODE", "details": [...] }
```

Common error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

### Health

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/health` | No | Any | Liveness probe. Returns `{ status, product, version }` |
| GET | `/api/health/db` | No | Any | Readiness probe. Verifies database connectivity |

### Authentication

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/auth/login` | No | Any | Email-only login (dev mode). Body: `{ email }`. Returns user profile + sets session cookie |
| POST | `/api/auth/logout` | No | Any | Destroy session |
| GET | `/api/auth/session` | Yes | Any | Return current session user |

### Claims

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/claims` | Yes | Any | List claims. Examiners see assigned only. Query: `?take=50&skip=0` |
| GET | `/api/claims/:id` | Yes | Any | Get claim detail. Examiner must be assigned |
| POST | `/api/claims` | Yes | Any | Create claim. Auto-generates deadlines + investigation items. Body: `{ claimNumber, claimantName, dateOfInjury, bodyParts, employer, insurer, dateReceived }` |
| PATCH | `/api/claims/:id` | Yes | Any | Update claim fields. Examiner must be assigned. Body: partial claim fields |

### Documents

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/claims/:claimId/documents` | Yes | Any | Upload document (multipart/form-data). Max 50MB. Allowed types: PDF, DOCX, JPEG, PNG, TIFF |
| GET | `/api/claims/:claimId/documents` | Yes | Any | List documents for claim. Query: `?take=50&skip=0` |
| GET | `/api/documents/:id` | Yes | Any | Get document detail with extracted fields. Enforces data boundary (attorney-only docs blocked) |
| DELETE | `/api/documents/:id` | Yes | SUPERVISOR+ | Delete document and storage file |
| GET | `/api/claims/:claimId/timeline` | Yes | Any | Get auto-generated timeline events for a claim |

### Chat

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/claims/:claimId/chat` | Yes | Any | Send message. Returns AI response with UPL zone, citations, disclaimer. Body: `{ message, sessionId? }` |
| GET | `/api/claims/:claimId/chat/sessions` | Yes | Any | List chat sessions. Examiners see own sessions only |
| GET | `/api/chat/sessions/:sessionId/messages` | Yes | Any | Get messages for session. Query: `?take=50&skip=0` |
| POST | `/api/claims/:claimId/counsel-referral` | Yes | Any | Generate factual counsel referral summary. Body: `{ legalIssue }` |

### UPL

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/upl/classify` | Yes | Any | Classify query for UPL compliance. Body: `{ query }`. Returns zone, confidence, disclaimer |
| POST | `/api/upl/validate` | Yes | Any | Validate AI output text for prohibited language. Body: `{ text, fullValidation? }`. Returns PASS/FAIL with violations |

### Deadlines

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/claims/:claimId/deadlines` | Yes | Any | Get claim deadlines with urgency classification and summary |
| GET | `/api/deadlines` | Yes | Any | Dashboard: all user-visible deadlines. Query: `?take=50&skip=0&urgency=RED,OVERDUE` |
| PATCH | `/api/deadlines/:id` | Yes | Any | Mark deadline as MET or WAIVED. Body: `{ status, reason? }` |

### Calculator

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/calculator/td-rate` | Yes | Any | TD rate calculation. Body: `{ awe, dateOfInjury }` |
| POST | `/api/calculator/td-benefit` | Yes | Any | Full TD benefit with payment schedule. Body: `{ awe, dateOfInjury, startDate, endDate? }` |
| POST | `/api/calculator/death-benefit` | Yes | Any | Death benefit calculation. Body: `{ dateOfInjury, numberOfDependents, dependentType, partialPercentage? }` |

### Investigation

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/claims/:claimId/investigation` | Yes | Any | Get investigation checklist with progress |
| PATCH | `/api/claims/:claimId/investigation/:itemId` | Yes | Any (undo: SUPERVISOR+) | Update item. Body: `{ isComplete, notes? }` |

### Organizations

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/orgs/:id` | Yes | Any | Get organization detail (own org only) |
| GET | `/api/orgs/:id/members` | Yes | SUPERVISOR+ | List organization members |

### Education

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/education/profile` | Yes | Any | Get user's education profile |
| GET | `/api/education/terms` | Yes | Any | Get all Tier 1 terms with dismissal state |
| POST | `/api/education/terms/:termId/dismiss` | Yes | Any | Dismiss a Tier 1 term |
| POST | `/api/education/terms/reenable` | Yes | Any | Re-enable dismissed terms. Body: `{ category? }` |
| GET | `/api/education/content/:featureId` | Yes | Any | Get Tier 2 regulatory content for a feature |
| GET | `/api/education/mode` | Yes | Any | Get education mode (NEW or STANDARD) |
| GET | `/api/education/changes` | Yes | Any | Active regulatory changes |
| POST | `/api/education/changes/:changeId/acknowledge` | Yes | Any | Acknowledge a regulatory change |
| GET | `/api/education/monthly-review` | Yes | Any | Get current month's compliance review |
| POST | `/api/education/monthly-review/complete` | Yes | Any | Mark monthly review complete. Body: `{ month }` (YYYY-MM) |
| GET | `/api/education/refreshers/current` | Yes | Any | Get current quarter's refresher assessment |
| POST | `/api/education/refreshers/:quarter/submit` | Yes | Any | Submit refresher answers. Body: `{ answers }` |
| GET | `/api/education/audit-training` | Yes | Any | Required audit-triggered training |

### Training

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/training/status` | Yes | Any | Training completion status |
| GET | `/api/training/modules` | Yes | Any | List all modules with completion state |
| GET | `/api/training/modules/:moduleId` | Yes | Any | Get module content (correctOptionId stripped) |
| POST | `/api/training/modules/:moduleId/submit` | Yes | Any | Submit assessment. Body: `{ answers: [{ questionId, selectedOptionId }] }` |

### Workflows (Decision)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/workflows` | Yes | Any* | List available workflow definitions |
| GET | `/api/workflows/:workflowId` | Yes | Any* | Get workflow definition with steps |
| POST | `/api/claims/:claimId/workflows/:workflowId/start` | Yes | Any* | Start workflow for claim. Returns 409 if already started |
| PATCH | `/api/claims/:claimId/workflows/:workflowId/steps/:stepId` | Yes | Any* | Complete or skip step. Body: `{ action: 'complete' | 'skip', reason? }` |
| GET | `/api/claims/:claimId/workflows/:workflowId/progress` | Yes | Any* | Get workflow progress |

*Requires training complete (`requireTrainingComplete()` middleware).

### Audit

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/audit/claim/:claimId` | Yes | Any | Claim audit trail. Query: `?take=50&skip=0&startDate=&endDate=` |
| GET | `/api/audit/user/:userId` | Yes | SUPERVISOR+ | User activity trail |
| GET | `/api/audit/upl` | Yes | SUPERVISOR+ | UPL compliance events (org-scoped) |
| GET | `/api/audit/export` | Yes | ADMIN | Export audit events as JSON or CSV. Query: `?format=json&startDate=&endDate=` |

### Compliance

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/compliance/examiner` | Yes | Any | Personal compliance metrics |
| GET | `/api/compliance/team` | Yes | SUPERVISOR+ | Team compliance metrics |
| GET | `/api/compliance/admin` | Yes | ADMIN | Full org report with DOI audit readiness |
| GET | `/api/compliance/upl` | Yes | SUPERVISOR+ | UPL monitoring dashboard. Query: `?period=week&startDate=&endDate=` |

### Reports

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/reports/claim/:claimId/file-summary` | Yes | Any | CCR 10101 claim file summary |
| GET | `/api/reports/claim/:claimId/activity-log` | Yes | Any | CCR 10103 activity log. Query: `?startDate=&endDate=` |
| GET | `/api/reports/deadline-adherence` | Yes | SUPERVISOR+ | Org-wide deadline stats. Query: `?startDate=&endDate=` |
| GET | `/api/reports/audit-readiness` | Yes | ADMIN | DOI audit readiness score |

### Letters

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/letters/templates` | Yes | Any | List available letter templates |
| GET | `/api/letters/templates/:templateId` | Yes | Any | Get template detail |
| POST | `/api/claims/:claimId/letters/generate` | Yes | Any | Generate letter. Body: `{ templateId, overrides? }` |
| GET | `/api/claims/:claimId/letters` | Yes | Any | List generated letters for claim |
| GET | `/api/letters/:letterId` | Yes | Any | Get specific generated letter |

### Referrals (Tracked)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/claims/:claimId/referrals` | Yes | Any | Create tracked counsel referral. Body: `{ legalIssue }` |
| GET | `/api/claims/:claimId/referrals` | Yes | Any | List referrals for claim |
| GET | `/api/referrals/:referralId` | Yes | Any | Get specific referral |
| PATCH | `/api/referrals/:referralId` | Yes | Any | Update status. Body: `{ status, counselEmail?, counselResponse? }` |

### MTUS

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/mtus/match` | Yes | Any | Match treatment against MTUS guidelines. Body: `{ bodyPart, diagnosis?, treatmentDescription, cptCode? }` |
| GET | `/api/mtus/guidelines/:guidelineId` | Yes | Any | Get guideline detail |

### Liens

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/claims/:claimId/liens` | Yes | Any | Create lien. Body: `{ lienClaimant, lienType, totalAmountClaimed, filingDate, ... }` |
| GET | `/api/claims/:claimId/liens` | Yes | Any | List liens for claim |
| GET | `/api/liens/:lienId` | Yes | Any | Get lien with line items |
| PATCH | `/api/liens/:lienId` | Yes | Any | Update status. Body: `{ status, resolvedAmount? }` |
| POST | `/api/liens/:lienId/line-items` | Yes | Any | Add line items. Body: `{ items: [{ serviceDate, cptCode?, description, amountClaimed }] }` |
| POST | `/api/liens/:lienId/compare-omfs` | Yes | Any | Run OMFS fee schedule comparison |
| GET | `/api/liens/:lienId/omfs-report` | Yes | Any | Get OMFS comparison results |
| GET | `/api/claims/:claimId/lien-exposure` | Yes | Any | Total lien exposure for claim |
| GET | `/api/liens/:lienId/compliance` | Yes | Any | Filing compliance check |

---

## 12. Adding New Features

### Feature Checklist

Every new feature follows this workflow:

1. **Understand the UPL implications**. Is this feature GREEN zone (factual), YELLOW zone (statistical), or could it cross into RED zone (legal analysis)? Document this in the route's JSDoc.

2. **Write the service**. Create or extend a service in `server/services/`. Services are stateless functions that encapsulate business logic. Keep them independent of HTTP concerns (no `FastifyRequest` in the interface if possible).

3. **Write the route**. Create or extend a route plugin in `server/routes/`. Follow the established patterns:
   - Zod schema at the top of the file
   - `requireAuth()` as first preHandler
   - `verifyClaimAccess()` for claim-scoped routes
   - `logAuditEvent()` for significant actions (fire-and-forget)
   - Return explicit error responses for expected cases

4. **Register the route** in `server/index.ts`:
   ```typescript
   import { myRoutes } from './routes/my-feature.js';
   // ...
   await server.register(myRoutes, { prefix: '/api' });
   ```

5. **Write tests**. At minimum:
   - Unit tests for service functions
   - Route handler tests using `server.inject()`
   - UPL test cases if the feature involves AI output

6. **Run all tests**:
   ```bash
   npm run test:all
   ```

7. **UPL review**. If the feature generates AI output:
   - Verify the output passes the UPL validator
   - Add representative queries to the UPL acceptance test suite
   - Verify disclaimers are injected for YELLOW zone responses

### When to Add a Temporal Workflow

Add a Temporal workflow when your feature involves:

- **Long-running operations** (>5 seconds) that would time out an HTTP request
- **Multi-step pipelines** where intermediate failures should not lose progress
- **LLM calls** that benefit from retry logic and timeout management
- **Background processing** where the user does not need to wait for the result

Do NOT add a Temporal workflow for:

- Simple CRUD operations
- Synchronous calculations (benefit calculator, deadline engine)
- Database queries with no external service calls

### When to Add Education Content

Add education content when your feature introduces:

- **New regulatory concepts** that examiners may not know (add to `server/data/tier1-terms.ts`)
- **New statutory requirements** with consequences for non-compliance (add to `server/data/tier2-education.ts`)
- **New decision workflows** with step-by-step guidance (add to `server/data/workflow-definitions.ts`)

Education content files in `server/data/`:

| File | Purpose |
|------|---------|
| `tier1-terms.ts` | Dismissable term definitions (AWE, TTD, QME, etc.) |
| `tier2-education.ts` | Always-present regulatory education (statutory citations + consequences) |
| `training-modules.ts` | Mandatory 4-module training gate content |
| `workflow-definitions.ts` | Step-by-step decision workflows |
| `letter-templates.ts` | Letter generation templates |
| `regulatory-changes.ts` | Active regulatory change notifications |
| `quarterly-refreshers.ts` | Quarterly assessment questions |

### Database Changes

If your feature requires new models or columns:

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Update `prisma/seed.ts` if seed data is needed
4. Run `npx prisma generate` to regenerate the client

### Adding a New Audit Event Type

1. Add the new value to the `AuditEventType` enum in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_event_type_name`
3. Use it in `logAuditEvent({ eventType: 'YOUR_NEW_EVENT', ... })` calls

### Service Layer Deep Dive

This section documents the key service modules and their responsibilities.

#### UPL Classifier (`server/services/upl-classifier.service.ts`)

The most critical compliance service. Two public functions:

- `classifyQuery(query)` — Full two-stage pipeline (regex + LLM). Async. Use in production paths.
- `classifyQuerySync(query)` — Stage 1 only (regex). Synchronous. Use in tests and fast-path checks.

The regex stage has 370+ test cases and catches ~60% of queries without an LLM call. The conservative default is YELLOW (not GREEN): if no pattern matches, the query is treated as borderline.

Pattern categories in Stage 1:
- RED patterns: "should I deny/accept/settle", case valuation, coverage opinions, legal strategy
- ADVERSARIAL patterns: role-play instructions, hypothetical framing, prompt injection attempts
- GREEN patterns: "what does the report say", calculation requests, deadline lookups

#### UPL Validator (`server/services/upl-validator.service.ts`)

Post-generation output scanner. Two functions:

- `validateOutput(text)` — Regex-only scan. Synchronous. Returns `{ result: 'PASS' | 'FAIL', violations[] }`.
- `validateOutputFull(text)` — Regex + LLM-based subtle advisory detection. Async.

Prohibited language patterns include:
- Legal conclusions: "coverage exists", "liability is clear", "claim should be denied"
- Advisory language: "I recommend", "you should consider", "in my opinion"
- Case law application: "under [case name]", "applying the rule in"
- Settlement/valuation: "the claim is worth", "fair settlement range"

Each violation includes `pattern`, `matchedText`, `position`, `severity` (CRITICAL or WARNING), and `suggestion` (a compliant rewrite).

#### Examiner Chat (`server/services/examiner-chat.service.ts`)

Orchestrates the full 3-stage UPL pipeline for chat messages:

```
processExaminerChat(request)
    │
    ├── 1. classifyQuery(message)           → UPL zone
    │       ├── RED → block + attorney referral message
    │       └── GREEN/YELLOW → continue
    │
    ├── 2. RAG retrieval                    → document chunks
    │       └── Filtered by document access (no attorney-only docs)
    │
    ├── 3. LLM generation                  → AI response
    │       └── System prompt: EXAMINER_CASE_CHAT_PROMPT
    │
    ├── 4. validateOutput(response)         → PASS/FAIL
    │       ├── FAIL → block + audit log
    │       └── PASS → continue
    │
    ├── 5. getDisclaimer(zone)              → disclaimer text
    │
    └── 6. Persist messages + audit log
```

The response includes the full audit trail: classification zone, confidence, validation result, citations, and disclaimer. This transparency is part of the Glass Box philosophy.

#### Benefit Calculator (`server/services/benefit-calculator.service.ts`)

Pure arithmetic functions with no side effects:

- `calculateTdRate(awe, dateOfInjury)` — Weekly TD rate = 2/3 AWE, clamped to statutory min/max per injury year (LC 4653)
- `calculateTdBenefit({ awe, dateOfInjury, startDate, endDate })` — Full payment schedule with 14-day periods (LC 4650)
- `generatePaymentSchedule(weeklyRate, startDate, endDate)` — Biweekly payment entries
- `calculateDeathBenefit({ dateOfInjury, numberOfDependents, dependentType })` — Death benefit per LC 4700-4706

Every response includes statutory authority citations and calculation inputs for auditability. This is a GREEN zone feature.

#### Deadline Engine (`server/services/deadline-engine.service.ts`)

Manages regulatory deadlines calculated from statutory requirements:

- `getClaimDeadlines(claimId)` — Returns deadlines with urgency classification (GREEN/YELLOW/RED/OVERDUE)
- `getDeadlineSummary(claimId)` — Aggregate counts by urgency
- `getAllUserDeadlinesPaginated(userId, orgId, role, options)` — Dashboard view sorted by urgency
- `markDeadline(id, status, reason?)` — Mark as MET or WAIVED
- `classifyUrgency(dueDate, now?)` — Classify a deadline's urgency based on days remaining

Urgency classification:
- GREEN: 7+ days remaining
- YELLOW: 3-6 days remaining
- RED: 0-2 days remaining
- OVERDUE: past due date

#### Document Access Service (`server/services/document-access.service.ts`)

Enforces attorney/examiner data boundaries at the database query level:

- `getDocumentAccessFilter(role)` — Returns Prisma where-clause fragment excluding attorney-only, privileged, work product, and legal analysis documents
- `isDocumentAccessible(document, role)` — Boolean check for a single document
- `getRagAccessFilter()` — Prisma filter for RAG retrieval (excludes same categories)

All examiner-side roles (CLAIMS_EXAMINER, CLAIMS_SUPERVISOR, CLAIMS_ADMIN) are filtered identically. There are no attorney roles in AdjudiCLAIMS.

#### Letter Template Service (`server/services/letter-template.service.ts`)

Template-based letter generation for benefit explanations, employer notifications, etc.:

- `getTemplates()` — List all available templates
- `getTemplate(templateId)` — Get template detail
- `populateTemplate(templateId, data)` — Fill template placeholders with claim data
- `generateLetter(userId, claimId, templateId, request, overrides?)` — Generate, persist, and audit-log a letter

Templates are defined in `server/data/letter-templates.ts` with types: TD_BENEFIT_EXPLANATION, TD_PAYMENT_SCHEDULE, WAITING_PERIOD_NOTICE, EMPLOYER_NOTIFICATION_LC3761, BENEFIT_ADJUSTMENT_NOTICE. All are GREEN zone (factual content only).

#### Lien Management (`server/services/lien-management.service.ts`)

Full lien lifecycle management with OMFS fee schedule comparison:

- `createLien(claimId, data)` — Create lien record
- `getLien(lienId)` / `getClaimLiens(claimId)` — Retrieve liens
- `updateLienStatus(lienId, status, resolvedAmount?)` — Status transitions with validation
- `addLineItems(lienId, items)` — Add service line items
- `runOmfsComparison(lienId)` — Compare line items against OMFS fee schedule
- `calculateLienExposure(claimId)` — Total exposure calculation
- `checkFilingCompliance(lienId)` — Filing fee and deadline compliance check

### System Prompts

`server/prompts/adjudiclaims-chat.prompts.ts` defines three system prompts:

1. **EXAMINER_CASE_CHAT_PROMPT** — Primary chat interface. Defines GREEN/YELLOW/RED zone rules, what the AI can and cannot do, citation requirements, and prohibited language.

2. **EXAMINER_DRAFT_CHAT_PROMPT** — Document editing assistant for factual correspondence.

3. **COUNSEL_REFERRAL_PROMPT** — Factual claim summary generator for defense counsel referral.

These prompts are legally critical. Changes to them must be reviewed for UPL compliance.

### Static Data Files

`server/data/` contains static data used by the education, training, and workflow systems:

| File | Content | Count |
|------|---------|-------|
| `tier1-terms.ts` | Dismissable term definitions (AWE, TTD, QME, etc.) | Categories: BENEFITS, MEDICAL, LEGAL_PROCESS, REGULATORY_BODIES, CLAIM_LIFECYCLE, DOCUMENTS_FORMS |
| `tier2-education.ts` | Always-present regulatory education entries | Feature contexts: CLAIM_INTAKE, BENEFIT_CALCULATION, DEADLINE_TRACKING, etc. |
| `training-modules.ts` | Mandatory 4-module training gate content with assessment questions | 4 modules |
| `workflow-definitions.ts` | Step-by-step decision workflows | 20 workflows |
| `letter-templates.ts` | Letter generation templates | 5 templates |
| `regulatory-changes.ts` | Active regulatory change notifications | Dynamic |
| `quarterly-refreshers.ts` | Quarterly assessment questions | Per-quarter |

### Detailed Test Examples

#### Health Check Route Test

The simplest pattern. Mock Prisma, build the server, inject requests:

```typescript
// tests/unit/health.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock Prisma BEFORE importing the server
vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ /* ... */ }),
    },
  },
}));

// Dynamic import after mock is in place
const { buildServer } = await import('../../server/index.js');

describe('Health check endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => { server = await buildServer(); });
  afterAll(async () => { await server.close(); });

  it('GET /api/health returns 200', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      product: 'AdjudiCLAIMS',
      version: '0.1.0',
    });
  });
});
```

#### Pure Service Unit Test

No mocking needed for pure functions:

```typescript
// tests/unit/calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTdRate } from '../../server/services/benefit-calculator.service.js';

describe('TD Rate Calculation', () => {
  it('calculates 2/3 AWE for standard case', () => {
    const result = calculateTdRate(900, new Date('2026-01-15'));
    expect(result.weeklyRate).toBeCloseTo(600, 2);
    expect(result.statutoryAuthority).toContain('LC 4653');
  });

  it('clamps to statutory minimum', () => {
    const result = calculateTdRate(100, new Date('2026-01-15'));
    expect(result.wasClampedToMin).toBe(true);
  });

  it('clamps to statutory maximum', () => {
    const result = calculateTdRate(5000, new Date('2026-01-15'));
    expect(result.wasClampedToMax).toBe(true);
  });
});
```

#### UPL Classifier Test Pattern

Tests for the UPL classifier use `classifyQuerySync()` (regex-only, synchronous) for speed:

```typescript
// tests/unit/upl-classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyQuerySync } from '../../server/services/upl-classifier.service.js';

describe('RED zone queries', () => {
  const queries = [
    'Should I deny this claim?',
    'Should I accept this claim?',
    'What is this case worth?',
    'Is coverage clear here?',
  ];

  it.each(queries)('blocks RED: %s', (query) => {
    const result = classifyQuerySync(query);
    expect(result.zone === 'RED' || result.zone === 'YELLOW').toBe(true);
  });
});

describe('GREEN zone queries', () => {
  const queries = [
    'What is the TD rate for $800 AWE?',
    'What body parts are in this claim?',
    'When is the next deadline?',
  ];

  it.each(queries)('allows GREEN: %s', (query) => {
    const result = classifyQuerySync(query);
    expect(result.zone).toBe('GREEN');
  });
});
```

#### Authenticated Route Test Pattern

For routes that require authentication, set up a session cookie:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const mockUserFindUnique = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    // ... mock all models used by routes
    user: { findUnique: (...args) => mockUserFindUnique(...args) },
    educationProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

const { buildServer } = await import('../../server/index.js');

describe('Claims routes', () => {
  let server;

  beforeAll(async () => { server = await buildServer(); });
  afterAll(async () => { await server.close(); });

  // Helper: login and get session cookie
  async function loginAs(email: string) {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      email,
      name: 'Test',
      role: 'CLAIMS_EXAMINER',
      organizationId: 'org-1',
      isActive: true,
    });

    const loginResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email },
    });

    // Extract session cookie
    const cookie = loginResponse.headers['set-cookie'];
    return Array.isArray(cookie) ? cookie[0] : cookie;
  }

  it('requires authentication', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/claims',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns claims for authenticated user', async () => {
    const cookie = await loginAs('examiner@test.com');
    // ... mock prisma.claim.findMany, etc.
    const response = await server.inject({
      method: 'GET',
      url: '/api/claims',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
  });
});
```

### Graceful Shutdown

The server implements graceful shutdown in `server/index.ts`:

```
SIGTERM/SIGINT received
    │
    ├── server.close()           → Stop accepting new requests, finish in-flight
    ├── disconnectTemporal()     → Close Temporal connection
    ├── prisma.$disconnect()     → Close database connection pool
    └── Sentry.close(2000)       → Flush pending events (2s timeout)
```

Uncaught exceptions and unhandled rejections are captured by Sentry before shutdown.

### Rate Limiting

Global rate limit: 100 requests per 15 minutes per IP, applied via `@fastify/rate-limit`. This is registered as a Fastify plugin in `server/index.ts`.

### Session Management

Sessions use `@fastify/session` with cookie storage:

| Setting | Value |
|---------|-------|
| Cookie secure | `true` in production, `false` in development |
| Cookie httpOnly | `true` (not accessible via JavaScript) |
| Cookie sameSite | `lax` |
| Cookie maxAge | 8 hours (28,800,000 ms) |
| Secret | `SESSION_SECRET` env var (min 32 chars in production) |

The session stores a `SessionUser` object:

```typescript
interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  isTrainingComplete?: boolean;
}
```

### RBAC Model

| Role | Claim Visibility | Document Delete | Org Members | Audit Export | Compliance Admin |
|------|-----------------|----------------|-------------|-------------|-----------------|
| CLAIMS_EXAMINER | Assigned only | No | No | No | No |
| CLAIMS_SUPERVISOR | All in org | Yes | Yes | No | Team view |
| CLAIMS_ADMIN | All in org | Yes | Yes | Yes | Full org report |

The RBAC model is implemented via `requireRole()` middleware and `verifyClaimAccess()` utility. All roles are examiner-side; there are no attorney roles in AdjudiCLAIMS.

### Concrete Example: Adding a New Feature End-to-End

Suppose you need to add a "subrogation tracking" feature. Here is the full workflow:

**Step 1: Database model** — Add to `prisma/schema.prisma`:

```prisma
model SubrogationClaim {
  id            String   @id @default(cuid()) @map("id")
  claimId       String   @map("claim_id")
  thirdParty    String   @map("third_party")
  amountSought  Decimal  @map("amount_sought") @db.Decimal(12, 2)
  status        String   @default("OPEN") @map("status")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  claim         Claim    @relation(fields: [claimId], references: [id])

  @@index([claimId], map: "idx_subrogation_claim_id")
  @@map("subrogation_claims")
}
```

Run `npx prisma migrate dev --name add_subrogation`.

**Step 2: Service** — Create `server/services/subrogation.service.ts`:

```typescript
import { prisma } from '../db.js';

export interface CreateSubrogationInput {
  claimId: string;
  thirdParty: string;
  amountSought: number;
}

export async function createSubrogation(input: CreateSubrogationInput) {
  return prisma.subrogationClaim.create({
    data: {
      claimId: input.claimId,
      thirdParty: input.thirdParty,
      amountSought: input.amountSought,
    },
  });
}

export async function getClaimSubrogations(claimId: string) {
  return prisma.subrogationClaim.findMany({
    where: { claimId },
    orderBy: { createdAt: 'desc' },
  });
}
```

**Step 3: Route** — Create `server/routes/subrogation.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import { logAuditEvent } from '../middleware/audit.js';
import { createSubrogation, getClaimSubrogations } from '../services/subrogation.service.js';

const CreateBodySchema = z.object({
  thirdParty: z.string().min(1),
  amountSought: z.number().positive(),
});

export async function subrogationRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/claims/:claimId/subrogation',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const parsed = CreateBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });

      // UPL note: subrogation tracking is YELLOW zone — involves potential legal issues
      const result = await createSubrogation({ claimId, ...parsed.data });

      void logAuditEvent({
        userId: user.id,
        claimId,
        eventType: 'CLAIM_STATUS_CHANGED',
        eventData: { action: 'subrogation_created', subrogationId: result.id },
        request,
      });

      return reply.code(201).send(result);
    },
  );
}
```

**Step 4: Register** — Add to `server/index.ts`:

```typescript
import { subrogationRoutes } from './routes/subrogation.js';
// ...
await server.register(subrogationRoutes, { prefix: '/api' });
```

**Step 5: Test** — Create `tests/unit/subrogation.test.ts` following the patterns above.

**Step 6: Run tests** — `npm run test:all`

### Path Aliases

The project uses TypeScript path aliases:

| Alias | Maps To | Usage |
|-------|---------|-------|
| `~/*` | `./app/*` | Frontend code |
| `@server/*` | `./server/*` | Backend code |

These are configured in `tsconfig.json` and mirrored in the Vitest configs via the `resolve.alias` setting.

### TypeScript Configuration

The project uses strict TypeScript (`strict: true`) with additional strictness flags:

- `noUncheckedIndexedAccess: true` — Array/object index access returns `T | undefined`
- `verbatimModuleSyntax: true` — Enforces explicit `type` imports
- `isolatedModules: true` — Required for Vite compatibility
- `noEmit: true` — TypeScript is used for type checking only; Vite handles compilation

Target is ES2022 with ESNext modules and Bundler module resolution.

### Logging

The application uses Pino for structured JSON logging:

- **Development**: Pretty-printed with timestamps via `pino-pretty`
- **Production**: Raw JSON for log aggregation

Log levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. Fastify automatically logs request/response metadata.

Key logging rules:
- NEVER log PII (patient names, SSNs, medical details)
- NEVER log secret values (API keys, tokens)
- Log document IDs, not document content
- Log user IDs, not email addresses
- Audit log failures are logged as errors but never crash requests

### Environment-Specific Behavior

| Behavior | Development | Test | Production |
|----------|------------|------|------------|
| CORS | Allow all origins | N/A | Explicit allowlist required |
| Session cookie secure | `false` | N/A | `true` |
| Session secret | Default value | Default value | Required (min 32 chars) |
| Error stack traces | Included in response | N/A | Stripped |
| Pino transport | pino-pretty | Default | Raw JSON |
| Sentry | No-op without DSN | No-op | Active |
| LLM calls | Stub mode without API keys | Stub mode | Live API calls |
| Rate limit | 100/15min | 100/15min | 100/15min |

### Common Development Tasks

**Reset everything and start fresh:**

```bash
docker compose down -v                   # Destroy database volume
docker compose up -d                      # Recreate database
npx prisma migrate dev                    # Apply all migrations
npx prisma db seed                        # Seed development data
npm run dev                               # Start the app
```

**Check types without running tests:**

```bash
npm run typecheck
```

**Format and lint:**

```bash
npm run format                            # Prettier
npm run lint                              # ESLint
```

**Explore the database:**

```bash
npx prisma studio                         # Browser UI at localhost:5555
```

**Connect to the database directly:**

```bash
docker exec -it adjudiclaims-ai-app-1-postgres-1 \
  psql -U adjudiclaims -d adjudiclaims
```
