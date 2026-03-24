/**
 * Investigation checklist routes.
 *
 * Provides endpoints for viewing and updating the investigation checklist
 * for a claim. The checklist is auto-generated when a claim is created
 * (see investigation-generator.ts) and managed at runtime by the
 * investigation-checklist service.
 *
 * Routes:
 *   GET  /api/claims/:claimId/investigation          — Get checklist with progress
 *   PATCH /api/claims/:claimId/investigation/:itemId  — Update item status
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, UserRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import {
  getInvestigationProgress,
  markItemComplete,
  markItemIncomplete,
} from '../services/investigation-checklist.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UpdateItemBodySchema = z.object({
  isComplete: z.boolean(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify the caller has access to the given claim (org match + role check). */
async function verifyClaimAccess(
  claimId: string,
  userId: string,
  userRole: UserRole,
  orgId: string,
): Promise<{ authorized: boolean; claim: { id: string; organizationId: string; assignedExaminerId: string } | null }> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { id: true, organizationId: true, assignedExaminerId: true },
  });

  if (!claim || claim.organizationId !== orgId) {
    return { authorized: false, claim: null };
  }

  if (userRole === UserRole.CLAIMS_EXAMINER && claim.assignedExaminerId !== userId) {
    return { authorized: false, claim };
  }

  return { authorized: true, claim };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function investigationRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/claims/:claimId/investigation
   *
   * Get the investigation checklist for a claim with progress summary.
   * Requires authentication and claim access.
   */
  server.get<{ Params: { claimId: string } }>(
    '/claims/:claimId/investigation',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const progress = await getInvestigationProgress(claimId);
      return progress;
    },
  );

  /**
   * PATCH /api/claims/:claimId/investigation/:itemId
   *
   * Update an investigation item's completion status.
   *
   * - Any authenticated user with claim access can mark items complete.
   * - Only SUPERVISOR or ADMIN can mark items incomplete (undo).
   * - Logs an INVESTIGATION_ACTIVITY audit event.
   */
  server.patch<{ Params: { claimId: string; itemId: string } }>(
    '/claims/:claimId/investigation/:itemId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId, itemId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const parsed = UpdateItemBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { isComplete, notes } = parsed.data;

      // Only supervisors and admins can undo completion
      if (!isComplete && user.role === UserRole.CLAIMS_EXAMINER) {
        return reply.code(403).send({
          error: 'Only supervisors or admins can mark items as incomplete',
        });
      }

      try {
        const updatedItem = isComplete
          ? await markItemComplete(itemId, user.id, notes)
          : await markItemIncomplete(itemId);

        // Audit log
        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'INVESTIGATION_ACTIVITY',
          eventData: {
            itemId,
            itemType: updatedItem.itemType,
            action: isComplete ? 'completed' : 'uncompleted',
          },
          request,
        });

        return updatedItem;
      } catch {
        return reply.code(404).send({ error: 'Investigation item not found' });
      }
    },
  );
}
