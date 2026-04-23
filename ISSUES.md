# Deferred Issues

## Pre-existing — discovered during AJC-16 review

### GET /api/letters/:letterId/html lacks claim access enforcement

**Severity:** Medium (information disclosure across orgs)
**Discovered:** AJC-16 review (2026-04-23)
**File:** `server/routes/letters.ts` (around line 274)

The existing `/letters/:letterId/html` endpoint authenticates the user
but does not verify that the letter's parent claim is in the user's
organization. Any authenticated user can fetch any letter HTML by ID.

The `/letters/:letterId/pdf` endpoint added in AJC-16 was given a proper
`verifyClaimAccess` check (commit `c9610f9`). The same fix should be
applied to `/html` in a follow-up ticket. Same one-line pattern:

```ts
const access = await verifyClaimAccess(
  letter.claimId,
  user.id,
  user.role,
  user.organizationId,
);
if (!access.authorized) {
  return reply.code(403).send({ error: 'Access denied to this letter' });
}
```

Plus a 403 integration test mirroring the one in
`tests/unit/benefit-letter-routes.test.ts`.

Recommended ticket: "Fix: enforce org-scoped access on letter HTML
preview endpoint".
