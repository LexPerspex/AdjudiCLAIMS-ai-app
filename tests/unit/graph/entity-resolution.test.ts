/**
 * Tests for graph entity resolution service.
 *
 * Covers Levenshtein distance, exact matching (canonicalName + aliases),
 * fuzzy matching, short-name exclusion, case-insensitivity, claim/type
 * scoping, and batch resolution with intra-batch deduplication.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockGraphNodeFindMany = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    graphNode: {
      findMany: (...args: unknown[]) => mockGraphNodeFindMany(...args) as unknown,
    },
  },
}));

// Dynamic import after mock is in place
const {
  levenshteinDistance,
  resolveEntity,
  resolveAndMerge,
} = await import('../../../server/services/graph/entity-resolution.service.js');

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CLAIM_ID = 'claim-test-1';

function makeNode(overrides: {
  id?: string;
  canonicalName: string;
  aliases?: string[];
  nodeType?: string;
}) {
  return {
    id: overrides.id ?? `node-${overrides.canonicalName.toLowerCase().replace(/\s/g, '-')}`,
    canonicalName: overrides.canonicalName,
    aliases: overrides.aliases ?? [],
    nodeType: overrides.nodeType ?? 'PERSON',
    claimId: CLAIM_ID,
    properties: {},
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('handles single insertion', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1);
  });

  it('handles single deletion', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1);
  });

  it('handles single substitution', () => {
    expect(levenshteinDistance('abc', 'aXc')).toBe(1);
  });

  it('handles multiple edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('foo', 'bar')).toBe(levenshteinDistance('bar', 'foo'));
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — exact match on canonicalName
// ---------------------------------------------------------------------------

describe('resolveEntity — exact match on canonicalName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches exact canonicalName (case-insensitive)', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'John Smith' }),
    ]);

    const result = await resolveEntity('john smith', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('exact');
    expect(result.matchConfidence).toBe(0.95);
    expect(result.existingNodeId).toBe('node-john-smith');
    expect(result.resolvedName).toBe('John Smith');
  });

  it('trims whitespace before matching', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'John Smith' }),
    ]);

    const result = await resolveEntity('  John Smith  ', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('exact');
    expect(result.existingNodeId).toBe('node-john-smith');
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — exact match on alias
// ---------------------------------------------------------------------------

describe('resolveEntity — exact match on alias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches an alias (case-insensitive)', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({
        id: 'node-js',
        canonicalName: 'John Smith',
        aliases: ['J. Smith', 'Johnny Smith'],
      }),
    ]);

    const result = await resolveEntity('j. smith', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('exact');
    expect(result.matchConfidence).toBe(0.95);
    expect(result.existingNodeId).toBe('node-js');
    expect(result.resolvedName).toBe('John Smith');
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — fuzzy match
// ---------------------------------------------------------------------------

describe('resolveEntity — fuzzy match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches with Levenshtein distance ≤ 2', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'Robert Johnson' }),
    ]);

    // "Robrt Johnson" → distance 1 from "Robert Johnson" (missing 'e')
    const result = await resolveEntity('Robrt Johnson', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('fuzzy');
    expect(result.matchConfidence).toBe(0.70);
    expect(result.existingNodeId).toBe('node-robert-johnson');
    expect(result.resolvedName).toBe('Robert Johnson');
  });

  it('does not match when Levenshtein distance > 2', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'Robert Johnson' }),
    ]);

    const result = await resolveEntity('Bobby Johnsonn', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('new');
    expect(result.existingNodeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — short name fuzzy exclusion
// ---------------------------------------------------------------------------

describe('resolveEntity — short names skip fuzzy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fuzzy match names shorter than 5 characters', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'John' }),
    ]);

    // "Jonh" is distance 1 from "John", but "Jonh" is 4 chars → no fuzzy
    const result = await resolveEntity('Jonh', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('new');
    expect(result.existingNodeId).toBeNull();
  });

  it('does fuzzy match names with exactly 5 characters', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'James' }),
    ]);

    // "Janes" is distance 1 from "James"
    const result = await resolveEntity('Janes', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('fuzzy');
    expect(result.matchConfidence).toBe(0.70);
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — scoping
// ---------------------------------------------------------------------------

describe('resolveEntity — scoped to claimId + nodeType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with correct claimId and nodeType', async () => {
    mockGraphNodeFindMany.mockResolvedValue([]);

    await resolveEntity('Acme Corp', 'ORGANIZATION', 'claim-42');

    expect(mockGraphNodeFindMany).toHaveBeenCalledWith({
      where: { claimId: 'claim-42', nodeType: 'ORGANIZATION' },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — no match
// ---------------------------------------------------------------------------

describe('resolveEntity — no match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns new when no existing nodes', async () => {
    mockGraphNodeFindMany.mockResolvedValue([]);

    const result = await resolveEntity('New Person', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('new');
    expect(result.matchConfidence).toBe(0);
    expect(result.existingNodeId).toBeNull();
    expect(result.resolvedName).toBe('New Person');
  });

  it('returns new when no matching nodes exist', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'Completely Different' }),
    ]);

    const result = await resolveEntity('Another Entity', 'PERSON', CLAIM_ID);

    expect(result.matchTier).toBe('new');
    expect(result.existingNodeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveAndMerge — batch resolution
// ---------------------------------------------------------------------------

describe('resolveAndMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves multiple candidates', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      makeNode({ canonicalName: 'John Smith' }),
    ]);

    const results = await resolveAndMerge(
      [
        { name: 'John Smith', nodeType: 'PERSON' as const },
        { name: 'Jane Doe', nodeType: 'PERSON' as const },
      ],
      CLAIM_ID,
    );

    expect(results).toHaveLength(2);
    expect(results[0].resolution.matchTier).toBe('exact');
    expect(results[1].resolution.matchTier).toBe('new');
  });

  it('deduplicates within the same batch', async () => {
    mockGraphNodeFindMany.mockResolvedValue([]);

    const results = await resolveAndMerge(
      [
        { name: 'Dr. Maria Garcia', nodeType: 'PERSON' as const },
        { name: 'Dr. Maria Garcia', nodeType: 'PERSON' as const },
      ],
      CLAIM_ID,
    );

    expect(results).toHaveLength(2);
    // First is new
    expect(results[0].resolution.matchTier).toBe('new');
    // Second should match the first (now in cache)
    expect(results[1].resolution.matchTier).toBe('exact');
    expect(results[1].resolution.existingNodeId).toContain('pending-');
  });

  it('handles mixed node types in a batch', async () => {
    mockGraphNodeFindMany.mockImplementation(({ where }: { where: { nodeType: string } }) => {
      if (where.nodeType === 'PERSON') {
        return Promise.resolve([makeNode({ canonicalName: 'John Smith' })]);
      }
      return Promise.resolve([]);
    });

    const results = await resolveAndMerge(
      [
        { name: 'John Smith', nodeType: 'PERSON' as const },
        { name: 'Acme Corp', nodeType: 'ORGANIZATION' as const },
      ],
      CLAIM_ID,
    );

    expect(results[0].resolution.matchTier).toBe('exact');
    expect(results[1].resolution.matchTier).toBe('new');
    // Should have queried for both node types
    expect(mockGraphNodeFindMany).toHaveBeenCalledTimes(2);
  });
});
