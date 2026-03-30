# SOC 2 Type II Compliance Implementation Plan — AdjudiCLAIMS

**Document Type:** Compliance Architecture Plan
**Product:** AdjudiCLAIMS by Glass Box Solutions, Inc.
**Date:** 2026-03-28
**Author:** Compliance Architecture (Opus)
**Status:** Planning — Pre-Audit
**Target Audit Window:** Q4 2026 (Type I readiness) / Q2 2027 (Type II observation period complete)

---

## PART 1: CURRENT STATE ASSESSMENT

This assessment maps every SOC 2 Trust Service Criterion to what AdjudiCLAIMS already has in code, configuration, and documentation versus what is missing.

---

### TSC 1: SECURITY (Common Criteria CC1-CC9)

#### CC1 — Control Environment

**EXISTS:**
- RBAC with three roles (`CLAIMS_EXAMINER`, `CLAIMS_SUPERVISOR`, `CLAIMS_ADMIN`) defined in `prisma/schema.prisma` (UserRole enum, line 36) and enforced in `server/middleware/rbac.ts`
- Organization-scoped multi-tenancy (Organization model, line 420 of schema)
- Mandatory training gate before product access (`server/middleware/training-gate.ts`) with `EducationProfile.isTrainingComplete` flag
- Code of conduct equivalent: UPL compliance is a legal requirement baked into the product (Cal. Bus. & Prof. Code section 6125)
- CLAUDE.md and ROOT_CLAUDE.md define development guardrails (no force push, no secrets in code, 100% test pass)

**MISSING:**
- P0: Formal Information Security Policy document (written policy, not just code)
- P0: Organizational chart mapping control owners to TSC criteria
- P1: Formal employee security training program (distinct from product training)
- P1: Background check policy for personnel with system access
- P1: Board/management oversight documentation for security program

#### CC2 — Communication and Information

**EXISTS:**
- Comprehensive product documentation in `docs/product/` (PRD, user guide, education spec, decision workflows, onboarding spec, compliance implementation guide, data boundary spec)
- Compliance standards templates in `docs/standards/` (UPL disclaimer, AI transparency, data retention, HIPAA boilerplate)
- Audit trail accessible to supervisors via `server/routes/audit.ts` (claim audit, user audit, UPL events, admin export)
- Compliance dashboard with role-scoped views via `server/routes/compliance.ts`
- Error reporting via Sentry (`server/lib/instrumentation.ts`)

**MISSING:**
- P0: Internal security incident communication procedure
- P1: External breach notification templates and procedures (client notification, regulatory notification)
- P1: Formal change communication process for system changes affecting users
- P2: Security awareness newsletter or update channel for staff

#### CC3 — Risk Assessment

**EXISTS:**
- UPL risk is formally modeled and mitigated with three enforcement layers: query classifier (`server/services/upl-classifier.service.ts`), system prompt, and output validator (`server/services/upl-validator.service.ts`)
- Conservative default: uncertain classifications default to RED (blocked). See `classifyByKeywords()` and `parseLlmResponse()` fallback logic
- Adversarial attack detection: 7 jailbreak patterns in `ADVERSARIAL_PATTERNS` array
- Data boundary specification separating attorney and examiner data (`docs/product/DATA_BOUNDARY_SPECIFICATION.md`)

**MISSING:**
- P0: Formal risk assessment document covering all system risks (not just UPL)
- P0: Annual risk assessment cadence and ownership
- P0: Vendor risk assessment for each third-party service
- P1: Risk register with risk ratings, owners, and mitigation status
- P1: Threat modeling documentation for the application architecture

#### CC4 — Monitoring Activities

**EXISTS:**
- Sentry error monitoring with console error capture (`server/lib/instrumentation.ts`, 100% trace sample rate)
- 38+ audit event types tracked via `AuditEventType` enum (schema lines 163-211): login, logout, document operations, chat, UPL classifications, UPL blocks, deadline events, compliance events, training events
- Immutable audit log: `AuditEvent` model has no `updatedAt` field, append-only by design (schema line 881, audit middleware line 19-20)
- Health check endpoints: liveness (`/api/health`) and readiness (`/api/health/db`) in `server/routes/health.ts`
- Docker HEALTHCHECK configured with 30s interval (`Dockerfile` line 67)
- UPL monitoring dashboard for supervisors (`/api/compliance/upl` endpoint)

**MISSING:**
- P0: Alerting rules for security-relevant events (failed login spikes, unusual access patterns, privilege escalation attempts)
- P0: Log aggregation pipeline with retention policy (currently logs go to Cloud Logging via `cloudbuild.yaml` line 161 `CLOUD_LOGGING_ONLY`, but no formal retention or alerting configuration is documented)
- P1: Regular audit log review procedure (who reviews, how often, what they look for)
- P1: Anomaly detection for unusual data access patterns
- P2: Automated compliance drift detection

#### CC5 — Control Activities

**EXISTS:**
- Input validation on all route files via Zod schemas (verified by `tests/upl-compliance/security-audit.test.ts` lines 223-285)
- Message length limits on chat input (security audit test verifies `.max()` on chat route, line 271)
- File upload size awareness (security audit test checks for limits, lines 492-511)
- All database access via Prisma ORM (no raw SQL injection vectors, verified by security audit test lines 380-448)
- Session cookies: `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'`, 8-hour maxAge (`server/index.ts` lines 69-74)
- Global rate limiting: 100 requests per 15 minutes (`server/index.ts` lines 78-81)
- Non-root container execution (`Dockerfile` lines 61-63, UID 1001)

**MISSING:**
- P0: Session timeout on inactivity (current 8-hour maxAge is absolute, not idle-based)
- P1: Password policy enforcement (current auth is email-only dev mode, `server/routes/auth.ts` lines 7-8 explicitly state this is not production auth)
- P0: MFA requirement for all roles
- P1: API key rotation procedure for Anthropic, Voyage, Temporal, Sentry
- P1: IP allowlisting or network-level access controls documentation
- P2: WAF (Web Application Firewall) configuration

#### CC6 — Logical and Physical Access Controls

**EXISTS:**
- Session-based authentication with `requireAuth()` middleware enforced on all protected routes (verified by security audit test lines 326-375)
- Role-based authorization with `requireRole()` middleware (e.g., audit export restricted to `CLAIMS_ADMIN`, UPL dashboard to `CLAIMS_SUPERVISOR+`)
- Organization-scoped claim access: `server/middleware/claim-access.ts` verifies org membership AND examiner assignment for `CLAIMS_EXAMINER` role
- Document access control: `AccessLevel` enum (`SHARED`, `ATTORNEY_ONLY`, `EXAMINER_ONLY`) with flags for `containsLegalAnalysis`, `containsWorkProduct`, `containsPrivileged` (schema lines 559-562)
- RAG retrieval filtering excludes attorney-only, legal analysis, work product, and privileged documents (`server/services/examiner-chat.service.ts` lines 131-140)
- Secrets managed via GCP Secret Manager (all secrets injected via `--set-secrets` in `cloudbuild.yaml` lines 100, 121, 142)
- No hardcoded secrets in codebase (verified by security audit test lines 69-155)
- `.gitignore` excludes `.env` files

