import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import rateLimit from '@fastify/rate-limit';
import { validateEnv } from './lib/env.js';
import { registerErrorHandler } from './lib/error-handler.js';
import { initSentry, Sentry } from './lib/instrumentation.js';
import { disconnectTemporal } from './lib/temporal.js';
import { prisma } from './db.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { claimsRoutes } from './routes/claims.js';
import { organizationRoutes } from './routes/organizations.js';
import { documentRoutes } from './routes/documents.js';
import { investigationRoutes } from './routes/investigation.js';
import { deadlineRoutes } from './routes/deadlines.js';
import { calculatorRoutes } from './routes/calculator.js';
import { uplRoutes } from './routes/upl.js';
import { chatRoutes } from './routes/chat.js';
import { educationRoutes } from './routes/education.js';
import { trainingRoutes } from './routes/training.js';
import { workflowRoutes } from './routes/workflows.js';
import { auditRoutes } from './routes/audit.js';
import { complianceRoutes } from './routes/compliance.js';
// Phase 10 route imports
import { reportRoutes } from './routes/reports.js';
import { letterRoutes } from './routes/letters.js';
import { referralRoutes } from './routes/referrals.js';
import { mtusRoutes } from './routes/mtus.js';
import { lienRoutes } from './routes/liens.js';
import { coverageRoutes } from './routes/coverage.js';
import { medicalBillingRoutes } from './routes/medical-billing.js';
import { dataManagementRoutes } from './routes/data-management.js';
import { sandboxRoutes } from './routes/sandbox.js';

export async function buildServer() {
  const env = validateEnv();

  // Initialize Sentry (no-op if SENTRY_DSN not set)
  initSentry();

  const server = Fastify({
    logger: {
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
          : undefined,
    },
  });

  // --- Plugins -----------------------------------------------------------

  // WI-9: CORS — env-specific allowlist
  const corsOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : env.NODE_ENV === 'production'
      ? [] // Must be explicitly configured in production
      : [true]; // Allow all in development

  await server.register(cors, {
    origin:
      corsOrigins.length === 1 && corsOrigins[0] === true
        ? true
        : (corsOrigins as string[]),
    credentials: true,
  });

  await server.register(cookie);

  await server.register(session, {
    secret: env.SESSION_SECRET ?? 'change-me-in-production-min-32chars!',
    cookie: {
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  });

  // WI-6: Global rate limit — 100 requests per 15 minutes
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
  });

  // --- API Routes --------------------------------------------------------
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(claimsRoutes, { prefix: '/api' });
  await server.register(organizationRoutes, { prefix: '/api' });
  await server.register(documentRoutes, { prefix: '/api' });
  await server.register(investigationRoutes, { prefix: '/api' });
  await server.register(deadlineRoutes, { prefix: '/api' });
  await server.register(calculatorRoutes, { prefix: '/api' });
  await server.register(uplRoutes, { prefix: '/api' });
  await server.register(chatRoutes, { prefix: '/api' });
  await server.register(educationRoutes, { prefix: '/api' });
  await server.register(trainingRoutes, { prefix: '/api' });
  await server.register(workflowRoutes, { prefix: '/api' });
  await server.register(auditRoutes, { prefix: '/api' });
  await server.register(complianceRoutes, { prefix: '/api' });
  // Phase 10 routes
  await server.register(reportRoutes, { prefix: '/api' });
  await server.register(letterRoutes, { prefix: '/api' });
  await server.register(referralRoutes, { prefix: '/api' });
  await server.register(mtusRoutes, { prefix: '/api' });
  await server.register(lienRoutes, { prefix: '/api' });
  await server.register(coverageRoutes, { prefix: '/api' });
  await server.register(medicalBillingRoutes, { prefix: '/api' });
  await server.register(dataManagementRoutes, { prefix: '/api' });
  await server.register(sandboxRoutes, { prefix: '/api' });

  // WI-2: Global error handler — registered after all routes
  registerErrorHandler(server);

  return server;
}

// --- Start server (when run directly) ------------------------------------
async function start() {
  const env = validateEnv();
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`AdjudiCLAIMS server listening on port ${String(env.PORT)}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // WI-7: Graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    server.log.info(`${signal} received — shutting down gracefully`);

    try {
      await server.close();
      await disconnectTemporal();
      await prisma.$disconnect();
      await Sentry.close(2000);
      server.log.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    Sentry.captureException(err);
    server.log.fatal({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (err) => {
    Sentry.captureException(err);
    server.log.fatal({ err }, 'Unhandled rejection');
    void shutdown('unhandledRejection');
  });
}

// Only auto-start when run directly (not when imported by tests).
const isMainModule =
  typeof process.env['VITEST'] === 'undefined' &&
  typeof process.env['TEST'] === 'undefined';

if (isMainModule) {
  start().catch((err: unknown) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
