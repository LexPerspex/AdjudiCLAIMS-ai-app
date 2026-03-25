/**
 * Training module routes.
 *
 * Provides endpoints for mandatory 4-module training gate completion.
 * These routes are exempt from the training gate check — training itself
 * must be accessible to users who have not yet completed training.
 *
 * Routes:
 *   GET  /api/training/status                        — Training completion status
 *   GET  /api/training/modules                       — List all modules with completion state
 *   GET  /api/training/modules/:moduleId             — Module content (no correctOptionId)
 *   POST /api/training/modules/:moduleId/submit      — Submit assessment, get graded result
 *
 * Security contract: correctOptionId is NEVER returned by any route.
 * The training-module service strips it before returning any module data.
 *
 * Regulatory authority: 10 CCR 2695.6 — every insurer shall adopt and
 * communicate minimum training standards to all claims agents and adjusters.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import * as trainingService from '../services/training-module.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AnswerSchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  selectedOptionId: z.string().min(1, 'selectedOptionId is required'),
});

const SubmitAssessmentBodySchema = z.object({
  answers: z.array(AnswerSchema).min(1, 'At least one answer is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function trainingRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/training/status
   *
   * Returns the authenticated user's overall training completion status
   * and per-module pass/fail state.
   */
  server.get(
    '/training/status',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const status = await trainingService.getTrainingStatus(user.id);
      return status;
    },
  );

  /**
   * GET /api/training/modules
   *
   * Returns all training modules with per-module completion state merged in.
   * Questions are included but correctOptionId is stripped.
   */
  server.get(
    '/training/modules',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const [modules, status] = await Promise.all([
        Promise.resolve(trainingService.getAllModules()),
        trainingService.getTrainingStatus(user.id),
      ]);

      // Merge completion state into each module
      const statusByModuleId = new Map(status.modules.map((m) => [m.moduleId, m]));
      const modulesWithCompletion = modules.map((mod) => {
        const moduleStatus = statusByModuleId.get(mod.id);
        return {
          ...mod,
          isComplete: moduleStatus?.isComplete ?? false,
          score: moduleStatus?.score ?? null,
          completedAt: moduleStatus?.completedAt ?? null,
        };
      });

      return { modules: modulesWithCompletion };
    },
  );

  /**
   * GET /api/training/modules/:moduleId
   *
   * Returns a single training module's content including questions.
   * correctOptionId is stripped — this endpoint is safe to expose to
   * examinees before they have submitted their assessment.
   */
  server.get<{ Params: { moduleId: string } }>(
    '/training/modules/:moduleId',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { moduleId } = request.params;
      const mod = trainingService.getModule(moduleId);
      if (!mod) {
        return reply.code(404).send({ error: 'Training module not found' });
      }

      return mod;
    },
  );

  /**
   * POST /api/training/modules/:moduleId/submit
   *
   * Submit answers for a training module assessment. Returns a graded result
   * including per-question correctness and regulatory explanations.
   *
   * If the submission passes:
   *   - Persists completion record to EducationProfile
   *   - Logs TRAINING_ASSESSMENT_PASSED audit event
   *   - If all modules now complete, logs TRAINING_MODULE_COMPLETED audit event
   *
   * Body: { answers: [{ questionId: string, selectedOptionId: string }] }
   *
   * Errors:
   *   400 — Body fails Zod validation OR assessment incomplete (not all questions answered)
   *   404 — Module not found
   */
  server.post<{ Params: { moduleId: string } }>(
    '/training/modules/:moduleId/submit',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;
      if (!user) return reply.code(401).send({ error: 'Authentication required' });

      const { moduleId } = request.params;

      // Validate request body
      const parsed = SubmitAssessmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { answers } = parsed.data;

      // Check training status before submission so we can detect completion
      const statusBefore = await trainingService.getTrainingStatus(user.id);
      const wasAlreadyComplete = statusBefore.isComplete;

      let result: trainingService.AssessmentResult;
      try {
        result = await trainingService.submitAssessment(user.id, moduleId, answers);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Assessment submission failed';
        // Distinguish "module not found" from "incomplete answers"
        if (message.includes('not found')) {
          return reply.code(404).send({ error: message });
        }
        return reply.code(400).send({ error: message });
      }

      // Audit logging for passing submissions
      if (result.passed) {
        void logAuditEvent({
          userId: user.id,
          eventType: 'TRAINING_ASSESSMENT_PASSED',
          eventData: {
            moduleId,
            score: result.score,
            correctCount: result.correctCount,
            totalQuestions: result.totalQuestions,
          },
          request,
        });

        // Check if this submission completed all training (first time)
        if (!wasAlreadyComplete) {
          const statusAfter = await trainingService.getTrainingStatus(user.id);
          if (statusAfter.isComplete) {
            void logAuditEvent({
              userId: user.id,
              eventType: 'TRAINING_MODULE_COMPLETED',
              eventData: {
                completedAt: new Date().toISOString(),
                finalModuleId: moduleId,
              },
              request,
            });
          }
        }
      }

      return result;
    },
  );
}
