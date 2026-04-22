/**
 * Document management routes.
 *
 * Handles document upload, listing, detail, and deletion for claims.
 * All routes require authentication and claim access authorization.
 * Uploaded documents are queued for the processing pipeline (OCR → classify → extract → embed).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { requireAuth, UserRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import { storageService } from '../services/storage.service.js';
import { processDocumentPipeline } from '../services/document-pipeline.service.js';
import {
  getDocumentAccessFilter,
  isDocumentAccessible,
} from '../services/document-access.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListDocumentsQuerySchema = z.object({
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

export async function documentRoutes(server: FastifyInstance): Promise<void> {
  // Register multipart support for this plugin scope
  await server.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  /**
   * POST /api/claims/:claimId/documents
   *
   * Upload a document to a claim. Accepts multipart/form-data with a single file field.
   * Creates a Document record with PENDING OCR status and kicks off the processing pipeline.
   */
  server.post<{ Params: { claimId: string } }>(
    '/claims/:claimId/documents',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return reply.code(400).send({
          error: 'Unsupported file type',
          allowed: [...ALLOWED_MIME_TYPES],
        });
      }

      const buffer = await file.toBuffer();

      if (buffer.length > MAX_FILE_SIZE) {
        return reply.code(400).send({ error: `File exceeds maximum size of ${String(MAX_FILE_SIZE / 1024 / 1024)}MB` });
      }

      const docId = crypto.randomUUID();

      // Store file
      const fileUrl = await storageService.upload(
        user.organizationId,
        claimId,
        docId,
        file.filename,
        buffer,
        file.mimetype,
      );

      // Create Document record
      const document = await prisma.document.create({
        data: {
          id: docId,
          claimId,
          fileName: file.filename,
          fileUrl,
          fileSize: buffer.length,
          mimeType: file.mimetype,
          ocrStatus: 'PENDING',
        },
        select: {
          id: true,
          claimId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          documentType: true,
          ocrStatus: true,
          createdAt: true,
        },
      });

      // Audit
      void logAuditEvent({
        userId: user.id,
        claimId,
        eventType: 'DOCUMENT_UPLOADED',
        eventData: { documentId: docId, fileName: file.filename, mimeType: file.mimetype },
        request,
      });

      // Kick off pipeline async — don't block the response
      processDocumentPipeline(docId).catch((err: unknown) => {
        request.log.error({ err, documentId: docId }, 'Document pipeline failed');
      });

      return reply.code(201).send(document);
    },
  );

  /**
   * GET /api/claims/:claimId/documents
   *
   * List all documents for a claim with pagination.
   */
  server.get<{ Params: { claimId: string } }>(
    '/claims/:claimId/documents',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const queryParsed = ListDocumentsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: queryParsed.error.issues });
      }

      const { take, skip } = queryParsed.data;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where: { claimId, ...getDocumentAccessFilter(user.role) },
          select: {
            id: true,
            claimId: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            documentType: true,
            documentSubtype: true,
            classificationConfidence: true,
            ocrStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        prisma.document.count({ where: { claimId, ...getDocumentAccessFilter(user.role) } }),
      ]);

      return { documents, total, take, skip };
    },
  );

  /**
   * GET /api/documents/:id
   *
   * Get a single document's details including extracted fields.
   */
  server.get<{ Params: { id: string } }>(
    '/documents/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          claimId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          documentType: true,
          documentSubtype: true,
          classificationConfidence: true,
          accessLevel: true,
          containsLegalAnalysis: true,
          containsWorkProduct: true,
          containsPrivileged: true,
          ocrStatus: true,
          extractedText: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          extractedFields: {
            select: {
              id: true,
              fieldName: true,
              fieldValue: true,
              confidence: true,
              sourcePage: true,
            },
          },
        },
      });

      // Treat soft-deleted documents as non-existent
      if (!document || document.deletedAt != null) return reply.code(404).send({ error: 'Document not found' });

      // Verify claim access
      const { authorized } = await verifyClaimAccess(
        document.claimId,
        user.id,
        user.role,
        user.organizationId,
      );
      if (!authorized) return reply.code(404).send({ error: 'Document not found' });

      // Enforce data boundary — examiner roles may not access attorney-only,
      // privileged, work product, or legal analysis documents.
      if (!isDocumentAccessible(document, user.role)) {
        return reply.code(403).send({ error: 'Access denied — document is restricted to authorized personnel' });
      }

      void logAuditEvent({
        userId: user.id,
        claimId: document.claimId,
        eventType: 'DOCUMENT_VIEWED',
        eventData: { documentId: document.id },
        request,
      });

      return document;
    },
  );

  /**
   * DELETE /api/documents/:id
   *
   * Delete a document and its associated storage file.
   * Only supervisors and admins can delete documents.
   */
  server.delete<{ Params: { id: string } }>(
    '/documents/:id',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      // Only supervisors and admins can delete
      if (user.role === UserRole.CLAIMS_EXAMINER) {
        return reply.code(403).send({ error: 'Insufficient permissions — supervisor or admin required' });
      }

      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
        select: { id: true, claimId: true, fileUrl: true, fileName: true },
      });

      if (!document) return reply.code(404).send({ error: 'Document not found' });

      // Verify org access
      const { authorized } = await verifyClaimAccess(
        document.claimId,
        user.id,
        user.role,
        user.organizationId,
      );
      if (!authorized) return reply.code(404).send({ error: 'Document not found' });

      // Delete storage file
      try {
        await storageService.delete(document.fileUrl);
      } catch (err) {
        request.log.error({ err, documentId: document.id }, 'Failed to delete storage file');
      }

      // Delete DB record (cascades to chunks and extracted fields)
      await prisma.document.delete({ where: { id: document.id } });

      void logAuditEvent({
        userId: user.id,
        claimId: document.claimId,
        eventType: 'DOCUMENT_DELETED',
        eventData: { documentId: document.id, action: 'deleted', fileName: document.fileName },
        request,
      });

      return reply.code(204).send();
    },
  );

  /**
   * GET /api/claims/:claimId/timeline
   *
   * Get the timeline of events for a claim, sorted by date.
   */
  server.get<{ Params: { claimId: string } }>(
    '/claims/:claimId/timeline',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId } = request.params;
      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const events = await prisma.timelineEvent.findMany({
        where: { claimId },
        select: {
          id: true,
          claimId: true,
          documentId: true,
          eventDate: true,
          eventType: true,
          description: true,
          source: true,
        },
        orderBy: { eventDate: 'asc' },
      });

      return { events, total: events.length };
    },
  );
}
