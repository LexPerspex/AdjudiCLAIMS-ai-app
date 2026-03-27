/**
 * MTUS guideline matching routes.
 *
 * Provides endpoints for matching treatment requests against MTUS guidelines
 * from the Knowledge Base and retrieving individual guideline details.
 *
 * UPL zone: GREEN — purely factual guideline criteria presentation.
 * All responses include the MTUS disclaimer per LC 4610.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { matchMtusGuidelines, getGuidelineDetail } from '../services/mtus-matcher.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const MtusMatchBodySchema = z.object({
  bodyPart: z.string().min(1, 'Body part is required').max(200, 'Body part too long'),
  diagnosis: z.string().max(500, 'Diagnosis too long').optional(),
  treatmentDescription: z
    .string()
    .min(1, 'Treatment description is required')
    .max(2000, 'Treatment description too long'),
  cptCode: z
    .string()
    .regex(/^\d{5}$/, 'CPT code must be a 5-digit number')
    .optional(),
});

const GuidelineIdParamSchema = z.object({
  guidelineId: z.string().min(1, 'Guideline ID is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function mtusRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/mtus/match
   *
   * Match a treatment request against MTUS guidelines.
   * Returns matching guidelines with relevance scores and the mandatory disclaimer.
   */
  server.post(
    '/mtus/match',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = MtusMatchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const matchRequest = parsed.data;

      // Audit log the MTUS query — GREEN zone factual lookup
      void logAuditEvent({
        userId: user.id,
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: 'GREEN',
        eventData: {
          action: 'mtus_guideline_match',
          bodyPart: matchRequest.bodyPart,
          cptCode: matchRequest.cptCode ?? null,
          hasDiagnosis: !!matchRequest.diagnosis,
        },
        request,
      });

      const result = matchMtusGuidelines(matchRequest);

      return result;
    },
  );

  /**
   * GET /api/mtus/guidelines/:guidelineId
   *
   * Get detailed information for a specific MTUS guideline.
   */
  server.get<{ Params: { guidelineId: string } }>(
    '/mtus/guidelines/:guidelineId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = GuidelineIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid guideline ID', details: parsed.error.issues });
      }

      const { guidelineId } = parsed.data;

      const guideline = getGuidelineDetail(guidelineId);

      if (!guideline) {
        return reply.code(404).send({ error: 'Guideline not found' });
      }

      // Audit log guideline detail access
      void logAuditEvent({
        userId: user.id,
        eventType: 'UPL_ZONE_CLASSIFICATION',
        uplZone: 'GREEN',
        eventData: {
          action: 'mtus_guideline_detail',
          guidelineId,
        },
        request,
      });

      return { guideline };
    },
  );
}
