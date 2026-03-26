/**
 * Sentry instrumentation.
 *
 * Initializes Sentry error tracking and performance monitoring.
 * Only active when SENTRY_DSN is configured. In development without
 * a DSN, Sentry is a no-op.
 */

import * as Sentry from '@sentry/node';

let _initialized = false;

/**
 * Initialize Sentry. Safe to call multiple times — only initializes once.
 */
export function initSentry(): void {
  if (_initialized) return;
  _initialized = true;

  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) {
    // No DSN configured — Sentry is a no-op
    return;
  }

  const environment =
    process.env['SENTRY_ENVIRONMENT'] ??
    (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');

  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    release: process.env['SENTRY_RELEASE'],
    environment,
    attachStacktrace: true,
    integrations: [
      Sentry.captureConsoleIntegration({
        levels: ['error'],
      }),
    ],
    // Skip OpenTelemetry to avoid conflicts with other tracing
    skipOpenTelemetrySetup: true,
  });
}

export { Sentry };
