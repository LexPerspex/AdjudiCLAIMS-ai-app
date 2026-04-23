/**
 * Training-sandbox routes — per-user synthetic claim workspace (AJC-19).
 *
 * Lets an individual claims examiner toggle a personal training workspace
 * pre-seeded with synthetic claims. Distinct from the org-wide ENV-gated
 * `/api/sandbox/*` admin routes — those are for demo/staging seeding,
 * these are for any examiner to practice safely.
 *
 * Routes:
 *   GET  /api/training/sandbox/status   — Returns trainingModeEnabled + counts
 *   POST /api/training/sandbox/enable   — Turn on training mode + seed
 *   POST /api/training/sandbox/disable  — Turn off training mode (claims persist)
 *   POST /api/training/sandbox/reset    — Delete + reseed user's sandbox
 *
 * Security: requires auth. Available to all roles — sandbox practice is the
 * exact place trainees should be working before they pass the training gate
 * (see `requireTrainingComplete` middleware), so these routes are exempt
 * from that gate.
 *
 * Audit: enable/disable/reset emit SYSTEM_CONFIG_CHANGED events with
 * resource type `training_sandbox` so admins can review training activity.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import * as service from '../services/training-sandbox.service.js';

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function trainingSandboxRoutes(server: FastifyInstance): Promise<void> {
  const auth = [requireAuth()];

  /**
   * GET /api/training/sandbox/status
   *
   * Returns the user's current sandbox state. Cheap to call — used by the
   * frontend to render the "TRAINING SANDBOX" banner.
   */
  server.get(
    '/training/sandbox/status',
    { preHandler: auth },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const status = await service.getTrainingSandboxStatus(user.id);
      return status;
    },
  );

  /**
   * POST /api/training/sandbox/enable
   *
   * Flip training mode on and seed synthetic claims (idempotent).
   * Returns counts of newly created records.
   */
  server.post(
    '/training/sandbox/enable',
    { preHandler: auth },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const result = await service.enableTrainingMode(user.id, user.organizationId);

      // Mirror flag on the live session so subsequent requests see it without
      // a re-login. (Persisted via prisma in the service call above.)
      user.trainingModeEnabled = true;

      await logAuditEvent({
        userId: user.id,
        eventType: 'SYSTEM_CONFIG_CHANGED',
        eventData: { action: 'training_sandbox_enable', ...result },
        request,
      });

      return { success: true, ...result };
    },
  );

  /**
   * POST /api/training/sandbox/disable
   *
   * Flip training mode off. Synthetic claims are preserved so the user can
   * re-enable later — use POST /reset to also delete them.
   */
  server.post(
    '/training/sandbox/disable',
    { preHandler: auth },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      await service.disableTrainingMode(user.id);
      user.trainingModeEnabled = false;

      await logAuditEvent({
        userId: user.id,
        eventType: 'SYSTEM_CONFIG_CHANGED',
        eventData: { action: 'training_sandbox_disable' },
        request,
      });

      return { success: true };
    },
  );

  /**
   * POST /api/training/sandbox/reset
   *
   * Wipe the user's synthetic claims and re-seed from the catalog. Does NOT
   * change the trainingModeEnabled flag.
   */
  server.post(
    '/training/sandbox/reset',
    { preHandler: auth },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const result = await service.resetSandbox(user.id, user.organizationId);

      await logAuditEvent({
        userId: user.id,
        eventType: 'SYSTEM_CONFIG_CHANGED',
        eventData: { action: 'training_sandbox_reset', ...result },
        request,
      });

      return { success: true, ...result };
    },
  );
}
