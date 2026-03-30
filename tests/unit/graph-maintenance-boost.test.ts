import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for G6 usage-based confidence boost functions in graph-maintenance.service.ts.
 *
 * Covers:
 *   1. boostEdgeConfidence — caps at 1.0, skips locked/human-verified
 *   2. recordQueryTraversal — updates timestamps, applies 0.02 boost per traversal
 *   3. runHebbianDecay — recently-traversed edges decay at half rate
 */

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockGraphEdgeFindUnique = vi.fn();
const mockGraphEdgeUpdate = vi.fn();
const mockGraphEdgeFindMany = vi.fn();
const mockGraphEdgeUpdateMany = vi.fn();
const mockGraphNodeGroupBy = vi.fn();
const mockGraphNodeFindMany = vi.fn();
const mockGraphNodeUpdate = vi.fn();
const mockGraphNodeDelete = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    graphEdge: {
      findUnique: (...args: unknown[]): unknown => mockGraphEdgeFindUnique(...args),
      update: (...args: unknown[]): unknown => mockGraphEdgeUpdate(...args),
      findMany: (...args: unknown[]): unknown => mockGraphEdgeFindMany(...args),
      updateMany: (...args: unknown[]): unknown => mockGraphEdgeUpdateMany(...args),
    },
    graphNode: {
      groupBy: (...args: unknown[]): unknown => mockGraphNodeGroupBy(...args),
      findMany: (...args: unknown[]): unknown => mockGraphNodeFindMany(...args),
      update: (...args: unknown[]): unknown => mockGraphNodeUpdate(...args),
      delete: (...args: unknown[]): unknown => mockGraphNodeDelete(...args),
    },
  },
}));

import {
  boostEdgeConfidence,
  recordQueryTraversal,
  runHebbianDecay,
} from '../../server/services/graph-maintenance.service.js';

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphEdgeUpdate.mockResolvedValue({});
  mockGraphEdgeUpdateMany.mockResolvedValue({ count: 0 });
  mockGraphNodeGroupBy.mockResolvedValue([]);
  mockGraphNodeFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// 1. boostEdgeConfidence
// ---------------------------------------------------------------------------

describe('boostEdgeConfidence', () => {
  it('applies the default boost of 0.05 to an unlocked edge', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-1',
      confidence: 0.7,
      locked: false,
      humanVerified: false,
    });

    await boostEdgeConfidence('edge-1');

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'edge-1' },
        data: expect.objectContaining({
          confidence: 0.75,
        }) as unknown,
      }),
    );
  });

  it('applies a custom boost amount', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-2',
      confidence: 0.5,
      locked: false,
      humanVerified: false,
    });

    await boostEdgeConfidence('edge-2', 0.1);

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 0.6,
        }) as unknown,
      }),
    );
  });

  it('caps confidence at 1.0 when boost would exceed maximum', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-3',
      confidence: 0.98,
      locked: false,
      humanVerified: false,
    });

    await boostEdgeConfidence('edge-3', 0.05);

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 1.0,
        }) as unknown,
      }),
    );
  });

  it('does NOT update a locked edge', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-locked',
      confidence: 0.8,
      locked: true,
      humanVerified: false,
    });

    await boostEdgeConfidence('edge-locked');

    expect(mockGraphEdgeUpdate).not.toHaveBeenCalled();
  });

  it('does NOT update a human-verified edge', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-verified',
      confidence: 0.9,
      locked: false,
      humanVerified: true,
    });

    await boostEdgeConfidence('edge-verified');

    expect(mockGraphEdgeUpdate).not.toHaveBeenCalled();
  });

  it('returns without error when edge does not exist', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue(null);

    await expect(boostEdgeConfidence('nonexistent')).resolves.toBeUndefined();
    expect(mockGraphEdgeUpdate).not.toHaveBeenCalled();
  });

  it('handles edge at exactly 1.0 confidence without exceeding it', async () => {
    mockGraphEdgeFindUnique.mockResolvedValue({
      id: 'edge-max',
      confidence: 1.0,
      locked: false,
      humanVerified: false,
    });

    await boostEdgeConfidence('edge-max', 0.1);

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 1.0,
        }) as unknown,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. recordQueryTraversal
// ---------------------------------------------------------------------------

