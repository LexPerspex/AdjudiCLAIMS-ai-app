/**
 * Graph Entity Resolution Service
 *
 * Resolves candidate entity nodes against existing graph nodes to merge
 * duplicates. Uses a 3-tier matching strategy:
 *   1. Exact match on canonicalName or aliases (confidence 0.95)
 *   2. Fuzzy match via Levenshtein distance ≤ 2 (confidence 0.70, names ≥ 5 chars only)
 *   3. No match → new node (confidence 0)
 *
 * All matching is scoped to the same claimId + nodeType combination.
 */

import type { GraphNodeType, PersonRole, OrgType, GraphNode } from '@prisma/client';
import { prisma } from '../../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  /** Existing node ID if matched, null if new */
  existingNodeId: string | null;
  /** Match tier: 'exact' (0.95), 'fuzzy' (0.70), 'new' (0) */
  matchTier: 'exact' | 'fuzzy' | 'new';
  /** Match confidence */
  matchConfidence: number;
  /** The canonical name to use (from existing node if matched) */
  resolvedName: string;
}

export interface CandidateNode {
  name: string;
  nodeType: GraphNodeType;
  personRole?: PersonRole;
  orgType?: OrgType;
}

export interface ResolvedNode {
  candidateNode: CandidateNode;
  resolution: ResolutionResult;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence assigned to exact matches (canonicalName or alias). */
const EXACT_MATCH_CONFIDENCE = 0.95;

/** Confidence assigned to fuzzy matches (Levenshtein ≤ 2). */
const FUZZY_MATCH_CONFIDENCE = 0.70;

/** Maximum Levenshtein distance for a fuzzy match. */
const MAX_LEVENSHTEIN_DISTANCE = 2;

/** Minimum name length for fuzzy matching (short names get exact-only). */
const MIN_FUZZY_NAME_LENGTH = 5;

// ---------------------------------------------------------------------------
// Levenshtein Distance
// ---------------------------------------------------------------------------

/**
 * Standard Levenshtein edit distance between two strings.
 *
 * Uses a bottom-up dynamic programming approach with O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Early exits
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  // Ensure a is the shorter string for space optimization
  if (m > n) return levenshteinDistance(b, a);

  // Single-row DP (space = O(min(m,n)))
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);

  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,      // deletion
        curr[i - 1] + 1,  // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}

// ---------------------------------------------------------------------------
// Single Entity Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a candidate entity name against existing graph nodes in a claim.
 *
 * 3-tier matching:
 *   1. Exact match on canonicalName (case-insensitive, trimmed) or aliases
 *   2. Fuzzy match (Levenshtein ≤ 2) for names ≥ 5 characters
 *   3. No match → new node
 */
export async function resolveEntity(
  candidateName: string,
  nodeType: GraphNodeType,
  claimId: string,
  _personRole?: PersonRole,
  _orgType?: OrgType,
): Promise<ResolutionResult> {
  const existingNodes = await prisma.graphNode.findMany({
    where: { claimId, nodeType },
  });

  return resolveAgainstNodes(candidateName, existingNodes);
}

/**
 * Core resolution logic against a provided set of nodes.
 * Extracted so batch resolution can reuse it without extra DB queries.
 */
function resolveAgainstNodes(
  candidateName: string,
  existingNodes: Pick<GraphNode, 'id' | 'canonicalName' | 'aliases'>[],
): ResolutionResult {
  const normalized = candidateName.trim().toLowerCase();

  // --- Tier 1: Exact match on canonicalName ---
  for (const node of existingNodes) {
    if (node.canonicalName.trim().toLowerCase() === normalized) {
      return {
        existingNodeId: node.id,
        matchTier: 'exact',
        matchConfidence: EXACT_MATCH_CONFIDENCE,
        resolvedName: node.canonicalName,
      };
    }
  }

  // --- Tier 1b: Exact match on aliases ---
  for (const node of existingNodes) {
    const aliases = node.aliases as string[];
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === 'string' && alias.trim().toLowerCase() === normalized) {
          return {
            existingNodeId: node.id,
            matchTier: 'exact',
            matchConfidence: EXACT_MATCH_CONFIDENCE,
            resolvedName: node.canonicalName,
          };
        }
      }
    }
  }

  // --- Tier 2: Fuzzy match (only for names ≥ MIN_FUZZY_NAME_LENGTH chars) ---
  if (normalized.length >= MIN_FUZZY_NAME_LENGTH) {
    let bestDistance = MAX_LEVENSHTEIN_DISTANCE + 1;
    let bestNode: typeof existingNodes[number] | null = null;

    for (const node of existingNodes) {
      const distance = levenshteinDistance(
        normalized,
        node.canonicalName.trim().toLowerCase(),
      );
      if (distance <= MAX_LEVENSHTEIN_DISTANCE && distance < bestDistance) {
        bestDistance = distance;
        bestNode = node;
      }
    }

    if (bestNode) {
      return {
        existingNodeId: bestNode.id,
        matchTier: 'fuzzy',
        matchConfidence: FUZZY_MATCH_CONFIDENCE,
        resolvedName: bestNode.canonicalName,
      };
    }
  }

  // --- Tier 3: No match → new node ---
  return {
    existingNodeId: null,
    matchTier: 'new',
    matchConfidence: 0,
    resolvedName: candidateName,
  };
}

// ---------------------------------------------------------------------------
// Batch Resolution
// ---------------------------------------------------------------------------

/**
 * Batch-resolve an array of candidate nodes against existing graph nodes.
 *
 * Caches the initial DB query result and appends synthetic entries as new
 * nodes are resolved, so later candidates in the same batch can deduplicate
 * against earlier ones.
 */
export async function resolveAndMerge(
  candidateNodes: CandidateNode[],
  claimId: string,
): Promise<ResolvedNode[]> {
  // Group candidates by nodeType to minimize queries
  const nodeTypes = [...new Set(candidateNodes.map((c) => c.nodeType))];

  // Fetch all existing nodes for the relevant types in one query per type
  const cache = new Map<
    GraphNodeType,
    Pick<GraphNode, 'id' | 'canonicalName' | 'aliases'>[]
  >();

  for (const nodeType of nodeTypes) {
    const nodes = await prisma.graphNode.findMany({
      where: { claimId, nodeType },
    });
    cache.set(nodeType, nodes);
  }

  const results: ResolvedNode[] = [];

  for (const candidate of candidateNodes) {
    const cachedNodes = cache.get(candidate.nodeType) ?? [];
    const resolution = resolveAgainstNodes(candidate.name, cachedNodes);

    // If this is a new node, add a synthetic entry to the cache so later
    // candidates in the batch can match against it.
    if (resolution.matchTier === 'new') {
      const syntheticId = `pending-${candidate.name}-${candidate.nodeType}`;
      cachedNodes.push({
        id: syntheticId,
        canonicalName: candidate.name,
        aliases: [] as unknown as GraphNode['aliases'],
      });
    }

    results.push({ candidateNode: candidate, resolution });
  }

  return results;
}
