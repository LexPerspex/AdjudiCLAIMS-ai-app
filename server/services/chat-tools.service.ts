/**
 * Chat tool registry — examiner-safe tools for agentic LLM use.
 *
 * Each tool is declared with a JSON Schema input definition and routed
 * to the appropriate service at execution time. All tool results are
 * UPL-filtered: RED zone queries return empty results, and no tool
 * ever returns legal analysis, strategy, or privileged content.
 *
 * Tool execution is synchronous from the LLM's perspective: the agentic
 * loop in examiner-chat.service.ts calls executeTool() and feeds the
 * string result back as a tool_result content block.
 */

import type { ToolDefinition, ToolCall } from '../lib/llm/types.js';
import { hybridSearch } from './hybrid-search.service.js';
import { queryGraphForExaminer, formatGraphContext } from './graph/examiner-graph-access.service.js';
import { calculateTdRate } from './benefit-calculator.service.js';
import { getClaimDeadlines } from './deadline-engine.service.js';
import { lookupRegulation } from '../data/regulatory-kb.js';
import { searchRegulatory } from '../lib/kb-client.js';

// ---------------------------------------------------------------------------
// Tool definitions — JSON Schema for each examiner-safe tool
// ---------------------------------------------------------------------------

export const EXAMINER_TOOLS: ToolDefinition[] = [
  {
    name: 'search_documents',
    description: 'Search claim documents for specific information using keyword and semantic search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        documentTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter by document type',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_graph',
    description:
      'Query the claim knowledge graph for entities and relationships (people, organizations, body parts, treatments, benefits)',
    inputSchema: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Name of entity to look up' },
        entityType: {
          type: 'string',
          description:
            'Optional type filter: PERSON, ORGANIZATION, BODY_PART, TREATMENT, etc.',
        },
      },
      required: ['entityName'],
    },
  },
  {
    name: 'calculate_benefit',
    description:
      'Calculate TD/PD benefit rates based on average weekly earnings and injury date',
    inputSchema: {
      type: 'object',
      properties: {
        averageWeeklyEarnings: { type: 'number', description: 'AWE in dollars' },
        injuryDate: {
          type: 'string',
          description: 'Date of injury (YYYY-MM-DD)',
        },
        benefitType: {
          type: 'string',
          enum: ['TD', 'PD'],
          description: 'Type of benefit',
        },
      },
      required: ['averageWeeklyEarnings', 'injuryDate', 'benefitType'],
    },
  },
  {
    name: 'check_deadlines',
    description:
      'Check regulatory deadlines for a claim, including overdue and upcoming',
    inputSchema: {
      type: 'object',
      properties: {
        urgencyFilter: {
          type: 'string',
          enum: ['all', 'overdue', 'due_soon'],
          description: 'Filter by urgency',
        },
      },
    },
  },
  {
    name: 'lookup_regulation',
    description:
      'Look up a California Workers Compensation regulation by Labor Code section or CCR section',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'e.g. "LC 4650" or "8 CCR 9792.9.1"',
        },
      },
      required: ['citation'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor — routes tool calls to the appropriate service
// ---------------------------------------------------------------------------

/**
 * Execute a tool call and return a string result for the LLM.
 *
 * @param toolCall - The tool invocation from the LLM
 * @param claimId - Current claim context
 * @param uplZone - UPL zone from the query classification ('GREEN' | 'YELLOW' | 'RED')
 * @returns String result to feed back to the LLM as a tool_result
 */
export async function executeTool(
  toolCall: ToolCall,
  claimId: string,
  uplZone: string,
): Promise<string> {
  // RED zone: all tools return empty results — no data should feed legal analysis
  if (uplZone === 'RED') {
    return 'Tool execution blocked: query classified as RED zone (requires attorney review).';
  }

  try {
    switch (toolCall.name) {
      case 'search_documents':
        return await executeSearchDocuments(toolCall.input, claimId);

      case 'query_graph':
        return await executeQueryGraph(toolCall.input, claimId, uplZone);

      case 'calculate_benefit':
        return executeCalculateBenefit(toolCall.input);

      case 'check_deadlines':
        return await executeCheckDeadlines(toolCall.input, claimId);

      case 'lookup_regulation':
        return await executeLookupRegulation(toolCall.input);

      default:
        return `Unknown tool: "${toolCall.name}". Available tools: ${EXAMINER_TOOLS.map((t) => t.name).join(', ')}`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chat-tools] Tool "${toolCall.name}" failed:`, message);
    return `Tool execution error: ${message}`;
  }
}

// ---------------------------------------------------------------------------
// Individual tool handlers
// ---------------------------------------------------------------------------

async function executeSearchDocuments(
  input: Record<string, unknown>,
  claimId: string,
): Promise<string> {
  const query = String(input['query'] ?? '');
  if (!query) return 'Error: "query" parameter is required.';

  const results = await hybridSearch(query, claimId, { finalTopK: 5 });

  if (results.length === 0) {
    return 'No relevant documents found for this query.';
  }

  return results
    .map(
      (r, i) =>
        `[Result ${String(i + 1)}] ${r.headingBreadcrumb ?? 'Unknown'} (score: ${r.fusedScore.toFixed(3)})\n${r.parentContent ?? r.content}`,
    )
    .join('\n\n');
}

async function executeQueryGraph(
  input: Record<string, unknown>,
  claimId: string,
  uplZone: string,
): Promise<string> {
  const entityName = String(input['entityName'] ?? '');
  if (!entityName) return 'Error: "entityName" parameter is required.';

  const graphResult = await queryGraphForExaminer(
    claimId,
    uplZone as 'GREEN' | 'YELLOW' | 'RED',
    { maxNodes: 20, maxEdges: 30 },
  );

  // Filter nodes by entity name (case-insensitive partial match)
  const lowerName = entityName.toLowerCase();
  const entityType = input['entityType'] ? String(input['entityType']) : undefined;

  const matchedNodes = graphResult.nodes.filter((n) => {
    const nameMatch = n.canonicalName.toLowerCase().includes(lowerName);
    const typeMatch = entityType ? n.nodeType === entityType : true;
    return nameMatch && typeMatch;
  });

  if (matchedNodes.length === 0) {
    return `No graph entities found matching "${entityName}"${entityType ? ` of type ${entityType}` : ''}.`;
  }

  const formatted = formatGraphContext({
    ...graphResult,
    nodes: matchedNodes,
    edges: graphResult.edges.filter(
      (e) =>
        matchedNodes.some((n) => n.id === e.sourceNodeId) ||
        matchedNodes.some((n) => n.id === e.targetNodeId),
    ),
  });

  return formatted || 'Graph query returned no displayable results.';
}

function executeCalculateBenefit(input: Record<string, unknown>): string {
  const awe = Number(input['averageWeeklyEarnings']);
  const injuryDateStr = String(input['injuryDate'] ?? '');
  const benefitType = String(input['benefitType'] ?? '');

  if (isNaN(awe) || awe <= 0) {
    return 'Error: "averageWeeklyEarnings" must be a positive number.';
  }
  if (!injuryDateStr) {
    return 'Error: "injuryDate" parameter is required (YYYY-MM-DD).';
  }

  const injuryDate = new Date(injuryDateStr);
  if (isNaN(injuryDate.getTime())) {
    return 'Error: "injuryDate" is not a valid date. Use YYYY-MM-DD format.';
  }

  if (benefitType === 'TD') {
    const result = calculateTdRate(awe, injuryDate);
    return [
      `TD Rate Calculation:`,
      `  AWE: $${result.awe.toFixed(2)}`,
      `  TD Rate (2/3 AWE): $${result.tdRate.toFixed(2)}/week`,
      `  Statutory Min: $${result.statutoryMin.toFixed(2)}`,
      `  Statutory Max: $${result.statutoryMax.toFixed(2)}`,
      `  Authority: ${result.statutoryAuthority}`,
    ].join('\n');
  }

  if (benefitType === 'PD') {
    return 'PD benefit calculation not yet implemented. Consult the PD rate schedule for the applicable injury date.';
  }

  return `Error: "benefitType" must be "TD" or "PD". Received: "${benefitType}"`;
}

async function executeCheckDeadlines(
  input: Record<string, unknown>,
  claimId: string,
): Promise<string> {
  const filter = String(input['urgencyFilter'] ?? 'all');

  const deadlines = await getClaimDeadlines(claimId);

  if (deadlines.length === 0) {
    return 'No regulatory deadlines found for this claim.';
  }

  let filtered = deadlines;
  if (filter === 'overdue') {
    filtered = deadlines.filter((d) => d.urgency === 'RED');
  } else if (filter === 'due_soon') {
    filtered = deadlines.filter((d) => d.urgency === 'YELLOW' || d.urgency === 'RED');
  }

  if (filtered.length === 0) {
    return `No ${filter === 'overdue' ? 'overdue' : 'upcoming'} deadlines found for this claim.`;
  }

  return filtered
    .map(
      (d) =>
        `[${d.urgency}] ${d.deadlineType} — due ${d.dueDate.toISOString().split('T')[0]}${d.statutoryAuthority ? ` (${d.statutoryAuthority})` : ''}`,
    )
    .join('\n');
}

async function executeLookupRegulation(input: Record<string, unknown>): Promise<string> {
  const citation = String(input['citation'] ?? '');
  if (!citation) return 'Error: "citation" parameter is required.';

  // 1. Try in-repo regulatory KB first (34 entries, instant, no network)
  const localResults = lookupRegulation(citation);

  if (localResults.length > 0) {
    return localResults
      .map(
        (r) =>
          `[${r.citation}] ${r.title}\n` +
          `${r.fullText}\n` +
          (r.keyRequirements.length > 0
            ? `Key Requirements:\n${r.keyRequirements.map((req) => `  • ${req}`).join('\n')}\n`
            : '') +
          (r.penalties.length > 0
            ? `Penalties:\n${r.penalties.map((p) => `  • ${p}`).join('\n')}\n`
            : '') +
          `Authority: ${r.citation} (effective ${r.effectiveDate})`,
      )
      .join('\n\n---\n\n');
  }

  // 2. Fall back to live KB for citations not in the local KB
  try {
    const kbResults = await searchRegulatory(citation, [
      'labor_code',
      'ccr_title_8',
      'mtus',
      'omfs',
    ], 5);

    if (kbResults.length > 0) {
      // Deduplicate by sectionNumber
      const seen = new Set<string>();
      const unique = kbResults.filter((r) => {
        if (seen.has(r.sectionNumber)) return false;
        seen.add(r.sectionNumber);
        return true;
      });

      return unique
        .map(
          (r) =>
            `[${r.sectionNumber}] ${r.title ?? r.sectionNumber}\n` +
            `${r.fullText}` +
            (r.effectiveDate ? `\nEffective: ${r.effectiveDate}` : '') +
            (r.tags.length > 0 ? `\nTags: ${r.tags.join(', ')}` : ''),
        )
        .join('\n\n---\n\n');
    }
  } catch (err) {
    console.warn(
      '[chat-tools] KB regulation lookup failed:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return (
    `No regulation found matching "${citation}" in the local KB or live Knowledge Base. ` +
    `Please refer to the California Labor Code or Title 8 CCR directly.`
  );
}
