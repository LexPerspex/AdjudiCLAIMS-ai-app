import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

/**
 * User roles matching the Prisma schema enum.
 */
export enum UserRole {
  CLAIMS_ADMIN = 'CLAIMS_ADMIN',
  CLAIMS_SUPERVISOR = 'CLAIMS_SUPERVISOR',
  CLAIMS_EXAMINER = 'CLAIMS_EXAMINER',
}

/**
 * Shape of the user object stored in the session.
 * Will be expanded as auth implementation progresses.
 */
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  isTrainingComplete?: boolean;  // Set during login from EducationProfile
  /**
   * AJC-19 — true when the user is in training-sandbox mode. Mirrored from
   * `User.trainingModeEnabled` at login and updated in-place when the
   * /api/training/sandbox/{enable,disable} routes flip the flag. Drives the
   * "TRAINING SANDBOX" banner in the app shell.
   */
  trainingModeEnabled?: boolean;
}

// Extend Fastify session type so `request.session.user` is recognized.
declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: SessionUser;
    lastActivity?: number;
    mfaPending?: {
      userId: string;
      email: string;
      role: UserRole;
      organizationId: string;
    };
    pendingMfaSecret?: string;
  }
}

/**
 * Fastify preHandler hook — rejects the request with 401 if no
 * authenticated user is found in the session.
 */
export function requireAuth(): preHandlerHookHandler {
  return (request: FastifyRequest, reply: FastifyReply, done) => {
    const user = request.session.user;

    if (!user) {
      void reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    done();
  };
}

/**
 * Fastify preHandler hook — rejects the request with 403 if the
 * authenticated user's role is not in the allowed list.
 *
 * Must be used **after** `requireAuth()` in the preHandler chain.
 */
export function requireRole(...roles: UserRole[]): preHandlerHookHandler {
  return (request: FastifyRequest, reply: FastifyReply, done) => {
    const user = request.session.user;

    if (!user) {
      void reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(user.role)) {
      void reply.code(403).send({
        error: 'Insufficient permissions',
        required: roles,
        current: user.role,
      });
      return;
    }

    done();
  };
}
