/**
 * Audit trail query endpoints.
 *
 * Provides claim-level and user-level audit trail views, a scoped UPL
 * compliance event feed, and an admin-only export endpoint (JSON or CSV).
 *
 * Role requirements:
 * - GET /audit/claim/:claimId  — CLAIMS_EXAMINER+ (org membership verified)
 * - GET /audit/user/:userId    — CLAIMS_SUPERVISOR+ (same-org restriction)
 * - GET /audit/upl             — CLAIMS_SUPERVISOR+
 * - GET /audit/export          — CLAIMS_ADMIN only
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole, UserRole } from '../middleware/rbac.js';
import * as auditQuery from '../services/audit-query.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';
  const firstRecord = records[0];
  if (!firstRecord) return '';
  const headers = Object.keys(firstRecord);
  const rows = records.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const DateRangePaginationSchema = z.object({
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
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const ExportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function auditRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/audit/claim/:claimId
   *
   * Returns the audit trail for a specific claim. Accessible to any
   * authenticated user — the audit-query service is responsible for
   * ensuring the user's org has access to the claim.
   */
  server.get<{ Params: { claimId: string } }>(
    '/audit/claim/:claimId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;

      const queryParsed = DateRangePaginationSchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { take, skip, startDate, endDate } = queryParsed.data;

      const result = await auditQuery.getClaimAuditTrail(claimId, {
        take,
        skip,
        startDate: parseOptionalDate(startDate),
        endDate: parseOptionalDate(endDate),
      });

      return {
        events: result.items,
        total: result.total,
        take: result.take,
        skip: result.skip,
      };
    },
  );

  /**
   * GET /api/audit/user/:userId
   *
   * Returns the activity audit trail for a specific user. Restricted to
   * CLAIMS_SUPERVISOR and CLAIMS_ADMIN. Only users within the same org
   * may be queried — enforcement is performed by the audit-query service
   * via the user→organization join.
   */
  server.get<{ Params: { userId: string } }>(
    '/audit/user/:userId',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { userId } = request.params;

      const queryParsed = DateRangePaginationSchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { take, skip, startDate, endDate } = queryParsed.data;

      const result = await auditQuery.getUserAuditTrail(userId, {
        take,
        skip,
        startDate: parseOptionalDate(startDate),
        endDate: parseOptionalDate(endDate),
      });

      return {
        events: result.items,
        total: result.total,
        take: result.take,
        skip: result.skip,
      };
    },
  );

  /**
   * GET /api/audit/upl
   *
   * Returns UPL compliance events scoped to the authenticated user's org.
   * Restricted to CLAIMS_SUPERVISOR and CLAIMS_ADMIN.
   */
  server.get(
    '/audit/upl',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_SUPERVISOR, UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const queryParsed = DateRangePaginationSchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { take, skip, startDate, endDate } = queryParsed.data;

      const result = await auditQuery.getUplEvents(user.organizationId, {
        take,
        skip,
        startDate: parseOptionalDate(startDate),
        endDate: parseOptionalDate(endDate),
      });

      return {
        events: result.items,
        total: result.total,
        take: result.take,
        skip: result.skip,
      };
    },
  );

  /**
   * GET /api/audit/export
   *
   * Exports audit events for the authenticated user's org as JSON or CSV.
   * Restricted to CLAIMS_ADMIN only.
   */
  server.get(
    '/audit/export',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const queryParsed = ExportQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { startDate, endDate, format } = queryParsed.data;

      const records = await auditQuery.exportAuditEvents(user.organizationId, {
        startDate: parseOptionalDate(startDate),
        endDate: parseOptionalDate(endDate),
        format,
      });

      if (format === 'csv') {
        void reply.header('Content-Type', 'text/csv');
        void reply.header('Content-Disposition', 'attachment; filename="audit-export.csv"');
        return reply.send(
          jsonToCsv(records as unknown as Record<string, unknown>[]),
        );
      }

      return { records };
    },
  );
}