**MISSING:**
- P0: Production authentication system (current email-only login is explicitly dev-mode, `server/routes/auth.ts` line 8)
- P0: User provisioning and de-provisioning procedure
- P0: Access review procedure (quarterly review of who has access to what)
- P1: Service account inventory and least-privilege review
- P1: GCP IAM role documentation for Cloud Run, Secret Manager, Cloud SQL
- P2: Physical security documentation (GCP handles physical controls, but need to document reliance on GCP SOC 2)

#### CC7 — System Operations

**EXISTS:**
- CI/CD pipeline in `cloudbuild.yaml`: install, Prisma generate, typecheck, unit tests, UPL compliance tests, Docker build, push to Artifact Registry, deploy API + 2 workers, run migrations
- Tests required before deployment: unit tests (step 4), UPL tests (step 5), typecheck (step 3) must pass before Docker build (step 6)
- Three Cloud Run services: API server, document worker, LLM worker
- Database migrations via Cloud Run job (`cloudbuild.yaml` step 11)
- Multi-stage Docker build minimizing attack surface (`Dockerfile`)
- Temporal.io workflow orchestration for document and LLM processing

**MISSING:**
- P0: Incident response procedure (detection, triage, containment, eradication, recovery, post-mortem)
- P0: Rollback procedure for failed deployments
- P1: Capacity planning documentation
- P1: Backup and recovery procedure for PlanetScale database
- P1: Disaster recovery plan with RTO/RPO targets
- P2: Runbook for common operational scenarios

#### CC8 — Change Management

**EXISTS:**
- Cloud Build CI/CD pipeline enforcing test pass before deploy (`cloudbuild.yaml`)
- Git branch-based workflow (current branch: `feat/document-workflow-engine`, main branch protection implied)
- TypeScript strict type checking (`npm run typecheck`)
- Comprehensive test suites: 70+ unit tests, integration tests, UPL compliance tests, RAG evaluation tests
- Code review implied by GitHub organization structure

**MISSING:**
- P0: Formal change approval process documentation (who approves changes, what requires approval)
- P0: Change log / release notes procedure
- P1: Emergency change procedure
- P1: Post-deployment verification checklist
- P1: Rollback criteria and procedure
- P2: Change Advisory Board (CAB) or equivalent for high-risk changes

#### CC9 — Risk Mitigation

**EXISTS:**
- UPL risk mitigation is the core product architecture (three-layer pipeline)
- Conservative defaults throughout (RED zone on uncertainty)
- Error handling: global error handler strips stack traces in production (`server/lib/error-handler.ts` lines 30-31), maps errors to consistent HTTP responses
- Sentry captures unhandled exceptions
- Audit failures are non-blocking (audit middleware catches errors and continues, `server/middleware/audit.ts` lines 42-44)

**MISSING:**
- P0: Insurance coverage documentation (cyber liability, E&O)
- P1: Vendor SLA documentation and monitoring
- P1: Business impact analysis for each system component

---

### TSC 2: AVAILABILITY (A1)

**EXISTS:**
- Cloud Run with min 1 / max 10 instances for API, min 1 / max 5 for workers (`cloudbuild.yaml` lines 97-99, 113-116, 136-139)
- Health checks: liveness (`/api/health`) and readiness (`/api/health/db`)
- Docker HEALTHCHECK with 30s interval, 5s timeout, 3 retries
- PlanetScale database (managed, highly available by design)
- GCP Cloud Run (managed, auto-scaling, multi-zone)

**MISSING:**
- P0: Documented SLA commitment (e.g., 99.9% uptime)
- P0: Uptime monitoring and reporting (external monitoring, status page)
- P1: Disaster recovery plan with RTO/RPO
- P1: Business continuity plan
- P1: Capacity planning documentation
- P2: Load testing results and baseline performance metrics

---

### TSC 3: PROCESSING INTEGRITY (PI1)

**EXISTS:**
- UPL 3-stage validation pipeline ensures AI output integrity (classify, generate, validate)
- 11 prohibited output patterns with CRITICAL severity in output validator
- Zod schema validation on all API inputs
- Prisma ORM ensures data type integrity at the database layer
- Decimal types for financial calculations (schema uses `@db.Decimal(12,2)` and `@db.Decimal(10,2)`)
- Benefit calculator with statutory citation backing (LC 4653, LC 4650)
- Late payment penalty calculation with statutory basis (LC 4650(c))
- Deadline tracking with statutory authority citations (`RegulatoryDeadline.statutoryAuthority`)

**MISSING:**
- P1: Data integrity verification procedures (checksums, reconciliation)
- P1: Error correction procedures documentation
- P2: Processing completeness monitoring (e.g., all documents processed, all deadlines generated)

---

### TSC 4: CONFIDENTIALITY (C1)

**EXISTS:**
- Audit middleware explicitly avoids logging PHI (comments throughout `server/services/examiner-chat.service.ts`: "never log message content", "never log PII -- only IDs, zones, and counts")
- Security audit tests verify no PHI in audit logs (`tests/upl-compliance/security-audit.test.ts` lines 161-217)
- Secret management via GCP Secret Manager (all connection strings, API keys, session secrets)
- Organization-scoped data isolation (all queries scoped by `organizationId`)
- Document access levels (`AccessLevel` enum) preventing cross-role data leakage
- CORS configuration with production allowlist (`server/index.ts` lines 50-63)
- Sentry instrumentation comment: "never log claim content, only metadata and IDs" (`server/lib/instrumentation.ts` line 30)

**MISSING:**
- P0: Data classification policy (what is Confidential vs Internal vs Public)
- P0: Encryption at rest documentation (PlanetScale provides TDE, GCP provides default encryption, but this must be documented)
- P0: Encryption in transit documentation (TLS configuration for all connections)
- P1: Data masking policy beyond SSN (what about claimant names, DOB, medical records in non-audit contexts?)
- P1: Confidential data disposal procedures
- P1: NDA and confidentiality agreement policy for employees and contractors

---

### TSC 5: PRIVACY (P1-P8)

