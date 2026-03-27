/**
 * Decision workflow routes.
 *
 * Provides endpoints for listing workflow definitions and managing per-claim
 * workflow progress. All routes require authentication AND completed training
 * (workflows are a core part of the guided examiner experience).
 *
 * Routes:
 *   GET  /api/workflows                                              — List available workflows
 *   GET  /api/workflows/:workflowId                                  — Get workflow definition
 *   POST /api/claims/:claimId/workflows/:workflowId/start            — Start workflow for claim
 *   PATCH /api/claims/:claimId/workflows/:workflowId/steps/:stepId   — Complete or skip step
 *   GET  /api/claims/:claimId/workflows/:workflowId/progress         — Get progress
 *
 * UPL Note: Workflows are GREEN zone (procedural/factual guidance only).
 * No legal conclusions are produced by these endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { requireTrainingComplete } from '../middleware/training-gate.js';
import { logAuditEvent } from '../middleware/audit.js';
import { verifyClaimAccess } from '../middleware/claim-access.js';
import * as workflowEngine from '../services/workflow-engine.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const StepActionBodySchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('complete'),
      reason: z.string().optional(),
    }),
    z.object({
      action: z.literal('skip'),
      reason: z.string().min(1, 'reason must not be empty'),
    }),
  ]);

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function workflowRoutes(server: FastifyInstance): Promise<void> {
  const preHandler = [requireAuth(), requireTrainingComplete()];

  /**
   * GET /api/workflows
   *
   * Return summary metadata for all available workflow definitions.
   * Does not require claim context — the list is global.
   */
  server.get(
    '/workflows',
    { preHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const workflows = workflowEngine.getAllWorkflows();
      return { workflows };
    },
  );

  /**
   * GET /api/workflows/:workflowId
   *
   * Return the full definition for a single workflow (including step list).
   */
  server.get<{ Params: { workflowId: string } }>(
    '/workflows/:workflowId',
    { preHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { workflowId } = request.params;
      const workflow = workflowEngine.getWorkflow(workflowId);
      if (!workflow) {
        return reply.code(404).send({ error: 'Workflow not found' });
      }

      return workflow;
    },
  );

  /**
   * POST /api/claims/:claimId/workflows/:workflowId/start
   *
   * Start a workflow for a specific claim.
   *
   * Creates a WorkflowProgress record with all steps set to PENDING.
   * Returns 409 if the workflow was already started for this claim/user pair.
   * Logs a CLAIM_STATUS_CHANGED audit event on success.
   */
  server.post<{ Params: { claimId: string; workflowId: string } }>(
    '/claims/:claimId/workflows/:workflowId/start',
    { preHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId, workflowId } = request.params;

      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      try {
        const progress = await workflowEngine.startWorkflow(user.id, claimId, workflowId);

        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'CLAIM_STATUS_CHANGED',
          eventData: {
            action: 'workflow_started',
            workflowId,
            workflowTitle: progress.title,
          },
          request,
        });

        return await reply.code(201).send(progress);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Prisma unique constraint: workflow already started for this claim/user
        if (message.includes('P2002') || message.includes('Unique constraint')) {
          return reply.code(409).send({ error: 'Workflow already started for this claim' });
        }

        // Unknown workflowId
        if (message.startsWith('Unknown workflowId')) {
          return reply.code(404).send({ error: 'Workflow not found' });
        }

        throw err;
      }
    },
  );

  /**
   * PATCH /api/claims/:claimId/workflows/:workflowId/steps/:stepId
   *
   * Complete or skip a step within a workflow.
   *
   * Body: { action: 'complete' | 'skip', reason?: string }
   *   - reason is required when action is 'skip'
   *
   * Logs an INVESTIGATION_ACTIVITY audit event for each step action.
   * If the action causes the workflow to reach 100% completion, an additional
   * CLAIM_STATUS_CHANGED audit event is logged.
   */
  server.patch<{ Params: { claimId: string; workflowId: string; stepId: string } }>(
    '/claims/:claimId/workflows/:workflowId/steps/:stepId',
    { preHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId, workflowId, stepId } = request.params;

      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      const parsed = StepActionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { action } = parsed.data;
      const reason = 'reason' in parsed.data ? parsed.data.reason : undefined;

      try {
        const progress =
          action === 'complete'
            ? await workflowEngine.completeStep(user.id, claimId, workflowId, stepId)
            : await workflowEngine.skipStep(user.id, claimId, workflowId, stepId, reason as string);

        // Audit: step action
        void logAuditEvent({
          userId: user.id,
          claimId,
          eventType: 'INVESTIGATION_ACTIVITY',
          eventData: {
            action: `step_${action}d`,
            workflowId,
            stepId,
            ...(reason !== undefined ? { reason } : {}),
          },
          request,
        });

        // Audit: workflow completion (if this step finished the workflow)
        if (progress.isComplete) {
          void logAuditEvent({
            userId: user.id,
            claimId,
            eventType: 'CLAIM_STATUS_CHANGED',
            eventData: {
              action: 'workflow_completed',
              workflowId,
              workflowTitle: progress.title,
            },
            request,
          });
        }

        return progress;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('Unknown workflowId')) {
          return reply.code(404).send({ error: 'Workflow not found' });
        }

        if (message.startsWith('Unknown stepId')) {
          return reply.code(404).send({ error: 'Step not found' });
        }

        // Workflow not started — no WorkflowProgress record
        if (message.includes('P2025') || message.includes('No WorkflowProgress')) {
          return reply.code(404).send({ error: 'Workflow has not been started for this claim' });
        }

        // Step is not skippable
        if (message.includes('not skippable')) {
          return reply.code(422).send({ error: message });
        }

        throw err;
      }
    },
  );

  /**
   * GET /api/claims/:claimId/workflows/:workflowId/progress
   *
   * Return the current progress detail for a claim/user/workflow combination.
   * Returns 404 if the workflow has not been started.
   */
  server.get<{ Params: { claimId: string; workflowId: string } }>(
    '/claims/:claimId/workflows/:workflowId/progress',
    { preHandler },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { claimId, workflowId } = request.params;

      const { authorized } = await verifyClaimAccess(claimId, user.id, user.role, user.organizationId);
      if (!authorized) return reply.code(404).send({ error: 'Claim not found' });

      try {
        const progress = await workflowEngine.getWorkflowProgress(user.id, claimId, workflowId);
        return progress;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('Unknown workflowId')) {
          return reply.code(404).send({ error: 'Workflow not found' });
        }

        // WorkflowProgress record does not exist — workflow not started
        if (message.includes('P2025') || message.includes('No WorkflowProgress')) {
          return reply.code(404).send({ error: 'Workflow has not been started for this claim' });
        }

        throw err;
      }
    },
  );
}
