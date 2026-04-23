# Insurance Claims Case Generator — Implementation Plan

## GBS Engineering Compliance

**Linear Ticket Required:** File tickets in the **AJC** space (AdjudiCLAIMS team, Linear ID `ba307334-bcf4-4ab8-8645-2f619a9fc4a4`). Branch name must follow `AJC-XXX/short-description` per GBS branch naming standard.

**Definition of Ready:** All five conditions must hold before Phase 1 begins:
- [ ] Linear ticket created and linked
- [ ] `gbs-tools-and-resources` repo access confirmed
- [ ] Tech stack deviation approved (see Frontend section)
- [ ] GCP service account provisioned for this package
- [ ] Requirements confirmed with no open ambiguities

**Synthetic Data Disclaimer:** This tool generates entirely **fake/synthetic** data. No real PHI, PII, or claimant information is processed or stored. The output artifacts are for pipeline testing and staging seeding only — they must not be used in production claims systems.

---

## Context

AdjudiCLAIMS needs realistic mock California Workers' Compensation claim files to:
- Feed the document classifier pipeline for training and testing
- Seed the staging environment with believable case data
- Support QA testing with diverse scenario coverage

The existing `prisma/seed.ts` only creates 3 static hardcoded claims with no documents. This new tool generates full claim case folders — PDFs for every document type + JSON metadata — using a lifecycle-aware DAG engine, following the pattern of the existing `merus-test-data-generator` in `gbs-tools-and-resources`.

---

## Repo Location

**`gbs-tools-and-resources/packages/insurance-claims-case-generator/`**
- Monorepo package alongside `merus-test-data-generator`
- Own `pyproject.toml`, `CLAUDE.md`, `Dockerfile`, CI, tests
- Shared monorepo tooling (ruff, mypy, pytest conventions)

---

## Tech Stack

| Component | Library |
|---|---|
| Language | Python 3.12 |
| API | FastAPI 0.115+ |
| PDF | reportlab 4.2+ |
| Data gen | Faker 26+ |
| Models | Pydantic v2 |
| CLI | Click 8.1 |
| HTTP client | httpx 0.27+ (AdjudiCLAIMS integration) |
| Images | Pillow 10+ (Tier A form overlays) |
| GCP secrets | google-cloud-secret-manager 2.x |
| Testing | pytest 8, pytest-asyncio 0.23, pytest-httpx 0.30 |
| Frontend | React Router 7 + TypeScript + Tailwind (GBS standard; see note below) |
| Container | Docker multi-stage (python:3.12 → python:3.12-slim) |

No database — stateless; artifacts written to `/tmp`. No LLM calls — all generation is template-based.

---

## Pre-Commit Hooks (Mandatory — GBS Standard)

Python equivalent of GBS Husky + lint-staged + secret scanning:

```toml
# pyproject.toml — [tool.ruff] + pre-commit config
[tool.ruff]
select = ["E", "F", "S", "B"]   # S = bandit-equivalent security rules

# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks: [{ id: ruff }, { id: ruff-format }]
  - repo: https://github.com/Yelp/detect-secrets
    hooks: [{ id: detect-secrets }]   # Replaces eslint-plugin-no-secrets
  - repo: https://github.com/pre-commit/mirrors-mypy
    hooks: [{ id: mypy }]
```

CI must fail on any secrets detected. `detect-secrets` baseline must be committed. No credentials in any committed file — all credentials via GCP Secret Manager.

---

## GCP Service Account

**Required:** A dedicated service account per GBS standards.

- SA name: `sa-claims-generator@<gcp-project>.iam.gserviceaccount.com`
- Minimum IAM roles: `roles/secretmanager.secretAccessor` (scoped to specific secrets only)
- **Never** use the Compute Engine default SA or any shared SA
- SA must be provisioned before Phase 4 integration work begins

---