**EXISTS:**
- Data retention template with statutory basis (`docs/standards/DATA_RETENTION_TEMPLATE.md`): CA Labor Code section 5955 (7 years), HIPAA 45 CFR section 164.530(j) (6 years)
- HIPAA boilerplate with PHI inventory table (`docs/standards/HIPAA_BOILERPLATE.md`)
- AI transparency template (`docs/standards/AI_TRANSPARENCY_TEMPLATE.md`)
- PHI field inventory started in HIPAA boilerplate (claimant name, DOB, DOI, diagnosis codes, treatment records, QME/AME reports, WC claim number, SSN last 4)
- Sub-processor disclosure framework in HIPAA boilerplate

**MISSING:**
- P0: Privacy policy (public-facing, end-user)
- P0: Data Processing Agreement (DPA) templates for customers
- P0: Sub-processor agreements with all vendors (Anthropic, Google, PlanetScale, Temporal, Voyage, Sentry)
- P0: Right to deletion implementation (no `DELETE` endpoints for PII exist in the codebase)
- P1: Privacy impact assessment
- P1: Consent management mechanism
- P1: Data subject access request (DSAR) procedure
- P1: Cross-border data transfer documentation (all vendors US-based, but must document)
- P2: Cookie consent mechanism (if applicable for web app)

---

## PART 2: IMPLEMENTATION ROADMAP

### Phase 1: Audit Blockers (P0) — Weeks 1-8

These items must be completed before a SOC 2 Type I engagement can begin.

| # | Gap | Type | Effort | Owner | Week |
|---|-----|------|--------|-------|------|
| 1.1 | Production authentication (BetterAuth or equivalent) replacing email-only login | CODE | 2 weeks | Engineering | 1-2 |
| 1.2 | MFA enforcement for all roles | CODE + CONFIG | 1 week | Engineering | 3 |
| 1.3 | Idle session timeout (15 min inactivity, distinct from 8hr absolute) | CODE | 2 days | Engineering | 3 |
| 1.4 | Information Security Policy document | DOCUMENT | 1 week | Compliance | 1 |
| 1.5 | Risk Assessment document (annual cadence) | DOCUMENT | 1 week | Compliance | 2 |
| 1.6 | Incident Response Procedure | DOCUMENT | 1 week | Compliance | 3 |
| 1.7 | Change Management Policy | DOCUMENT | 3 days | Compliance | 4 |
| 1.8 | Vendor Risk Assessment (all 6 vendors) | DOCUMENT | 2 weeks | Compliance | 4-5 |
| 1.9 | Access Review Procedure + first quarterly review | DOCUMENT + PROCESS | 1 week | Compliance | 5 |
| 1.10 | User provisioning/de-provisioning procedure | DOCUMENT + CODE | 1 week | Engineering | 6 |
| 1.11 | Encryption documentation (at rest + in transit) | DOCUMENT | 3 days | Engineering | 6 |
| 1.12 | Data Classification Policy | DOCUMENT | 3 days | Compliance | 6 |
| 1.13 | Privacy Policy (public-facing) | DOCUMENT | 1 week | Legal | 7 |
| 1.14 | DPA template for customers | DOCUMENT | 1 week | Legal | 7 |
| 1.15 | Security alerting rules (Cloud Monitoring) | CONFIG | 3 days | Infrastructure | 7 |
| 1.16 | Rollback procedure for deployments | DOCUMENT + CONFIG | 2 days | Engineering | 8 |
| 1.17 | Formal SLA commitment documentation | DOCUMENT | 2 days | Product | 8 |
| 1.18 | Control owner mapping (org chart to TSC) | DOCUMENT | 2 days | Compliance | 8 |

### Phase 2: Important Controls (P1) — Weeks 9-16

| # | Gap | Type | Effort | Owner | Week |
|---|-----|------|--------|-------|------|
| 2.1 | Employee security training program | DOCUMENT + PROCESS | 1 week | Compliance | 9 |
| 2.2 | Background check policy | DOCUMENT | 2 days | HR | 9 |
| 2.3 | Right to deletion API endpoints | CODE | 1 week | Engineering | 10 |
| 2.4 | DSAR procedure | DOCUMENT + CODE | 1 week | Engineering | 11 |
| 2.5 | Password policy enforcement (complexity, rotation) | CODE | 3 days | Engineering | 10 |
| 2.6 | API key rotation procedure + automation | CODE + DOCUMENT | 1 week | Infrastructure | 11 |
| 2.7 | Disaster recovery plan (RTO/RPO) | DOCUMENT | 1 week | Infrastructure | 12 |
| 2.8 | Business continuity plan | DOCUMENT | 1 week | Compliance | 12 |
| 2.9 | Audit log review procedure | DOCUMENT + PROCESS | 3 days | Compliance | 13 |
| 2.10 | Penetration testing (first engagement) | TEST | 2 weeks | External Vendor | 13-14 |
| 2.11 | GCP IAM role documentation | DOCUMENT | 3 days | Infrastructure | 14 |
| 2.12 | Service account inventory + least privilege review | CONFIG + DOCUMENT | 3 days | Infrastructure | 14 |
| 2.13 | Breach notification templates | DOCUMENT | 3 days | Legal | 15 |
| 2.14 | Capacity planning documentation | DOCUMENT | 2 days | Infrastructure | 15 |
| 2.15 | Post-deployment verification checklist | DOCUMENT | 1 day | Engineering | 16 |
| 2.16 | Anomaly detection for unusual access patterns | CODE + CONFIG | 1 week | Engineering | 16 |
| 2.17 | Sub-processor agreements (BAAs/DPAs) with all vendors | DOCUMENT | 2 weeks | Legal | 9-10 |
| 2.18 | SOC 2 compliance test suite (50+ automated tests) | TEST | 2 weeks | Engineering | 15-16 |

### Phase 3: Enhancements (P2) — Weeks 17-24

| # | Gap | Type | Effort | Owner | Week |
|---|-----|------|--------|-------|------|
| 3.1 | Glass Box Transparency Dashboard | CODE | 3 weeks | Engineering | 17-19 |
| 3.2 | WAF configuration | CONFIG | 3 days | Infrastructure | 17 |
| 3.3 | Load testing and baseline metrics | TEST | 1 week | Engineering | 20 |
| 3.4 | Compliance drift detection automation | CODE | 1 week | Engineering | 21 |
| 3.5 | SOC 3 public trust page | CODE + DESIGN | 2 weeks | Marketing + Engineering | 22-23 |
| 3.6 | External uptime monitoring + status page | CONFIG | 3 days | Infrastructure | 24 |

---

## PART 3: TECHNICAL CONTROLS IMPLEMENTATION

### 3.1 Access Controls

#### 3.1.1 Production Authentication

**Current state:** `server/routes/auth.ts` lines 7-8 explicitly state: "This does NOT perform password authentication. It is a development-only convenience that will be replaced with BetterAuth."

**Required implementation:**

