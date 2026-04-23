# AJC-16 — Plan

## Title
Phase 10: Benefit payment letter PDF export + employer notification templates (LC 3761)

## Goal (one sentence)
Add a benefit-payment-specific letter generator (per-payment, per-benefit-type) and a generalized LC 3761 employer notification builder with structured "event" types, then expose a PDF-export route (server returns print-ready HTML; browser handles Save-as-PDF) plus a frontend Download Letter button on the existing letters tab.

## What already exists (don't rebuild)
- `server/services/letter-template.service.ts` — token-replacement engine + `generateLetter`/`getClaimLetters`/`getLetter`.
- `server/services/document-generation.service.ts` — `generateLetterHtml(markdown, metadata)` returns full print-ready HTML with letterhead + UPL footer + `@media print` CSS. **This is our PDF mechanism.**
- `server/data/letter-templates.ts` — 5 templates including `EMPLOYER_NOTIFICATION_LC3761` (claim-receipt only) and `TD_PAYMENT_SCHEDULE` (period range only).
- `server/routes/letters.ts` — `POST /claims/:claimId/letters/generate`, `GET /letters/:letterId/html` (print HTML).
- `prisma.GeneratedLetter` model + `LetterType` enum (5 values).
- `prisma.BenefitPayment` model — has `paymentType` (TD/PD/DEATH_BENEFIT/SJDB_VOUCHER), `amount`, `paymentDate`, `periodStart`, `periodEnd`, `isLate`, `penaltyAmount`, `calculationInputs`.
- Tests: `tests/unit/letter-template.test.ts`, `tests/unit/letter-generation-html.test.ts`.
- Frontend: `app/routes/_app.claims.$claimId.letters.tsx` + `app/hooks/api/use-letters.ts`. Note: hook return shape doesn't match server (`recipientRole`, `category`, `status` fields aren't returned by backend) — out of scope to refactor; we extend the API additively.

## Gaps this ticket fills
1. **No per-payment benefit letter.** Existing `TD_PAYMENT_SCHEDULE` is a period-range explainer; there's no letter tied to a single `BenefitPayment` row that says "Payment of $X for period A-B issued on date D" with its statutory authority. Examiners need this when issuing a payment.
2. **LC 3761 is one-shot only.** Existing template covers initial claim notification. LC 3761 also entitles employers to ongoing material-development notice (benefit award, decision, denial). Need an event-typed builder.
3. **No PDF download UI.** Backend has the HTML route, but the frontend has no Download/Print button.
4. **Letter generation isn't linked to payment records.** Need to allow `populatedData` to carry payment id + amount + period for audit traceability.

## Implementation

### Prisma — additive only (no schema migration risks)
Add 3 enum values to `LetterType`:
- `BENEFIT_PAYMENT_LETTER` — per-payment notification of issued TD/PD/death-benefit/SJDB payment.
- `EMPLOYER_NOTIFICATION_BENEFIT_AWARD` — LC 3761 notice of benefit award/material development.
- `EMPLOYER_NOTIFICATION_CLAIM_DECISION` — LC 3761 notice of accept/deny decision.

Run `prisma generate` only (no DB migration; new enum values only — backwards compatible with existing data). Verify the enum addition produces a small migration file, commit it, but do not apply against staging (per project policy `staging holds dev artifacts only`).

**Decision:** Yes generate the migration file (so production deploy stamps it). Migration is enum ALTER TYPE ADD VALUE — non-breaking.

### New data file: `server/data/benefit-payment-templates.ts`
Three new `LetterTemplate` exports appended to `LETTER_TEMPLATES`:

1. **`benefit-payment-letter`** (`letterType: 'BENEFIT_PAYMENT_LETTER'`)
   - Required fields: `claimNumber`, `claimantName`, `paymentType`, `paymentAmount`, `periodStart`, `periodEnd`, `paymentDate`, `tdRate` (optional), `examinerName`, `insurer`.
   - Statutory authority: `LC 4650 (TD), LC 4658 (PD), LC 4700 (death benefit)`.
   - Body addresses claimant; CC line names employer (LC 3761 cross-reference).
   - Includes late-payment penalty notice (LC 4650(c)) when `isLate=true`.

