import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { claimsRoutes } from './routes/claims.js';
import { organizationRoutes } from './routes/organizations.js';
import { documentRoutes } from './routes/documents.js';
import { investigationRoutes } from './routes/investigation.js';
import { deadlineRoutes } from './routes/deadlines.js';
import { calculatorRoutes } from './routes/calculator.js';

const PORT = Number(process.env['PORT'] ?? 4901);
const SESSION_SECRET =
  process.env['SESSION_SECRET'] ?? 'change-me-in-production-min-32chars!';

export async function buildServer() {
  const server = Fastify({
    logger: {
      transport:
        process.env['NODE_ENV'] === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
          : undefined,
    },
  });

  // --- Plugins -----------------------------------------------------------
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(cookie);

  await server.register(session, {
    secret: SESSION_SECRET,
    cookie: {
      secure: process.env['NODE_ENV'] === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
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

  return server;
}

// --- Start server (when run directly) ------------------------------------
async function start() {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`AdjudiCLAIMS server listening on port ${String(PORT)}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
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