File: `server/routes/auth.ts` (rewrite)
- Replace email-only lookup with BetterAuth (or equivalent) integration
- Implement password hashing (bcrypt/argon2, min cost 12)
- Implement email verification flow
- Add account lockout after 5 failed attempts (30-minute lockout)
- Add audit event `USER_LOGIN_FAILED` to the `AuditEventType` enum

File: `server/middleware/rbac.ts` (extend)
- Add MFA verification check to `requireAuth()`
- Add `mfaVerified: boolean` to `SessionUser` interface

#### 3.1.2 Session Configuration

**Current state (`server/index.ts` lines 67-75):**
- `secure: true` in production
- `httpOnly: true`
- `sameSite: 'lax'`
- `maxAge: 8 hours` (absolute)

**Required changes:**
- Add rolling session with 15-minute idle timeout
- Implement session invalidation on password change
- Add concurrent session limit (max 3 active sessions per user)
- Store session data server-side (not in cookie) for revocation capability

#### 3.1.3 Rate Limiting Enhancement

**Current state (`server/index.ts` lines 78-81):** Global 100 requests per 15 minutes.

**Required changes:**
- Per-endpoint rate limits: `/api/auth/login` should be 10 attempts per 15 minutes (brute force protection)
- Chat endpoint: 30 messages per 15 minutes per user
- Document upload: 20 uploads per hour per user
- Audit export: 5 exports per hour per admin

#### 3.1.4 Service Account Management

**Required:** Document all GCP service accounts used by:
- Cloud Run API service
- Cloud Run document worker
- Cloud Run LLM worker
- Cloud Build
- Prisma Migrate job

Each must follow least-privilege principle. Document the IAM roles bound to each.

### 3.2 Data Protection

#### 3.2.1 PII/PHI Identification in Data Model

The following fields in `prisma/schema.prisma` contain PII or PHI:

| Model | Field | Classification | Sensitivity |
|-------|-------|---------------|-------------|
| Claim | `claimantName` | PII | HIGH |
| Claim | `dateOfInjury` | PHI | HIGH |
| Claim | `bodyParts` (JSON) | PHI | HIGH |
| Claim | `employer` | PII | MEDIUM |
| Document | `extractedText` | PHI (may contain medical records) | HIGH |
| DocumentChunk | `content` | PHI (may contain medical records) | HIGH |
| ChatMessage | `content` | PHI (user may include claim details) | HIGH |
| ChatSession | (linked to claim + user) | PII correlation | MEDIUM |
| BenefitPayment | `amount`, `calculationInputs` | PII/Financial | HIGH |
| CounselReferral | `legalIssue`, `summary` | Privileged/PHI | HIGH |
| GeneratedLetter | `content`, `populatedData` | PHI | HIGH |
| GraphNode | `canonicalName`, `properties` | PII/PHI (persons, diagnoses) | HIGH |
| GraphEdge | `properties` | PHI (medical relationships) | HIGH |
| AuditEvent | `ipAddress`, `userAgent` | PII | LOW |
| User | `email`, `name` | PII | MEDIUM |

#### 3.2.2 Encryption

**At rest:**
- PlanetScale: AES-256 encryption at rest (managed by PlanetScale, documented in their SOC 2 report)
- GCP Cloud Storage (document files): AES-256 default encryption
- GCP Artifact Registry (container images): AES-256 default encryption
- Vertex AI Vector Search: Google-managed encryption

**In transit:**
- All PlanetScale connections: TLS 1.2+ required
- Cloud Run ingress: HTTPS only (TLS 1.2+)
- Anthropic API: HTTPS (TLS 1.2+)
- Voyage AI API: HTTPS (TLS 1.2+)
- Temporal Cloud: TLS with API key authentication (env var `TEMPORAL_API_KEY` triggers TLS, per `server/lib/env.ts` line 58)
- Sentry: HTTPS (TLS 1.2+)
- Inter-service communication: all within GCP VPC

**Required documentation:** Create `docs/standards/ENCRYPTION_SPECIFICATION.md` documenting all of the above with version-specific TLS configurations.

#### 3.2.3 Data Retention Schedule

Based on `docs/standards/DATA_RETENTION_TEMPLATE.md` legal framework:

| Data Type | Retention Period | Legal Basis | Destruction Method |
|-----------|-----------------|-------------|-------------------|
| Claim records (all fields) | 7 years from last update | CA Labor Code section 5955 | Soft delete + hard purge after retention |
| Medical records (Document, DocumentChunk) | 7 years from last update | CA Labor Code section 5955 + HIPAA | Soft delete + hard purge |
| Chat messages | 7 years from creation | CA Labor Code section 5955 (claim-associated) | Cascade delete with claim |
| Audit events | 7 years from creation | CA Labor Code section 5955 + SOC 2 | Retained; never deleted during retention |
| User accounts | Duration of employment + 7 years | Contractual + CA Labor Code section 5955 | Anonymize PII, retain audit trail |
| Session data | 8 hours (maxAge) | Operational | Automatic expiry |
| Embeddings (Vertex AI) | Same as source document | Derived data follows source | Delete via API when source deleted |
| Graph nodes/edges | Same as source claim | Derived data follows source | Cascade delete with claim |

**Required code changes:**
- Add `deletedAt` (soft delete) column to Claim, Document, User models
- Implement retention enforcement job (Temporal workflow) that purges data past retention period
- Implement right-to-deletion endpoint that anonymizes PII fields while preserving audit integrity

#### 3.2.4 Log Sanitization

**Current state:** The codebase demonstrates strong awareness of PHI in logs:
- `server/services/examiner-chat.service.ts` line 246: "Audit log the classification -- never log message content (PII risk)"
- `server/services/examiner-chat.service.ts` line 448: "Audit log the response -- log provider/model/usage, never response content"
- `server/lib/instrumentation.ts` line 30: "never log claim content, only metadata and IDs"
- Security audit tests verify no PHI patterns in audit code

**Required enhancements:**
- Configure Sentry `beforeSend` hook to scrub PII fields (claimantName, email, SSN patterns) from error payloads
- Add Cloud Logging sink filter to redact any PII that reaches structured logs
- Document the sanitization approach in the Information Security Policy

### 3.3 Audit and Monitoring

#### 3.3.1 Current Audit Coverage

The `AuditEventType` enum contains 38 event types (schema lines 163-211). The current coverage is strong:

