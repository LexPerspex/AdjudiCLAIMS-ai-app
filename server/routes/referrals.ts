/**
 * Counsel referral routes.
 *
 * Provides endpoints for creating, listing, and managing tracked
 * counsel referrals with status lifecycle management.
 *
 * Routes:
 *   POST  /api/claims/:claimId/referrals  — Create a tracked referral
 *   GET   /api/claims/:claimId/referrals  — List referrals for a claim
 *   GET   /api/referrals/:referralId      — Get a specific referral
 *   PATCH /api/referrals/:referralId      — Update referral status
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import {
  createTrackedReferral,
  getClaimReferrals,
  getReferralById,
  updateReferralStatus,
} from '../services/counsel-referral.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateReferralBodySchema = z.object({
  legalIssue: z.string().min(1, 'legalIssue is required'),
});

const UpdateReferralBodySchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'RESPONDED', 'CLOSED']),
  counselEmail: z.string().refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), { message: 'Invalid email' }).optional(),
  counselResponse: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function referralRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/claims/:claimId/referrals
   *
   * Create a tracked counsel referral for a claim.
   * Generates a factual summary and persists the referral.
   */
  server.post(
    '/claims/:claimId/referrals',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      // Verify claim access
      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      // Validate request body
      const parsed = CreateReferralBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      try {
        const referral = await createTrackedReferral(
          user.id,
          claimId,
          parsed.data.legalIssue,
          request,
        );

        return await reply.code(201).send({ referral });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Referral creation failed';
        request.log.error({ err, claimId }, 'Referral creation failed');
        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/claims/:claimId/referrals
   *
   * List all referrals for a claim.
   */
  server.get(
    '/claims/:claimId/referrals',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      // Verify claim access
      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const referrals = await getClaimReferrals(claimId);

      return { referrals };
    },
  );

  /**
   * GET /api/referrals/:referralId
   *
   * Get a specific referral by ID.
   */
  server.get(
    '/referrals/:referralId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { referralId } = request.params as { referralId: string };

      const referral = await getReferralById(referralId);

      if (!referral) {
        return reply.code(404).send({ error: 'Referral not found' });
      }

      return { referral };
    },
  );

  /**
   * PATCH /api/referrals/:referralId
   *
   * Update referral status with transition validation.
   */
  server.patch(
    '/referrals/:referralId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { referralId } = request.params as { referralId: string };

      // Validate request body
      const parsed = UpdateReferralBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      try {
        const referral = await updateReferralStatus(
          referralId,
          parsed.data.status,
          request,
          parsed.data.counselResponse,
          parsed.data.counselEmail,
        );

        return { referral };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Status update failed';

        if (message.includes('not found')) {
          return reply.code(404).send({ error: message });
        }

        if (message.includes('Invalid status transition')) {
          return reply.code(400).send({ error: message });
        }

        request.log.error({ err, referralId }, 'Referral status update failed');
        return reply.code(500).send({ error: message });
      }
    },
  );
}