**Frontend stack note:** GBS default is React Router 7. This package lives in `gbs-tools-and-resources` alongside a Python FastAPI backend — the project-level `CLAUDE.md` must explicitly override the frontend stack choice and document the justification. If the `merus-test-data-generator` already uses a different framework, match it for monorepo consistency. Resolve before Phase 5 begins.

---

## Directory Structure

```
gbs-tools-and-resources/packages/insurance-claims-case-generator/
├── CLAUDE.md                       # Project-level overrides (tech stack, SA, etc.)
├── SUBAGENT_INSTRUCTIONS.md        # Required by GBS for specialist subagents
├── ISSUES.md                       # Deferred out-of-scope improvements (append-only during execution)
├── README.md
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
├── .env.example
│
├── src/claims_generator/
│   ├── main.py                     # FastAPI app factory + lifespan
│   ├── cli.py                      # Click: generate / batch / seed commands
│   ├── config.py                   # pydantic-settings Settings
│   ├── case_builder.py             # profile + lifecycle + docs → ClaimCase + PDF bytes
│   ├── batch_builder.py            # ThreadPoolExecutor over case_builder
│   ├── exporter.py                 # ClaimCase → ZIP with manifest.json
│   │
│   ├── models/
│   │   ├── enums.py                # DocumentType (mirrors Prisma exactly — 24 values)
│   │   ├── claim.py                # ClaimCase, DocumentEvent (root output models)
│   │   ├── profile.py              # ClaimProfile (full case metadata)
│   │   ├── claimant.py             # ClaimantProfile
│   │   ├── employer.py             # EmployerProfile, InsurerProfile
│   │   ├── medical.py              # MedicalProfile, BodyPart, ICD10Entry
│   │   ├── financial.py            # FinancialProfile — TD/PD calculations
│   │   └── scenario.py             # ScenarioPreset base model
│   │
│   ├── core/
│   │   ├── dag_nodes.py            # ClaimStageNode + DocumentEmission dataclasses
│   │   ├── dag_transitions.py      # StageTransition + WeightModifier
│   │   ├── lifecycle_engine.py     # DAG walk: ClaimState → ordered List[ClaimStage]
│   │   ├── timeline_builder.py     # Stages + profile → List[DocumentEvent] with deadline enforcement
│   │   └── claim_state.py          # Mutable ClaimState (flags, stages_visited, rng)
│   │
│   ├── profile/
│   │   ├── profile_generator.py    # Orchestrator → ClaimProfile
│   │   ├── claimant_gen.py         # Demographics, weighted CA county distribution
│   │   ├── employer_gen.py         # Industry-specific employers, 15 real CA WC carriers
│   │   ├── injury_gen.py           # ICD-10 + body part + mechanism pools
│   │   ├── physician_gen.py        # Treating MD, QME panel, AME, vocational expert
│   │   └── financial_gen.py        # AWW → TD rate (exact match to benefit-calculator.service.ts)
│   │
│   ├── scenarios/
│   │   ├── registry.py
│   │   ├── base_scenario.py
│   │   ├── standard_claim.py
│   │   ├── cumulative_trauma.py
│   │   ├── litigated_qme.py
│   │   ├── denied_claim.py
│   │   ├── death_claim.py
│   │   ├── ptd_claim.py
│   │   ├── psychiatric_overlay.py
│   │   ├── multi_employer.py
│   │   ├── split_carrier.py
│   │   ├── complex_lien.py
│   │   ├── expedited_hearing.py
│   │   ├── qme_dispute_only.py
│   │   └── sjdb_voucher.py         # 13 scenarios total
│   │
│   ├── documents/
│   │   ├── base_document.py        # Abstract DocumentGenerator
│   │   ├── registry.py             # @register_document decorator + DocumentRegistry
│   │   ├── pdf_primitives.py       # Flowable wrappers (Paragraph, Table, Spacer)
│   │   ├── form_renderer.py        # PNG background + field coordinate overlay (Tier A)
│   │   ├── letterhead.py           # Reusable header/footer/caption blocks
│   │   ├── types/                  # One file per DocumentType enum value (24 files)
│   │   │   ├── dwc1_claim_form.py          # Tier A: form-accurate DWC-1
│   │   │   ├── medical_report.py           # Tier B: PR-2, treating notes, P&S
│   │   │   ├── ame_qme_report.py           # Tier B: QME/AME/IME/psych/apportionment
│   │   │   ├── utilization_review.py       # Tier B: RFA, UR decision, IMR
│   │   │   ├── billing_statement.py        # Tier A: UB-04, CMS-1500
│   │   │   ├── wcab_filing.py              # Tier B: Application, DOR, petitions, orders
│   │   │   ├── settlement_document.py      # Tier B: C&R, Stips
│   │   │   ├── lien_claim.py               # Tier B
│   │   │   ├── medical_chronology.py       # Tier B: timeline, vocational, economist
│   │   │   ├── return_to_work.py           # Tier B: AD 10133.53, SJDB voucher
│   │   │   ├── deposition_transcript.py    # Tier C: Q&A format
│   │   │   ├── discovery_request.py        # Tier C: subpoenas, SDTs
│   │   │   ├── investigation_report.py     # Tier C
│   │   │   ├── legal_correspondence.py     # Tier C
│   │   │   ├── benefit_notice.py           # Tier C: accept/deny/delay
│   │   │   ├── payment_record.py           # Tier C: TD/PD ledger
│   │   │   ├── wage_statement.py           # Tier C: table-heavy
│   │   │   ├── employer_report.py          # Tier C
│   │   │   ├── imaging_report.py           # Tier C
│   │   │   ├── pharmacy_record.py          # Tier C
│   │   │   ├── dwc_official_form.py        # Tier A: Form 105, DEU rating
│   │   │   ├── work_product.py             # Tier C: attorney-only docs
│   │   │   ├── correspondence.py           # Tier C: general
│   │   │   └── other_document.py           # Fallback
│   │   └── assets/
│   │       ├── form_templates/             # Blank PNG scans: DWC-1, UB-04, CMS-1500, Form 105
│   │       ├── field_maps/                 # JSON field coordinate maps per form (calibrated once)
│   │       ├── logos/                      # Placeholder insurer logo PNGs
│   │       └── signatures/                 # Scribble PNG overlays for signature realism
│   │
│   ├── api/
│   │   ├── schemas.py              # Pydantic request/response models
│   │   ├── job_store.py            # In-memory async job tracking
│   │   ├── middleware.py           # CORS, request ID, logging
│   │   └── routes/
│   │       ├── generate.py         # POST /api/v1/generate (sync, single case)
│   │       ├── batch.py            # POST /api/v1/batch (async job)
│   │       ├── jobs.py             # GET /api/v1/jobs/{job_id}
│   │       ├── export.py           # GET /api/v1/export/{job_id} (StreamingResponse ZIP)
│   │       ├── scenarios.py        # GET /api/v1/scenarios[/{slug}]
│   │       └── health.py           # GET /api/v1/health
│   │
│   └── integrations/
│       ├── adjudiclaims_client.py  # httpx client: login → create claim → upload docs
│       └── gcp_secrets.py          # Secret Manager with env var fallback
│
├── frontend/                       # Next.js 14: scenario selector, generate form, job poller
│
└── tests/
    ├── conftest.py
    ├── fixtures/sample_profiles.py
    ├── unit/
    │   ├── test_lifecycle_engine.py
    │   ├── test_timeline_builder.py
    │   ├── test_financial_gen.py    # Regression vs benefit-calculator.service.ts TD rates
    │   ├── test_document_registry.py
    │   └── test_document_generators.py  # Smoke: one PDF per DocumentType
    └── integration/
        ├── test_api_generate.py
        ├── test_api_batch.py
        ├── test_case_builder_e2e.py
        └── test_adjudiclaims_seed.py    # pytest-httpx mock of AdjudiCLAIMS API
```