**Authentication events:** `USER_LOGIN`, `USER_LOGOUT`, `PERMISSION_DENIED`
**Document events:** `DOCUMENT_UPLOADED`, `DOCUMENT_CLASSIFIED`, `DOCUMENT_VIEWED`, `DOCUMENT_DELETED`
**Claim events:** `CLAIM_CREATED`, `CLAIM_STATUS_CHANGED`, `COVERAGE_DETERMINATION`, `RESERVE_CHANGED`
**AI/UPL events:** `CHAT_MESSAGE_SENT`, `CHAT_RESPONSE_GENERATED`, `UPL_ZONE_CLASSIFICATION`, `UPL_OUTPUT_BLOCKED`, `UPL_DISCLAIMER_INJECTED`, `UPL_OUTPUT_VALIDATION_FAIL`, `COUNSEL_REFERRAL_GENERATED`
**Compliance events:** `COMPLIANCE_REPORT_GENERATED`, `REGULATORY_CHANGE_ACKNOWLEDGED`
**Training events:** `TRAINING_MODULE_COMPLETED`, `TRAINING_ASSESSMENT_PASSED`, `TIER1_TERM_DISMISSED`

Each event captures: `userId`, `claimId` (optional), `eventType`, `eventData` (JSON), `uplZone` (optional), `ipAddress`, `userAgent`, `createdAt`.

#### 3.3.2 Audit Gaps (Events Needed)

Add these `AuditEventType` values:

| Event Type | Trigger | SOC 2 Criterion |
|------------|---------|-----------------|
| `USER_LOGIN_FAILED` | Failed login attempt | CC6 |
| `USER_ACCOUNT_LOCKED` | Account lockout after failed attempts | CC6 |
| `USER_MFA_ENROLLED` | MFA setup | CC6 |
| `USER_MFA_VERIFIED` | Successful MFA challenge | CC6 |
| `USER_PASSWORD_CHANGED` | Password change | CC6 |
| `USER_CREATED` | New user provisioned | CC6 |
| `USER_DEACTIVATED` | User account disabled | CC6 |
| `USER_ROLE_CHANGED` | Role modification | CC6 |
| `SESSION_EXPIRED` | Session timeout (idle or absolute) | CC6 |
| `EXPORT_DATA_REQUESTED` | Any bulk data export | C1 |
| `DATA_DELETION_REQUESTED` | Right to deletion request | P1 |
| `DATA_DELETION_COMPLETED` | Deletion confirmed | P1 |
| `SYSTEM_CONFIG_CHANGED` | Configuration change | CC8 |
| `DEPLOYMENT_COMPLETED` | New version deployed | CC8 |

#### 3.3.3 Alerting Rules

Configure in GCP Cloud Monitoring:

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|-------------|
| Failed login spike | >10 failed logins from same IP in 5 min | CRITICAL | PagerDuty + Email |
| UPL block spike | >20 RED zone blocks in 1 hour | HIGH | Email |
| Permission denied spike | >10 PERMISSION_DENIED events from same user in 15 min | HIGH | Email |
| Error rate | >5% 5xx responses in 5 min | CRITICAL | PagerDuty |
| Health check failure | >3 consecutive failures | CRITICAL | PagerDuty |
| Database connectivity | /api/health/db returns 503 | CRITICAL | PagerDuty |
| Audit write failure | Audit event write fails (logged by middleware) | HIGH | Email |
| Unusual data export | Audit export from non-admin IP | CRITICAL | PagerDuty + Email |

#### 3.3.4 Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Application logs (Cloud Logging) | 90 days hot, 1 year cold | GCP Cloud Logging + Cloud Storage archive |
| Audit events (database) | 7 years | PlanetScale (primary) + quarterly backup to Cloud Storage |
| Sentry events | 90 days | Sentry Cloud (per their plan) |
| Cloud Build logs | 1 year | GCP Cloud Logging |
| Access logs (Cloud Run) | 1 year | GCP Cloud Logging |

### 3.4 Change Management

#### 3.4.1 Current Pipeline

`cloudbuild.yaml` enforces:
1. `npm ci` (reproducible installs)
2. `npx prisma generate` (schema consistency)
3. `npm run typecheck` (TypeScript strict)
4. `npm run test` (unit tests must pass)
5. `npm run test:upl` (UPL compliance tests must pass)
6. Docker build (only if 3-5 pass)
7. Push to Artifact Registry
8. Deploy to Cloud Run (API + 2 workers)
9. Run database migrations

#### 3.4.2 Required Enhancements

**Change approval process:**
- All changes to `main` require pull request with at least 1 approval
- Changes touching `server/middleware/rbac.ts`, `server/middleware/audit.ts`, `server/services/upl-*.ts`, or `prisma/schema.prisma` require 2 approvals
- Database migration changes require explicit sign-off from a designated DB owner

**Rollback procedure:**
- Cloud Run supports instant rollback to previous revision
- Document: `gcloud run services update-traffic --to-revisions=PREVIOUS=100`
- Rollback criteria: >1% error rate increase, health check failures, or UPL compliance test failures in production
- Database rollback: Prisma `migrate reset` is destructive; instead, write forward-compatible migration scripts with explicit rollback SQL in comments

**Post-deployment verification:**
1. Health check passes (`/api/health` and `/api/health/db`)
2. Smoke test: create session, access claim, send chat message
3. UPL pipeline functional: submit known GREEN and RED queries, verify correct classification
4. Error rate baseline: no increase in Sentry error volume for 15 minutes

### 3.5 Incident Response

#### 3.5.1 Incident Severity Classification

| Severity | Definition | Response Time | Example |
|----------|-----------|---------------|---------|
| SEV-1 | Data breach, system-wide outage, UPL violation in production | 15 minutes | PHI exposed, all users blocked |
| SEV-2 | Partial outage, single-tenant data exposure, security vulnerability | 1 hour | One org's data visible to another, auth bypass |
| SEV-3 | Performance degradation, non-critical feature failure | 4 hours | Chat responses slow, document upload failing |
| SEV-4 | Minor issue, cosmetic, no data impact | Next business day | UI rendering issue, non-critical log error |

#### 3.5.2 Incident Response Phases

1. **Detection:** Sentry alert, Cloud Monitoring alert, customer report, or internal discovery
2. **Assessment:** Determine severity, scope (which orgs, which data), and classification (security incident, availability incident, data incident)
3. **Containment:** Isolate affected component (e.g., disable affected endpoint, revoke compromised credential, block malicious IP)
4. **Eradication:** Fix root cause (code patch, configuration change, credential rotation)
5. **Recovery:** Restore service, verify integrity, monitor for recurrence
6. **Post-mortem:** Within 5 business days. Blameless. Document: timeline, root cause, impact, remediation, prevention measures

#### 3.5.3 Breach Notification Requirements

- **Customers:** Within 72 hours of confirmed breach (contractual obligation, align with GDPR standard even though not directly applicable)
- **California AG:** If >500 California residents affected (CA Civil Code section 1798.82)
- **HIPAA:** If PHI breach affects >500 individuals, notify HHS within 60 days (45 CFR section 164.408)
- **Internal:** Immediate notification to CEO, CTO, and legal counsel

### 3.6 Vendor Management

