/**
 * Claims management routes.
 *
 * All routes require authentication. Claim visibility is role-scoped:
 * - CLAIMS_EXAMINER: sees only their assigned claims
 * - CLAIMS_SUPERVISOR: sees all claims in their organization
 * - CLAIMS_ADMIN: sees all claims in their organization
 *
 * Claim creation auto-generates regulatory deadlines and investigation
 * checklist items per California Workers' Compensation requirements.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, UserRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { generateDeadlines } from '../services/deadline-generator.js';
import { generateInvestigationItems } from '../services/investigation-generator.js';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListClaimsQuerySchema = z.object({
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
});

const UpdateClaimBodySchema = z.object({
  claimantName: z.string().min(1).optional(),
  dateOfInjury: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateOfInjury must be a valid date string',
  ).optional(),
  bodyParts: z.array(z.string().min(1)).min(1).optional(),
  employer: z.string().min(1).optional(),
  insurer: z.string().min(1).optional(),
  dateReceived: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateReceived must be a valid date string',
  ).optional(),
  dateAcknowledged: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateAcknowledged must be a valid date string',
  ).optional().nullable(),
  dateDetermined: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateDetermined must be a valid date string',
  ).optional().nullable(),
  status: z.enum(['OPEN', 'UNDER_INVESTIGATION', 'ACCEPTED', 'DENIED', 'CLOSED', 'REOPENED']).optional(),
  isLitigated: z.boolean().optional(),
  hasApplicantAttorney: z.boolean().optional(),
  isCumulativeTrauma: z.boolean().optional(),
  currentReserveIndemnity: z.number().min(0).optional(),
  currentReserveMedical: z.number().min(0).optional(),
  currentReserveLegal: z.number().min(0).optional(),
  currentReserveLien: z.number().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, 'At least one field must be provided');

const CreateClaimBodySchema = z.object({
  claimNumber: z.string().min(1, 'Claim number is required'),
  claimantName: z.string().min(1, 'Claimant name is required'),
  dateOfInjury: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateOfInjury must be a valid date string',
  ),
  bodyParts: z.array(z.string().min(1)).min(1, 'At least one body part is required'),
  employer: z.string().min(1, 'Employer is required'),
  insurer: z.string().min(1, 'Insurer is required'),
  dateReceived: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateReceived must be a valid date string',
  ),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function claimsRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/claims
   *
   * List claims visible to the authenticated user.
   * - CLAIMS_EXAMINER: only their assigned claims
   * - CLAIMS_SUPERVISOR / CLAIMS_ADMIN: all org claims
   *
   * Supports pagination via `take` and `skip` query parameters.
   */
  server.get(
    '/claims',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const queryParsed = ListClaimsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: queryParsed.error.issues,
        });
      }

      const { take, skip } = queryParsed.data;

      // Build where clause based on role
      const where: Record<string, unknown> = {
        organizationId: user.organizationId,
      };

      // Examiners see only their assigned claims
      if (user.role === UserRole.CLAIMS_EXAMINER) {
        where['assignedExaminerId'] = user.id;
      }

      const [claims, total] = await Promise.all([
        prisma.claim.findMany({
          where,
          select: {
            id: true,
            claimNumber: true,
            claimantName: true,
            dateOfInjury: true,
            bodyParts: true,
            employer: true,
            insurer: true,
            status: true,
            dateReceived: true,
            assignedExaminerId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        prisma.claim.count({ where }),
      ]);

      return { claims, total, take, skip };
    },
  );

  /**
   * GET /api/claims/:id
   *
   * Retrieve a single claim by ID with authorization check.
   * User must be the assigned examiner, or a supervisor/admin in the same org.
   */
  server.get<{ Params: { id: string } }>(
    '/claims/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { id } = request.params;

      const claim = await prisma.claim.findUnique({
        where: { id },
        select: {
          id: true,
          claimNumber: true,
          claimantName: true,
          dateOfInjury: true,
          bodyParts: true,
          employer: true,
          insurer: true,
          status: true,
          dateReceived: true,
          dateAcknowledged: true,
          dateDetermined: true,
          dateClosed: true,
          assignedExaminerId: true,
          organizationId: true,
          isLitigated: true,
          hasApplicantAttorney: true,
          isCumulativeTrauma: true,
          currentReserveIndemnity: true,
          currentReserveMedical: true,
          currentReserveLegal: true,
          currentReserveLien: true,
          totalPaidIndemnity: true,
          totalPaidMedical: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Treat soft-deleted claims as non-existent
      if (!claim || claim.deletedAt != null) {
        return reply.code(404).send({ error: 'Claim not found' });
      }

      // Authorization: user must belong to the same org
      if (claim.organizationId !== user.organizationId) {
        return reply.code(404).send({ error: 'Claim not found' });
      }

      // Examiners can only view claims assigned to them
      if (
        user.role === UserRole.CLAIMS_EXAMINER &&
        claim.assignedExaminerId !== user.id
      ) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      // Strip internal soft-delete field — not part of the public API contract
      const { deletedAt: _deletedAt, ...claimResponse } = claim;
      return claimResponse;
    },
  );

  /**
   * POST /api/claims
   *
   * Create a new claim. Validates input with Zod. Auto-assigns to the
   * creating examiner. Auto-generates investigation checklist and
   * regulatory deadlines.
   */
  server.post(
    '/claims',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = CreateClaimBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const dateOfInjury = new Date(data.dateOfInjury);
      const dateReceived = new Date(data.dateReceived);

      // Create claim and generate deadlines + investigation items atomically
      const claim = await prisma.$transaction(async (tx) => {
        const newClaim = await tx.claim.create({
          data: {
            claimNumber: data.claimNumber,
            claimantName: data.claimantName,
            dateOfInjury,
            bodyParts: data.bodyParts,
            employer: data.employer,
            insurer: data.insurer,
            dateReceived,
            organizationId: user.organizationId,
            assignedExaminerId: user.id,
          },
          select: {
            id: true,
            claimNumber: true,
            claimantName: true,
            dateOfInjury: true,
            bodyParts: true,
            employer: true,
            insurer: true,
            status: true,
            dateReceived: true,
            assignedExaminerId: true,
            organizationId: true,
            createdAt: true,
          },
        });

        // Generate deadlines and investigation items within the transaction
        await generateDeadlines(tx as unknown as PrismaClient, newClaim.id, dateReceived);
        await generateInvestigationItems(tx as unknown as PrismaClient, newClaim.id);

        return newClaim;
      });

      // Audit log — log claim ID only, never claimant PII
      void logAuditEvent({
        userId: user.id,
        claimId: claim.id,
        eventType: 'CLAIM_CREATED',
        eventData: { claimNumber: data.claimNumber },
        request,
      });

      return reply.code(201).send(claim);
    },
  );

  /**
   * PATCH /api/claims/:id
   *
   * Update an existing claim. All fields are optional but at least one
   * must be provided. Validates input with Zod.
   *
   * Authorization:
   *   - CLAIMS_EXAMINER: can only update claims assigned to them
   *   - CLAIMS_SUPERVISOR / CLAIMS_ADMIN: can update any org claim
   *
   * Side effects:
   *   - Status change → CLAIM_STATUS_CHANGED audit event
   *   - dateReceived change → warning logged (deadline engine will handle recalculation)
   */
  server.patch<{ Params: { id: string } }>(
    '/claims/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = UpdateClaimBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { id } = request.params;

      // Look up the existing claim for authorization
      const existing = await prisma.claim.findUnique({
        where: { id },
        select: {
          id: true,
          organizationId: true,
          assignedExaminerId: true,
          status: true,
          deletedAt: true,
        },
      });

      // Treat soft-deleted claims as non-existent
      if (!existing || existing.deletedAt != null) {
        return reply.code(404).send({ error: 'Claim not found' });
      }

      // Must be same org
      if (existing.organizationId !== user.organizationId) {
        return reply.code(404).send({ error: 'Claim not found' });
      }

      // Examiners can only update their assigned claims
      if (
        user.role === UserRole.CLAIMS_EXAMINER &&
        existing.assignedExaminerId !== user.id
      ) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const data = parsed.data;

      // Build the update payload — convert date strings to Date objects
      const updateData: Record<string, unknown> = {};

      if (data.claimantName !== undefined) updateData['claimantName'] = data.claimantName;
      if (data.bodyParts !== undefined) updateData['bodyParts'] = data.bodyParts;
      if (data.employer !== undefined) updateData['employer'] = data.employer;
      if (data.insurer !== undefined) updateData['insurer'] = data.insurer;
      if (data.status !== undefined) updateData['status'] = data.status;
      if (data.isLitigated !== undefined) updateData['isLitigated'] = data.isLitigated;
      if (data.hasApplicantAttorney !== undefined) updateData['hasApplicantAttorney'] = data.hasApplicantAttorney;
      if (data.isCumulativeTrauma !== undefined) updateData['isCumulativeTrauma'] = data.isCumulativeTrauma;
      if (data.currentReserveIndemnity !== undefined) updateData['currentReserveIndemnity'] = data.currentReserveIndemnity;
      if (data.currentReserveMedical !== undefined) updateData['currentReserveMedical'] = data.currentReserveMedical;
      if (data.currentReserveLegal !== undefined) updateData['currentReserveLegal'] = data.currentReserveLegal;
      if (data.currentReserveLien !== undefined) updateData['currentReserveLien'] = data.currentReserveLien;

      // Date fields — convert strings to Date objects
      if (data.dateOfInjury !== undefined) updateData['dateOfInjury'] = new Date(data.dateOfInjury);
      if (data.dateReceived !== undefined) {
        updateData['dateReceived'] = new Date(data.dateReceived);
        // Log warning — deadline engine will handle recalculation in a future phase
        request.log.warn(
          { claimId: id },
          'dateReceived changed — regulatory deadlines may need recalculation',
        );
      }
      if (data.dateAcknowledged !== undefined) {
        updateData['dateAcknowledged'] = data.dateAcknowledged !== null
          ? new Date(data.dateAcknowledged)
          : null;
      }
      if (data.dateDetermined !== undefined) {
        updateData['dateDetermined'] = data.dateDetermined !== null
          ? new Date(data.dateDetermined)
          : null;
      }

      const updated = await prisma.claim.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          claimNumber: true,
          claimantName: true,
          dateOfInjury: true,
          bodyParts: true,
          employer: true,
          insurer: true,
          status: true,
          dateReceived: true,
          dateAcknowledged: true,
          dateDetermined: true,
          dateClosed: true,
          assignedExaminerId: true,
          organizationId: true,
          isLitigated: true,
          hasApplicantAttorney: true,
          isCumulativeTrauma: true,
          currentReserveIndemnity: true,
          currentReserveMedical: true,
          currentReserveLegal: true,
          currentReserveLien: true,
          totalPaidIndemnity: true,
          totalPaidMedical: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Audit log status changes
      if (data.status !== undefined && data.status !== existing.status) {
        void logAuditEvent({
          userId: user.id,
          claimId: id,
          eventType: 'CLAIM_STATUS_CHANGED',
          eventData: {
            previousStatus: existing.status,
            newStatus: data.status,
          },
          request,
        });
      }

      return updated;
    },
  );
}
