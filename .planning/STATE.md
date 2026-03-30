# AdjudiCLAIMS — Current State

**Last Updated:** 2026-03-30
**Branch:** main
**Last Merge:** PR #3 — `feat/document-workflow-engine` → `main` (commit `dd47fab`)

---

## Phase Summary

| Phase | Status | Completion |
|-------|--------|------------|
| 0 Infrastructure | ✅ Complete | 100% |
| 1 Auth & RBAC | ✅ Complete | ~100% |
| 2 Document Pipeline | ✅ Complete | 95% |
| 3 Core Claims Services | ✅ Complete | 95% |
| 4 UPL Compliance | ✅ Complete | 98% |
| 5 Claims Chat | ✅ Complete | 95% |
| 6 Education & Training | ✅ Complete | ~90% |
| 7 Compliance Dashboard | 🟡 Near Complete | ~80% |
| 8 Data Boundaries & KB | 🟡 Near Complete | ~85% |
| 9 MVP Integration Testing | 🟡 Near Complete | ~80% |
| 10 Tier 2 Features | 🟡 Partial | ~60% |
| 11 Tier 3 Features | ❌ Not Started | 0% |

## Current Focus: MVP Readiness (Phase 9)

### Open Blockers

1. **Unified server not deployed to Cloud Run** — `server/production.ts` committed, Cloud Build triggers on `main` push but staging deployment needs verification
2. **Legal counsel UPL review not submitted** — Package at `docs/legal/UPL_REVIEW_PACKAGE.md`, must be sent to outside counsel for sign-off before production use
3. **Production database migration not run** — Schema changes (auth fields, soft-delete, ClaimBodyPart, CoverageDetermination, MedicalPayment) need `prisma migrate deploy` on staging/production

### Resolved (This Session)

- ~~Production authentication~~ — Full argon2id + MFA/TOTP + lockout + register
- ~~KB integration~~ — 34-entry regulatory KB, `lookup_regulation` wired
- ~~Education content~~ — 86 Tier 1 terms, 57 Tier 2 entries, 4 training modules, 20 workflows
- ~~Frontend tab stubs~~ — All 12 claim detail tabs implemented (including Coverage + Medicals)
- ~~Lien type mismatches~~ — Frontend hook aligned with backend (10-status enum, correct field names)

### Next Actions

1. Deploy unified server to Cloud Run staging
2. Run `npx prisma migrate deploy` against staging database
3. Run Playwright E2E suite against staging URL
4. Submit UPL review package to legal counsel
5. Graph RAG G5 Trust UX (confidence badges, entity panel)

## Quality Metrics

| Metric | Value |
|--------|-------|
| Test files | 87 |
| Tests passing | 3,068 / 3,068 |
| Typecheck errors | 0 |
| Build | succeeds |
| UPL RED blocked | 126/126 (100%) |
| UPL GREEN false positive | 0/126 (0%) |
| UPL YELLOW disclaimed | 62/62 (100%) |
| SOC 2 compliance tests | 69 passing |

## New Features (This Sprint)

- **AOE/COE Coverage Tracking** — `ClaimBodyPart` model with per-body-part admit/deny/pending status, `CoverageDetermination` append-only audit log, Coverage tab with UPL disclaimers
- **Medical Billing Overview** — `MedicalPayment` model, aggregate view (reserves vs exposure, OMFS summary, provider totals, admitted vs non-admitted), Medicals tab
- **SOC 2 Foundation** — argon2id auth, MFA, lockout, idle timeout, rate limiting, DSAR, right to deletion, anomaly detection, 69 compliance tests
- **Regulatory KB** — 34-entry in-memory KB with citation/topic/keyword search
- **UPL Acceptance Suite** — 314 queries + 203 prohibited outputs, 100% catch rate
