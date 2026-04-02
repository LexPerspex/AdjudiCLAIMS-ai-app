/**
 * Comparable claims routes — YELLOW zone statistical analysis.
 *
 * Exposes the comparable claims service as an API endpoint for
 * claims examiners. All responses include mandatory UPL disclaimer.
 *
 * Routes:
 *   POST /api/comparable-claims — Get statistical comparable claims data
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { getComparableClaims } from '../services/comparable-claims.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ComparableClaimsBodySchema = z.object({
  bodyParts: z.array(z.string().min(1)).min(1, 'At least one body part is required'),
  injuryType: z.enum(['SPECIFIC', 'CUMULATIVE', 'OCCUPATIONAL_DISEASE']),
  dateOfInjury: z.string().pipe(z.coerce.date()),
  currentReserves: z.number().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function comparableClaimsRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/comparable-claims
   *
   * Returns statistical comparable claims data for given body parts and
   * injury type. YELLOW zone — every response includes a mandatory
   * disclaimer directing the examiner to defense counsel.
   */
  server.post(
    '/comparable-claims',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = ComparableClaimsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const result = getComparableClaims({
        bodyParts: parsed.data.bodyParts,
        injuryType: parsed.data.injuryType,
        dateOfInjury: parsed.data.dateOfInjury,
        currentReserves: parsed.data.currentReserves,
      });

      // Audit log — claim-level context not available here, log user action only
      console.info(
        `[comparable-claims] YELLOW zone query by user=${user.id} ` +
        `bodyParts=${parsed.data.bodyParts.join(',')} injuryType=${parsed.data.injuryType}`,
      );

      return reply.code(200).send(result);
    },
  );
}
