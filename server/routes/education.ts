/**
 * Education routes.
 *
 * Provides endpoints for managing a claims examiner's education state —
 * Tier 1 term dismissals, Tier 2 regulatory content lookup, and education
 * mode (NEW vs STANDARD). These routes are exempt from the training gate
 * because education is a prerequisite to training, not the reverse.
 *
 * Routes:
 *   GET  /api/education/profile                  — Get user's education state
 *   GET  /api/education/terms                    — Get all Tier 1 terms with dismissal state
 *   POST /api/education/terms/:termId/dismiss    — Dismiss a Tier 1 term
 *   POST /api/education/terms/reenable           — Re-enable dismissed terms (all or by category)
 *   GET  /api/education/content/:featureId       — Get Tier 2 entries for a feature
 *   GET  /api/education/mode                     — Get current mode (NEW/STANDARD)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import * as educationService from '../services/education-profile.service.js';
import type { Tier1Category, FeatureContext } from '../data/tier1-terms.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const TIER1_CATEGORIES: [Tier1Category, ...Tier1Category[]] = [
  'BENEFITS',
  'MEDICAL',
  'LEGAL_PROCESS',
  'REGULATORY_BODIES',
  'CLAIM_LIFECYCLE',
  'DOCUMENTS_FORMS',
];

const FEATURE_CONTEXTS: [FeatureContext, ...FeatureContext[]] = [
  'CLAIM_INTAKE',
  'BENEFIT_CALCULATION',
  'DEADLINE_TRACKING',
  'MEDICAL_REVIEW',
  'INVESTIGATION',
  'DOCUMENT_REVIEW',
  'CHAT',
  'COVERAGE_DETERMINATION',
  'SETTLEMENT',
  'UTILIZATION_REVIEW',
];

const ReEnableBodySchema = z.object({
  category: z.enum(TIER1_CATEGORIES).optional(),
});

const TermIdParamsSchema = z.object({
  termId: z.string().min(1),
});

const FeatureIdParamsSchema = z.object({
  featureId: z.enum(FEATURE_CONTEXTS),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function educationRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/education/profile
   *
   * Get the authenticated user's full education profile — dismissed terms,
   * training completion status, and learning mode expiry.
   * Education routes are exempt from the training gate.
   */
  server.get(
    '/education/profile',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const profile = await educationService.getOrCreateProfile(user.id);
      return profile;
    },
  );

  /**
   * GET /api/education/terms
   *
   * Return all Tier 1 terms annotated with whether this user has dismissed them.
   * Order matches the canonical TIER1_TERMS source order.
   */
  server.get(
    '/education/terms',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const terms = await educationService.getTermsWithDismissalState(user.id);
      return terms;
    },
  );

  /**
   * POST /api/education/terms/:termId/dismiss
   *
   * Permanently dismiss a Tier 1 term for the authenticated user.
   * The term will no longer appear in the UI until re-enabled.
   * Logs a TIER1_TERM_DISMISSED audit event.
   */
  server.post<{ Params: { termId: string } }>(
    '/education/terms/:termId/dismiss',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = TermIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid term ID',
          details: parsed.error.issues,
        });
      }

      const { termId } = parsed.data;

      try {
        const profile = await educationService.dismissTerm(user.id, termId);

        void logAuditEvent({
          userId: user.id,
          eventType: 'TIER1_TERM_DISMISSED',
          eventData: { termId },
          request,
        });

        return profile;
      } catch {
        return reply.code(404).send({ error: 'Term not found' });
      }
    },
  );

  /**
   * POST /api/education/terms/reenable
   *
   * Re-enable dismissed Tier 1 terms. If `category` is provided in the body,
   * only terms in that category are re-enabled. If omitted, ALL dismissed
   * terms are cleared.
   */
  server.post(
    '/education/terms/reenable',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = ReEnableBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { category } = parsed.data;
      const profile = await educationService.reEnableTerms(user.id, category);
      return profile;
    },
  );

  /**
   * GET /api/education/content/:featureId
   *
   * Return Tier 2 (always-present) regulatory education entries for a given
   * feature context. Tier 2 content is never personalized and never hidden.
   * Returns 400 if the featureId is not a known FeatureContext value.
   */
  server.get<{ Params: { featureId: string } }>(
    '/education/content/:featureId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const parsed = FeatureIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid feature ID',
          details: parsed.error.issues,
        });
      }

      const { featureId } = parsed.data;
      const entries = educationService.getEducationContentForFeature(featureId);
      return entries;
    },
  );

  /**
   * GET /api/education/mode
   *
   * Return the current education mode for the authenticated user.
   *
   * 'NEW'      — learningModeExpiry is set and is in the future (new examiner)
   * 'STANDARD' — no expiry set, or expiry has passed
   */
  server.get(
    '/education/mode',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const mode = await educationService.getEducationMode(user.id);
      return { mode };
    },
  );
}