| Vendor | Data Processed | SOC 2 Status | BAA Needed | DPA Status | Risk Level |
|--------|---------------|-------------|------------|------------|------------|
| **Anthropic** (Claude) | Chat queries (may contain claim details) | Request their SOC 2 report | Yes (PHI in prompts) | Required | HIGH |
| **Google Cloud Platform** | All application data, documents, embeddings | SOC 2 Type II available | Yes (GCP BAA) | Google Cloud DPA | HIGH |
| **PlanetScale** | All database records (claims, users, PHI) | SOC 2 Type II certified | Yes | Required | HIGH |
| **Temporal.io** (Cloud) | Workflow metadata (no PHI in payloads) | Request report | Evaluate | Required | MEDIUM |
| **Voyage AI** | Document text for embedding generation | Request report | Yes (document text is PHI) | Required | HIGH |
| **Sentry** | Error payloads (must not contain PHI) | SOC 2 Type II certified | Evaluate (should not receive PHI) | Sentry DPA | LOW |

**Required actions per vendor:**
1. Obtain and review SOC 2 Type II reports (or SOC 2 Type I at minimum)
2. Execute BAAs where PHI is processed
3. Execute DPAs covering data processing terms
4. Document data residency (all should be US)
5. Annual review of vendor security posture

---

## PART 4: COMPLIANCE TEST SUITE SPECIFICATION

Target file: `tests/soc2-compliance/` directory with the following test files.

### 4.1 Access Control Tests (CC6) — `access-control.test.ts`

```typescript
// CC6.1: All protected endpoints require authentication
describe('CC6.1: All API endpoints require authentication', () => {
  const protectedEndpoints = [
    { method: 'GET', path: '/api/claims' },
    { method: 'POST', path: '/api/claims' },
    { method: 'GET', path: '/api/documents' },
    { method: 'POST', path: '/api/chat/message' },
    { method: 'GET', path: '/api/audit/claim/test' },
    { method: 'GET', path: '/api/compliance/examiner' },
    { method: 'GET', path: '/api/audit/export' },
    // ... all 30+ protected endpoints
  ];
  
  for (const endpoint of protectedEndpoints) {
    it(`${endpoint.method} ${endpoint.path} returns 401 without session`, ...);
  }
});

// CC6.2: Role-based access is enforced
describe('CC6.2: RBAC enforcement', () => {
  it('CLAIMS_EXAMINER cannot access /api/audit/export (ADMIN only)', ...);
  it('CLAIMS_EXAMINER cannot access /api/audit/upl (SUPERVISOR+ only)', ...);
  it('CLAIMS_EXAMINER cannot access /api/compliance/team (SUPERVISOR+ only)', ...);
  it('CLAIMS_EXAMINER cannot access claims assigned to other examiners', ...);
  it('users cannot access claims in other organizations', ...);
});

// CC6.3: Session security configuration
describe('CC6.3: Session security', () => {
  it('session cookie has httpOnly flag', ...);
  it('session cookie has secure flag in production', ...);
  it('session cookie has sameSite attribute', ...);
  it('session maxAge does not exceed 8 hours', ...);
  it('idle timeout triggers after 15 minutes of inactivity', ...);
});

// CC6.4: Rate limiting active
describe('CC6.4: Rate limiting', () => {
  it('global rate limit returns 429 after threshold', ...);
  it('login endpoint has stricter rate limit', ...);
});

// CC6.5: MFA enforcement
describe('CC6.5: MFA required', () => {
  it('login without MFA verification is rejected for protected resources', ...);
  it('MFA enrollment is audited', ...);
});
```

### 4.2 Data Protection Tests (C1) — `data-protection.test.ts`

```typescript
// C1.1: PII/PHI never appears in logs
describe('C1.1: No PHI in logs or audit events', () => {
  it('audit eventData never contains document content fields', ...);
  it('audit eventData never contains chat message text', ...);
  it('audit eventData never contains claimant names', ...);
  it('audit eventData never contains SSN patterns', ...);
  it('Sentry beforeSend scrubs PII from error payloads', ...);
  it('server logger does not include request body in log output', ...);
});

// C1.2: Secrets are not in source code
describe('C1.2: No hardcoded secrets', () => {
  it('no API keys in server/ source files', ...); // existing test
  it('no database credentials in server/ source files', ...); // existing test
  it('.env files are in .gitignore', ...); // existing test
  it('GCP Secret Manager is the sole secret source', ...);
});

// C1.3: Encryption
describe('C1.3: Encryption requirements', () => {
  it('DATABASE_URL uses TLS connection string', ...);
  it('SESSION_SECRET meets minimum length requirement (32 chars)', ...);
  it('production enforces SESSION_SECRET', ...); // existing in env.ts
});

// C1.4: Data classification
describe('C1.4: Sensitive data fields are identified', () => {
  it('Document accessLevel defaults to EXAMINER_ONLY (not SHARED)', ...);
  it('attorney-only documents are excluded from examiner RAG retrieval', ...);
  it('work product documents are excluded from examiner RAG retrieval', ...);
  it('privileged documents are excluded from examiner RAG retrieval', ...);
});
```

### 4.3 Audit Trail Tests (CC4) — `audit-trail.test.ts`

```typescript
// CC4.1: Audit events are immutable
describe('CC4.1: Audit event immutability', () => {
  it('AuditEvent model has no updatedAt field in schema', ...);
  it('no UPDATE queries exist against audit_events table', ...);
  it('no DELETE queries exist against audit_events table', ...);
});

// CC4.2: All security-relevant actions are logged
describe('CC4.2: Security event logging', () => {
  it('login creates USER_LOGIN audit event', ...);
  it('logout creates USER_LOGOUT audit event', ...);
  it('failed login creates USER_LOGIN_FAILED audit event', ...);
  it('permission denial creates PERMISSION_DENIED audit event', ...);
  it('UPL RED zone classification creates UPL_ZONE_CLASSIFICATION event', ...);
  it('UPL output block creates UPL_OUTPUT_BLOCKED event', ...);
  it('document upload creates DOCUMENT_UPLOADED event', ...);
  it('claim creation creates CLAIM_CREATED event', ...);
  it('data export creates EXPORT_DATA_REQUESTED event', ...);
});

// CC4.3: Audit events contain required context
describe('CC4.3: Audit event completeness', () => {
  it('all audit events include userId', ...);
  it('all audit events include ipAddress', ...);
  it('all audit events include userAgent', ...);
  it('all audit events include createdAt timestamp', ...);
  it('UPL events include uplZone', ...);
});

// CC4.4: Audit trail is accessible to authorized roles
describe('CC4.4: Audit access controls', () => {
  it('CLAIMS_EXAMINER can view own claim audit trail', ...);
  it('CLAIMS_SUPERVISOR can view user audit trails in same org', ...);
  it('CLAIMS_ADMIN can export audit events', ...);
  it('audit export supports date range filtering', ...);
  it('audit export supports CSV format', ...);
});
```

