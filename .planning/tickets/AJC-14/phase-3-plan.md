# AJC-14 Implementation Plan — Graph RAG G5 Trust UX

## Context
All 3 UI components already exist (ConfidenceBadge, EntityPanel, ProvenanceCard).
Gap: Backend doesn't return graph trust data per-message. Frontend type missing fields.

## Steps

1. `server/services/examiner-chat.service.ts`
   - Add `GraphTrustData` interface with `overallConfidence`, `entities`, `provenance`
   - Capture `graphResult` (currently discarded) in the chat pipeline
   - Add `graphTrust` field to `ChatResponse`
   - Populate from `queryGraphForExaminer` result + citation similarity scores

2. `server/routes/chat.ts`
   - Add `graphTrust` serialization to POST /claims/:claimId/chat response

3. `app/hooks/api/use-chat.ts`
   - Add `GraphTrustData`, `GraphTrustEntity`, `GraphTrustSource` interfaces
   - Add `graphTrust?: GraphTrustData` to `ChatMessage`

4. `app/components/chat/chat-panel.tsx`
   - Wire `ConfidenceBadge` to `message.graphTrust.overallConfidence` in `AssistantMessage`
   - Add `EntitySummarySection` component (collapsible) — shows entity names + types from `graphTrust.entities`
   - Update `ProvenanceSection` to use real `graphTrust.provenance` confidence scores

5. `tests/unit/graph/graph-trust-ux.test.ts` — NEW
   - ConfidenceBadge: HIGH/MEDIUM/LOW thresholds, pct display, aria-label
   - EntityPanel: collapsed by default, expands on click, shows aliases/sources/related
   - ProvenanceCard: renders documentName, type, confidence badge, date

6. `tests/unit/chat-routes.test.ts` (UPDATE existing)
   - Verify `graphTrust` field present in chat response
   - Verify `graphTrust.overallConfidence` is number in [0,1]

## Files to Change
| Path | Change | Why |
|------|--------|-----|
| server/services/examiner-chat.service.ts | modify | Add GraphTrustData to response |
| server/routes/chat.ts | modify | Serialize graphTrust |
| app/hooks/api/use-chat.ts | modify | Add GraphTrustData types |
| app/components/chat/chat-panel.tsx | modify | Wire components |
| tests/unit/graph/graph-trust-ux.test.ts | create | Component unit tests |
| tests/unit/chat-routes.test.ts | modify | API contract tests |
