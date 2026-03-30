/**
 * Medical billing overview routes.
 *
 * All routes require authentication. All routes verify claim access.
 * GREEN zone — factual cost aggregation and payment tracking.
 * YELLOW zone — admitted vs. non-admitted breakdown (includes disclaimer).
 *
 * Endpoints:
 * - GET    /api/claims/:claimId/medical-overview
 * - GET    /api/claims/:claimId/medical-payments
 * - POST   /api/claims/:claimId/medical-payments
 * - GET    /api/claims/:claimId/provider-summary
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import {
  getMedicalBillingOverview,
  getMedicalPayments,
  recordMedicalPayment,
  getProviderSummary,
} from '../services/medical-billing-overview.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RecordMedicalPaymentBodySchema = z.object({
  bodyPartId: z.string().optional(),
  lienId: z.string().optional(),
  providerName: z.string().min(1, 'providerName is required'),
  paymentType: z.enum(['DIRECT_PAYMENT', 'LIEN_PAYMENT', 'PHARMACY', 'DME', 'DIAGNOSTICS']),
  amount: z.number().positive('amount must be positive'),
  paymentDate: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'paymentDate must be a valid date string',
  ),
  serviceDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'serviceDate must be a valid date string')
    .optional(),
  cptCode: z.string().optional(),
  description: z.string().min(1, 'description is required'),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
});

const GetMedicalPaymentsQuerySchema = z.object({
  bodyPartId: z.string().optional(),
  providerName: z.string().optional(),
  fromDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'fromDate must be a valid date string')
    .optional(),
  toDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'toDate must be a valid date string')
    .optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function medicalBillingRoutes(server: FastifyInstance): Promise<void> {
  // =========================================================================
  // GET /api/claims/:claimId/medical-overview — Full medical billing overview
  // =========================================================================
  server.get(
    '/claims/:claimId/medical-overview',
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
        const overview = await getMedicalBillingOverview(claimId);
        return overview;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to retrieve medical billing overview';
        return reply.code(500).send({ error: message });
      }
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/medical-payments — List medical payments
  // =========================================================================
  server.get(
    '/claims/:claimId/medical-payments',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const queryParsed = GetMedicalPaymentsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: queryParsed.error.issues });
      }

      const { bodyPartId, providerName, fromDate, toDate } = queryParsed.data;

      const payments = await getMedicalPayments(claimId, {
        bodyPartId,
        providerName,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
      });

      return payments;
    },
  );

  // =========================================================================
  // POST /api/claims/:claimId/medical-payments — Record medical payment
  // =========================================================================
  server.post(
    '/claims/:claimId/medical-payments',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = RecordMedicalPaymentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      try {
        const payment = await recordMedicalPayment({
          claimId,
          bodyPartId: parsed.data.bodyPartId,
          lienId: parsed.data.lienId,
          providerName: parsed.data.providerName,
          paymentType: parsed.data.paymentType,
          amount: parsed.data.amount,
          paymentDate: new Date(parsed.data.paymentDate),
          serviceDate: parsed.data.serviceDate ? new Date(parsed.data.serviceDate) : undefined,
          cptCode: parsed.data.cptCode,
          description: parsed.data.description,
          checkNumber: parsed.data.checkNumber,
          notes: parsed.data.notes,
        });

        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'MEDICAL_PAYMENT_RECORDED',
          eventData: {
            paymentId: payment.id,
            providerName: payment.providerName,
            paymentType: payment.paymentType,
            amount: Number(payment.amount),
            paymentDate: payment.paymentDate,
            bodyPartId: payment.bodyPartId,
            lienId: payment.lienId,
          },
          request,
        });

        return reply.code(201).send(payment);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record medical payment';
        return reply.code(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // GET /api/claims/:claimId/provider-summary — Per-provider cost summary
  // =========================================================================
  server.get(
    '/claims/:claimId/provider-summary',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const summary = await getProviderSummary(claimId);
      return summary;
    },
  );
}
