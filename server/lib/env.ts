/**
 * Environment variable validation.
 *
 * Validates all required and optional environment variables at startup.
 * Fails fast with clear error messages if required vars are missing.
 */

import { z } from 'zod';

/**
 * Zod schema defining all environment variables consumed by the application.
 *
 * Variables fall into four categories:
 * - Core: NODE_ENV, PORT, DATABASE_URL, SESSION_SECRET — required for basic operation
 * - AI/ML: ANTHROPIC_API_KEY, VERTEX_AI_PROJECT, DOCUMENT_AI_PROCESSOR — optional,
 *   services degrade gracefully to stub mode when absent
 * - Infrastructure: GCS_BUCKET, TEMPORAL_*, CORS_ORIGINS — optional with sensible defaults
 * - Observability: SENTRY_* — optional, Sentry is a no-op when DSN is not set
 */
const envSchema = z.object({
  /** Application environment. Controls logging, error detail, and SESSION_SECRET enforcement. */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** HTTP server port. Default 4901 to avoid conflicts with other GBS services. */
  PORT: z
    .string()
    .default('4901')
    .transform(Number)
    .pipe(z.number().int().positive()),
  /** MySQL connection string. Required. */
  DATABASE_URL: z
    .string()
    .startsWith(
      'mysql://',
      'DATABASE_URL must be a MySQL connection string',
    ),
  /** Session encryption key. Required in production (min 32 chars). From GCP Secret Manager. */
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters in production')
    .optional(),
  /** Anthropic API key for Claude-based UPL classification and field extraction. From GCP Secret Manager. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** GCP project ID hosting Vertex AI for embeddings. Enables vector search when set. */
  VERTEX_AI_PROJECT: z.string().optional(),
  /** Google Document AI processor ID for OCR text extraction. */
  DOCUMENT_AI_PROCESSOR: z.string().optional(),
  /** GCS bucket name for document storage. Falls back to local filesystem when absent. */
  GCS_BUCKET: z.string().optional(),
  /** Comma-separated list of allowed CORS origins for the API. */
  CORS_ORIGINS: z.string().optional(),

  // Temporal
  /** Temporal server gRPC address. Default: localhost:7233 for local development. */
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  /** Temporal namespace for workflow isolation. Default: 'adjudiclaims'. */
  TEMPORAL_NAMESPACE: z.string().default('adjudiclaims'),
  /** Temporal Cloud API key. When set, enables TLS for the Temporal connection. */
  TEMPORAL_API_KEY: z.string().optional(),

  // Voyage Large + Vertex AI Vector Search
  /** Voyage Large embedding API key. Enables Voyage embeddings when set. From GCP Secret Manager. */
  VOYAGE_API_KEY: z.string().optional(),
  /** Vertex AI Vector Search index endpoint URL. */
  VECTOR_SEARCH_INDEX_ENDPOINT: z.string().optional(),
  /** Deployed index identifier within the Vector Search index endpoint. */
  VECTOR_SEARCH_DEPLOYED_INDEX_ID: z.string().optional(),

  // Sentry
  /** Sentry DSN URL. When absent, Sentry is completely disabled (no-op). */
  SENTRY_DSN: z.string().refine((val) => { try { new URL(val); return true; } catch { return false; } }, { message: 'Invalid URL' }).optional(),
  /** Sentry environment tag (defaults to NODE_ENV-based value). */
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Sentry release identifier for error grouping and source maps. */
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
      ? { DATABASE_URL: 'mysql://test:test@localhost:3306/test' }
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
