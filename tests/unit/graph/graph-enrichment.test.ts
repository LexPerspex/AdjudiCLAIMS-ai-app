/**
 * Unit tests for the Graph Enrichment Orchestrator.
 *
 * Tests the orchestration of entity extraction, resolution, and persistence
 * into the claim knowledge graph.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDocumentFindUnique = vi.fn();
const mockGraphNodeCreate = vi.fn();
const mockGraphNodeFindUnique = vi.fn();
const mockGraphNodeUpdate = vi.fn();
const mockGraphEdgeCreate = vi.fn();
const mockGraphEdgeFindFirst = vi.fn();
const mockGraphEdgeUpdate = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args) as unknown,
    },
    graphNode: {
      create: (...args: unknown[]) => mockGraphNodeCreate(...args) as unknown,
      findUnique: (...args: unknown[]) => mockGraphNodeFindUnique(...args) as unknown,
      update: (...args: unknown[]) => mockGraphNodeUpdate(...args) as unknown,
    },
    graphEdge: {
      create: (...args: unknown[]) => mockGraphEdgeCreate(...args) as unknown,
      findFirst: (...args: unknown[]) => mockGraphEdgeFindFirst(...args) as unknown,
      update: (...args: unknown[]) => mockGraphEdgeUpdate(...args) as unknown,
    },
  },
}));

const mockExtractEntities = vi.fn();
vi.mock('../../../server/services/graph/entity-extraction.service.js', () => ({
  extractEntities: (...args: unknown[]) => mockExtractEntities(...args) as unknown,
}));

const mockResolveAndMerge = vi.fn();
vi.mock('../../../server/services/graph/entity-resolution.service.js', () => ({
  resolveAndMerge: (...args: unknown[]) => mockResolveAndMerge(...args) as unknown,
}));

const mockNoisyOr = vi.fn();
vi.mock('../../../server/services/graph/confidence.js', () => ({
  noisyOr: (...args: unknown[]) => mockNoisyOr(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { enrichGraph } from '../../../server/services/graph/graph-enrichment.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidateNode(overrides: Record<string, unknown> = {}) {
  return {
    nodeType: 'PERSON',
    canonicalName: 'John Doe',
    properties: {},
    sourceDocumentId: 'doc-1',
    confidence: 0.85,
    sourceFieldName: 'applicant_name',
    ...overrides,
  };
}

function makeCandidateEdge(overrides: Record<string, unknown> = {}) {
  return {
    edgeType: 'TREATED_BY',
    sourceNodeKey: 'John Doe',
    targetNodeKey: 'Dr. Smith',
    properties: {},
    sourceDocumentId: 'doc-1',
    confidence: 0.9,
    sourceFieldName: 'treating_physician',
    ...overrides,
  };
}

function makeResolvedNode(
  candidateName: string,
  matchTier: 'new' | 'exact' | 'fuzzy',
  existingNodeId: string | null = null,
) {
  return {
    candidateNode: { name: candidateName, nodeType: 'PERSON' },
    resolution: {
      existingNodeId,
      matchTier,
      matchConfidence: matchTier === 'exact' ? 0.95 : matchTier === 'fuzzy' ? 0.7 : 0,
      resolvedName: candidateName,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrichGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: document exists
    mockDocumentFindUnique.mockResolvedValue({ claimId: 'claim-1' });

    // Default: noisyOr returns 0.9
    mockNoisyOr.mockReturnValue(0.9);
  });

  // -------------------------------------------------------------------------
  // No candidates → returns zeros
  // -------------------------------------------------------------------------

  it('returns zeros when there are no candidate nodes or edges', async () => {
    mockExtractEntities.mockResolvedValue({
      candidateNodes: [],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });

    const result = await enrichGraph('doc-1');

    expect(result).toEqual({
      documentId: 'doc-1',
      nodesCreated: 0,
      nodesUpdated: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      errors: [],
    });
    // Should not even look up the document or call resolution
    expect(mockDocumentFindUnique).not.toHaveBeenCalled();
    expect(mockResolveAndMerge).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // New nodes created
  // -------------------------------------------------------------------------

  it('creates new graph nodes for candidates with matchTier "new"', async () => {
    mockExtractEntities.mockResolvedValue({
      candidateNodes: [makeCandidateNode()],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
    ]);
    mockGraphNodeCreate.mockResolvedValue({ id: 'node-1', canonicalName: 'John Doe' });

    const result = await enrichGraph('doc-1');

    expect(result.nodesCreated).toBe(1);
    expect(result.nodesUpdated).toBe(0);
    expect(mockGraphNodeCreate).toHaveBeenCalledOnce();
    expect(mockGraphNodeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimId: 'claim-1',
        nodeType: 'PERSON',
        canonicalName: 'John Doe',
        sourceDocumentIds: ['doc-1'],
        confidence: 0.85,
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Existing nodes updated with confidence merge
  // -------------------------------------------------------------------------

  it('updates existing nodes and merges confidence via noisyOr', async () => {
    mockExtractEntities.mockResolvedValue({
      candidateNodes: [makeCandidateNode({ canonicalName: 'Jon Doe' })],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'fuzzy', 'existing-node-1'),
    ]);
    mockGraphNodeFindUnique.mockResolvedValue({
      id: 'existing-node-1',
      canonicalName: 'John Doe',
      aliases: [],
      sourceDocumentIds: ['doc-0'],
      confidence: 0.7,
    });
    mockNoisyOr.mockReturnValue(0.955);
    mockGraphNodeUpdate.mockResolvedValue({});

    const result = await enrichGraph('doc-1');

    expect(result.nodesUpdated).toBe(1);
    expect(result.nodesCreated).toBe(0);
    expect(mockNoisyOr).toHaveBeenCalledWith([0.7, 0.85]);
    expect(mockGraphNodeUpdate).toHaveBeenCalledWith({
      where: { id: 'existing-node-1' },
      data: expect.objectContaining({
        confidence: 0.955,
        sourceDocumentIds: ['doc-0', 'doc-1'],
        aliases: ['Jon Doe'], // candidate name added as alias
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Edges created between resolved nodes
  // -------------------------------------------------------------------------

  it('creates edges when both source and target nodes exist', async () => {
    const nodeA = makeCandidateNode({ canonicalName: 'John Doe' });
    const nodeB = makeCandidateNode({ canonicalName: 'Dr. Smith', nodeType: 'PERSON' });
    const edge = makeCandidateEdge();

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [nodeA, nodeB],
      candidateEdges: [edge],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
      makeResolvedNode('Dr. Smith', 'new'),
    ]);
    mockGraphNodeCreate
      .mockResolvedValueOnce({ id: 'node-1', canonicalName: 'John Doe' })
      .mockResolvedValueOnce({ id: 'node-2', canonicalName: 'Dr. Smith' });
    mockGraphEdgeFindFirst.mockResolvedValue(null); // no existing edge
    mockGraphEdgeCreate.mockResolvedValue({ id: 'edge-1' });

    const result = await enrichGraph('doc-1');

    expect(result.edgesCreated).toBe(1);
    expect(result.edgesUpdated).toBe(0);
    expect(mockGraphEdgeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimId: 'claim-1',
        edgeType: 'TREATED_BY',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        sourceDocumentIds: ['doc-1'],
        confidence: 0.9,
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Existing edges updated with confidence merge
  // -------------------------------------------------------------------------

  it('updates existing edges and merges confidence via noisyOr', async () => {
    const nodeA = makeCandidateNode({ canonicalName: 'John Doe' });
    const nodeB = makeCandidateNode({ canonicalName: 'Dr. Smith' });
    const edge = makeCandidateEdge();

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [nodeA, nodeB],
      candidateEdges: [edge],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
      makeResolvedNode('Dr. Smith', 'new'),
    ]);
    mockGraphNodeCreate
      .mockResolvedValueOnce({ id: 'node-1', canonicalName: 'John Doe' })
      .mockResolvedValueOnce({ id: 'node-2', canonicalName: 'Dr. Smith' });

    // Existing edge found
    mockGraphEdgeFindFirst.mockResolvedValue({
      id: 'existing-edge-1',
      confidence: 0.6,
      sourceDocumentIds: ['doc-0'],
    });
    mockNoisyOr.mockReturnValue(0.96);
    mockGraphEdgeUpdate.mockResolvedValue({});

    const result = await enrichGraph('doc-1');

    expect(result.edgesUpdated).toBe(1);
    expect(result.edgesCreated).toBe(0);
    expect(mockNoisyOr).toHaveBeenCalledWith([0.6, 0.9]);
    expect(mockGraphEdgeUpdate).toHaveBeenCalledWith({
      where: { id: 'existing-edge-1' },
      data: expect.objectContaining({
        confidence: 0.96,
        sourceDocumentIds: ['doc-0', 'doc-1'],
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Edge skipped when source/target node not found
  // -------------------------------------------------------------------------

  it('skips edges when source or target node is not in the map', async () => {
    const nodeA = makeCandidateNode({ canonicalName: 'John Doe' });
    // Edge references a target that was never created
    const edge = makeCandidateEdge({
      sourceNodeKey: 'John Doe',
      targetNodeKey: 'Unknown Person',
    });

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [nodeA],
      candidateEdges: [edge],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
    ]);
    mockGraphNodeCreate.mockResolvedValue({ id: 'node-1', canonicalName: 'John Doe' });

    const result = await enrichGraph('doc-1');

    expect(result.edgesCreated).toBe(0);
    expect(result.edgesUpdated).toBe(0);
    expect(mockGraphEdgeCreate).not.toHaveBeenCalled();
    expect(mockGraphEdgeFindFirst).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Individual node failure → continues with others
  // -------------------------------------------------------------------------

  it('continues processing when an individual node creation fails', async () => {
    const nodeA = makeCandidateNode({ canonicalName: 'John Doe' });
    const nodeB = makeCandidateNode({ canonicalName: 'Jane Smith' });

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [nodeA, nodeB],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
      makeResolvedNode('Jane Smith', 'new'),
    ]);

    // First node fails, second succeeds
    mockGraphNodeCreate
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValueOnce({ id: 'node-2', canonicalName: 'Jane Smith' });

    const result = await enrichGraph('doc-1');

    expect(result.nodesCreated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('John Doe');
    expect(result.errors[0]).toContain('DB constraint violation');
  });

  // -------------------------------------------------------------------------
  // Individual edge failure → continues with others
  // -------------------------------------------------------------------------

  it('continues processing when an individual edge creation fails', async () => {
    const nodeA = makeCandidateNode({ canonicalName: 'John Doe' });
    const nodeB = makeCandidateNode({ canonicalName: 'Dr. Smith' });
    const nodeC = makeCandidateNode({ canonicalName: 'Dr. Jones' });
    const edge1 = makeCandidateEdge({
      sourceNodeKey: 'John Doe',
      targetNodeKey: 'Dr. Smith',
    });
    const edge2 = makeCandidateEdge({
      edgeType: 'TREATED_BY',
      sourceNodeKey: 'John Doe',
      targetNodeKey: 'Dr. Jones',
    });

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [nodeA, nodeB, nodeC],
      candidateEdges: [edge1, edge2],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('John Doe', 'new'),
      makeResolvedNode('Dr. Smith', 'new'),
      makeResolvedNode('Dr. Jones', 'new'),
    ]);
    mockGraphNodeCreate
      .mockResolvedValueOnce({ id: 'node-1', canonicalName: 'John Doe' })
      .mockResolvedValueOnce({ id: 'node-2', canonicalName: 'Dr. Smith' })
      .mockResolvedValueOnce({ id: 'node-3', canonicalName: 'Dr. Jones' });

    mockGraphEdgeFindFirst.mockResolvedValue(null);

    // First edge fails, second succeeds
    mockGraphEdgeCreate
      .mockRejectedValueOnce(new Error('Edge DB error'))
      .mockResolvedValueOnce({ id: 'edge-2' });

    const result = await enrichGraph('doc-1');

    expect(result.edgesCreated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Edge DB error');
  });

  // -------------------------------------------------------------------------
  // EnrichmentResult counts are correct
  // -------------------------------------------------------------------------

  it('returns correct counts for mixed create/update operations', async () => {
    const newNode = makeCandidateNode({ canonicalName: 'New Person' });
    const existingNode = makeCandidateNode({ canonicalName: 'Existing Person' });

    mockExtractEntities.mockResolvedValue({
      candidateNodes: [newNode, existingNode],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockResolveAndMerge.mockResolvedValue([
      makeResolvedNode('New Person', 'new'),
      makeResolvedNode('Existing Person', 'exact', 'existing-node-1'),
    ]);
    mockGraphNodeCreate.mockResolvedValue({ id: 'node-new', canonicalName: 'New Person' });
    mockGraphNodeFindUnique.mockResolvedValue({
      id: 'existing-node-1',
      canonicalName: 'Existing Person',
      aliases: [],
      sourceDocumentIds: [],
      confidence: 0.5,
    });
    mockGraphNodeUpdate.mockResolvedValue({});

    const result = await enrichGraph('doc-1');

    expect(result.documentId).toBe('doc-1');
    expect(result.nodesCreated).toBe(1);
    expect(result.nodesUpdated).toBe(1);
    expect(result.edgesCreated).toBe(0);
    expect(result.edgesUpdated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Document not found
  // -------------------------------------------------------------------------

  it('returns error when document is not found in DB', async () => {
    mockExtractEntities.mockResolvedValue({
      candidateNodes: [makeCandidateNode()],
      candidateEdges: [],
      documentType: 'MEDICAL_REPORT',
      documentSubtype: null,
    });
    mockDocumentFindUnique.mockResolvedValue(null);

    const result = await enrichGraph('doc-missing');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Document not found');
    expect(result.nodesCreated).toBe(0);
  });
});
