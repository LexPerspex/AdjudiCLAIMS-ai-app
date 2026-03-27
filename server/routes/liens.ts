/**
 * Lien management + OMFS comparison routes.
 *
 * All routes require authentication. Claim-scoped routes verify claim access.
 * GREEN zone feature — factual lien tracking and fee schedule comparison.
 *
 * Endpoints:
 * - POST   /api/claims/:claimId/liens          — Create lien
 * - GET    /api/claims/:claimId/liens           — List liens for claim
 * - GET    /api/liens/:lienId                   — Get lien with line items
 * - PATCH  /api/liens/:lienId                   — Update status/resolution
 * - POST   /api/liens/:lienId/line-items        — Add line items
 * - POST   /api/liens/:lienId/compare-omfs      — Run OMFS comparison
 * - GET    /api/liens/:lienId/omfs-report       — Get OMFS comparison results
 * - GET    /api/claims/:claimId/lien-exposure    — Total lien exposure
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import {
  createLien,
  getLien,
  getClaimLiens,
  updateLienStatus,
  addLineItems,
  runOmfsComparison,
  checkFilingCompliance,
  calculateLienExposure,
  getLienSummary,
} from '../services/lien-management.service.js';
import { lookupOmfsRate } from '../services/omfs-comparison.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateLienBodySchema = z.object({
  lienClaimant: z.string().min(1, 'lienClaimant is required'),
  lienType: z.enum([
    'MEDICAL_PROVIDER',
    'ATTORNEY_FEE',
    'EDD',
    'EXPENSE',
    'CHILD_SUPPORT',
    'OTHER',
  ]),
  totalAmountClaimed: z.number().positive('totalAmountClaimed must be positive'),
  filingDate: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'filingDate must be a valid date string',
  ),
  filingFeeStatus: z.enum(['PAID', 'NOT_PAID', 'EXEMPT', 'UNKNOWN']).optional(),
  wcabCaseNumber: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateLienBodySchema = z.object({
  status: z.enum([
    'RECEIVED',
    'UNDER_REVIEW',
    'OMFS_COMPARED',
    'NEGOTIATING',
    'PAID_IN_FULL',
    'PAID_REDUCED',
    'DISPUTED',
    'WITHDRAWN',
    'WCAB_HEARING',
    'RESOLVED_BY_ORDER',
  ]),
  resolvedAmount: z.number().nonnegative('resolvedAmount must be non-negative').optional(),
});

const LineItemSchema = z.object({
  serviceDate: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'serviceDate must be a valid date string',
  ),
  cptCode: z.string().optional(),
  description: z.string().min(1, 'description is required'),
  amountClaimed: z.number().positive('amountClaimed must be positive'),
});

const AddLineItemsBodySchema = z.object({
  items: z.array(LineItemSchema).min(1, 'At least one line item is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function lienRoutes(server: FastifyInstance): Promise<void> {
  // =========================================================================
  // POST /api/claims/:claimId/liens — Create lien
  // =========================================================================
  server.post(
    '/claims/:claimId/liens',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = CreateLienBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const lien = await createLien(claimId, parsed.data);

      void logAuditEvent({
        userId: user.id,
        claimId,
        eventType: 'LIEN_CREATED',
        eventData: {
          lienId: lien.id,
          lienType: lien.lienType,
          totalAmountClaimed: lien.totalAmountClaimed,
        },
        request,
      });

      return reply.code(201).send(lien);
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/liens — List liens for claim
  // =========================================================================
  server.get(
    '/claims/:claimId/liens',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const liens = await getClaimLiens(claimId);
      return liens;
    },
  );

  // =========================================================================
  // GET /api/liens/:lienId — Get lien with line items
  // =========================================================================
  server.get(
    '/liens/:lienId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      const lien = await getLien(lienId);
      if (!lien) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      // Verify claim access
      const access = await verifyClaimAccess(lien.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      return lien;
    },
  );

  // =========================================================================
  // PATCH /api/liens/:lienId — Update status/resolution
  // =========================================================================
  server.patch(
    '/liens/:lienId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      // Get lien first to verify claim access
      const existing = await getLien(lienId);
      if (!existing) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      const access = await verifyClaimAccess(existing.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = UpdateLienBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      try {
        const updated = await updateLienStatus(lienId, parsed.data.status, parsed.data.resolvedAmount);

        const isResolved = ['PAID_IN_FULL', 'PAID_REDUCED', 'WITHDRAWN', 'RESOLVED_BY_ORDER'].includes(
          parsed.data.status,
        );

        void logAuditEvent({
          userId: user.id,
          claimId: existing.claimId,
          eventType: isResolved ? 'LIEN_RESOLVED' : 'LIEN_STATUS_CHANGED',
          eventData: {
            lienId,
            previousStatus: existing.status,
            newStatus: parsed.data.status,
            resolvedAmount: parsed.data.resolvedAmount,
          },
          request,
        });

        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update lien status';
        return reply.code(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // POST /api/liens/:lienId/line-items — Add line items
  // =========================================================================
  server.post(
    '/liens/:lienId/line-items',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      // Verify lien exists and user has claim access
      const existing = await getLien(lienId);
      if (!existing) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      const access = await verifyClaimAccess(existing.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = AddLineItemsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      try {
        const items = await addLineItems(lienId, parsed.data.items);
        return await reply.code(201).send(items);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add line items';
        return await reply.code(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // POST /api/liens/:lienId/compare-omfs — Run OMFS comparison
  // =========================================================================
  server.post(
    '/liens/:lienId/compare-omfs',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      const existing = await getLien(lienId);
      if (!existing) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      const access = await verifyClaimAccess(existing.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      try {
        const result = await runOmfsComparison(lienId);

        void logAuditEvent({
          userId: user.id,
          claimId: existing.claimId,
          eventType: 'LIEN_OMFS_COMPARED',
          eventData: {
            lienId,
            totalClaimed: result.totalClaimed,
            totalOmfsAllowed: result.totalOmfsAllowed,
            totalDiscrepancy: result.totalDiscrepancy,
            discrepancyPercent: result.discrepancyPercent,
          },
          request,
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run OMFS comparison';
        return reply.code(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // GET /api/liens/:lienId/omfs-report — Get OMFS comparison results
  // =========================================================================
  server.get(
    '/liens/:lienId/omfs-report',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      const lien = await getLien(lienId);
      if (!lien) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      const access = await verifyClaimAccess(lien.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      // If no OMFS comparison has been run, return summary from stored data
      if (lien.totalOmfsAllowed === null) {
        return reply.code(404).send({
          error: 'OMFS comparison has not been run for this lien. Use POST /api/liens/:lienId/compare-omfs first.',
        });
      }

      // Build report from stored line item data + lookup descriptions
      const lineItems = lien.lineItems.map((li) => {
          const lookup = li.cptCode ? lookupOmfsRate(li.cptCode) : null;
          return {
            cptCode: li.cptCode ?? 'N/A',
            description: li.description,
            amountClaimed: li.amountClaimed,
            omfsAllowed: li.omfsRate,
            isOvercharge: li.isOvercharge,
            overchargeAmount: li.overchargeAmount ?? 0,
            feeScheduleSection: lookup?.feeScheduleSection ?? 'N/A',
          };
        });

      return {
        lienId: lien.id,
        lienClaimant: lien.lienClaimant,
        lineItems,
        totalClaimed: lien.totalAmountClaimed,
        totalOmfsAllowed: lien.totalOmfsAllowed,
        totalDiscrepancy: lien.discrepancyAmount,
        disclaimer:
          'OMFS rate comparison is provided for factual reference only. Fee schedule amounts are based on ' +
          'the Official Medical Fee Schedule (8 CCR 9789.10 et seq.). Examiners should verify rates against ' +
          'the current OMFS edition. Disputes over medical billing amounts may require consultation with ' +
          'defense counsel.',
      };
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/lien-exposure — Total lien exposure
  // =========================================================================
  server.get(
    '/claims/:claimId/lien-exposure',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const exposure = await calculateLienExposure(claimId);
      const summary = await getLienSummary(claimId);
      const compliance = { exposure, summary };

      return compliance;
    },
  );

  // =========================================================================
  // GET /api/liens/:lienId/compliance — Filing compliance check
  // =========================================================================
  server.get(
    '/liens/:lienId/compliance',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { lienId } = request.params as { lienId: string };

      const lien = await getLien(lienId);
      if (!lien) {
        return reply.code(404).send({ error: 'Lien not found' });
      }

      const access = await verifyClaimAccess(lien.claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const result = await checkFilingCompliance(lienId);
      return result;
    },
  );
}