---

## Lifecycle Engine

### Claim Stages (DAG nodes)

Each `ClaimStageNode` defines which documents it emits (type, subtype slug, probability, access level) and its duration bounds:

| Stage | Key Documents Emitted | Regulatory Deadline |
|---|---|---|
| `DWC1_FILED` | DWC1_CLAIM_FORM (p=1.0), EMPLOYER_REPORT (p=0.85) | — |
| `INITIAL_CONTACT` | BENEFIT_NOTICE/delay (p=0.40), CORRESPONDENCE (p=0.60) | 10 CCR 2695.5(b): 15 days |
| `CLAIM_ACCEPTED` | BENEFIT_NOTICE/acceptance (p=1.0) | 10 CCR 2695.7(b): 40 days |
| `CLAIM_DENIED` | BENEFIT_NOTICE/denial (p=1.0), INVESTIGATION_REPORT (p=0.75) | 90 days |
| `TREATMENT_BEGINS` | MEDICAL_REPORT/PR-2 (p=0.80), BILLING_STATEMENT (p=0.90) | — |
| `UR_RFA_CYCLE` | UTILIZATION_REVIEW/RFA (p=1.0), UR_DECISION (p=1.0) | 8 CCR 9792: 5 business days |
| `TD_PAYMENTS` | PAYMENT_RECORD/TD_ongoing (p=1.0), BENEFIT_NOTICE/notice (p=1.0) | LC 4650: 14 days |
| `QME_DISPUTE` | DWC_OFFICIAL_FORM/Form 105 (p=1.0), LEGAL_CORRESPONDENCE (p=0.80 if litigated) | LC 4062.2 |
| `QME_EXAM` | AME_QME_REPORT/QME_initial (p=1.0), PSYCH_EVAL (p=1.0 if psych_overlay) | — |
| `MMI_REACHED` | MEDICAL_REPORT/P&S (p=1.0), IMAGING_REPORT (p=0.70) | — |
| `PD_RATING` | DWC_OFFICIAL_FORM/DEU (p=0.85), PAYMENT_RECORD/PD_worksheet (p=0.80) | — |
| `SETTLEMENT_CR` | SETTLEMENT_DOCUMENT/C&R (p=1.0) | — |
| `SETTLEMENT_STIPS` | SETTLEMENT_DOCUMENT/Stips (p=1.0) | — |
| `WCAB_HEARING` | WCAB_FILING/Application (p=1.0), DEPOSITION_TRANSCRIPT (p=0.70) | — |
| `CLOSURE` | PAYMENT_RECORD/PD_final (p=0.90) | — |

