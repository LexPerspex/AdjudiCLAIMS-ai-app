/**
 * Chat routes for examiner AI chat and counsel referral.
 *
 * All routes require authentication and claim access authorization.
 * Chat sessions are scoped to specific claims and users.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, UserRole } from '../middleware/rbac.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import { logAuditEvent } from '../middleware/audit.js';
import { processExaminerChat } from '../services/examiner-chat.service.js';
import { generateCounselReferral } from '../services/counsel-referral.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ChatMessageBodySchema = z.object({
  message: z.string().min(1, 'Message must not be empty').max(10000, 'Message too long'),
  sessionId: z.string().optional(),
});

const CounselReferralBodySchema = z.object({
  legalIssue: z.string().min(1, 'Legal issue description is required').max(5000, 'Description too long'),
});

const PaginationQuerySchema = z.object({
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

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function chatRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/claims/:claimId/chat
   *
   * Send a message to the examiner AI chat for a specific claim.
   * Processes through the 3-stage UPL pipeline (classify -> generate -> validate).
   */
  server.post<{ Params: { claimId: string } }>(
    '/claims/:claimId/chat',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const parsed = ChatMessageBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const { message, sessionId } = parsed.data;

      // Audit log the incoming message
      void logAuditEvent({
        userId: user.id,
        claimId,
        eventType: 'CHAT_MESSAGE_SENT',
        eventData: { messageLength: message.length, sessionId: sessionId ?? null },
        request,
      });

      const response = await processExaminerChat({
        claimId,
        sessionId,
        message,
        userId: user.id,
        orgId: user.organizationId,
        request,
      });

      return {
        sessionId: response.sessionId,
        messageId: response.messageId,
        content: response.content,
        zone: response.classification.zone,
        wasBlocked: response.wasBlocked,
        disclaimer: response.disclaimer.disclaimer,
        citations: response.citations.map((c) => ({
          documentId: c.documentId,
          documentName: c.documentName,
          snippet: c.content.substring(0, 200),
        })),
        // G5 Trust UX (AJC-14): confidence badge, entity panel, source provenance
        graphTrust: {
          overallConfidence: response.graphTrust.overallConfidence,
          graphContextUsed: response.graphTrust.graphContextUsed,
          entities: response.graphTrust.entities.map((e) => ({
            id: e.id,
            name: e.name,
            nodeType: e.nodeType,
            confidence: e.confidence,
            confidenceBadge: e.confidenceBadge,
            aliases: e.aliases ?? [],
            sourceCount: e.sourceCount,
          })),
          provenance: response.graphTrust.provenance.map((p) => ({
            documentName: p.documentName,
            documentType: p.documentType,
            confidence: p.confidence,
            extractedAt: p.extractedAt,
          })),
        },
      };
    },
  );

  /**
   * GET /api/claims/:claimId/chat/sessions
   *
   * List chat sessions for a claim. Role-scoped:
   * - CLAIMS_EXAMINER: only their sessions
   * - CLAIMS_SUPERVISOR / CLAIMS_ADMIN: all sessions for the claim
   */
  server.get<{ Params: { claimId: string } }>(
    '/claims/:claimId/chat/sessions',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      // Build where clause based on role
      const where: Record<string, unknown> = { claimId };
      if (user.role === UserRole.CLAIMS_EXAMINER) {
        where['userId'] = user.id;
      }

      const sessions = await prisma.chatSession.findMany({
        where,
        select: {
          id: true,
          claimId: true,
          userId: true,
          createdAt: true,
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          claimId: s.claimId,
          userId: s.userId,
          createdAt: s.createdAt,
          messageCount: s._count.messages,
        })),
        total: sessions.length,
      };
    },
  );

  /**
   * GET /api/chat/sessions/:sessionId/messages
   *
   * Get messages for a chat session with pagination.
   * Verifies the user has access to the session's claim.
   */
  server.get<{ Params: { sessionId: string } }>(
    '/chat/sessions/:sessionId/messages',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { sessionId } = request.params;

      // Look up session
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { id: true, claimId: true, userId: true },
      });

      if (!session) return reply.code(404).send({ error: 'Session not found' });

      // Verify claim access
      const { authorized } = await verifyClaimAccess(
        session.claimId,
        user.id,
        user.role,
        user.organizationId,
      );
      if (!authorized) return reply.code(404).send({ error: 'Session not found' });

      // Examiner can only see their own sessions
      if (user.role === UserRole.CLAIMS_EXAMINER && session.userId !== user.id) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const queryParsed = PaginationQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: queryParsed.error.issues });
      }

      const { take, skip } = queryParsed.data;

      const [messages, total] = await Promise.all([
        prisma.chatMessage.findMany({
          where: { sessionId },
          select: {
            id: true,
            role: true,
            content: true,
            uplZone: true,
            wasBlocked: true,
            disclaimerApplied: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
          take,
          skip,
        }),
        prisma.chatMessage.count({ where: { sessionId } }),
      ]);

      return { messages, total, take, skip };
    },
  );

  /**
   * POST /api/claims/:claimId/counsel-referral
   *
   * Generate a factual claim summary for defense counsel referral.
   * Triggered when an examiner hits a RED zone and wants to refer
   * the legal issue to their assigned attorney.
   */
  server.post<{ Params: { claimId: string } }>(
    '/claims/:claimId/counsel-referral',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const parsed = CounselReferralBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const { legalIssue } = parsed.data;

      const result = await generateCounselReferral({
        claimId,
        userId: user.id,
        legalIssue,
        request,
      });

      return {
        summary: result.summary,
        sections: result.sections,
        wasBlocked: result.wasBlocked,
      };
    },
  );
}
