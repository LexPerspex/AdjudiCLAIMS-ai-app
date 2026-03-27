/**
 * Utilities for handling JSON-stored string arrays.
 *
 * PlanetScale (MySQL) does not support PostgreSQL's native String[] type.
 * These fields are stored as Json and parsed at the application layer:
 * - Claim.bodyParts
 * - EducationProfile.dismissedTerms
 * - EducationProfile.acknowledgedChanges
 */
import type { JsonValue } from '@prisma/client/runtime/library';

/**
 * Parse a Prisma Json field that stores a string array.
 * Returns an empty array for null/undefined/invalid values.
 */
export function parseJsonStringArray(value: JsonValue | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Convert a string array to a JsonValue for Prisma Json field storage.
 */
export function toJsonStringArray(values: string[]): JsonValue {
  return values as unknown as JsonValue;
}
