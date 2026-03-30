/**
 * Tests for chat-tools.service.ts — examiner tool registry and executor.
 *
 * Covers:
 *  - Tool definitions have valid JSON Schema structure
 *  - executeTool routes to correct service for each tool name
 *  - RED zone blocks all tool execution
 *  - Unknown tool names return error message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — all downstream services
// ---------------------------------------------------------------------------

vi.mock('../../server/services/hybrid-search.service.js', () => ({
  hybridSearch: vi.fn(),
}));

vi.mock('../../server/services/graph/examiner-graph-access.service.js', () => ({
  queryGraphForExaminer: vi.fn(),
  formatGraphContext: vi.fn(),
}));

vi.mock('../../server/services/benefit-calculator.service.js', () => ({
  calculateTdRate: vi.fn(),
}));

vi.mock('../../server/services/deadline-engine.service.js', () => ({
  getClaimDeadlines: vi.fn(),
}));

import { EXAMINER_TOOLS, executeTool } from '../../server/services/chat-tools.service.js';
import { hybridSearch } from '../../server/services/hybrid-search.service.js';
import { queryGraphForExaminer, formatGraphContext } from '../../server/services/graph/examiner-graph-access.service.js';
import { calculateTdRate } from '../../server/services/benefit-calculator.service.js';
import { getClaimDeadlines } from '../../server/services/deadline-engine.service.js';
import type { ToolCall } from '../../server/lib/llm/types.js';

const mockHybridSearch = vi.mocked(hybridSearch);
const mockQueryGraph = vi.mocked(queryGraphForExaminer);
const mockFormatGraph = vi.mocked(formatGraphContext);
const mockCalcTdRate = vi.mocked(calculateTdRate);
const mockGetDeadlines = vi.mocked(getClaimDeadlines);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolCall(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: `tc_${name}_1`, name, input };
}

// ==========================================================================
// TOOL DEFINITIONS — schema validity
// ==========================================================================

describe('EXAMINER_TOOLS — definitions', () => {
  it('exports 5 tool definitions', () => {
    expect(EXAMINER_TOOLS).toHaveLength(5);
  });

  it.each(EXAMINER_TOOLS.map((t) => [t.name, t]))('tool "%s" has name, description, and inputSchema', (_name, tool) => {
    expect(tool.name).toBeTruthy();
    expect(typeof tool.name).toBe('string');
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe('string');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema['type']).toBe('object');
    expect(tool.inputSchema['properties']).toBeDefined();
  });

  it('all tool names are unique', () => {
    const names = EXAMINER_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('search_documents requires "query"', () => {
    const tool = EXAMINER_TOOLS.find((t) => t.name === 'search_documents')!;
    expect(tool.inputSchema['required']).toContain('query');
  });

  it('calculate_benefit requires awe, injuryDate, benefitType', () => {
    const tool = EXAMINER_TOOLS.find((t) => t.name === 'calculate_benefit')!;
    const required = tool.inputSchema['required'] as string[];
    expect(required).toContain('averageWeeklyEarnings');
    expect(required).toContain('injuryDate');
    expect(required).toContain('benefitType');
  });

  it('lookup_regulation requires "citation"', () => {
    const tool = EXAMINER_TOOLS.find((t) => t.name === 'lookup_regulation')!;
    expect(tool.inputSchema['required']).toContain('citation');
  });
});

// ==========================================================================
// RED ZONE — blocks all tools
// ==========================================================================

describe('executeTool — RED zone enforcement', () => {
  it('returns blocked message for any tool in RED zone', async () => {
    const result = await executeTool(
      makeToolCall('search_documents', { query: 'test' }),
      'claim-1',
      'RED',
    );
    expect(result).toContain('RED zone');
    expect(result).toContain('blocked');
  });

  it('does not call any downstream service in RED zone', async () => {
    await executeTool(
      makeToolCall('calculate_benefit', { averageWeeklyEarnings: 1000, injuryDate: '2025-01-01', benefitType: 'TD' }),
      'claim-1',
      'RED',
    );
    expect(mockHybridSearch).not.toHaveBeenCalled();
    expect(mockCalcTdRate).not.toHaveBeenCalled();
    expect(mockQueryGraph).not.toHaveBeenCalled();
    expect(mockGetDeadlines).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// UNKNOWN TOOL
// ==========================================================================

describe('executeTool — unknown tool', () => {
  it('returns error message listing available tools', async () => {
    const result = await executeTool(
      makeToolCall('nonexistent_tool', {}),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('Unknown tool');
    expect(result).toContain('nonexistent_tool');
    expect(result).toContain('search_documents');
  });
});

// ==========================================================================
// SEARCH_DOCUMENTS routing
// ==========================================================================

describe('executeTool — search_documents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls hybridSearch with query and claimId', async () => {
    mockHybridSearch.mockResolvedValue([]);
    await executeTool(
      makeToolCall('search_documents', { query: 'medical report' }),
      'claim-42',
      'GREEN',
    );
    expect(mockHybridSearch).toHaveBeenCalledWith('medical report', 'claim-42', { finalTopK: 5 });
  });

  it('returns "no documents" when search returns empty', async () => {
    mockHybridSearch.mockResolvedValue([]);
    const result = await executeTool(
      makeToolCall('search_documents', { query: 'test' }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('No relevant documents');
  });

  it('returns error when query is missing', async () => {
    const result = await executeTool(
      makeToolCall('search_documents', {}),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('required');
  });
});

// ==========================================================================
// QUERY_GRAPH routing
// ==========================================================================

describe('executeTool — query_graph', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls queryGraphForExaminer and filters by entity name', async () => {
    mockQueryGraph.mockResolvedValue({
      nodes: [
        { id: 'n1', canonicalName: 'John Doe', nodeType: 'PERSON' } as never,
      ],
      edges: [],
      disclaimer: null,
      wasFiltered: false,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    });
    mockFormatGraph.mockReturnValue('Graph: John Doe (PERSON)');

    const result = await executeTool(
      makeToolCall('query_graph', { entityName: 'John' }),
      'claim-1',
      'GREEN',
    );
    expect(mockQueryGraph).toHaveBeenCalledWith('claim-1', 'GREEN', { maxNodes: 20, maxEdges: 30 });
    expect(result).toContain('John Doe');
  });

  it('returns "no entities" when no match', async () => {
    mockQueryGraph.mockResolvedValue({
      nodes: [
        { id: 'n1', canonicalName: 'Jane Smith', nodeType: 'PERSON' } as never,
      ],
      edges: [],
      disclaimer: null,
      wasFiltered: false,
      filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
    });

    const result = await executeTool(
      makeToolCall('query_graph', { entityName: 'NotFound' }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('No graph entities found');
  });
});

// ==========================================================================
// CALCULATE_BENEFIT routing
// ==========================================================================

describe('executeTool — calculate_benefit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls calculateTdRate for TD benefit type', async () => {
    mockCalcTdRate.mockReturnValue({
      awe: 1000,
      tdRate: 666.67,
      statutoryMin: 230.95,
      statutoryMax: 1619.15,
      authority: 'LC 4653(c)(1)',
      wasClampedToMin: false,
      wasClampedToMax: false,
    } as never);

    const result = await executeTool(
      makeToolCall('calculate_benefit', {
        averageWeeklyEarnings: 1000,
        injuryDate: '2025-06-15',
        benefitType: 'TD',
      }),
      'claim-1',
      'GREEN',
    );
    expect(mockCalcTdRate).toHaveBeenCalledWith(1000, expect.any(Date));
    expect(result).toContain('TD Rate');
    expect(result).toContain('$666.67');
  });

  it('returns placeholder for PD benefit type', async () => {
    const result = await executeTool(
      makeToolCall('calculate_benefit', {
        averageWeeklyEarnings: 1000,
        injuryDate: '2025-06-15',
        benefitType: 'PD',
      }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('PD benefit calculation not yet implemented');
  });

  it('returns error for invalid AWE', async () => {
    const result = await executeTool(
      makeToolCall('calculate_benefit', {
        averageWeeklyEarnings: -100,
        injuryDate: '2025-01-01',
        benefitType: 'TD',
      }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('positive number');
  });

  it('returns error for invalid date', async () => {
    const result = await executeTool(
      makeToolCall('calculate_benefit', {
        averageWeeklyEarnings: 1000,
        injuryDate: 'not-a-date',
        benefitType: 'TD',
      }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('not a valid date');
  });
});

// ==========================================================================
// CHECK_DEADLINES routing
// ==========================================================================

describe('executeTool — check_deadlines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls getClaimDeadlines with claimId', async () => {
    mockGetDeadlines.mockResolvedValue([]);
    await executeTool(
      makeToolCall('check_deadlines', { urgencyFilter: 'all' }),
      'claim-99',
      'GREEN',
    );
    expect(mockGetDeadlines).toHaveBeenCalledWith('claim-99');
  });

  it('filters by overdue when urgencyFilter is "overdue"', async () => {
    mockGetDeadlines.mockResolvedValue([
      { urgency: 'RED', deadlineType: 'INITIAL_RESPONSE', description: 'Overdue', dueDate: new Date('2025-01-01'), statutoryCitation: 'LC 4650' } as never,
      { urgency: 'GREEN', deadlineType: 'FOLLOW_UP', description: 'Future', dueDate: new Date('2026-12-31'), statutoryCitation: null } as never,
    ]);

    const result = await executeTool(
      makeToolCall('check_deadlines', { urgencyFilter: 'overdue' }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('INITIAL_RESPONSE');
    expect(result).not.toContain('FOLLOW_UP');
  });

  it('returns "no deadlines" when none found', async () => {
    mockGetDeadlines.mockResolvedValue([]);
    const result = await executeTool(
      makeToolCall('check_deadlines', {}),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('No regulatory deadlines');
  });
});

// ==========================================================================
// LOOKUP_REGULATION routing
// ==========================================================================

describe('executeTool — lookup_regulation', () => {
  it('returns placeholder message with citation', async () => {
    const result = await executeTool(
      makeToolCall('lookup_regulation', { citation: 'LC 4650' }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('not yet implemented');
    expect(result).toContain('LC 4650');
  });

  it('returns error when citation is missing', async () => {
    const result = await executeTool(
      makeToolCall('lookup_regulation', {}),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('required');
  });
});

// ==========================================================================
// ERROR HANDLING
// ==========================================================================

describe('executeTool — error handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('catches service errors and returns error string', async () => {
    mockHybridSearch.mockRejectedValue(new Error('Database connection lost'));

    const result = await executeTool(
      makeToolCall('search_documents', { query: 'test' }),
      'claim-1',
      'GREEN',
    );
    expect(result).toContain('Tool execution error');
    expect(result).toContain('Database connection lost');
  });
});
