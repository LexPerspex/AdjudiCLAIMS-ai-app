/**
 * Tests for graph traversal service.
 *
 * Covers BFS traversal (depth 1/2, bidirectional), confidence filtering,
 * maxNodes limits, nodeType/edgeType filtering, keyword node search
 * (canonical + aliases), and claim graph summary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockGraphNodeFindFirst = vi.fn();
const mockGraphNodeFindMany = vi.fn();
const mockGraphNodeGroupBy = vi.fn();
const mockGraphEdgeFindMany = vi.fn();
const mockGraphEdgeCount = vi.fn();
const mockGraphMaturityFindUnique = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    graphNode: {
      findFirst: (...args: unknown[]) => mockGraphNodeFindFirst(...args) as unknown,
      findMany: (...args: unknown[]) => mockGraphNodeFindMany(...args) as unknown,
      groupBy: (...args: unknown[]) => mockGraphNodeGroupBy(...args) as unknown,
    },
    graphEdge: {
      findMany: (...args: unknown[]) => mockGraphEdgeFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockGraphEdgeCount(...args) as unknown,
    },
    graphMaturity: {
      findUnique: (...args: unknown[]) => mockGraphMaturityFindUnique(...args) as unknown,
    },
  },
}));

// Dynamic import after mock is in place
const {
  traverseFromNode,
  findNodesByQuery,
  getClaimGraphSummary,
} = await import('../../../server/services/graph/graph-traversal.service.js');

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CLAIM_ID = 'claim-test-1';

function makeNode(overrides: {
  id: string;
  canonicalName: string;
  nodeType?: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
}) {
  return {
    id: overrides.id,
    claimId: CLAIM_ID,
    nodeType: overrides.nodeType ?? 'PERSON',
    canonicalName: overrides.canonicalName,
    aliases: overrides.aliases ?? [],
    properties: overrides.properties ?? {},
    confidence: 0.9,
    humanVerified: false,
    locked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(overrides: {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType?: string;
  confidence?: number;
  weight?: number;
}) {
  return {
    id: overrides.id,
    claimId: CLAIM_ID,
    edgeType: overrides.edgeType ?? 'MENTIONS',
    sourceNodeId: overrides.sourceNodeId,
    targetNodeId: overrides.targetNodeId,
    confidence: overrides.confidence ?? 0.8,
    weight: overrides.weight ?? 1.0,
    properties: {},
    traversalCount: 0,
    lastTraversedAt: null,
    contradictionStatus: 'NONE',
    humanVerified: false,
    locked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// traverseFromNode
// ---------------------------------------------------------------------------

describe('traverseFromNode', () => {
  it('returns empty subgraph when no startNodeId provided', async () => {
    const result = await traverseFromNode(CLAIM_ID, {});
    expect(result).toEqual({ nodes: [], edges: [] });
    expect(mockGraphNodeFindFirst).not.toHaveBeenCalled();
  });

  it('returns empty subgraph when start node not found', async () => {
    mockGraphNodeFindFirst.mockResolvedValue(null);

    const result = await traverseFromNode(CLAIM_ID, { startNodeId: 'nonexistent' });
    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it('performs BFS at depth 1', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith' });
    const nodeB = makeNode({ id: 'b', canonicalName: 'John Doe' });
    const edgeAB = makeEdge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', edgeType: 'TREATS' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    // Depth 1: edges from frontier ['a']
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeAB]);
    // Fetch neighbor nodes
    mockGraphNodeFindMany.mockResolvedValueOnce([nodeB]);
    // Depth 2: edges from frontier ['b'] — empty
    mockGraphEdgeFindMany.mockResolvedValueOnce([]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      maxDepth: 2,
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({ id: 'a', depth: 0 });
    expect(result.nodes[1]).toMatchObject({ id: 'b', depth: 1 });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ id: 'e1', edgeType: 'TREATS' });
  });

  it('performs BFS at depth 2', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith' });
    const nodeB = makeNode({ id: 'b', canonicalName: 'John Doe' });
    const nodeC = makeNode({ id: 'c', canonicalName: 'Lumbar Spine', nodeType: 'BODY_PART' });
    const edgeAB = makeEdge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' });
    const edgeBC = makeEdge({ id: 'e2', sourceNodeId: 'b', targetNodeId: 'c' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    // Depth 1: edges from ['a']
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeAB]);
    mockGraphNodeFindMany.mockResolvedValueOnce([nodeB]);
    // Depth 2: edges from ['b']
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeBC]);
    mockGraphNodeFindMany.mockResolvedValueOnce([nodeC]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      maxDepth: 2,
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[2]).toMatchObject({ id: 'c', depth: 2 });
    expect(result.edges).toHaveLength(2);
  });

  it('filters edges by minConfidence', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    // No edges pass confidence filter — Prisma where clause filters them
    mockGraphEdgeFindMany.mockResolvedValueOnce([]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      minConfidence: 0.9,
      maxDepth: 1,
    });

    // Check that Prisma was called with the confidence filter
    expect(mockGraphEdgeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          confidence: { gte: 0.9 },
        }),
      }),
    );

    // Only the start node
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it('respects maxNodes limit', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Start' });
    const nodeB = makeNode({ id: 'b', canonicalName: 'Node B' });
    const nodeC = makeNode({ id: 'c', canonicalName: 'Node C' });
    const edgeAB = makeEdge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' });
    const edgeAC = makeEdge({ id: 'e2', sourceNodeId: 'a', targetNodeId: 'c' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    // Depth 1: two edges from 'a'
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeAB, edgeAC]);
    // Return both neighbor nodes, but maxNodes=2 should cap at 2 total
    mockGraphNodeFindMany.mockResolvedValueOnce([nodeB, nodeC]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      maxNodes: 2,
      maxDepth: 1,
    });

    // Start node (1) + 1 neighbor = 2 max
    expect(result.nodes).toHaveLength(2);
  });

  it('filters by nodeTypes', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith', nodeType: 'PERSON' });
    const nodeB = makeNode({ id: 'b', canonicalName: 'Lumbar Spine', nodeType: 'BODY_PART' });
    const edgeAB = makeEdge({ id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeAB]);
    // Prisma filters by nodeType — only PERSON nodes match
    mockGraphNodeFindMany.mockResolvedValueOnce([]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      nodeTypes: ['PERSON'] as any,
      maxDepth: 1,
    });

    // Only the start node (PERSON), BODY_PART filtered out by Prisma
    expect(result.nodes).toHaveLength(1);
    expect(mockGraphNodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nodeType: { in: ['PERSON'] },
        }),
      }),
    );
  });

  it('filters by edgeTypes', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    mockGraphEdgeFindMany.mockResolvedValueOnce([]);

    await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      edgeTypes: ['TREATS', 'DIAGNOSES'] as any,
      maxDepth: 1,
    });

    expect(mockGraphEdgeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          edgeType: { in: ['TREATS', 'DIAGNOSES'] },
        }),
      }),
    );
  });

  it('handles bidirectional edge traversal', async () => {
    // Node B has an edge pointing TO node A (incoming from A's perspective)
    const nodeA = makeNode({ id: 'a', canonicalName: 'Dr. Smith' });
    const nodeB = makeNode({ id: 'b', canonicalName: 'John Doe' });
    // Edge direction: B -> A (so from A, B is found via incoming edge)
    const edgeBA = makeEdge({ id: 'e1', sourceNodeId: 'b', targetNodeId: 'a' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    mockGraphEdgeFindMany.mockResolvedValueOnce([edgeBA]);
    mockGraphNodeFindMany.mockResolvedValueOnce([nodeB]);
    mockGraphEdgeFindMany.mockResolvedValueOnce([]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      maxDepth: 2,
    });

    // Should find nodeB via the incoming edge
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({ id: 'b', depth: 1 });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ sourceNodeId: 'b', targetNodeId: 'a' });
  });

  it('returns empty subgraph for empty graph', async () => {
    const nodeA = makeNode({ id: 'a', canonicalName: 'Lonely Node' });

    mockGraphNodeFindFirst.mockResolvedValue(nodeA);
    mockGraphEdgeFindMany.mockResolvedValueOnce([]);

    const result = await traverseFromNode(CLAIM_ID, {
      startNodeId: 'a',
      maxDepth: 2,
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({ id: 'a', depth: 0 });
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findNodesByQuery
// ---------------------------------------------------------------------------

describe('findNodesByQuery', () => {
  it('matches canonical names', async () => {
    const nodes = [
      { id: 'n1', nodeType: 'PERSON', canonicalName: 'Dr. Robert Smith', aliases: [] },
      { id: 'n2', nodeType: 'BODY_PART', canonicalName: 'Lumbar Spine', aliases: [] },
    ];
    mockGraphNodeFindMany.mockResolvedValue(nodes);

    const results = await findNodesByQuery(CLAIM_ID, 'robert smith');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      nodeId: 'n1',
      canonicalName: 'Dr. Robert Smith',
      relevance: 1.0, // both tokens match
    });
  });

  it('matches aliases', async () => {
    const nodes = [
      {
        id: 'n1',
        nodeType: 'PERSON',
        canonicalName: 'Robert Smith MD',
        aliases: ['Dr. Bob Smith', 'R. Smith'],
      },
    ];
    mockGraphNodeFindMany.mockResolvedValue(nodes);

    const results = await findNodesByQuery(CLAIM_ID, 'bob smith');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      nodeId: 'n1',
      relevance: 1.0, // 'bob' in alias, 'smith' in both
    });
  });

  it('returns results sorted by relevance descending', async () => {
    const nodes = [
      { id: 'n1', nodeType: 'PERSON', canonicalName: 'John Doe', aliases: [] },
      { id: 'n2', nodeType: 'PERSON', canonicalName: 'John Robert Smith', aliases: [] },
    ];
    mockGraphNodeFindMany.mockResolvedValue(nodes);

    const results = await findNodesByQuery(CLAIM_ID, 'john robert');

    expect(results).toHaveLength(2);
    // n2 matches both tokens (john + robert), n1 matches only john
    expect(results[0]!.nodeId).toBe('n2');
    expect(results[0]!.relevance).toBe(1.0);
    expect(results[1]!.nodeId).toBe('n1');
    expect(results[1]!.relevance).toBe(0.5);
  });

  it('ignores tokens shorter than 3 characters', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      { id: 'n1', nodeType: 'PERSON', canonicalName: 'Dr. Smith', aliases: [] },
    ]);

    // 'dr' is 2 chars, filtered out. Only 'smith' used.
    const results = await findNodesByQuery(CLAIM_ID, 'dr smith');

    expect(results).toHaveLength(1);
    expect(results[0]!.relevance).toBe(1.0); // 1 token matches out of 1
  });

  it('returns empty for query with all short tokens', async () => {
    const results = await findNodesByQuery(CLAIM_ID, 'dr md');

    expect(results).toEqual([]);
    // Should not even query Prisma
    expect(mockGraphNodeFindMany).not.toHaveBeenCalled();
  });

  it('returns empty when no nodes match', async () => {
    mockGraphNodeFindMany.mockResolvedValue([
      { id: 'n1', nodeType: 'PERSON', canonicalName: 'Dr. Smith', aliases: [] },
    ]);

    const results = await findNodesByQuery(CLAIM_ID, 'lumbar spine');

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getClaimGraphSummary
// ---------------------------------------------------------------------------

describe('getClaimGraphSummary', () => {
  it('returns correct counts and maturity', async () => {
    mockGraphNodeGroupBy.mockResolvedValue([
      { nodeType: 'PERSON', _count: { id: 5 } },
      { nodeType: 'BODY_PART', _count: { id: 3 } },
      { nodeType: 'DOCUMENT', _count: { id: 10 } },
    ]);
    mockGraphEdgeCount.mockResolvedValue(25);
    mockGraphMaturityFindUnique.mockResolvedValue({
      id: 'mat-1',
      claimId: CLAIM_ID,
      overallScore: 0.65,
      maturityLabel: 'MATURE',
    });

    const summary = await getClaimGraphSummary(CLAIM_ID);

    expect(summary).toEqual({
      totalNodes: 18,
      totalEdges: 25,
      nodeTypeCounts: {
        PERSON: 5,
        BODY_PART: 3,
        DOCUMENT: 10,
      },
      maturityLabel: 'MATURE',
      maturityScore: 0.65,
    });
  });

  it('returns NASCENT defaults when no maturity record exists', async () => {
    mockGraphNodeGroupBy.mockResolvedValue([]);
    mockGraphEdgeCount.mockResolvedValue(0);
    mockGraphMaturityFindUnique.mockResolvedValue(null);

    const summary = await getClaimGraphSummary(CLAIM_ID);

    expect(summary).toEqual({
      totalNodes: 0,
      totalEdges: 0,
      nodeTypeCounts: {},
      maturityLabel: 'NASCENT',
      maturityScore: 0,
    });
  });
});
