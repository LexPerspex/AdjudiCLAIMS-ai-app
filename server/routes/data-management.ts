/**
 * Data management routes — GDPR/CCPA-style user data rights.
 *
 * DELETE /api/users/:id/data — Right to deletion (CLAIMS_ADMIN only)
 * GET    /api/users/:id/data-export — Data Subject Access Request export
 *                                     (user themselves OR CLAIMS_ADMIN)
 *
 * Deletion semantics:
 * - Soft-delete only: sets deletedAt + deletedBy on the user, their claims,
 *   and their documents. Data is NOT purged immediately.
 * - PII anonymization: name → "REDACTED", email → "deleted-{id}@redacted.local"
 * - Audit trail is NEVER deleted (immutable by law).
 *
 * Export semantics:
 * - Returns JSON snapshot of user's data footprint.
 * - Excludes passwordHash and mfaSecret.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole, UserRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UserIdParamsSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function dataManagementRoutes(server: FastifyInstance): Promise<void> {
  /**
   * DELETE /api/users/:id/data
   *
   * Right to deletion. Requires CLAIMS_ADMIN role.
   *
   * Soft-deletes the user, all their assigned claims, and all documents
   * on those claims. Anonymizes PII fields on the User record.
   * Audit events are preserved (immutable append-only log).
   */
  server.delete(
    '/users/:id/data',
    { preHandler: [requireAuth(), requireRole(UserRole.CLAIMS_ADMIN)] },
    async (request, reply) => {
      const admin = request.session.user;
      if (!admin) return reply.code(401).send({ error: 'Authentication required' });

      const paramsParsed = UserIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.code(400).send({
          error: 'Invalid parameters',
          details: paramsParsed.error.issues,
        });
      }

      const { id: targetUserId } = paramsParsed.data;

      // Verify target user exists and is in the admin's organization
      const targetUser = await prisma.user.findFirst({
        where: {
          id: targetUserId,
          organizationId: admin.organizationId,
          deletedAt: null,
        },
        select: { id: true, email: true },
      });

      if (!targetUser) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const now = new Date();
      const anonymizedEmail = `deleted-${targetUserId}@redacted.local`;

      // Log that deletion was requested (before performing it)
      await logAuditEvent({
        userId: admin.id,
        eventType: 'DATA_DELETION_REQUESTED',
        eventData: {
          targetUserId,
          requestedBy: admin.id,
        },
        request,
      });

      // --- Soft-delete claims assigned to this user ---
      const affectedClaims = await prisma.claim.findMany({
        where: {
          assignedExaminerId: targetUserId,
          deletedAt: null,
        },
        select: { id: true },
      });
      const claimIds = affectedClaims.map((c) => c.id);

      let deletedClaimsCount = 0;
      let deletedDocumentsCount = 0;

      if (claimIds.length > 0) {
        // Soft-delete documents on those claims
        const docsResult = await prisma.document.updateMany({
          where: {
            claimId: { in: claimIds },
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            deletedBy: admin.id,
          },
        });
        deletedDocumentsCount = docsResult.count;

        // Soft-delete the claims
        const claimsResult = await prisma.claim.updateMany({
          where: {
            id: { in: claimIds },
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            deletedBy: admin.id,
          },
        });
        deletedClaimsCount = claimsResult.count;
      }

      // --- Soft-delete and anonymize the user ---
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          deletedAt: now,
          deletedBy: admin.id,
          name: 'REDACTED',
          email: anonymizedEmail,
        },
      });

      // Log completion
      await logAuditEvent({
        userId: admin.id,
        eventType: 'DATA_DELETION_COMPLETED',
        eventData: {
          targetUserId,
          deletedBy: admin.id,
          recordsAffected: {
            claims: deletedClaimsCount,
            documents: deletedDocumentsCount,
          },
        },
        request,
      });

      return reply.code(200).send({
        ok: true,
        deletedAt: now.toISOString(),
        recordsAffected: {
          claims: deletedClaimsCount,
          documents: deletedDocumentsCount,
        },
      });
    },
  );

  /**
   * GET /api/users/:id/data-export
   *
   * Data Subject Access Request (DSAR) export.
   * Accessible by the user themselves or by a CLAIMS_ADMIN in the same org.
   *
   * Returns a JSON snapshot of the user's complete data footprint.
   * Excludes: passwordHash, mfaSecret.
   */
  server.get(
    '/users/:id/data-export',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const requestingUser = request.session.user;
      if (!requestingUser) return reply.code(401).send({ error: 'Authentication required' });

      const paramsParsed = UserIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.code(400).send({
          error: 'Invalid parameters',
          details: paramsParsed.error.issues,
        });
      }

      const { id: targetUserId } = paramsParsed.data;

      // Authorization: must be the user themselves or a CLAIMS_ADMIN in same org
      const isSelf = requestingUser.id === targetUserId;
      const isAdmin = requestingUser.role === UserRole.CLAIMS_ADMIN;

      if (!isSelf && !isAdmin) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      // Fetch the target user (must be in same org as requester)
      const targetUser = await prisma.user.findFirst({
        where: {
          id: targetUserId,
          organizationId: requestingUser.organizationId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          isActive: true,
          emailVerified: true,
          mfaEnabled: true,
          failedLoginAttempts: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          // Explicitly excluded: passwordHash, mfaSecret
        },
      });

      if (!targetUser) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // Collect claims assigned to this user
      const claims = await prisma.claim.findMany({
        where: { assignedExaminerId: targetUserId },
        select: {
          id: true,
          claimNumber: true,
          claimantName: true,
          dateOfInjury: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      // Collect documents uploaded by this user's claims
      // (Documents belong to claims, not users, so we collect by claim)
      const claimIds = claims.map((c) => c.id);
      const documents = claimIds.length > 0
        ? await prisma.document.findMany({
            where: { claimId: { in: claimIds } },
            select: {
              id: true,
              claimId: true,
              fileName: true,
              documentType: true,
              ocrStatus: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
            },
          })
        : [];

      // Collect chat sessions
      const chatSessions = await prisma.chatSession.findMany({
        where: { userId: targetUserId },
        select: {
          id: true,
          claimId: true,
          createdAt: true,
          messages: {
            select: {
              id: true,
              role: true,
              uplZone: true,
              wasBlocked: true,
              createdAt: true,
              // content excluded — may contain PHI
            },
          },
        },
      });

      // Collect audit events
      const auditEvents = await prisma.auditEvent.findMany({
        where: { userId: targetUserId },
        select: {
          id: true,
          eventType: true,
          claimId: true,
          uplZone: true,
          ipAddress: true,
          createdAt: true,
          // eventData excluded — may contain operational detail
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Cap for export size safety
      });

      // Collect education profile
      const educationProfile = await prisma.educationProfile.findUnique({
        where: { userId: targetUserId },
        select: {
          id: true,
          isTrainingComplete: true,
          learningModeExpiry: true,
          lastRecertificationDate: true,
          createdAt: true,
          updatedAt: true,
          // Exclude dismissedTerms, trainingModulesCompleted etc. to keep export lean
          // Include summary counts instead
          dismissedTerms: true,
          trainingModulesCompleted: true,
        },
      });

      // Log the export request
      await logAuditEvent({
        userId: requestingUser.id,
        eventType: 'EXPORT_DATA_REQUESTED',
        eventData: {
          targetUserId,
          requestedBy: requestingUser.id,
          isSelfRequest: isSelf,
        },
        request,
      });

      return reply.code(200).send({
        exportedAt: new Date().toISOString(),
        subject: targetUser,
        claims,
        documents,
        chatSessions,
        auditEvents,
        educationProfile,
      });
    },
  );
}
