/**
 * Authentication routes — session-based login/logout/session check.
 *
 * Phase 1 implementation uses email-only lookup for development.
 * BetterAuth integration is deferred to a later phase.
 *
 * IMPORTANT: This does NOT perform password authentication. It is a
 * development-only convenience that will be replaced with BetterAuth.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { logAuditEvent } from '../middleware/audit.js';
import { type UserRole } from '../middleware/rbac.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const LoginBodySchema = z.object({
  email: z.email('Valid email is required'),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin signature requires async
export async function authRoutes(server: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/login
   *
   * Look up user by email, set session. Returns user profile on success.
   * Password authentication is deferred — this is dev-mode email-only login.
   */
  server.post('/auth/login', async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Fetch education profile to set training gate flag
    const educationProfile = await prisma.educationProfile.findUnique({
      where: { userId: user.id },
      select: { isTrainingComplete: true },
    });

    // Set session — includes training completion status for gate middleware
    request.session.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizationId: user.organizationId,
      isTrainingComplete: educationProfile?.isTrainingComplete ?? false,
    };

    // Audit log — never log email content, only user ID
    void logAuditEvent({
      userId: user.id,
      eventType: 'USER_LOGIN',
      request,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    };
  });

  /**
   * POST /api/auth/logout
   *
   * Destroy the current session.
   */
  server.post('/auth/logout', async (request, reply) => {
    const user = request.session.user;

    if (user) {
      void logAuditEvent({
        userId: user.id,
        eventType: 'USER_LOGOUT',
        request,
      });
    }

    await new Promise<void>((resolve, reject) => {
      request.session.destroy((err) => {
        if (err) {
          request.log.error({ err }, 'Failed to destroy session');
          reject(err as Error);
        } else {
          resolve();
        }
      });
    });

    return reply.send({ ok: true });
  });

  /**
   * GET /api/auth/session
   *
   * Return the current session user, or 401 if not authenticated.
   */
  server.get('/auth/session', async (request, reply) => {
    const user = request.session.user;

    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  });
}