### 4.4 UPL Processing Integrity Tests (PI1) — `processing-integrity.test.ts`

```typescript
// PI1.1: UPL pipeline processes correctly
describe('PI1.1: UPL 3-stage pipeline integrity', () => {
  it('RED zone queries are blocked before LLM generation', ...);
  it('GREEN zone queries pass through without disclaimer', ...);
  it('YELLOW zone queries include mandatory disclaimer', ...);
  it('adversarial jailbreak patterns are classified as RED', ...);
  it('output validator catches all 11 prohibited patterns', ...);
  it('uncertain classifications default to RED (conservative)', ...);
  it('LLM parse failure defaults to RED', ...);
});

// PI1.2: Financial calculations are accurate
describe('PI1.2: Benefit calculation accuracy', () => {
  it('TD rate calculation matches statutory formula', ...);
  it('late payment penalty calculation uses LC 4650(c) 10% rate', ...);
  it('financial amounts use Decimal type (not floating point)', ...);
});

// PI1.3: Data integrity
describe('PI1.3: Input validation', () => {
  it('all POST/PUT endpoints validate input via Zod schemas', ...); // existing
  it('chat message input has length limit', ...); // existing
  it('document upload validates file type', ...);
  it('claim creation validates required fields', ...);
});
```

### 4.5 Availability Tests (A1) — `availability.test.ts`

```typescript
// A1.1: Health checks
describe('A1.1: Health check endpoints', () => {
  it('GET /api/health returns 200 with status ok', ...);
  it('GET /api/health/db returns 200 when database is connected', ...);
  it('GET /api/health/db returns 503 when database is disconnected', ...);
  it('health endpoints do not require authentication', ...);
});

// A1.2: Error handling
describe('A1.2: Error handling does not crash the server', () => {
  it('Zod validation errors return 400 (not 500)', ...);
  it('Prisma not-found errors return 404 (not 500)', ...);
  it('Prisma unique constraint errors return 409 (not 500)', ...);
  it('stack traces are stripped in production responses', ...);
  it('audit write failures do not crash the request', ...);
  it('UPL classifier errors default to RED (not crash)', ...);
});
```

### 4.6 Privacy Tests (P1-P8) — `privacy.test.ts`

```typescript
// P1: Right to deletion
describe('P1: Data deletion capability', () => {
  it('DELETE /api/users/:id anonymizes PII fields', ...);
  it('deletion preserves audit trail with anonymized userId', ...);
  it('deletion cascades to chat messages and sessions', ...);
  it('deletion removes embeddings from vector search', ...);
  it('deletion is audited as DATA_DELETION_COMPLETED', ...);
});

// P2: Data access
describe('P2: Data subject access', () => {
  it('GET /api/users/:id/data returns all PII held for the user', ...);
  it('data export includes all audit events for the user', ...);
  it('data access request is audited', ...);
});

// P3: Organization data isolation
describe('P3: Multi-tenant data isolation', () => {
  it('claims are scoped to the requesting user organization', ...);
  it('audit events are scoped to the requesting user organization', ...);
  it('users in Org A cannot see claims belonging to Org B', ...);
  it('users in Org A cannot see users belonging to Org B', ...);
});
```

### 4.7 Change Management Tests (CC8) — `change-management.test.ts`

```typescript
// CC8.1: Build pipeline integrity
describe('CC8.1: CI/CD pipeline enforces quality gates', () => {
  it('cloudbuild.yaml runs typecheck before docker build', ...);
  it('cloudbuild.yaml runs unit tests before docker build', ...);
  it('cloudbuild.yaml runs UPL tests before docker build', ...);
  it('docker build depends on all test steps passing', ...);
  it('deployment depends on docker push completing', ...);
});

// CC8.2: Container security
describe('CC8.2: Container security', () => {
  it('Dockerfile uses non-root user', ...);
  it('Dockerfile uses multi-stage build', ...);
  it('production stage does not include dev dependencies', ...);
});
```

**Total test count: 53 tests across 7 files**, covering all 5 Trust Service Criteria.

---

## PART 5: GLASS BOX TRANSPARENCY LAYER

This is the strategic differentiator. SOC 2 compliance is typically invisible to end users. Glass Box makes it visible, verifiable, and valuable.

### 5.1 Compliance Dashboard (All Roles)

**Not just for admins.** Every examiner sees their own compliance posture.

**Examiner view (`/api/compliance/examiner` - already exists):**
- Personal UPL compliance score (% of queries that were GREEN/YELLOW vs RED blocks)
- Deadline compliance rate (% of deadlines met)
- Training completion status
- Document processing integrity (% of documents successfully classified)

**Extend with SOC 2 transparency data:**
- "Your actions are audited" indicator (always visible, not hidden)
- Count of audit events logged for you today
- Last login time and IP address (let the user verify it was them)
- Active sessions count

**Supervisor view (`/api/compliance/team` - already exists):**
- Team UPL compliance metrics
- Access review status (when was the last review, who was reviewed)
- Audit event volume trends
- System health indicators

**Admin view (`/api/compliance/admin` - already exists):**
- Extend with SOC 2 control status dashboard
- Vendor certification status (last SOC 2 report date for each vendor)
- Encryption status verification
- Backup status verification

### 5.2 AI Decision Audit Trail

**Already partially implemented** in the ChatResponse interface (`server/services/examiner-chat.service.ts` lines 73-93). Each response includes:
- `classification` (UPL zone, reason, confidence, adversarial flag)
- `disclaimer` (zone-appropriate disclaimer text)
- `validation` (PASS/FAIL, violations list)
- `wasBlocked` (boolean)
- `citations` (document sources used)
- `graphContextIncluded` (whether graph RAG contributed)

**Extend for Glass Box display:**
- Show the UPL zone badge on every AI response (GREEN/YELLOW/RED indicator)
- Show citation sources with document names (already in `Citation` interface)
- Show "Why this answer" expandable panel with: classification reason, retrieval sources, validation status
- Show confidence level for each citation (similarity score)
- Show heading breadcrumb for source attribution (already in `headingBreadcrumb` field)

### 5.3 Trust Indicators

**Visible on every page:**
- SOC 2 Type II badge (after certification)
- "Your data is encrypted" indicator
- "Powered by Glass Box AI — every decision explained" tagline
- Statutory citation badges on every deadline, calculation, and regulation reference

**Per AI response:**
- Confidence indicator (based on classification confidence + citation similarity scores)
- Source count (e.g., "Based on 5 document sources")
- UPL zone badge (color-coded)
- "This response was validated for compliance" checkmark

### 5.4 Audit Trail Self-Service