2. **`employer-notification-benefit-award`** (`letterType: 'EMPLOYER_NOTIFICATION_BENEFIT_AWARD'`)
   - Required fields: `claimNumber`, `claimantName`, `dateOfInjury`, `employer`, `insurer`, `benefitType`, `benefitAmount`, `effectiveDate`, `examinerName`.
   - Statutory authority: `LC 3761`.
   - Body: addresses employer of record, recites benefit decision facts (type/amount/effective date), cites LC 3761.

3. **`employer-notification-claim-decision`** (`letterType: 'EMPLOYER_NOTIFICATION_CLAIM_DECISION'`)
   - Required fields: `claimNumber`, `claimantName`, `dateOfInjury`, `employer`, `insurer`, `decisionType` ("ACCEPTED"/"DENIED"/"DELAYED"), `decisionDate`, `decisionBasis` (factual recitation, no legal analysis), `examinerName`.
   - Statutory authority: `LC 3761; LC 5402`.

All templates explicitly disclaim "not legal advice" (UPL GREEN-zone — factual recitation + statutory citation only).

### New service: `server/services/benefit-letter.service.ts`
Thin wrapper around `letter-template.service.ts` adding payment-aware data hydration:

```typescript
export async function generateBenefitPaymentLetter(
  userId: string,
  paymentId: string,
  request: FastifyRequest,
): Promise<GeneratedLetterRecord>;

export async function generateEmployerNotification(
  userId: string,
  claimId: string,
  event: EmployerNotificationEvent,  // discriminated union
  request: FastifyRequest,
): Promise<GeneratedLetterRecord>;
```

Where `EmployerNotificationEvent` is:
```typescript
type EmployerNotificationEvent =
  | { type: 'BENEFIT_AWARD'; benefitType: PaymentType; benefitAmount: string; effectiveDate: string }
  | { type: 'CLAIM_DECISION'; decisionType: 'ACCEPTED' | 'DENIED' | 'DELAYED'; decisionDate: string; decisionBasis: string };
```

Both functions:
1. Fetch payment/claim from prisma.
2. Build the override map (amounts formatted with `$X,XXX.XX`, dates as YYYY-MM-DD).
3. Call existing `generateLetter(...)` which persists + audits.

