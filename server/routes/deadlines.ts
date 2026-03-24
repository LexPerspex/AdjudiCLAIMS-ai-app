/**
 * Regulatory deadline management routes.
 *
 * Provides claim-level deadline views with urgency classification,
 * a dashboard view of all user-visible deadlines, and deadline
 * status updates (MET / WAIVED).
 *
 * All routes require authentication. Deadline visibility follows the
 * same RBAC model as claims:
 * - CLAIMS_EXAMINER: sees only deadlines for their assigned claims
 * - CLAIMS_SUPERVISOR / CLAIMS_ADMIN: sees all deadlines in their org
 *
 * GREEN zone disclaimer: "Deadlines calculated from statutory requirements.
 * Verify underlying dates."
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, UserRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import {
  getClaimDeadlines,
  getDeadlineSummary,
  getAllUserDeadlines,
  markDeadline,
  type UrgencyLevel,
} from '../services/deadline-engine.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const PaginationQuerySchema = z.object({
  take: z
    .string()
    .optional()
    .transform((v) => {
      const n = v !== undefined ? parseInt(v, 10) : 50;
      return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50;
    }),
  skip: z
    .string()
    .optional()
    .transform((v) => {
      const n = v !== undefined ? parseInt(v, 10) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }),
  urgency: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const levels = v.split(',').map((s) => s.trim().toUpperCase());
      const valid: UrgencyLevel[] = ['GREEN', 'YELLOW', 'RED', 'OVERDUE'];
      const filtered = levels.filter((l): l is UrgencyLevel =>
        valid.includes(l as UrgencyLevel),
      );
      return filtered.length > 0 ? filtered : undefined;
    }),
});

const PatchDeadlineBodySchema = z.object({
  status: z.enum(['MET', 'WAIVED']),
  reason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify the caller has access to a claim (org match + role check). */
async function verifyClaimAccess(
  claimId: string,
  userId: string,
  userRole: UserRole,
  orgId: string,
): Promise<{
  authorized: boolean;
  claim: { id: string; organizationId: string; assignedExaminerId: string } | null;
}> {
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
export async function deadlineRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/claims/:claimId/deadlines
   *
   * Get all deadlines for a specific claim with urgency classification
   * and an aggregate summary.
   */
  server.get<{ Params: { claimId: string } }>(
    '/claims/:claimId/deadlines',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(
        claimId,
        user.id,
        user.role,
        user.organizationId,
      );

      if (!authorized) {
        return reply.code(404).send({ error: 'Claim not found' });
      }

      const [deadlines, summary] = await Promise.all([
        getClaimDeadlines(claimId),
        getDeadlineSummary(claimId),
      ]);

      return {
        deadlines,
        summary,
        disclaimer: 'Deadlines calculated from statutory requirements. Verify underlying dates.',
      };
    },
  );

  /**
   * GET /api/deadlines
   *
   * Dashboard: all deadlines visible to the user, sorted by urgency
   * (RED/OVERDUE first). Supports pagination and urgency filtering.
   */
  server.get(
    '/deadlines',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const queryParsed = PaginationQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { take, skip, urgency } = queryParsed.data;

      let deadlines = await getAllUserDeadlines(user.id, user.organizationId, user.role);

      // Filter by urgency if specified
      if (urgency) {
        deadlines = deadlines.filter((d) => urgency.includes(d.urgency));
      }

      const total = deadlines.length;

      // Apply pagination
      const paginated = deadlines.slice(skip, skip + take);

      return {
        deadlines: paginated,
        total,
        take,
        skip,
        disclaimer: 'Deadlines calculated from statutory requirements. Verify underlying dates.',
      };
    },
  );

  /**
   * PATCH /api/deadlines/:id
   *
   * Mark a deadline as MET or WAIVED. Validates that the user has
   * access to the claim associated with the deadline.
   *
   * Audit logs DEADLINE_MET or DEADLINE_MISSED event type.
   */
  server.patch<{ Params: { id: string } }>(
    '/deadlines/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = PatchDeadlineBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { id } = request.params;
      const { status, reason } = parsed.data;

      // Look up the deadline
      const deadline = await prisma.regulatoryDeadline.findUnique({
        where: { id },
        select: { id: true, claimId: true, deadlineType: true, status: true },
      });

      if (!deadline) {
        return reply.code(404).send({ error: 'Deadline not found' });
      }

      // Verify user has access to the associated claim
      const { authorized } = await verifyClaimAccess(
        deadline.claimId,
        user.id,
        user.role,
        user.organizationId,
      );

      if (!authorized) {
        return reply.code(404).send({ error: 'Deadline not found' });
      }

      // Update the deadline
      const updated = await markDeadline(id, status, reason);

      // Audit log — use DEADLINE_MET for both MET and WAIVED
      const auditEventType = status === 'MET' ? 'DEADLINE_MET' : 'DEADLINE_MET';
      void logAuditEvent({
        userId: user.id,
        claimId: deadline.claimId,
        eventType: auditEventType,
        eventData: {
          deadlineId: id,
          deadlineType: deadline.deadlineType,
          newStatus: status,
          reason: reason ?? null,
        },
        request,
      });

      return updated;
    },
  );
}
