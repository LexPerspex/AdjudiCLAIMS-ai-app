/**
 * Unit tests for the Examiner Graph Access Service.
 *
 * Tests all 5 UPL safety filters that protect claims examiners from
 * seeing attorney-only content, legal analysis, work product, or
 * privileged information in the knowledge graph.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGraphNodeFindMany = vi.fn();
const mockGraphEdgeFindMany = vi.fn();
const mockDocumentFindMany = vi.fn();

vi.mock('../../../server/db.js', () => ({
  prisma: {
    graphNode: {
      findMany: (...args: unknown[]) => mockGraphNodeFindMany(...args) as unknown,
    },
    graphEdge: {
      findMany: (...args: unknown[]) => mockGraphEdgeFindMany(...args) as unknown,
    },
    document: {
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  queryGraphForExaminer,
  formatGraphContext,
} from '../../../server/services/graph/examiner-graph-access.service.js';
import type {
  GraphQueryResult,
  FilteredNode,
} from '../../../server/services/graph/examiner-graph-access.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    claimId: 'claim-1',
    nodeType: 'PERSON',
    canonicalName: 'John Smith',
    aliases: [],
    properties: {},
    personRole: 'APPLICANT',
    orgType: null,
    sourceDocumentIds: ['doc-1'],
    confidence: 0.85,
    embeddingModel: null,
    humanVerified: false,
    humanVerifiedBy: null,
    locked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edge-1',
    claimId: 'claim-1',
    edgeType: 'TREATS',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    properties: {},
    sourceDocumentIds: ['doc-1'],
    sourceChunkIds: [],
    confidence: 0.90,
    sourceConfidences: [],
    weight: 1.0,
    traversalCount: 0,
    lastTraversedAt: null,
    contradictionStatus: 'NONE',
    contradictedByEdgeIds: [],
    contradictionType: null,
    humanVerified: false,
    humanVerifiedBy: null,
    locked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    accessLevel: 'SHARED',
    containsLegalAnalysis: false,
    containsWorkProduct: false,
    containsPrivileged: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return empty arrays
  mockGraphNodeFindMany.mockResolvedValue([]);
  mockGraphEdgeFindMany.mockResolvedValue([]);
  mockDocumentFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Filter 5: UPL Zone Gate
// ---------------------------------------------------------------------------

describe('Filter 5: UPL Zone Gate', () => {
  it('RED zone returns empty result with attorney referral disclaimer', async () => {
    const result = await queryGraphForExaminer('claim-1', 'RED');

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.disclaimer).toBe(
      'This query requires legal analysis. Please consult defense counsel.',
    );
    expect(result.wasFiltered).toBe(true);

    // Should NOT query the database at all
    expect(mockGraphNodeFindMany).not.toHaveBeenCalled();
    expect(mockGraphEdgeFindMany).not.toHaveBeenCalled();
  });

  it('YELLOW zone returns data with mandatory disclaimer', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode()]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'YELLOW');

    expect(result.nodes).toHaveLength(1);
    expect(result.disclaimer).toBe(
      'Statistical/comparative data — consult defense counsel for legal interpretation.',
    );
  });

  it('GREEN zone returns data without disclaimer', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode()]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toHaveLength(1);
    expect(result.disclaimer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filter 1: Document Access Level
// ---------------------------------------------------------------------------

describe('Filter 1: Document Access Level', () => {
  it('removes nodes whose ONLY source documents are ATTORNEY_ONLY', async () => {
    const node = makeNode({ id: 'node-atty', sourceDocumentIds: ['doc-atty'] });
    mockGraphNodeFindMany.mockResolvedValue([node]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-atty', accessLevel: 'ATTORNEY_ONLY' }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toHaveLength(0);
    expect(result.filterStats.nodesRemoved).toBe(1);
  });

  it('retains nodes with mixed SHARED + ATTORNEY_ONLY sources', async () => {
    const node = makeNode({
      id: 'node-mixed',
      sourceDocumentIds: ['doc-shared', 'doc-atty'],
    });
    mockGraphNodeFindMany.mockResolvedValue([node]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-shared', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-atty', accessLevel: 'ATTORNEY_ONLY' }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toHaveLength(1);
    expect(result.filterStats.nodesRemoved).toBe(0);
  });

  it('removes edges whose ONLY source documents are ATTORNEY_ONLY', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      id: 'edge-atty',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-atty'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-atty', accessLevel: 'ATTORNEY_ONLY' }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(0);
    expect(result.filterStats.edgesRemoved).toBe(1);
  });

  it('retains edges with mixed sources', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-1', 'doc-atty'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-atty', accessLevel: 'ATTORNEY_ONLY' }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Filter 2: Content Flags
// ---------------------------------------------------------------------------

describe('Filter 2: Content Flags', () => {
  it('removes edges sourced exclusively from legal analysis docs', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-legal'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-legal', accessLevel: 'SHARED', containsLegalAnalysis: true }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(0);
    expect(result.filterStats.edgesRemoved).toBe(1);
  });

  it('removes edges sourced exclusively from work product docs', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-wp'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-wp', accessLevel: 'SHARED', containsWorkProduct: true }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(0);
  });

  it('removes edges sourced exclusively from privileged docs', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-priv'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-priv', accessLevel: 'SHARED', containsPrivileged: true }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(0);
  });

  it('retains edges with mixed flagged + clean sources', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      sourceDocumentIds: ['doc-1', 'doc-legal'],
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([
      makeDoc({ id: 'doc-1', accessLevel: 'SHARED' }),
      makeDoc({ id: 'doc-legal', accessLevel: 'SHARED', containsLegalAnalysis: true }),
    ]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(1);
    expect(result.filterStats.edgesRemoved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Filter 3: Node Type Restrictions
// ---------------------------------------------------------------------------

describe('Filter 3: Node Type Restrictions', () => {
  it('strips LEGAL_ISSUE node properties to type + status only', async () => {
    const node = makeNode({
      id: 'node-legal',
      nodeType: 'LEGAL_ISSUE',
      canonicalName: 'Compensability',
      properties: {
        type: 'compensability',
        status: 'contested',
        reasoning: 'Defense argues pre-existing condition',
        strategy: 'File MSJ on apportionment',
        analysis: 'Weak defense position',
      },
    });

    mockGraphNodeFindMany.mockResolvedValue([node]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.properties).toEqual({ type: 'compensability', status: 'contested' });
    expect(result.filterStats.propertiesStripped).toBe(3);
  });

  it('strips SETTLEMENT node properties to type + amount + date only', async () => {
    const node = makeNode({
      id: 'node-settlement',
      nodeType: 'SETTLEMENT',
      canonicalName: 'C&R Settlement',
      properties: {
        type: 'compromise_and_release',
        amount: 85000,
        date: '2026-01-15',
        valuationAnalysis: 'Based on PD rating of 45%',
        strategy: 'Push for early settlement',
        negotiationHistory: 'Initial demand was $120K',
      },
    });

    mockGraphNodeFindMany.mockResolvedValue([node]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.properties).toEqual({
      type: 'compromise_and_release',
      amount: 85000,
      date: '2026-01-15',
    });
    expect(result.filterStats.propertiesStripped).toBe(3);
  });

  it('does NOT strip properties from other node types', async () => {
    const node = makeNode({
      nodeType: 'PERSON',
      properties: { role: 'applicant', dateOfBirth: '1985-03-12', ssn_last4: '1234' },
    });

    mockGraphNodeFindMany.mockResolvedValue([node]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes[0]!.properties).toEqual({
      role: 'applicant',
      dateOfBirth: '1985-03-12',
      ssn_last4: '1234',
    });
    expect(result.filterStats.propertiesStripped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Filter 4: Edge Type Restrictions
// ---------------------------------------------------------------------------

describe('Filter 4: Edge Type Restrictions', () => {
  it('strips reasoning property from DECIDES edges', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Compensability Issue' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      edgeType: 'DECIDES',
      properties: {
        date: '2026-02-10',
        outcome: 'denied',
        reasoning: 'Judge found insufficient evidence of industrial causation',
      },
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.properties).toEqual({ date: '2026-02-10', outcome: 'denied' });
    expect(result.filterStats.propertiesStripped).toBe(1);
  });

  it('does NOT strip properties from other edge types', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Lumbar Spine' });
    const edge = makeEdge({
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      edgeType: 'DIAGNOSES',
      properties: { icd10: 'M54.5', reasoning: 'clinical correlation' },
    });

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue([edge]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.edges[0]!.properties).toEqual({
      icd10: 'M54.5',
      reasoning: 'clinical correlation',
    });
    expect(result.filterStats.propertiesStripped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Confidence badges
// ---------------------------------------------------------------------------

describe('Confidence badges', () => {
  it('assigns verified badge for confidence >= 0.95', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode({ confidence: 0.97 })]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');
    expect(result.nodes[0]!.confidenceBadge).toBe('verified');
  });

  it('assigns confident badge for confidence >= 0.80', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode({ confidence: 0.85 })]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');
    expect(result.nodes[0]!.confidenceBadge).toBe('confident');
  });

  it('assigns suggested badge for confidence >= 0.50', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode({ confidence: 0.55 })]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');
    expect(result.nodes[0]!.confidenceBadge).toBe('suggested');
  });

  it('assigns ai_generated badge for confidence < 0.50', async () => {
    mockGraphNodeFindMany.mockResolvedValue([makeNode({ confidence: 0.30 })]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');
    expect(result.nodes[0]!.confidenceBadge).toBe('ai_generated');
  });
});

// ---------------------------------------------------------------------------
// Limits: maxNodes / maxEdges
// ---------------------------------------------------------------------------

describe('maxNodes and maxEdges limits', () => {
  it('limits nodes to maxNodes, sorted by confidence descending', async () => {
    const nodes = [
      makeNode({ id: 'n1', confidence: 0.5 }),
      makeNode({ id: 'n2', confidence: 0.9 }),
      makeNode({ id: 'n3', confidence: 0.7 }),
    ];

    mockGraphNodeFindMany.mockResolvedValue(nodes);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN', { maxNodes: 2 });

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]!.id).toBe('n2'); // highest confidence
    expect(result.nodes[1]!.id).toBe('n3');
  });

  it('limits edges to maxEdges, sorted by confidence descending', async () => {
    const n1 = makeNode({ id: 'node-1' });
    const n2 = makeNode({ id: 'node-2', canonicalName: 'Dr. Chen' });
    const edges = [
      makeEdge({ id: 'e1', sourceNodeId: 'node-1', targetNodeId: 'node-2', confidence: 0.6 }),
      makeEdge({ id: 'e2', sourceNodeId: 'node-1', targetNodeId: 'node-2', confidence: 0.95 }),
      makeEdge({ id: 'e3', sourceNodeId: 'node-1', targetNodeId: 'node-2', confidence: 0.8 }),
    ];

    mockGraphNodeFindMany.mockResolvedValue([n1, n2]);
    mockGraphEdgeFindMany.mockResolvedValue(edges);
    mockDocumentFindMany.mockResolvedValue([makeDoc()]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN', { maxEdges: 2 });

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]!.id).toBe('e2'); // highest confidence
    expect(result.edges[1]!.id).toBe('e3');
  });
});

// ---------------------------------------------------------------------------
// Empty graph
// ---------------------------------------------------------------------------

describe('Empty graph', () => {
  it('returns empty result when no nodes or edges exist', async () => {
    mockGraphNodeFindMany.mockResolvedValue([]);
    mockGraphEdgeFindMany.mockResolvedValue([]);
    mockDocumentFindMany.mockResolvedValue([]);

    const result = await queryGraphForExaminer('claim-1', 'GREEN');

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.disclaimer).toBeNull();
    expect(result.wasFiltered).toBe(false);
    expect(result.filterStats).toEqual({
      nodesRemoved: 0,
      edgesRemoved: 0,
      propertiesStripped: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// formatGraphContext
// ---------------------------------------------------------------------------

describe('formatGraphContext', () => {
  it('produces readable text with entities and relationships', () => {
    const result: GraphQueryResult = {
      nodes: [
        {
          id: 'n1',
          nodeType: 'PERSON' as any,
          canonicalName: 'John Smith',
          properties: {},
          personRole: 'APPLICANT',
          orgType: null,
          confidence: 0.88,
          confidenceBadge: 'confident',
          sourceCount: 2,
        },
        {
          id: 'n2',
          nodeType: 'ORGANIZATION' as any,
          canonicalName: 'Pacific Coast Logistics',
          properties: {},
          personRole: null,
          orgType: 'EMPLOYER',
          confidence: 0.96,
          confidenceBadge: 'verified',
          sourceCount: 3,
        },
        {
          id: 'n3',
          nodeType: 'BODY_PART' as any,
          canonicalName: 'Lumbar Spine',
          properties: {},
          personRole: null,
          orgType: null,
          confidence: 0.82,
          confidenceBadge: 'confident',
          sourceCount: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          edgeType: 'EVALUATES' as any,
          sourceNodeId: 'n1',
          targetNodeId: 'n3',
          properties: {},
          confidence: 0.92,
          weight: 1.0,
          contradictionStatus: 'NONE',
        },
        {
          id: 'e2',
          edgeType: 'EMPLOYED_BY' as any,
          sourceNodeId: 'n1',
          targetNodeId: 'n2',
          properties: {},
          confidence: 0.95,
          weight: 1.0,
          contradictionStatus: 'NONE',
        },
      ],
      disclaimer: null,
      wasFiltered: false,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    };

    const text = formatGraphContext(result);

    expect(text).toContain('## CLAIM KNOWLEDGE GRAPH');
    expect(text).toContain('### Key Entities');
    expect(text).toContain('PERSON (APPLICANT): John Smith [confident]');
    expect(text).toContain('ORGANIZATION (EMPLOYER): Pacific Coast Logistics [verified]');
    expect(text).toContain('BODY_PART: Lumbar Spine [confident]');
    expect(text).toContain('### Key Relationships');
    expect(text).toContain('John Smith EVALUATES Lumbar Spine (confidence: 0.92)');
    expect(text).toContain('John Smith EMPLOYED_BY Pacific Coast Logistics (confidence: 0.95)');
  });

  it('includes disclaimer when present', () => {
    const result: GraphQueryResult = {
      nodes: [
        {
          id: 'n1',
          nodeType: 'PERSON' as any,
          canonicalName: 'John Smith',
          properties: {},
          personRole: null,
          orgType: null,
          confidence: 0.85,
          confidenceBadge: 'confident',
          sourceCount: 1,
        },
      ],
      edges: [],
      disclaimer: 'Statistical/comparative data — consult defense counsel for legal interpretation.',
      wasFiltered: false,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    };

    const text = formatGraphContext(result);

    expect(text).toContain('[DISCLAIMER:');
    expect(text).toContain('consult defense counsel');
  });

  it('returns empty string for empty graph with no disclaimer', () => {
    const result: GraphQueryResult = {
      nodes: [],
      edges: [],
      disclaimer: null,
      wasFiltered: false,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    };

    expect(formatGraphContext(result)).toBe('');
  });

  it('returns disclaimer block for empty graph with disclaimer (RED zone)', () => {
    const result: GraphQueryResult = {
      nodes: [],
      edges: [],
      disclaimer: 'This query requires legal analysis. Please consult defense counsel.',
      wasFiltered: true,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    };

    const text = formatGraphContext(result);

    expect(text).toContain('## CLAIM KNOWLEDGE GRAPH');
    expect(text).toContain('Please consult defense counsel');
  });
});
