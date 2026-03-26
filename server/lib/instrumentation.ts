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
 * Initialize Sentry error tracking and performance monitoring.
 *
 * Safe to call multiple times — only initializes once (idempotent).
 *
 * Activation rules:
 * - Only active when SENTRY_DSN environment variable is set.
 * - In development without a DSN, all Sentry calls are no-ops (zero overhead).
 * - In production, captures unhandled exceptions, console.error calls, and
 *   performance traces at 100% sample rate.
 *
 * What it captures:
 * - Unhandled exceptions with full stack traces (attachStacktrace: true)
 * - Console error output (captureConsoleIntegration)
 * - Performance traces at 100% sample rate (tracesSampleRate: 1.0)
 *
 * What it does NOT capture:
 * - PHI/PII — never log claim content, only metadata and IDs
 * - OpenTelemetry spans — skipped to avoid conflicts with other tracing
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