### Transition Weights

`StageTransition(from, to, base_weight, modifiers)` — modifiers add/subtract weight based on `ClaimState` flags:
- `CLAIM_ACCEPTED`: base=0.55, +0.10 if not `denied_scenario`
- `CLAIM_DENIED`: base=0.20, +0.30 if `denied_scenario`
- `DELAY_90DAY`: base=0.25, −0.15 if not `ct`
- `QME_DISPUTE`: base=0.25, +0.75 if `litigated`
- `WCAB_HEARING`: base=0.20, +0.60 if `litigated`, suppressed if not `attorney_represented`

### ClaimState Flags

`litigated`, `attorney_represented`, `ct` (cumulative trauma), `denied_scenario`, `death_claim`, `ptd_claim`, `psych_overlay`, `multi_employer`, `split_carrier`, `high_liens`, `sjdb_dispute`, `expedited`, `investigation_active`

---

## PDF Tier Strategy

| Tier | Forms | Approach |
|---|---|---|
| **A — Form-accurate** | DWC-1, UB-04, CMS-1500, Form 105, DEU rating | PNG blank form + JSON field coordinate map → text overlaid at calibrated positions |
| **B — Structured letterhead** | QME/AME reports, UR decisions, WCAB filings, C&R, Stips, medical reports, medical chronology, billing (non-Tier A) | Reportlab Flowables with proper sections, WCAB captions, signature blocks, CA WC vocabulary |
| **C — Plain letterhead** | All correspondence, benefit notices, payment records, pharmacy, imaging, wage statements, investigation reports | 2–4 paragraph templates with `{variable}` substitution from ClaimProfile |

