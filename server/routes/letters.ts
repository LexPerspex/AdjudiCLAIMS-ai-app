/**
 * Letter generation routes.
 *
 * Provides endpoints for template-based letter generation — benefit payment
 * letters, employer notifications, and other factual correspondence.
 *
 * All templates are GREEN zone — factual content only, no legal reasoning.
 * Every generated letter is persisted and audit-logged.
 *
 * Routes:
 *   GET  /api/letters/templates              — List available templates
 *   GET  /api/letters/templates/:templateId   — Get template detail
 *   POST /api/claims/:claimId/letters/generate — Generate a letter
 *   GET  /api/claims/:claimId/letters         — List generated letters for a claim
 *   GET  /api/letters/:letterId               — Get a specific generated letter
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import {
  getTemplates,
  getTemplate,
  generateLetter,
  getClaimLetters,
  getLetter,
} from '../services/letter-template.service.js';
import {
  generateDraft,
  refineDraft,
  getDraftHistory,
} from '../services/draft-generation.service.js';
import {
  generateLetterHtml,
} from '../services/document-generation.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const GenerateLetterBodySchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
  overrides: z.record(z.string(), z.string()).optional(),
});

const GenerateDraftBodySchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
  instructions: z.string().optional(),
  overrides: z.record(z.string(), z.string()).optional(),
});

const RefineDraftBodySchema = z.object({
  instruction: z.string().min(1, 'instruction is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function letterRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/letters/templates
   *
   * List all available letter templates.
   */
  server.get(
    '/letters/templates',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const templates = getTemplates();

      return {
        templates: templates.map((t) => ({
          id: t.id,
          letterType: t.letterType,
          title: t.title,
          description: t.description,
          requiredFields: t.requiredFields,
          statutoryAuthority: t.statutoryAuthority,
        })),
      };
    },
  );

  /**
   * GET /api/letters/templates/:templateId
   *
   * Get a specific template including the full template text.
   */
  server.get(
    '/letters/templates/:templateId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { templateId } = request.params as { templateId: string };

      const template = getTemplate(templateId);

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      return { template };
    },
  );

  /**
   * POST /api/claims/:claimId/letters/generate
   *
   * Generate a letter from a template for a specific claim.
   * Requires claim access. Persists the generated letter and logs an audit event.
   */
  server.post(
    '/claims/:claimId/letters/generate',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      // Verify claim access
      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      // Validate request body
      const parsed = GenerateLetterBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { templateId, overrides } = parsed.data;

      // Verify template exists
      const template = getTemplate(templateId);

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      try {
        const letter = await generateLetter(
          user.id,
          claimId,
          templateId,
          request,
          overrides,
        );

        return await reply.code(201).send({ letter });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Letter generation failed';
        request.log.error({ err, claimId, templateId }, 'Letter generation failed');
        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/claims/:claimId/letters
   *
   * List all generated letters for a claim.
   * Requires claim access.
   */
  server.get(
    '/claims/:claimId/letters',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      // Verify claim access
      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const letters = await getClaimLetters(claimId);

      return { letters };
    },
  );

  /**
   * GET /api/letters/:letterId
   *
   * Get a specific generated letter by ID.
   */
  server.get(
    '/letters/:letterId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { letterId } = request.params as { letterId: string };

      const letter = await getLetter(letterId);

      if (!letter) {
        return reply.code(404).send({ error: 'Letter not found' });
      }

      return { letter };
    },
  );

  /**
   * GET /api/letters/:letterId/html
   *
   * Return the generated letter as a printable HTML document.
   *
   * The HTML includes Glass Box Solutions letterhead, letter metadata,
   * the letter body (Markdown converted to HTML), and a mandatory UPL
   * disclaimer footer. The browser's native Print → Save as PDF function
   * can be used to produce a PDF without server-side dependencies.
   *
   * Content-Type: text/html
   */
  server.get(
    '/letters/:letterId/html',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { letterId } = request.params as { letterId: string };

      const letter = await getLetter(letterId);

      if (!letter) {
        return reply.code(404).send({ error: 'Letter not found' });
      }

      // Extract claim number from populatedData (set during generation)
      const claimNumber =
        (letter.populatedData as Record<string, string>)?.claimNumber ?? 'N/A';

      const html = generateLetterHtml(letter.content, {
        claimNumber,
        letterType: letter.letterType,
        generatedAt: new Date(letter.createdAt),
        generatedBy: user.email ?? user.id,
      });

      return reply
        .code(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    },
  );

  // -------------------------------------------------------------------------
  // AI Draft Generation Routes
  // -------------------------------------------------------------------------

  /**
   * POST /api/claims/:claimId/drafts/generate
   *
   * Generate an AI-assisted draft from a template for a specific claim.
   * Uses LLM to produce richer, more contextual content than template-only.
   * All output is UPL-validated (GREEN zone only).
   */
  server.post(
    '/claims/:claimId/drafts/generate',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      // Verify claim access
      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      // Validate request body
      const parsed = GenerateDraftBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      try {
        const draft = await generateDraft({
          claimId,
          userId: user.id,
          templateId: parsed.data.templateId,
          instructions: parsed.data.instructions,
          overrides: parsed.data.overrides,
        });

        return await reply.code(201).send({ draft });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Draft generation failed';
        request.log.error({ err, claimId, templateId: parsed.data.templateId }, 'Draft generation failed');
        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * POST /api/drafts/:draftId/refine
   *
   * Refine an existing AI-generated draft with a natural-language instruction.
   * Supports iterative refinement — each call updates the draft and tracks
   * revision history.
   */
  server.post(
    '/drafts/:draftId/refine',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { draftId } = request.params as { draftId: string };

      // Validate request body
      const parsed = RefineDraftBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      try {
        const result = await refineDraft({
          draftId,
          instruction: parsed.data.instruction,
          userId: user.id,
        });

        return { result };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Draft refinement failed';
        request.log.error({ err, draftId }, 'Draft refinement failed');

        if (message.includes('not found')) {
          return await reply.code(404).send({ error: message });
        }

        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/drafts/:draftId/history
   *
   * Get the revision history for a draft, showing all prior iterations
   * and the instructions that prompted each change.
   */
  server.get(
    '/drafts/:draftId/history',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { draftId } = request.params as { draftId: string };

      try {
        const history = await getDraftHistory(draftId);

        return { history };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch draft history';
        request.log.error({ err, draftId }, 'Draft history fetch failed');

        if (message.includes('not found')) {
          return await reply.code(404).send({ error: message });
        }

        return await reply.code(500).send({ error: message });
      }
    },
  );
}