describe('recordQueryTraversal', () => {
  it('applies 0.02 confidence boost to each traversed edge', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-1', confidence: 0.6 },
      { id: 'e-2', confidence: 0.8 },
    ]);

    await recordQueryTraversal('claim-1', ['e-1', 'e-2']);

    // Should update both edges with 0.02 boost
    expect(mockGraphEdgeUpdate).toHaveBeenCalledTimes(2);

    // Verify e-1 and e-2 were each updated with the correct confidence
    const calls = mockGraphEdgeUpdate.mock.calls as Array<[{ where: { id: string }; data: { confidence: number } }]>;
    const e1Call = calls.find((c) => c[0].where.id === 'e-1');
    const e2Call = calls.find((c) => c[0].where.id === 'e-2');

    expect(e1Call).toBeDefined();
    expect(e2Call).toBeDefined();

    // First edge: 0.6 + 0.02 = 0.62
    expect(e1Call![0].data.confidence).toBeCloseTo(0.62, 10);

    // Second edge: 0.8 + 0.02 = 0.82
    expect(e2Call![0].data.confidence).toBeCloseTo(0.82, 10);
  });

  it('updates lastTraversedAt timestamp on traversed edges', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-1', confidence: 0.5 },
    ]);

    await recordQueryTraversal('claim-1', ['e-1']);

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastTraversedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
    );
  });

  it('caps confidence at 1.0 during traversal boost', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-near-max', confidence: 0.995 },
    ]);

    await recordQueryTraversal('claim-1', ['e-near-max']);

    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidence: 1.0,
        }) as unknown,
      }),
    );
  });

  it('returns immediately with empty edgeIds array', async () => {
    await recordQueryTraversal('claim-1', []);

    expect(mockGraphEdgeFindMany).not.toHaveBeenCalled();
    expect(mockGraphEdgeUpdate).not.toHaveBeenCalled();
  });

  it('timestamps locked/human-verified edges without boosting confidence', async () => {
    // findMany (excludes locked/verified) returns only unlocked edge
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-unlocked', confidence: 0.5 },
    ]);

    // 'e-locked' is not in findMany result, so it gets updateMany (timestamp only)
    await recordQueryTraversal('claim-1', ['e-unlocked', 'e-locked']);

    // updateMany called for the locked edge (timestamp only)
    expect(mockGraphEdgeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['e-locked'] } },
        data: expect.objectContaining({
          lastTraversedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
    );
  });

  it('does not call updateMany when all edges are in the unlocked set', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-1', confidence: 0.4 },
      { id: 'e-2', confidence: 0.6 },
    ]);

    await recordQueryTraversal('claim-1', ['e-1', 'e-2']);

    // No locked edges → updateMany should not be called
    expect(mockGraphEdgeUpdateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. runHebbianDecay — recently-traversed edges decay at half rate
// ---------------------------------------------------------------------------

describe('runHebbianDecay — reduced decay for recently-traversed edges', () => {
  const NOW = new Date('2026-03-30T12:00:00Z');
  const RECENT = new Date('2026-03-15T12:00:00Z'); // within 30 days
  const STALE = new Date('2026-01-01T12:00:00Z');   // older than 30 days

  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('applies full decay rate (0.05) to stale edges', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'stale-1', confidence: 0.8, weight: 0.8, lastTraversedAt: STALE },
    ]);

    await runHebbianDecay({ decayRate: 0.05 });

    // 0.8 * (1 - 0.05) = 0.76
    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stale-1' },
        data: expect.objectContaining({
          confidence: 0.76,
          weight: 0.76,
        }) as unknown,
      }),
    );
  });

  it('applies half decay rate (0.025) to recently-traversed edges', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'recent-1', confidence: 0.8, weight: 0.8, lastTraversedAt: RECENT },
    ]);

    await runHebbianDecay({ decayRate: 0.05 });

    // 0.8 * (1 - 0.025) = 0.78
    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recent-1' },
        data: expect.objectContaining({
          confidence: 0.78,
          weight: 0.78,
        }) as unknown,
      }),
    );
  });

  it('applies full decay to edges with null lastTraversedAt', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'never-1', confidence: 0.6, weight: 0.6, lastTraversedAt: null },
    ]);

    await runHebbianDecay({ decayRate: 0.1 });

    // 0.6 * (1 - 0.1) = 0.54
    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'never-1' },
        data: expect.objectContaining({
          confidence: 0.54,
        }) as unknown,
      }),
    );
  });

  it('prunes edges that drop below minConfidence after decay', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'low-1', confidence: 0.105, weight: 0.105, lastTraversedAt: STALE },
    ]);

    await runHebbianDecay({ decayRate: 0.05, minConfidence: 0.1 });

    // 0.105 * 0.95 = 0.09975 < 0.1 → pruned
    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'low-1' },
        data: expect.objectContaining({
          confidence: 0,
          weight: 0,
        }) as unknown,
      }),
    );
  });

  it('does NOT prune recently-traversed edges that would drop below threshold with full rate but not half rate', async () => {
    // With full decay (0.1): 0.105 * 0.9 = 0.0945 < 0.1 → would prune
    // With half decay (0.05): 0.105 * 0.95 = 0.09975 < 0.1 → still pruned at half too
    // So test a case where half rate saves the edge:
    // With full decay (0.2): 0.13 * 0.8 = 0.104 > 0.1 → won't prune
    // Let's use: confidence = 0.115, decayRate = 0.15
    // Full: 0.115 * 0.85 = 0.09775 < 0.1 → would prune
    // Half: 0.115 * 0.925 = 0.106375 > 0.1 → saved
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'borderline', confidence: 0.115, weight: 0.115, lastTraversedAt: RECENT },
    ]);

    await runHebbianDecay({ decayRate: 0.15, minConfidence: 0.1 });

    // Half rate: 0.115 * (1 - 0.075) = 0.115 * 0.925 ≈ 0.10638 — above threshold, not pruned
    const updateCall = mockGraphEdgeUpdate.mock.calls[0] as [unknown, ...unknown[]];
    const updateArg = updateCall[0] as { data: { confidence: number } };
    expect(updateArg.data.confidence).toBeGreaterThan(0.1);
    expect(updateArg.data.confidence).not.toBe(0);
  });

  it('returns correct counts of decayed and pruned edges', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([
      { id: 'e-1', confidence: 0.8, weight: 0.8, lastTraversedAt: STALE },
      { id: 'e-2', confidence: 0.8, weight: 0.8, lastTraversedAt: RECENT },
      { id: 'e-3', confidence: 0.05, weight: 0.05, lastTraversedAt: STALE }, // will be pruned
    ]);

    const result = await runHebbianDecay({ decayRate: 0.05, minConfidence: 0.1 });

    expect(result.edgesDecayed).toBe(2);
    expect(result.edgesPruned).toBe(1);
  });

  it('returns zero counts when no edges exist', async () => {
    mockGraphEdgeFindMany.mockResolvedValue([]);

    const result = await runHebbianDecay();

    expect(result.edgesDecayed).toBe(0);
    expect(result.edgesPruned).toBe(0);
  });
});
