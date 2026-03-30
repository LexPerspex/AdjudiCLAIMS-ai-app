/**
 * Sandbox routes — training environment data management.
 *
 * Provides endpoints for seeding and clearing synthetic training claims
 * in sandbox environments. All routes require CLAIMS_ADMIN role.
 *
 * Routes:
 *   POST /api/sandbox/seed    — Seed training data for the org (idempotent)
 *   POST /api/sandbox/clear   — Remove all TRAIN-* claims for the org
 *   GET  /api/sandbox/status  — Returns { isSandboxMode, claimCount }
 *
 * Security: CLAIMS_ADMIN only. No training gate required (admin function).
 *
 * Note: These routes are always registered but the seed/clear operations
 * check SANDBOX_MODE at the service layer and return a 403 when not in
 * sandbox mode, preventing accidental use in production.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole, UserRole } from '../middleware/rbac.js';
import * as sandboxService from '../services/sandbox.service.js';

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function sandboxRoutes(server: FastifyInstance): Promise<void> {
  const adminHandler = [requireAuth(), requireRole(UserRole.CLAIMS_ADMIN)];

  /**
   * GET /api/sandbox/status
   *
   * Returns whether sandbox mode is enabled and how many sandbox claims
   * exist for the authenticated user's organization.
   *
   * Accessible to CLAIMS_ADMIN only. Safe to call in any environment.
   */
  server.get(
    '/sandbox/status',
    { preHandler: adminHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const status = await sandboxService.getSandboxStatus(user.organizationId);
      return status;
    },
  );

  /**
   * POST /api/sandbox/seed
   *
   * Seeds three synthetic training claims (TRAIN-001, TRAIN-002, TRAIN-003)
   * for the authenticated admin's organization. Idempotent — existing claims
   * are skipped.
   *
   * Returns: { claims: number; documents: number } — counts of created records.
   *
   * Requires SANDBOX_MODE=true. Returns 403 otherwise.
   */
  server.post(
    '/sandbox/seed',
    { preHandler: adminHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      if (!sandboxService.isSandboxMode()) {
        return reply.code(403).send({
          error: 'Sandbox operations are only allowed when SANDBOX_MODE=true',
        });
      }

      const result = await sandboxService.seedSandboxData(user.organizationId, user.id);
      return { success: true, ...result };
    },
  );

  /**
   * POST /api/sandbox/clear
   *
   * Removes all TRAIN-* claims and their associated records for the
   * authenticated admin's organization.
   *
   * Requires SANDBOX_MODE=true. Returns 403 otherwise.
   */
  server.post(
    '/sandbox/clear',
    { preHandler: adminHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      if (!sandboxService.isSandboxMode()) {
        return reply.code(403).send({
          error: 'Sandbox operations are only allowed when SANDBOX_MODE=true',
        });
      }

      await sandboxService.clearSandboxData(user.organizationId);
      return { success: true };
    },
  );
}