**Key realism factors** (what AdjudiCLAIMS Document AI + Claude classifier actually reads):
- Correct form identifiers in headers (PR-2, AD 10133.53, WCAB captions with `ADJ[7-digit]`)
- Regulatory citations in body (`LC 4650`, `8 CCR 9792.6`, `10 CCR 2695.7`)
- CA WC acronyms in context (QME, AME, PQME, P&S, MMI, MPN, SJDB, UR, IMR, MSC)
- ICD-10 codes matching stated body parts; CPT codes in appropriate ranges

---

## 13 Named Scenarios

| Slug | Key Flags | Typical Doc Count |
|---|---|---|
| `standard_claim` | all False | 8–14 |
| `cumulative_trauma` | `ct=True` | 12–18 |
| `litigated_qme` | `litigated=True`, `attorney_represented=True` | 18–30 |
| `denied_claim` | `denied_scenario=True`, `investigation_active=True` | 10–16 |
| `death_claim` | `death_claim=True` | 12–20 |
| `ptd_claim` | `ptd_claim=True`, `litigated=True` | 20–35 |
| `psychiatric_overlay` | `psych_overlay=True` | 14–22 |
| `multi_employer` | `multi_employer=True`, `ct=True` | 16–26 |
| `split_carrier` | `split_carrier=True` | 10–18 |
| `complex_lien` | `litigated=True`, `high_liens=True` | 20–32 |
| `expedited_hearing` | `expedited=True` | 10–16 |
| `qme_dispute_only` | `qme_dispute=True`, `litigated=False` | 8–14 |
| `sjdb_voucher` | `sjdb_dispute=True` | 10–16 |

---

## AdjudiCLAIMS Integration

**Path:** Public API (Path B) — no changes to AdjudiCLAIMS needed.

Sequence per generated case:
1. `POST /api/auth/login` → session cookie
2. `POST /api/claims` (body: claimant name, DOI, body parts, employer, insurer, dateReceived)
3. `PATCH /api/claims/:id` (isLitigated, hasApplicantAttorney, isCumulativeTrauma, status)
4. For each document event: `POST /api/claims/:claimId/documents` (multipart PDF upload)

This triggers the full AdjudiCLAIMS pipeline (OCR → classify → extract → embed → graph enrichment), making generated cases useful for end-to-end pipeline testing.

### Field Alignment (critical)

`financial_gen.py` must replicate the exact TD rate tables from:
`AdjudiCLAIMS-ai-app/server/services/benefit-calculator.service.ts`

```python
TD_RATE_TABLE = {
    2024: {"min": 230.95, "max": 1619.15},
    2025: {"min": 242.86, "max": 1694.57},
    2026: {"min": 252.43, "max": 1761.71},
}
```

`DocumentType` enum must mirror `AdjudiCLAIMS-ai-app/prisma/schema.prisma` exactly (24 values).
Subtype slugs must match `AdjudiCLAIMS-ai-app/server/services/classifier-taxonomy-map.ts` exactly (188 subtypes).

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/generate` | Single case, synchronous, returns download URL + manifest |
| `POST` | `/api/v1/batch` | 1–500 cases, async job, returns `job_id` |
| `GET` | `/api/v1/jobs/{job_id}` | Poll job status + progress (0–100) |
| `GET` | `/api/v1/export/{job_id}` | Download ZIP (StreamingResponse) |
| `GET` | `/api/v1/scenarios` | List all 13 scenario presets |
| `GET` | `/api/v1/scenarios/{slug}` | Scenario detail |
| `GET` | `/api/v1/health` | Health check + counts |

Port: **8001** (avoids conflict with AdjudiCLAIMS at 4900 — verify against `GBS_PORT_AND_URL_REGISTRY.md` before finalizing)

---

## Build / Run Commands

```bash
# Install
pip install -e ".[dev]"

# Dev server
uvicorn claims_generator.main:app --reload --port 8001

