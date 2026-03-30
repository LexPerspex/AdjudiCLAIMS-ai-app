import { vi } from 'vitest';

/**
 * Standard auth fields for mock users in tests.
 * Include these alongside your base user fields when setting up mocks.
 * These satisfy all fields queried by the login route in server/routes/auth.ts.
 */
export const AUTH_FIELDS = {
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$mock-hash',
  emailVerified: true,
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  lastLoginAt: null,
  passwordChangedAt: null,
  deletedAt: null,
  deletedBy: null,
};

/**
 * Call this in your test file (at module top level, before any imports that
 * trigger buildServer) to mock argon2 so that verify() always returns true.
 * vi.mock() calls are hoisted by vitest so this must be at the top level.
 */
export function mockArgon2() {
  vi.mock('argon2', () => ({
    default: {
      verify: vi.fn().mockResolvedValue(true),
      hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mock-hash'),
      argon2id: 2,
    },
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mock-hash'),
    argon2id: 2,
  }));
}
