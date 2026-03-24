/**
 * Benefit calculator routes.
 *
 * All routes require authentication. Provides endpoints for:
 * - TD (Temporary Disability) rate calculation per LC 4653
 * - Full TD benefit calculation with payment schedule per LC 4650
 * - Death benefit calculation per LC 4700-4706
 *
 * This is a GREEN zone feature -- pure arithmetic, no legal analysis.
 * Every response includes the statutory authority citation and disclaimer.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/rbac.js';
import { logAuditEvent } from '../middleware/audit.js';
import {
  calculateTdRate,
  calculateTdBenefit,
  calculateDeathBenefit,
} from '../services/benefit-calculator.service.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const TdRateBodySchema = z.object({
  awe: z.number().positive('AWE must be a positive number'),
  dateOfInjury: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateOfInjury must be a valid date string',
  ),
});

const TdBenefitBodySchema = z.object({
  awe: z.number().positive('AWE must be a positive number'),
  dateOfInjury: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateOfInjury must be a valid date string',
  ),
  startDate: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'startDate must be a valid date string',
  ),
  endDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'endDate must be a valid date string')
    .optional(),
});

const DeathBenefitBodySchema = z.object({
  dateOfInjury: z.string().refine(
    (v) => !isNaN(Date.parse(v)),
    'dateOfInjury must be a valid date string',
  ),
  numberOfDependents: z.number().int().positive('numberOfDependents must be a positive integer'),
  dependentType: z.enum(['TOTAL', 'PARTIAL']),
  partialPercentage: z
    .number()
    .min(0, 'partialPercentage must be between 0 and 100')
    .max(100, 'partialPercentage must be between 0 and 100')
    .optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function calculatorRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/calculator/td-rate
   *
   * Calculate TD rate from AWE and date of injury.
   * Returns the weekly TD rate with statutory bounds and clamping info.
   */
  server.post(
    '/calculator/td-rate',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = TdRateBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { awe, dateOfInjury: doiString } = parsed.data;
      const dateOfInjury = new Date(doiString);

      const result = calculateTdRate(awe, dateOfInjury);

      // Audit log -- log calculation type only, no PII
      void logAuditEvent({
        userId: user.id,
        eventType: 'BENEFIT_CALCULATED',
        eventData: { calculationType: 'TD_RATE', injuryYear: result.injuryYear },
        request,
      });

      return result;
    },
  );

  /**
   * POST /api/calculator/td-benefit
   *
   * Full TD benefit calculation with payment schedule.
   * Returns rate, schedule, totals, and GREEN zone disclaimer.
   */
  server.post(
    '/calculator/td-benefit',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = TdBenefitBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { awe, dateOfInjury: doiString, startDate: startString, endDate: endString } =
        parsed.data;

      const result = calculateTdBenefit({
        awe,
        dateOfInjury: new Date(doiString),
        startDate: new Date(startString),
        endDate: endString ? new Date(endString) : undefined,
      });

      // Audit log -- log calculation type only, no PII
      void logAuditEvent({
        userId: user.id,
        eventType: 'BENEFIT_CALCULATED',
        eventData: {
          calculationType: 'TD_BENEFIT',
          injuryYear: result.rate.injuryYear,
          scheduleEntries: result.schedule.length,
        },
        request,
      });

      return result;
    },
  );

  /**
   * POST /api/calculator/death-benefit
   *
   * Death benefit calculation per LC 4700-4706.
   * Returns total benefit, weekly rate, and total weeks.
   */
  server.post(
    '/calculator/death-benefit',
    { preHandler: [requireAuth()] },
    async (request, reply) => {
      const user = request.session.user;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const parsed = DeathBenefitBodySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { dateOfInjury: doiString, numberOfDependents, dependentType, partialPercentage } =
        parsed.data;

      const result = calculateDeathBenefit({
        dateOfInjury: new Date(doiString),
        numberOfDependents,
        dependentType,
        partialPercentage,
      });

      // Audit log -- log calculation type only, no PII
      void logAuditEvent({
        userId: user.id,
        eventType: 'BENEFIT_CALCULATED',
        eventData: {
          calculationType: 'DEATH_BENEFIT',
          dependentType,
          numberOfDependents,
        },
        request,
      });

      return result;
    },
  );
}
