/**
 * Environment variable validation.
 *
 * Validates all required and optional environment variables at startup.
 * Fails fast with clear error messages if required vars are missing.
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4901')
    .transform(Number)
    .pipe(z.number().int().positive()),
  DATABASE_URL: z
    .string()
    .startsWith(
      'postgresql://',
      'DATABASE_URL must be a PostgreSQL connection string',
    ),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters in production')
    .optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VERTEX_AI_PROJECT: z.string().optional(),
  DOCUMENT_AI_PROCESSOR: z.string().optional(),
  GCS_BUCKET: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),

  // Temporal
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('adjudiclaims'),
  TEMPORAL_API_KEY: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validate and return environment variables.
 * Caches the result after first successful validation.
 *
 * In test mode, provides sensible defaults so tests don't need full env setup.
 * In production, SESSION_SECRET is required.
 */
export function validateEnv(): Env {
  if (_env) return _env;

  // In test mode, provide defaults for required vars
  const isTest =
    process.env['NODE_ENV'] === 'test' || process.env['VITEST'] !== undefined;

  const raw = {
    ...process.env,
    // Provide test defaults
    ...(isTest && !process.env['DATABASE_URL']
      ? { DATABASE_URL: 'postgresql://test:test@localhost:5432/test' }
      : {}),
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  // Enforce SESSION_SECRET in production
  if (result.data.NODE_ENV === 'production' && !result.data.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is required in production (minimum 32 characters)',
    );
  }

  _env = result.data;
  return _env;
}

/**
 * Get the validated environment. Throws if validateEnv() hasn't been called.
 */
export function getEnv(): Env {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}

/**
 * Reset the cached environment (for testing only).
 */
export function _resetEnv(): void {
  _env = null;
}
