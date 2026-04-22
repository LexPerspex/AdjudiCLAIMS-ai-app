/**
 * Compliance dashboard endpoints.
 *
 * Provides role-scoped compliance metric views:
 * - Personal metrics for the authenticated examiner
 * - Team metrics for supervisors and admins
 * - Full org report with DOI audit readiness for admins
 * - UPL monitoring dashboard for supervisors and admins
 *
 * Role requirements:
 * - GET /compliance/examiner — any authenticated role (self-scoped)
 * - GET /compliance/team     — CLAIMS_SUPERVISOR+
 * - GET /compliance/admin    — CLAIMS_ADMIN only
 * - GET /compliance/upl      — CLAIMS_SUPERVISOR+
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole, UserRole } from '../middleware/rbac.js';
import {
  getExaminerComplianceMetrics,
  getSupervisorTeamMetrics,
  getAdminComplianceReport,
  getUplMonitoringMetrics,
  getRecentRedBlocks,
  getUplAlertConfig,
  setUplAlertConfig,
} from '../services/compliance-dashboard.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UplQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  period: z.enum(['day', 'week', 'month']).optional().default('week'),
});

const UplBlocksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

const UplAlertConfigBodySchema = z.object({
  redRateThreshold: z.number().min(0).max(1).optional(),
  blockCountThreshold: z.number().int().min(0).optional(),
  alertsEnabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function complianceRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/compliance/examiner
   *
   * Returns personal compliance metrics for the authenticated user.
   * Any authenticated role may access their own metrics.
   */
  server.get(
    '/compliance/examiner',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const metrics = await getExaminerComplianceMetrics(user.id);

      return metrics;
    },
  );

  /**
   * GET /api/compliance/team
   *
   * Returns org-wide team compliance metrics.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.get(
    '/compliance/team',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const metrics = await getSupervisorTeamMetrics(user.organizationId);

      return metrics;
    },
  );

  /**
   * GET /api/compliance/admin
   *
   * Returns the full org compliance report including DOI audit readiness
   * score. Restricted to CLAIMS_ADMIN only.
   */
  server.get(
    '/compliance/admin',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const report = await getAdminComplianceReport(user.organizationId);

      return report;
    },
  );

  /**
   * GET /api/compliance/upl
   *
   * Returns the UPL monitoring dashboard scoped to the authenticated
   * user's org. Supports date range and time period filtering.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.get(
    '/compliance/upl',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const queryParsed = UplQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { startDate, endDate } = queryParsed.data;

      const dashboard = await getUplMonitoringMetrics(user.organizationId, {
        startDate: parseOptionalDate(startDate),
        endDate: parseOptionalDate(endDate),
      });

      return dashboard;
    },
  );

  /**
   * GET /api/compliance/upl/blocks
   *
   * Returns recent RED-zone block events for the org.
   * Metadata only — NEVER includes query content.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.get(
    '/compliance/upl/blocks',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const queryParsed = UplBlocksQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const blocks = await getRecentRedBlocks(user.organizationId, queryParsed.data.limit);
      return { blocks };
    },
  );

  /**
   * GET /api/compliance/upl/alert-config
   *
   * Returns the current UPL alert configuration for the org.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.get(
    '/compliance/upl/alert-config',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      return getUplAlertConfig(user.organizationId);
    },
  );

  /**
   * PUT /api/compliance/upl/alert-config
   *
   * Updates the UPL alert configuration for the org.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.put(
    '/compliance/upl/alert-config',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const bodyParsed = UplAlertConfigBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: bodyParsed.error.issues,
        });
      }

      const updated = setUplAlertConfig(user.organizationId, bodyParsed.data);
      return updated;
    },
  );
}