### New routes: extend `server/routes/letters.ts`
Add 3 endpoints:
- `POST /api/payments/:paymentId/letters/benefit-payment` — generate per-payment letter (verifies claim access via the payment's claim).
- `POST /api/claims/:claimId/letters/employer-notification` — body: `EmployerNotificationEvent`, generates LC 3761 letter.
- `GET /api/letters/:letterId/pdf` — alias of existing `/letters/:letterId/html` but sets Content-Disposition to attachment (so browser triggers download dialog instead of opening in new tab). Same HTML body — keeps single source of truth.

All endpoints: `requireAuth()`, role-check (CLAIMS_EXAMINER/SUPERVISOR/ADMIN), claim-access verification, audit log via `letter-template.service.generateLetter` (existing path).

### Frontend — `app/routes/_app.claims.$claimId.letters.tsx`
Minimal additive change: add a "Download" action to each letter card. Existing card layout has the letter title and status. Append a button that opens `/api/letters/:letterId/html` in a new tab (browser print-to-PDF). Add corresponding hook in `use-letters.ts`:
```typescript
export function letterPrintUrl(letterId: string): string {
  return `${API_BASE}/letters/${letterId}/html`;
}
```
No state changes; pure URL construction. Keeps the existing `Letter` type compatible.

(Optional, time-permitting: surface "Generate benefit payment letter" affordance on the medicals/payments tab. **Out of scope for this PR** — log as `ISSUES.md` follow-up if not done.)

### Tests — `tests/unit/benefit-letter.test.ts` (new)
- 3 templates render: each placeholder is replaced (no leftover `{{}}`)
- BENEFIT_PAYMENT_LETTER includes payment amount + period + statutory authority for each PaymentType
- EMPLOYER_NOTIFICATION_BENEFIT_AWARD: LC 3761 citation present, employer addressed, benefit details populated
- EMPLOYER_NOTIFICATION_CLAIM_DECISION: LC 3761 citation present, decision recited factually
- UPL GREEN: no legal-analysis phrases (`should`, `must consult`, `entitled to`, etc — use existing `upl-validator` patterns where appropriate)
- `generateBenefitPaymentLetter`: hydrates from payment row, passes correct overrides, persists via `prisma.generatedLetter.create`
- `generateEmployerNotification`: handles both event types, distinct `letterType` enum values

### Tests — extend `tests/unit/letter-template.test.ts`
- Verify new templates appear in `getTemplates()`
- Verify `getTemplate('benefit-payment-letter')` returns expected shape

### Tests — `tests/unit/benefit-letter-routes.test.ts` (new)
- `POST /api/payments/:paymentId/letters/benefit-payment` — auth required, RBAC, returns 201 with letter, calls `generateBenefitPaymentLetter`, payment-not-found returns 404, claim-access denied returns 403.
- `POST /api/claims/:claimId/letters/employer-notification` — same gates, both event types, invalid event-type returns 400 (zod).
- `GET /api/letters/:letterId/pdf` — auth required, returns Content-Type `text/html`, Content-Disposition `attachment; filename="..."`.

### Coverage target
≥80% on new files (`benefit-letter.service.ts`, new template registrations, new route handlers). Existing infra is well-covered.

## Files touched

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add 3 LetterType enum values |
| `prisma/migrations/<ts>_add_benefit_letter_types/migration.sql` | Generated by prisma migrate dev |
| `server/data/letter-templates.ts` | Append 3 templates to LETTER_TEMPLATES export |
| `server/services/benefit-letter.service.ts` | New — payment/employer-notification hydration |
| `server/routes/letters.ts` | Add 3 endpoints (benefit-payment, employer-notification, /pdf alias) |
| `server/index.ts` | (none — letters route already registered) |
| `app/hooks/api/use-letters.ts` | Add `letterPrintUrl()` helper |
| `app/routes/_app.claims.$claimId.letters.tsx` | Add Download button to letter cards |
| `tests/unit/benefit-letter.test.ts` | New |
| `tests/unit/benefit-letter-routes.test.ts` | New |
| `tests/unit/letter-template.test.ts` | Add coverage for new templates |

## Risks & open questions
- **Frontend-API shape mismatch already present.** `use-letters.ts` types fields the backend doesn't return (`recipientRole`, `category`, `status`). Out of scope to fix; new Download button only depends on `letter.id` which IS present. Logged for follow-up.
- **Migration on enum ALTER TYPE.** Postgres ALTER TYPE … ADD VALUE is non-transactional in older versions but is safe additive. Migration file generated by Prisma will use the supported syntax.
- **No PDF library.** Per project policy (no puppeteer/headless browser dependency), use existing HTML print path. A native PDF library would be a larger ticket.

## UPL compliance check
All 3 new templates: factual recitation + statutory citation. Disclaimer paragraph: "This [letter/notification] is a factual notification … It does not constitute legal advice." No verbs of legal opinion (entitled, must, should, advise). UPL GREEN per existing `upl-validator.service.ts` patterns.

## Acceptance criteria mapping
| AC | Resolution |
|---|---|
| Benefit payment letter PDF generator | `BENEFIT_PAYMENT_LETTER` template + `generateBenefitPaymentLetter` + `/letters/:id/pdf` |
| Employer LC 3761 notification template | 2 new templates (BENEFIT_AWARD, CLAIM_DECISION) + `generateEmployerNotification` |
| Backend route(s) | 3 new endpoints in `letters.ts` |
| Frontend Download Letter button | Added to letters tab cards |
| Unit tests for letter content generators | `benefit-letter.test.ts` |
| Unit tests for LC 3761 notification builder | `benefit-letter.test.ts` employer-notification block |
| Integration test for routes | `benefit-letter-routes.test.ts` |
| Coverage ≥80% | Driven by tests above |
| UPL compliance | GREEN-zone factual + statutory only |
