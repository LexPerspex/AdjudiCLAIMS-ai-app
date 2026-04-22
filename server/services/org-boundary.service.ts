/**
 * Organization boundary enforcement — cross-tenant data isolation.
 *
 * AdjudiCLAIMS is deployed as a Phase 2A standalone product. Each insurance
 * carrier, TPA, or self-insured employer is a distinct Organization tenant.
 * Data belonging to Org A must never be readable by users from Org B.
 *
 * This module documents the data boundary rules and provides shared helpers
 * used by route handlers and middleware to enforce them.
 *
 * # Enforcement layers
 *
 * 1. **Session layer** — `SessionUser.organizationId` is set at login from the
 *    database and cannot be overridden by the client. All requests carry the
 *    authenticated org ID from the session.
 *
 * 2. **Claim layer** — `verifyClaimAccess` (server/middleware/claim-access.ts)
 *    filters by `organizationId` and `deletedAt` for every claim operation.
 *    Documents, deadlines, investigation items, chat sessions, liens, letters,
 *    referrals, and all other claim-scoped resources are reached only through
 *    a claim access check — preventing direct-ID access from cross-org users.
 *
 * 3. **Document layer** — `getDocumentAccessFilter` and `isDocumentAccessible`
 *    (server/services/document-access.service.ts) enforce UPL data boundaries
 *    within the org: examiner roles are blocked from attorney-only, privileged,
 *    work product, and legal analysis documents.
 *
 * 4. **KB layer** — `kb-access.service.ts` blocks legal research sources and
 *    content types from examiner roles.
 *
 * 5. **Organization layer** — `GET /orgs/:id` and `GET /orgs/:id/members`
 *    check `user.organizationId === id` before returning data.
 *
 * # Soft-delete behavior
 *
 * Claims and documents support soft-delete (deletedAt / deletedBy fields).
 * Soft-deleted records are treated as non-existent for all access checks:
 * - `verifyClaimAccess` returns unauthorized when `claim.deletedAt` is set
 * - `GET /documents/:id` returns 404 when `document.deletedAt` is set
 *
 * # Phase 2A scope
 *
 * This is a standalone AdjudiCLAIMS deployment with no shared claims between
 * attorney-side and examiner-side tenants. Full dual-tenant shared claim
 * linkage (Phase 2B) is out of scope and deferred.
 *
 * Specification: docs/product/DATA_BOUNDARY_SPECIFICATION.md
 */

/**
 * Check if two organization IDs match.
 *
 * Used in route handlers where the resource's organizationId must match the
 * authenticated user's organizationId. Returns false if either value is null
 * or undefined, which should be treated as an authorization failure upstream.
 *
 * @param resourceOrgId - The organizationId on the resource being accessed.
 * @param userOrgId - The authenticated user's organizationId from the session.
 * @returns true only if both are non-empty and identical.
 */
export function isSameOrg(resourceOrgId: string | null | undefined, userOrgId: string | null | undefined): boolean {
  if (!resourceOrgId || !userOrgId) return false;
  return resourceOrgId === userOrgId;
}

/**
 * Build a Prisma where-clause fragment that scopes a top-level model query to
 * the authenticated user's organization.
 *
 * Usage:
 * ```ts
 * prisma.claim.findMany({
 *   where: { ...orgScope(user.organizationId) },
 * })
 * ```
 *
 * @param orgId - The authenticated user's organizationId.
 */
export function orgScope(orgId: string): { organizationId: string; deletedAt: null } {
  return { organizationId: orgId, deletedAt: null };
}
