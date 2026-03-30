import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Environment variable validation tests.
 *
 * Tests validateEnv(), getEnv(), and _resetEnv() including:
 * - Validation failures for missing/invalid env vars
 * - Production SESSION_SECRET enforcement
 * - Test mode defaults
 * - Caching and reset behavior
 */

import { validateEnv, getEnv, _resetEnv } from '../../server/lib/env.js';

// Save original env
const ORIGINAL_ENV = { ...process.env };

describe('Environment Validation', () => {
  beforeEach(() => {
    _resetEnv();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...ORIGINAL_ENV };
    _resetEnv();
  });

  // -------------------------------------------------------------------------
  // validateEnv — success cases
  // -------------------------------------------------------------------------

  describe('validateEnv — success', () => {
    it('validates successfully with required vars in test mode', () => {
      process.env['NODE_ENV'] = 'test';
      // DATABASE_URL not set — test mode provides default
      const env = validateEnv();
      expect(env.NODE_ENV).toBe('test');
      expect(env.DATABASE_URL).toBe('mysql://test:test@localhost:3306/test');
    });

    it('validates with explicit DATABASE_URL', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['DATABASE_URL'] = 'mysql://user:pass@host:3306/db';
      const env = validateEnv();
      expect(env.DATABASE_URL).toBe('mysql://user:pass@host:3306/db');
    });

    it('caches result after first call', () => {
      process.env['NODE_ENV'] = 'test';
      const env1 = validateEnv();
      const env2 = validateEnv();
      expect(env1).toBe(env2);
    });

    it('parses PORT as number', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['PORT'] = '5000';
      const env = validateEnv();
      expect(env.PORT).toBe(5000);
    });

    it('defaults PORT to 4901', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['PORT'];
      const env = validateEnv();
      expect(env.PORT).toBe(4901);
    });

    it('defaults TEMPORAL_ADDRESS to localhost:7233', () => {
      process.env['NODE_ENV'] = 'test';
      const env = validateEnv();
      expect(env.TEMPORAL_ADDRESS).toBe('localhost:7233');
    });

    it('defaults TEMPORAL_NAMESPACE to adjudiclaims', () => {
      process.env['NODE_ENV'] = 'test';
      const env = validateEnv();
      expect(env.TEMPORAL_NAMESPACE).toBe('adjudiclaims');
    });
  });

  // -------------------------------------------------------------------------
  // validateEnv — failure cases
  // -------------------------------------------------------------------------

  describe('validateEnv — failure', () => {
    it('throws when DATABASE_URL is not a valid database string', () => {
      process.env['NODE_ENV'] = 'development';
      process.env['DATABASE_URL'] = 'http://not-a-database';
      expect(() => validateEnv()).toThrow('Environment validation failed');
    });

    it('throws when DATABASE_URL is missing in non-test mode', () => {
      process.env['NODE_ENV'] = 'development';
      delete process.env['DATABASE_URL'];
      // Also clear VITEST so the test-mode default doesn't kick in
      const origVitest = process.env['VITEST'];
      delete process.env['VITEST'];
      try {
        expect(() => validateEnv()).toThrow('Environment validation failed');
      } finally {
        process.env['VITEST'] = origVitest;
      }
    });

    it('throws when production mode lacks SESSION_SECRET', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['DATABASE_URL'] = 'mysql://prod:pass@host:3306/db';
      delete process.env['SESSION_SECRET'];
      expect(() => validateEnv()).toThrow('SESSION_SECRET is required in production');
    });

    it('succeeds in production with valid SESSION_SECRET', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['DATABASE_URL'] = 'mysql://prod:pass@host:3306/db';
      process.env['SESSION_SECRET'] = 'a'.repeat(32);
      const env = validateEnv();
      expect(env.NODE_ENV).toBe('production');
    });

    it('error message includes field path for validation issues', () => {
      process.env['NODE_ENV'] = 'development';
      process.env['DATABASE_URL'] = 'invalid-url';
      try {
        validateEnv();
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('DATABASE_URL');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getEnv
  // -------------------------------------------------------------------------

  describe('getEnv', () => {
    it('calls validateEnv if not yet validated', () => {
      process.env['NODE_ENV'] = 'test';
      const env = getEnv();
      expect(env).toBeDefined();
      expect(env.NODE_ENV).toBe('test');
    });

    it('returns cached env without re-validation', () => {
      process.env['NODE_ENV'] = 'test';
      validateEnv();
      const env = getEnv();
      expect(env.NODE_ENV).toBe('test');
    });
  });

  // -------------------------------------------------------------------------
  // _resetEnv
  // -------------------------------------------------------------------------

  describe('_resetEnv', () => {
    it('clears the cached env so next call re-validates', () => {
      process.env['NODE_ENV'] = 'test';
      const env1 = validateEnv();
      _resetEnv();

      process.env['PORT'] = '9999';
      const env2 = validateEnv();

      expect(env1).not.toBe(env2);
      expect(env2.PORT).toBe(9999);
    });
  });

  // -------------------------------------------------------------------------
  // VITEST env detection
  // -------------------------------------------------------------------------

  describe('test mode detection', () => {
    it('detects test mode via VITEST env variable', () => {
      // VITEST is already set by the test runner
      delete process.env['NODE_ENV'];
      delete process.env['DATABASE_URL'];
      const env = validateEnv();
      // Should use test defaults
      expect(env.DATABASE_URL).toBe('mysql://test:test@localhost:3306/test');
    });
  });

  // -------------------------------------------------------------------------
  // Optional fields
  // -------------------------------------------------------------------------

  describe('optional fields', () => {
    it('optional fields are undefined when not set', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['VERTEX_AI_PROJECT'];
      delete process.env['VOYAGE_API_KEY'];
      delete process.env['SENTRY_DSN'];
      const env = validateEnv();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.VERTEX_AI_PROJECT).toBeUndefined();
      expect(env.VOYAGE_API_KEY).toBeUndefined();
      expect(env.SENTRY_DSN).toBeUndefined();
    });

    it('SENTRY_DSN is validated as URL when set', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['SENTRY_DSN'] = 'not-a-url';
      expect(() => validateEnv()).toThrow('Environment validation failed');
    });

    it('SENTRY_DSN accepts valid URL', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['SENTRY_DSN'] = 'https://abc@sentry.io/123';
      const env = validateEnv();
      expect(env.SENTRY_DSN).toBe('https://abc@sentry.io/123');
    });
  });
});