# CLI — single case
claims-gen generate --scenario litigated_qme --seed 42 --output ./output/

# CLI — batch
claims-gen batch --count 50 \
  --scenario-dist standard_claim:0.5,litigated_qme:0.3,denied_claim:0.2 \
  --output ./output/

# CLI — seed AdjudiCLAIMS staging
claims-gen seed --scenario standard_claim \
  --org-id org_staging_001 --examiner-id user_staging_001

# Tests
pytest tests/ -v
pytest tests/unit/ -v                         # Fast, no network
pytest tests/unit/test_document_generators.py -k "test_smoke"  # PDF smoke tests

# Docker
docker build -t insurance-claims-generator:latest .
docker-compose up
```

---

## PR & Merge Workflow (GBS Standard)

Each phase should be delivered as a discrete PR against the `gbs-tools-and-resources` main branch.

**Branch naming:** `AJC-XXX/insurance-claims-case-generator-phase-N`

### Merge Criteria Checklist

| Gate | Required |
|------|----------|
| Tests 100% passing (`pytest --tb=short`) | Yes — hard block |
| Coverage ≥ 80% (`pytest --cov`) | Yes — CI enforced |
| `ruff` + `mypy` clean | Yes — CI enforced |
| `detect-secrets` scan clean | Yes — hard block |
| At least 1 approving review | Yes — branch protection |
| All CI checks green | Yes — branch protection |
| No unresolved review threads | Yes |
| Linear ticket linked and updated | Yes |
| `ISSUES.md` updated with deferred items | If any were deferred |

**Use `/dev-ticket AJC-XXX`** for the full plan → implement → PR → review loop per GBS workflow.

---

## Implementation Phases

### Phase 1 — Data Layer + Lifecycle Engine (Days 1–5)
**Goal:** CLI outputs valid JSON manifests. No PDFs yet.

1. Repo scaffold: `pyproject.toml`, Dockerfile skeleton, ruff/mypy config, CI skeleton
2. All `models/` Pydantic models
3. `models/enums.py` — `DocumentType` copied exactly from `prisma/schema.prisma`
4. All `profile/` sub-generators with unit tests; `financial_gen.py` regression-tested vs `benefit-calculator.service.ts`
5. 3 initial scenarios: `standard_claim`, `litigated_qme`, `denied_claim`
6. `core/dag_nodes.py` + `core/dag_transitions.py` — full stage/transition set
7. `core/lifecycle_engine.py` — unit tested: each scenario produces valid ordered stage list
8. `core/timeline_builder.py` — unit tested: regulatory deadlines enforced (15-day ack, 14-day TD, 90-day determination)
9. `case_builder.py` (JSON only, `pdf_bytes={}`)
10. `cli.py` `generate` command

**Exit test:** `claims-gen generate --scenario litigated_qme --seed 42 | python -m json.tool`
→ valid JSON, 18–30 document_events, dates ascending, deadlines met.

### Phase 2 — PDF Generation (Days 6–16)
**Goal:** All 24 document types produce valid PDFs.

1. `pdf_primitives.py` + `letterhead.py` with smoke tests
2. `documents/registry.py` with `@register_document` decorator
3. **Tier C first** (2 days): `correspondence`, `benefit_notice`, `legal_correspondence`, `payment_record`, `pharmacy_record`, `other_document` — establish base pattern
4. **Tier B** (6 days): `medical_report`, `wcab_filing`, `settlement_document`, `ame_qme_report`, `utilization_review`, `billing_statement` (non-Tier A), `lien_claim`, `medical_chronology`, `return_to_work`, `investigation_report`, `deposition_transcript`, `discovery_request`, `work_product`
5. **Remaining Tier C** (1 day): `wage_statement`, `employer_report`, `imaging_report`, `claim_administration`
6. **Tier A forms** (3 days): DWC-1 field map calibration + `form_renderer.py`, UB-04 + CMS-1500, Form 105 + DEU rating
7. Wire `case_builder.py` to generators; `exporter.py` (ZIP + `manifest.json`)
8. `batch_builder.py` + CLI `batch` command; test 50-case batch

**Exit test:** 5-case batch ZIP; all PDFs open; DWC-1 shows filled fields over blank form.

### Phase 3 — FastAPI + All Scenarios (Days 17–21)
**Goal:** REST API live locally. All 13 scenarios working.

1. `api/job_store.py`, `api/schemas.py`, `api/middleware.py`
2. All 6 route files
3. Wire generators into routes
4. Remaining 10 scenarios
5. Integration tests (pytest-httpx ASGI transport)

**Exit test:** Batch of 20 via API completes under 30 seconds.

### Phase 4 — AdjudiCLAIMS Integration + Hardening (Days 22–26)
**Goal:** Staging seed confirmed end-to-end. Docker publishable. CI green.

1. `integrations/adjudiclaims_client.py` + `gcp_secrets.py`
2. `adjudiclaims_seed` wired into `case_builder.py` / `batch_builder.py`
3. CLI `seed` command
4. Integration tests with pytest-httpx mock of AdjudiCLAIMS API
5. Docker multi-stage build (target < 800MB)
6. GitHub Actions CI (ruff + mypy + pytest, fail if coverage < 80%)
7. README with quick-start, API reference, scenario catalog

**Exit test:**
```bash
claims-gen seed --scenario standard_claim --env staging
```
Verify claim appears in AdjudiCLAIMS staging with correct document count and pipeline completes.

### Phase 5 — Next.js Frontend (Days 27–31, parallel with Phase 4)
**Goal:** Usable web UI for non-CLI users.

- Scenario selector (card grid, 13 cards with flag badges)
- Generate form (scenario, seed, AdjudiCLAIMS seed toggle)
- Job status poller (2s interval, progress bar, download button)
- Batch page (count slider 1–500, scenario distribution table)

---

## Critical Reference Files in AdjudiCLAIMS

| File | Used For |
|---|---|
| `prisma/schema.prisma` | DocumentType enum (24 values), Claim model field names |
| `server/services/classifier-taxonomy-map.ts` | All 188 subtype slugs (exact names for DocumentRegistry) |
| `server/routes/claims.ts` | CreateClaimBodySchema + UpdateClaimBodySchema for AdjudiClaimsClient |
| `server/routes/documents.ts` | Multipart upload contract, MIME types, 50MB limit |
| `server/services/benefit-calculator.service.ts` | TD/PD rate tables to replicate exactly in financial_gen.py |

---

## Verification

1. **Phase 1 exit test:** JSON manifest from CLI — valid structure, 18–30 events, dates ascending, deadlines respected
2. **Phase 2 exit test:** 5-case batch — all PDFs open, DWC-1 Tier A visually correct
3. **Phase 3 exit test:** Batch of 20 via API < 30 seconds; all 13 scenarios return valid cases
4. **Phase 4 exit test:** `claims-gen seed` → claim visible in AdjudiCLAIMS staging, pipeline completes (ocrStatus=COMPLETE), documents classified
5. **Regression test:** `test_financial_gen.py` — TD rate calculations match `benefit-calculator.service.ts` values for 2024/2025/2026 at min/max/mid AWW values

---

## Definition of Done

The project is complete when ALL of the following are true:

- [ ] All 5 phase exit tests pass
- [ ] `pytest` reports 100% passing, ≥ 80% coverage
- [ ] `ruff`, `mypy`, `detect-secrets` all clean in CI
- [ ] Docker image builds and runs (`docker-compose up`) on a clean machine
- [ ] `claims-gen seed` completes against AdjudiCLAIMS staging; claim visible in UI with pipeline status `ocrStatus=COMPLETE`
- [ ] Linear ticket closed with merged PR linked
- [ ] `ISSUES.md` lists any deferred items with ticket references
- [ ] `SUBAGENT_INSTRUCTIONS.md` written and committed
- [ ] No credentials in any committed file
