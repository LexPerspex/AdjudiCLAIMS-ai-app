/**
 * Claim access verification middleware.
 *
 * Centralizes the claim access check that was previously duplicated
 * across documents, deadlines, and investigation routes.
 *
 * Verifies:
 * 1. Claim exists and has not been soft-deleted
 * 2. Claim belongs to the user's organization
 * 3. If CLAIMS_EXAMINER, claim is assigned to them
 */

import { prisma } from '../db.js';
import { UserRole } from './rbac.js';

export interface ClaimAccessResult {
  authorized: boolean;
  claim: {
    id: string;
    organizationId: string;
    assignedExaminerId: string;
  } | null;
}

/**
 * Verify the caller has access to the given claim.
 *
 * - Soft-delete guard: deleted claims return unauthorized (404 upstream)
 * - Organization ownership check: cross-org access returns unauthorized
 * - Examiner assignment check (for CLAIMS_EXAMINER role)
 * - Supervisors and admins can access all non-deleted org claims
 */
export async function verifyClaimAccess(
  claimId: string,
  userId: string,
  userRole: UserRole,
  orgId: string,
): Promise<ClaimAccessResult> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { id: true, organizationId: true, assignedExaminerId: true, deletedAt: true },
  });

  // Treat soft-deleted claims as non-existent — same as not found.
  // Note: deletedAt == null covers both null and undefined (legacy mocks without the field).
  if (!claim || claim.deletedAt != null || claim.organizationId !== orgId) {
    return { authorized: false, claim: null };
  }

  if (userRole === UserRole.CLAIMS_EXAMINER && claim.assignedExaminerId !== userId) {
    return { authorized: false, claim };
  }

  return { authorized: true, claim };
}
