/**
 * Production server entry point.
 *
 * Starts the Fastify server with:
 *   1. Compression (gzip/brotli — matches react-router-serve)
 *   2. All API routes (/api/*)
 *   3. Static asset serving with proper cache headers
 *   4. React Router SSR for frontend routes (everything else)
 *
 * This replaces `react-router-serve` which only serves the frontend
 * and doesn't know about the Fastify API routes.
 *
 * Parity with react-router-serve:
 *   - /assets/* → immutable, max-age=1y (hashed filenames)
 *   - / (build/client root) → favicon, manifest, etc.
 *   - public/ → max-age=1h
 *   - compression enabled
 *   - React Router createRequestHandler for SSR
 */

import { buildServer } from './index.js';
import { validateEnv } from './lib/env.js';
import { disconnectTemporal } from './lib/temporal.js';
import { Sentry } from './lib/instrumentation.js';
import { prisma } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startProduction() {
  const env = validateEnv();
  const server = await buildServer();

  const buildPath = path.resolve(__dirname, '../build');
  const clientPath = path.join(buildPath, 'client');
  const assetsPath = path.join(clientPath, 'assets');
  const serverBuildPath = path.join(buildPath, 'server/index.js');
  const publicPath = path.resolve(__dirname, '../public');

  // --- Compression (matches react-router-serve) ---
  await server.register(import('@fastify/compress'), {
    global: true,
  });

  // --- Static assets: /assets/* → immutable, 1 year cache ---
  // These are hashed filenames from Vite — safe to cache indefinitely.
  if (fs.existsSync(assetsPath)) {
    await server.register(import('@fastify/static'), {
      root: assetsPath,
      prefix: '/assets/',
      decorateReply: false,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in ms
      immutable: true,
    });
  }

  // --- Static files: build/client root → favicon, manifest, etc. ---
  // No aggressive caching — these can change between deploys.
  if (fs.existsSync(clientPath)) {
    await server.register(import('@fastify/static'), {
      root: clientPath,
      prefix: '/',
      decorateReply: false,
      // Only serve actual files, don't interfere with routes
      serve: false,
    });

    // Hook to serve static files from build/client root if they exist
    server.addHook('onRequest', async (request, reply) => {
      // Skip API routes and assets (already handled)
      if (request.url.startsWith('/api/') || request.url.startsWith('/assets/')) {
        return;
      }

      // Check if a static file exists at this path
      const filePath = path.join(clientPath, request.url);
      const safePath = path.resolve(filePath);

      // Prevent path traversal
      if (!safePath.startsWith(clientPath)) return;

      try {
        const stat = fs.statSync(safePath);
        if (stat.isFile()) {
          reply.header('Cache-Control', 'public, max-age=3600'); // 1 hour
          return reply.sendFile(path.relative(clientPath, safePath), clientPath);
        }
      } catch {
        // File doesn't exist — fall through to routes
      }
    });
  }

  // --- Public directory: /public/* → 1 hour cache ---
  if (fs.existsSync(publicPath)) {
    await server.register(import('@fastify/static'), {
      root: publicPath,
      prefix: '/',
      decorateReply: false,
      maxAge: 60 * 60 * 1000, // 1 hour
      serve: false,
    });
  }

  // --- React Router SSR catch-all ---
  // Uses the server build's fetch handler (React Router 7 Web Fetch API)
  let serverBuild: { fetch?: (request: Request) => Promise<Response> } | null = null;

  if (fs.existsSync(serverBuildPath)) {
    try {
      const mod = await import(serverBuildPath);
      // React Router 7 exports a module with default.fetch or just functions
      serverBuild = mod.default ?? mod;
    } catch (err) {
      server.log.warn({ err }, 'Failed to load React Router server build');
    }
  }

  if (serverBuild) {
    server.all('*', async (request, reply) => {
      // API routes are already handled by Fastify route registration.
      // This catch-all only fires for unmatched routes.
      // If it's an API path that wasn't matched, return proper 404.
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not Found' });
      }

      try {
        if (typeof serverBuild!.fetch === 'function') {
          // React Router 7 Web Fetch API handler
          const url = `${request.protocol}://${request.hostname}${request.url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }

          const webRequest = new Request(url, {
            method: request.method,
            headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
              ? JSON.stringify(request.body)
              : undefined,
          });

          const webResponse = await serverBuild!.fetch(webRequest);

          reply.status(webResponse.status);
          for (const [key, value] of webResponse.headers.entries()) {
            reply.header(key, value);
          }
          const body = await webResponse.text();
          return reply.send(body);
        } else {
          // Legacy Node.js handler (req, res)
          const nodeReq = request.raw;
          const nodeRes = reply.raw;
          // @ts-expect-error — legacy handler shape
          await serverBuild!(nodeReq, nodeRes);
        }
      } catch (err) {
        server.log.error({ err }, 'React Router SSR error');
        if (!reply.sent) {
          reply.status(500).send('Internal Server Error');
        }
      }
    });
  }

  // --- Start listening ---
  try {
    const port = env.PORT ?? 4901;
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`AdjudiCLAIMS production server on port ${String(port)}`);
    server.log.info(`API: /api/* (${String(20)} route files)`);
    server.log.info(`Assets: /assets/* (immutable, 1y cache)`);
    server.log.info(`Frontend: React Router SSR`);
    server.log.info(`Compression: enabled`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // --- Graceful shutdown ---
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    server.log.info(`${signal} — shutting down`);
    try {
      await server.close();
      await disconnectTemporal();
      await prisma.$disconnect();
      await Sentry.close(2000);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startProduction().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
