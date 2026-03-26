/**
 * Global Fastify error handler.
 *
 * Maps application errors, Zod validation errors, and Prisma errors
 * to consistent HTTP responses. Strips stack traces in production.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { Sentry } from './instrumentation.js';
import { AppError, ValidationError } from './errors.js';

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Register the global error handler on a Fastify instance.
 *
 * Error classification hierarchy (checked in order):
 * 1. AppError (custom) — maps directly to HTTP status via error.statusCode
 * 2. ZodError — schema validation failures → 400 with issue details
 * 3. Prisma P2002 — unique constraint violation → 409 Conflict
 * 4. Prisma P2025 — record not found → 404 Not Found
 * 5. Fastify validation — request schema failures → 400
 * 6. Unknown/unhandled — reported to Sentry → 500 (message stripped in production)
 *
 * Design choice: stack traces are included in development responses for
 * debugging but stripped in production to avoid leaking implementation details.
 * All errors are logged server-side regardless of environment.
 *
 * @param server - Fastify server instance to attach the error handler to.
 */
export function registerErrorHandler(server: {
  setErrorHandler: (
    handler: (
      error: FastifyError | Error,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => void,
  ) => void;
}): void {
  server.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const isProduction = process.env['NODE_ENV'] === 'production';

      // Log the error (always log full error server-side)
      request.log.error({ err: error }, 'Request error');

      // --- AppError (our custom errors) ---
      if (error instanceof AppError) {
        const response: ErrorResponse = {
          error: error.message,
          code: error.code,
        };
        if (error instanceof ValidationError && error.details) {
          response.details = error.details;
        }
        void reply.code(error.statusCode).send(response);
        return;
      }

      // --- ZodError (validation failures from z.parse()) ---
      if (error.name === 'ZodError' && 'issues' in error) {
        void reply.code(400).send({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: (error as { issues: unknown }).issues,
        });
        return;
      }

      // --- Prisma known request errors ---
      if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
        const prismaCode = (error as { code: string }).code;

        // P2002: Unique constraint violation
        if (prismaCode === 'P2002') {
          void reply.code(409).send({
            error: 'Resource already exists',
            code: 'CONFLICT',
          });
          return;
        }

        // P2025: Record not found
        if (prismaCode === 'P2025') {
          void reply.code(404).send({
            error: 'Resource not found',
            code: 'NOT_FOUND',
          });
          return;
        }
      }

      // --- Fastify validation errors (schema validation) ---
      if ('validation' in error) {
        void reply.code(400).send({
          error: 'Request validation failed',
          code: 'VALIDATION_ERROR',
          details: 'validation' in error ? (error as { validation: unknown }).validation : undefined,
        });
        return;
      }

      // --- Unknown / unhandled errors — report to Sentry ---
      Sentry.captureException(error, {
        tags: { component: 'error-handler' },
        extra: {
          url: request.url,
          method: request.method,
          statusCode: 'statusCode' in error ? (error as { statusCode?: number }).statusCode : 500,
        },
      });

      const statusCode =
        'statusCode' in error ? ((error as { statusCode?: number }).statusCode ?? 500) : 500;
      void reply.code(statusCode).send({
        error: isProduction ? 'Internal server error' : error.message,
        code: 'INTERNAL_ERROR',
        ...(!isProduction && { stack: error.stack }),
      });
    },
  );
}
