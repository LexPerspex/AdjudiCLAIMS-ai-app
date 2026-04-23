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
import {
  generateBenefitPaymentLetter,
  generateEmployerNotification,
  type EmployerNotificationEvent,
} from '../services/benefit-letter.service.js';
import { prisma } from '../db.js';

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

// AJC-16 — LC 3761 employer notification event payloads
const EmployerNotificationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('BENEFIT_AWARD'),
    benefitType: z.enum(['TD', 'PD', 'DEATH_BENEFIT', 'SJDB_VOUCHER']),
    benefitAmount: z.number().nonnegative(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be YYYY-MM-DD'),
  }),
  z.object({
    type: z.literal('CLAIM_DECISION'),
    decisionType: z.enum(['ACCEPTED', 'DENIED', 'DELAYED']),
    decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'decisionDate must be YYYY-MM-DD'),
    decisionBasis: z.string().min(1, 'decisionBasis is required'),
  }),
]);

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

      // Extract claim number from populatedData (set during generation).
      // Default to 'N/A' if the template did not populate this token.
      const claimNumber = letter.populatedData.claimNumber || 'N/A';

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
  // AJC-16 — Per-payment benefit letter + LC 3761 employer notification
  // -------------------------------------------------------------------------

  /**
   * POST /api/payments/:paymentId/letters/benefit-payment
   *
   * Generate a benefit-payment letter for a specific BenefitPayment row.
   * Verifies the caller has access to the payment's parent claim.
   * Returns the persisted GeneratedLetter record.
   */
  server.post(
    '/payments/:paymentId/letters/benefit-payment',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { paymentId } = request.params as { paymentId: string };

      // Look up the payment to find its parent claim, then verify access.
      const payment = await prisma.benefitPayment.findUnique({
        where: { id: paymentId },
        select: { id: true, claimId: true },
      });

      if (!payment) {
        return reply.code(404).send({ error: 'Benefit payment not found' });
      }

      const access = await verifyClaimAccess(
        payment.claimId,
        user.id,
        user.role,
        user.organizationId,
      );

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      try {
        const letter = await generateBenefitPaymentLetter(user.id, paymentId, request);

        return await reply.code(201).send({ letter });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Benefit payment letter generation failed';
        request.log.error({ err, paymentId }, 'Benefit payment letter generation failed');
        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * POST /api/claims/:claimId/letters/employer-notification
   *
   * Generate an LC 3761 employer notification for a claim event
   * (BENEFIT_AWARD or CLAIM_DECISION). Body must be a valid
   * EmployerNotificationEvent.
   */
  server.post(
    '/claims/:claimId/letters/employer-notification',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { claimId } = request.params as { claimId: string };

      const access = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this claim' });
      }

      const parsed = EmployerNotificationEventSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid employer notification event payload',
          details: parsed.error.issues,
        });
      }

      try {
        const event = parsed.data as EmployerNotificationEvent;
        const letter = await generateEmployerNotification(user.id, claimId, event, request);

        return await reply.code(201).send({ letter });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Employer notification generation failed';
        request.log.error({ err, claimId }, 'Employer notification generation failed');
        return await reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/letters/:letterId/pdf
   *
   * Returns the same printable HTML as `/letters/:letterId/html` but with
   * `Content-Disposition: attachment` so the browser triggers a download
   * dialog (filename is `<claim>-<letterType>-<id>.html`). The user's
   * browser handles Print → Save as PDF for the actual PDF artifact.
   *
   * This avoids a server-side PDF library dependency (puppeteer/headless
   * Chromium) while still giving examiners a one-click "Download Letter"
   * affordance from the UI.
   */
  server.get(
    '/letters/:letterId/pdf',
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

      // Enforce org-scoped access on the parent claim before serving the
      // letter. This is the download endpoint examiners hit from the UI;
      // unlike a same-tab navigation it can be triggered cross-origin via
      // a signed link, so we must not assume the session alone authorizes.
      const access = await verifyClaimAccess(
        letter.claimId,
        user.id,
        user.role,
        user.organizationId,
      );

      if (!access.authorized) {
        return reply.code(403).send({ error: 'Access denied to this letter' });
      }

      const claimNumber = letter.populatedData.claimNumber || 'N-A';

      const html = generateLetterHtml(letter.content, {
        claimNumber,
        letterType: letter.letterType,
        generatedAt: new Date(letter.createdAt),
        generatedBy: user.email,
      });

      // Sanitize filename — strip path separators and quotes.
      const safeClaim = claimNumber.replace(/[^A-Za-z0-9._-]/g, '_');
      const filename = `${safeClaim}-${letter.letterType}-${letter.id}.html`;

      return reply
        .code(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
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