**Let examiners see their own audit trail.** The endpoint already exists (`/api/audit/claim/:claimId` requires only `requireAuth()`). Build a UI that shows:
- "What the system recorded about your actions today"
- Grouped by: documents viewed, chat messages sent, deadlines acknowledged, calculations performed
- Exportable by the user (personal data access)
- Searchable by date range

This is radical transparency. Most compliance tools hide the audit trail from end users. Glass Box shows it proudly.

### 5.5 Regulatory Authority Display

Every regulatory citation in the product is a trust signal. Display them prominently:
- Deadline cards show statutory authority (e.g., "10 CCR 2695.5(b)") — already stored in `RegulatoryDeadline.statutoryAuthority`
- Benefit calculations show the Labor Code section
- Education content shows Tier 2 statutory basis
- UPL disclaimers cite Cal. Bus. & Prof. Code section 6125

This is not legal decoration. It is the product demonstrating that it knows the law better than competing black-box systems.

---

## PART 6: SOC 3 PUBLIC REPORT STRATEGY

### 6.1 What SOC 3 Is

SOC 3 is a general-use report derived from SOC 2 Type II. Unlike SOC 2 (which is restricted distribution), SOC 3 can be freely distributed and published on a website. It confirms that the organization has been audited and meets the Trust Service Criteria without disclosing the detailed control descriptions.

### 6.2 Public Trust Page

**URL:** `glassboxsolutions.com/trust`

**Content:**
- SOC 3 report download (PDF)
- SOC 2 Type II seal/badge
- "How We Protect Your Data" section (derived from encryption documentation)
- "Our AI Is Transparent" section (derived from AI Transparency Template)
- "Compliance Is Our Product" narrative (Glass Box philosophy)
- Vendor security summary (all vendors SOC 2 certified, BAAs in place)
- Uptime dashboard (embed from status page)
- Last audit date and auditor name

### 6.3 In-Product Badge

Display the SOC 2 Type II badge in the product:
- Footer of every page
- Login screen
- Compliance dashboard
- Audit export page
- Document upload page (reassurance when uploading sensitive medical records)

### 6.4 Marketing Integration

**RFP response templates:**
- "Glass Box Solutions is SOC 2 Type II certified. Our most recent audit was conducted by [Auditor] on [Date]. A SOC 3 report is available at glassboxsolutions.com/trust. A SOC 2 Type II report is available under NDA upon request."

**Sales collateral:**
- One-page compliance summary for insurance carrier IT security reviews
- Comparison chart: Glass Box vs competitors on transparency and compliance
- "From Black Box to Glass Box" narrative: competitors hide their compliance; we display ours

**Client onboarding materials:**
- Security questionnaire pre-filled responses (based on SOC 2 controls)
- Encryption and data handling fact sheet
- Vendor sub-processor list
- Data residency confirmation (US only)

### 6.5 Competitive Positioning

Glass Box does not just meet SOC 2 requirements. It makes compliance visible as a feature:

1. **Competitors** treat compliance as a checkbox. Glass Box treats it as the product.
2. **Competitors** hide their AI decision-making. Glass Box shows the full pipeline: classify, retrieve, generate, validate.
3. **Competitors** restrict audit trails to admins. Glass Box shows every examiner their own audit trail.
4. **Competitors** obscure their data handling. Glass Box cites the statute for every regulation it enforces.
5. **Competitors** say "we are SOC 2 compliant." Glass Box says "look — here is exactly how we are compliant, and you can verify it yourself."

This is the "Glass Box" brand promise made real in compliance infrastructure. SOC 2 is not a cost center for Glass Box. It is the proof of the brand.

---

## APPENDIX A: TIMELINE SUMMARY

| Phase | Weeks | Deliverables |
|-------|-------|-------------|
| Phase 1: Audit Blockers (P0) | 1-8 | Production auth + MFA, all policies, vendor assessments, alerting |
| Phase 2: Important Controls (P1) | 9-16 | Right to deletion, DR plan, pen test, compliance test suite |
| Phase 3: Enhancements (P2) | 17-24 | Transparency dashboard, SOC 3 trust page, load testing |
| SOC 2 Type I Engagement | Week 25-28 | Point-in-time control assessment |
| SOC 2 Type II Observation | Week 29-52 | 6-month observation period |
| SOC 2 Type II Report | Week 53+ | Report issuance, SOC 3 derivation |

## APPENDIX B: DOCUMENT INVENTORY (Required for Audit)

| Document | Status | Owner |
|----------|--------|-------|
| Information Security Policy | TO CREATE | Compliance |
| Risk Assessment | TO CREATE | Compliance |
| Incident Response Procedure | TO CREATE | Compliance |
| Change Management Policy | TO CREATE | Compliance |
| Access Control Policy | TO CREATE | Compliance |
| Data Classification Policy | TO CREATE | Compliance |
| Data Retention Policy | EXISTS (template) | Compliance — needs AdjudiCLAIMS-specific population |
| Encryption Specification | TO CREATE | Engineering |
| Vendor Risk Assessments (x6) | TO CREATE | Compliance |
| Business Continuity Plan | TO CREATE | Infrastructure |
| Disaster Recovery Plan | TO CREATE | Infrastructure |
| Privacy Policy | TO CREATE | Legal |
| DPA Template | TO CREATE | Legal |
| Employee Security Training | TO CREATE | Compliance |
| HIPAA BAA (per vendor) | TO EXECUTE | Legal |
| Penetration Test Report | TO COMMISSION | External |
| AI Transparency Disclosure | EXISTS (template) | Engineering — needs population |
| UPL Compliance Specification | EXISTS | Engineering |
| Data Boundary Specification | EXISTS | Engineering |
| Audit Trail Architecture | EXISTS (in code) | Engineering — needs standalone document |

---

### Critical Files for Implementation

- `/home/vncuser/AdjudiCLAIMS-ai-app-1/server/routes/auth.ts` — Must be rewritten to replace email-only dev login with production authentication + MFA (the single largest P0 blocker)
- `/home/vncuser/AdjudiCLAIMS-ai-app-1/server/middleware/rbac.ts` — Must be extended with MFA verification, idle session timeout, and new audit event types for access control compliance
- `/home/vncuser/AdjudiCLAIMS-ai-app-1/server/middleware/audit.ts` — Must be extended with 14 new audit event types (failed login, account lock, role change, data deletion, etc.)
- `/home/vncuser/AdjudiCLAIMS-ai-app-1/prisma/schema.prisma` — Must add soft-delete columns, new AuditEventType values, and password/MFA fields to User model
- `/home/vncuser/AdjudiCLAIMS-ai-app-1/tests/upl-compliance/security-audit.test.ts` — Pattern to follow for the 53-test SOC 2 compliance test suite; demonstrates the existing approach of static analysis tests that verify security properties without requiring a running server