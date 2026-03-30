/**
 * Coverage determination routes — AOE/COE body part tracking.
 *
 * All routes require authentication. All routes verify claim access.
 * GREEN zone feature — factual body part status tracking.
 *
 * Endpoints:
 * - GET    /api/claims/:claimId/body-parts
 * - POST   /api/claims/:claimId/body-parts
 * - POST   /api/claims/:claimId/coverage-determinations
 * - GET    /api/claims/:claimId/coverage-determinations
 * - GET    /api/claims/:claimId/coverage-summary
 * - POST   /api/claims/:claimId/migrate-body-parts
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import {
  getClaimBodyParts,
  addBodyPart,
  recordDetermination,
  getDeterminationHistory,
  getCoverageSummary,
  migrateJsonBodyParts,
} from '../services/coverage-determination.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AddBodyPartBodySchema = z.object({
  bodyPartName: z.string().min(1, 'bodyPartName is required'),
  icdCode: z.string().optional(),
});

const RecordDeterminationBodySchema = z.object({
  bodyPartId: z.string().min(1, 'bodyPartId is required'),
  newStatus: z.enum(['PENDING', 'ADMITTED', 'DENIED', 'UNDER_INVESTIGATION']),
  determinationDate: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'determinationDate must be a valid date string',
  ),
  basis: z.string().min(1, 'basis is required'),
  counselReferralId: z.string().optional(),
  notes: z.string().optional(),
});

const GetDeterminationsQuerySchema = z.object({
  bodyPartId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function coverageRoutes(server: FastifyInstance): Promise<void> {
  // =========================================================================
  // GET /api/claims/:claimId/body-parts — List body parts
  // =========================================================================
  server.get(
    '/claims/:claimId/body-parts',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const bodyParts = await getClaimBodyParts(claimId);
      return bodyParts;
    },
  );

  // =========================================================================
  // POST /api/claims/:claimId/body-parts — Add body part
  // =========================================================================
  server.post(
    '/claims/:claimId/body-parts',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = AddBodyPartBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const bodyPart = await addBodyPart(claimId, parsed.data.bodyPartName, parsed.data.icdCode);

      void logAuditEvent({
        userId: user.id,
        claimId,
        eventType: 'BODY_PART_STATUS_CHANGED',
        eventData: {
          action: 'BODY_PART_ADDED',
          bodyPartId: bodyPart.id,
          bodyPartName: bodyPart.bodyPartName,
          icdCode: bodyPart.icdCode,
        },
        request,
      });

      return reply.code(201).send(bodyPart);
    },
  );

  // =========================================================================
  // POST /api/claims/:claimId/coverage-determinations — Record determination
  // =========================================================================
  server.post(
    '/claims/:claimId/coverage-determinations',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = RecordDeterminationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      try {
        const determination = await recordDetermination({
          claimId,
          bodyPartId: parsed.data.bodyPartId,
          newStatus: parsed.data.newStatus,
          determinationDate: new Date(parsed.data.determinationDate),
          determinedById: user.id,
          basis: parsed.data.basis,
          counselReferralId: parsed.data.counselReferralId,
          notes: parsed.data.notes,
        });

        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'BODY_PART_STATUS_CHANGED',
          eventData: {
            determinationId: determination.id,
            bodyPartId: parsed.data.bodyPartId,
            newStatus: parsed.data.newStatus,
            previousStatus: determination.previousStatus,
            basis: parsed.data.basis,
            counselReferralId: parsed.data.counselReferralId,
          },
          request,
        });

        return reply.code(201).send(determination);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record determination';
        return reply.code(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/coverage-determinations — List determinations
  // =========================================================================
  server.get(
    '/claims/:claimId/coverage-determinations',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const queryParsed = GetDeterminationsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: queryParsed.error.issues });
      }

      const determinations = await getDeterminationHistory(claimId, queryParsed.data.bodyPartId);
      return determinations;
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/coverage-summary — Coverage summary
  // =========================================================================
  server.get(
    '/claims/:claimId/coverage-summary',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const summary = await getCoverageSummary(claimId);
      return summary;
    },
  );

  // =========================================================================
  // POST /api/claims/:claimId/migrate-body-parts — Migrate JSON body parts
  // =========================================================================
  server.post(
    '/claims/:claimId/migrate-body-parts',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      try {
        const result = await migrateJsonBodyParts(claimId);

        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'BODY_PART_STATUS_CHANGED',
          eventData: {
            action: 'JSON_BODY_PARTS_MIGRATED',
            migrated: result.migrated,
            skipped: result.skipped,
          },
          request,
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to migrate body parts';
        return reply.code(400).send({ error: message });
      }
    },
  );
}
