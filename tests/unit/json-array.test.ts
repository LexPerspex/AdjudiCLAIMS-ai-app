import { describe, it, expect } from 'vitest';

/**
 * JSON array utility tests.
 *
 * Tests parseJsonStringArray() and toJsonStringArray() for all edge cases.
 * These are pure functions — no mocking needed.
 */

import {
  parseJsonStringArray,
  toJsonStringArray,
} from '../../server/lib/json-array.js';

// ==========================================================================
// parseJsonStringArray
// ==========================================================================

describe('parseJsonStringArray', () => {
  // -----------------------------------------------------------------------
  // Null/undefined handling
  // -----------------------------------------------------------------------

  it('returns empty array for null', () => {
    expect(parseJsonStringArray(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseJsonStringArray(undefined)).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Array inputs (from Prisma Json field)
  // -----------------------------------------------------------------------

  it('returns string array when input is string[]', () => {
    const result = parseJsonStringArray(['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('filters out non-string items from array', () => {
    // Prisma Json can contain mixed types
    const mixed = ['valid', 42, null, true, 'also-valid', { key: 'val' }] as unknown as import('@prisma/client/runtime/library').JsonValue;
    const result = parseJsonStringArray(mixed);
    expect(result).toEqual(['valid', 'also-valid']);
  });

  it('returns empty array for array with no strings', () => {
    const result = parseJsonStringArray([1, 2, 3]);
    expect(result).toEqual([]);
  });

  it('handles empty array', () => {
    expect(parseJsonStringArray([])).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // String inputs (JSON-encoded arrays)
  // -----------------------------------------------------------------------

  it('parses a JSON-encoded string array', () => {
    const result = parseJsonStringArray('["lumbar spine", "cervical spine"]');
    expect(result).toEqual(['lumbar spine', 'cervical spine']);
  });

  it('filters non-string items from parsed JSON string', () => {
    const result = parseJsonStringArray('["valid", 42, null]');
    expect(result).toEqual(['valid']);
  });

  it('returns empty array for invalid JSON string', () => {
    const result = parseJsonStringArray('not valid json');
    expect(result).toEqual([]);
  });

  it('returns empty array when JSON string parses to non-array', () => {
    const result = parseJsonStringArray('{"key": "value"}');
    expect(result).toEqual([]);
  });

  it('returns empty array for JSON string that parses to a string', () => {
    const result = parseJsonStringArray('"just a string"');
    expect(result).toEqual([]);
  });

  it('returns empty array for JSON string that parses to a number', () => {
    const result = parseJsonStringArray('42');
    expect(result).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Non-array, non-string, non-null inputs
  // -----------------------------------------------------------------------

  it('returns empty array for number input', () => {
    expect(parseJsonStringArray(42)).toEqual([]);
  });

  it('returns empty array for boolean input', () => {
    expect(parseJsonStringArray(true)).toEqual([]);
  });

  it('returns empty array for object input', () => {
    expect(parseJsonStringArray({ key: 'val' })).toEqual([]);
  });
});

// ==========================================================================
// toJsonStringArray
// ==========================================================================

describe('toJsonStringArray', () => {
  it('converts string array to JsonValue', () => {
    const result = toJsonStringArray(['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('handles empty array', () => {
    const result = toJsonStringArray([]);
    expect(result).toEqual([]);
  });

  it('preserves array identity (cast, not copy)', () => {
    const input = ['x', 'y'];
    const result = toJsonStringArray(input);
    expect(result).toBe(input);
  });
});
