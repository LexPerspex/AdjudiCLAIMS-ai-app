/**
 * Authentication routes — full session-based auth with password verification,
 * account lockout, MFA (TOTP), registration, and email verification.
 *
 * Sprint 2: SOC 2 CC6.1-CC6.3 compliant authentication.
 *
 * Endpoints:
 *   POST /auth/register       — Create account (argon2id, email verification token)
 *   POST /auth/verify-email   — Verify email with token
 *   POST /auth/login          — Password login with lockout + MFA flow
 *   POST /auth/logout         — Destroy session
 *   GET  /auth/session        — Return current session user
 *   POST /auth/change-password — Change password (requires current)
 *   POST /auth/mfa/setup       — Generate TOTP secret + QR URI
 *   POST /auth/mfa/verify-setup — Verify TOTP code and enable MFA
 *   POST /auth/mfa/verify      — Complete MFA challenge during login
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../db.js';
import { logAuditEvent } from '../middleware/audit.js';
import { type UserRole } from '../middleware/rbac.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const LoginBodySchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;

const RegisterBodySchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, number, and special character'),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, number, and special character'),
});

const MfaVerifySchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Rate limit config — relaxed in test mode
const isTest = !!(process.env.VITEST || process.env.NODE_ENV === 'test');
const LOGIN_RATE_LIMIT = {
  max: isTest ? 10000 : 10,
  timeWindow: '15 minutes',
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function authRoutes(server: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /auth/register
  // -------------------------------------------------------------------------
  server.post('/auth/register', async (request, reply) => {
    const parsed = RegisterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const { email, name, password } = parsed.data;

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Don't reveal whether account exists — return generic message
      return reply.code(200).send({
        ok: true,
        message: 'If this email is not already registered, check your email for a verification link.',
      });
    }

    // Hash password with argon2id
    const argon2 = await import('argon2');
    const passwordHash = await argon2.default.hash(password, { type: argon2.argon2id ?? 2 });

    // Generate email verification token
    const emailVerificationToken = randomUUID();
    const emailVerificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerified: false,
        emailVerificationToken,
        emailVerificationExpiry,
        role: 'CLAIMS_EXAMINER',
        organizationId: 'default-org', // TODO: org assignment during provisioning
        isActive: true,
      },
    });

    void logAuditEvent({
      userId: 'system',
      eventType: 'USER_CREATED',
      eventData: { email: '[redacted]' },
      request,
    });

    return reply.code(200).send({
      ok: true,
      message: 'If this email is not already registered, check your email for a verification link.',
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/verify-email
  // -------------------------------------------------------------------------
  server.post('/auth/verify-email', async (request, reply) => {
    const parsed = VerifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: parsed.data.token,
        emailVerificationExpiry: { gte: new Date() },
      },
    });

    if (!user) {
      return reply.code(400).send({ error: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    return { ok: true, message: 'Email verified. You may now log in.' };
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------------------------
  server.post(
    '/auth/login',
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = LoginBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          isActive: true,
          passwordHash: true,
          emailVerified: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          mfaEnabled: true,
          trainingModeEnabled: true,
        },
      });

      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Check account lockout
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        void logAuditEvent({
          userId: user.id,
          eventType: 'USER_LOGIN_FAILED',
          eventData: { reason: 'account_locked' },
          request,
        });
        return reply.code(401).send({
          error: 'Account is locked due to too many failed login attempts. Try again later.',
        });
      }

      // Check email verified
      if (!user.emailVerified) {
        return reply.code(401).send({ error: 'Please verify your email before logging in.' });
      }

      // Verify password
      if (!user.passwordHash) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const argon2 = await import('argon2');
      const passwordValid = await argon2.default.verify(user.passwordHash, password);

      if (!passwordValid) {
        const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = {
          failedLoginAttempts: newAttempts,
        };

        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
          void logAuditEvent({
            userId: user.id,
            eventType: 'USER_ACCOUNT_LOCKED',
            eventData: { attempts: newAttempts },
            request,
          });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });

        void logAuditEvent({
          userId: user.id,
          eventType: 'USER_LOGIN_FAILED',
          eventData: { attempts: newAttempts },
          request,
        });

        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Password valid — reset failed attempts
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      // Check if MFA is required
      if (user.mfaEnabled) {
        request.session.mfaPending = {
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          organizationId: user.organizationId,
        };
        return { mfaRequired: true };
      }

      // Fetch education profile for training gate
      const educationProfile = await prisma.educationProfile.findUnique({
        where: { userId: user.id },
        select: { isTrainingComplete: true },
      });

      // Set full session
      request.session.user = {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        organizationId: user.organizationId,
        isTrainingComplete: educationProfile?.isTrainingComplete ?? false,
        trainingModeEnabled: user.trainingModeEnabled,
      };
      request.session.lastActivity = Date.now();

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
    },
  );

  // -------------------------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // GET /auth/session
  // -------------------------------------------------------------------------
  server.get('/auth/session', async (request, reply) => {
    // Block if MFA is pending
    if (request.session.mfaPending && !request.session.user) {
      return reply.code(401).send({ error: 'MFA verification required', mfaPending: true });
    }

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

  // -------------------------------------------------------------------------
  // POST /auth/change-password
  // -------------------------------------------------------------------------
  server.post('/auth/change-password', async (request, reply) => {
    const user = request.session.user;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return reply.code(400).send({ error: 'Cannot change password' });
    }

    const argon2 = await import('argon2');
    const valid = await argon2.default.verify(dbUser.passwordHash, parsed.data.currentPassword);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const newHash = await argon2.default.hash(parsed.data.newPassword, { type: argon2.argon2id ?? 2 });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });

    void logAuditEvent({
      userId: user.id,
      eventType: 'USER_PASSWORD_CHANGED',
      request,
    });

    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // POST /auth/mfa/setup
  // -------------------------------------------------------------------------
  server.post('/auth/mfa/setup', async (request, reply) => {
    const user = request.session.user;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    // Generate TOTP secret
    const { authenticator } = await import('@otplib/preset-default');
    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(user.email, 'AdjudiCLAIMS', secret);

    // Store pending secret in session (not DB until verified)
    request.session.pendingMfaSecret = secret;

    return { secret, otpauthUri };
  });

  // -------------------------------------------------------------------------
  // POST /auth/mfa/verify-setup
  // -------------------------------------------------------------------------
  server.post('/auth/mfa/verify-setup', async (request, reply) => {
    const user = request.session.user;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    const parsed = MfaVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid code format' });
    }

    const pendingSecret = request.session.pendingMfaSecret;
    if (!pendingSecret) {
      return reply.code(400).send({ error: 'No MFA setup in progress. Call /auth/mfa/setup first.' });
    }

    const { authenticator } = await import('@otplib/preset-default');
    const isValid = authenticator.verify({ token: parsed.data.code, secret: pendingSecret });

    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid code. Please try again.' });
    }

    // Save to DB
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: pendingSecret, mfaEnabled: true },
    });

    delete request.session.pendingMfaSecret;

    void logAuditEvent({
      userId: user.id,
      eventType: 'USER_MFA_ENROLLED',
      request,
    });

    return { ok: true, message: 'MFA enabled successfully.' };
  });

  // -------------------------------------------------------------------------
  // POST /auth/mfa/verify
  // -------------------------------------------------------------------------
  server.post('/auth/mfa/verify', async (request, reply) => {
    const pending = request.session.mfaPending;
    if (!pending) {
      return reply.code(400).send({ error: 'No MFA challenge pending.' });
    }

    const parsed = MfaVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid code format' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: pending.userId },
      select: { mfaSecret: true, trainingModeEnabled: true },
    });

    if (!dbUser?.mfaSecret) {
      return reply.code(400).send({ error: 'MFA not configured' });
    }

    const { authenticator } = await import('@otplib/preset-default');
    const isValid = authenticator.verify({ token: parsed.data.code, secret: dbUser.mfaSecret });

    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid MFA code' });
    }

    // Fetch education profile for training gate
    const educationProfile = await prisma.educationProfile.findUnique({
      where: { userId: pending.userId },
      select: { isTrainingComplete: true },
    });

    // Promote to full session
    request.session.user = {
      id: pending.userId,
      email: pending.email,
      role: pending.role,
      organizationId: pending.organizationId,
      isTrainingComplete: educationProfile?.isTrainingComplete ?? false,
      trainingModeEnabled: dbUser.trainingModeEnabled,
    };
    request.session.lastActivity = Date.now();
    delete request.session.mfaPending;

    void logAuditEvent({
      userId: pending.userId,
      eventType: 'USER_MFA_VERIFIED',
      request,
    });

    return { ok: true };
  });
}
