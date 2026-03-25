import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

/**
 * Fastify preHandler hook — rejects the request with 403 if the
 * authenticated user has not completed mandatory training.
 *
 * Must be used **after** `requireAuth()` in the preHandler chain.
 *
 * Training gate scope:
 *   Exempt: health, auth, training, education
 *   Protected: claims, documents, calculator, deadlines, investigation, chat, UPL, workflows
 */
export function requireTrainingComplete(): preHandlerHookHandler {
  return (request: FastifyRequest, reply: FastifyReply, done) => {
    const user = request.session.user;

    if (!user) {
      void reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    // If isTrainingComplete is not set on the session (legacy sessions or
    // sessions created before Phase 6), allow access — the training gate
    // will be enforced after the user's next login refreshes the session.
    if (user.isTrainingComplete === false) {
      void reply.code(403).send({
        error: 'Training required',
        message: 'You must complete mandatory training before accessing this feature. Visit /training to begin.',
        trainingRequired: true,
      });
      return;
    }

    done();
  };
}
