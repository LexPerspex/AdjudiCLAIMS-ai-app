/**
 * Graph Ontology Constraints Service
 *
 * Validates that graph edges conform to the California Workers' Compensation
 * claims domain ontology. Each edge type has a strict set of allowed source
 * and target node types — this service enforces those constraints so that
 * the knowledge graph never contains structurally invalid relationships.
 *
 * 13 node types, 35 edge types, fully enumerated constraint map.
 */

import type { GraphNodeType, GraphEdgeType } from '@prisma/client';

// Re-export Prisma enum types for consumers that don't import from Prisma directly
export type { GraphNodeType, GraphEdgeType };

// ---------------------------------------------------------------------------
// Constants — all 13 node types for convenience
// ---------------------------------------------------------------------------

const ALL_NODE_TYPES: readonly GraphNodeType[] = [
  'PERSON',
  'ORGANIZATION',
  'BODY_PART',
  'CLAIM',
  'DOCUMENT',
  'PROCEEDING',
  'LEGAL_ISSUE',
  'LIEN',
  'SETTLEMENT',
  'TREATMENT',
  'MEDICATION',
  'RATING',
  'BENEFIT',
] as const;

// ---------------------------------------------------------------------------
// Edge constraint definition
// ---------------------------------------------------------------------------

export interface EdgeConstraint {
  /** Allowed source node types for this edge type. */
  readonly sourceTypes: readonly GraphNodeType[];
  /** Allowed target node types for this edge type. */
  readonly targetTypes: readonly GraphNodeType[];
}

/**
 * Full ontology constraint map.
 *
 * Every entry specifies which source and target node types are valid for the
 * given edge type. The constraints encode domain knowledge about California
 * Workers' Compensation claims — e.g. only a PERSON (physician) can DIAGNOSE
 * a BODY_PART, only an ORGANIZATION (carrier/TPA) can PAY a BENEFIT, etc.
 *
 * Note: sub-role constraints (e.g. "attorney" vs "applicant" within PERSON)
 * are NOT enforced here — they require runtime property inspection and are
 * handled by higher-level validation in the graph extraction pipeline.
 */
export const EDGE_CONSTRAINTS: Readonly<Record<GraphEdgeType, EdgeConstraint>> = {
  // -------------------------------------------------------------------------
  // Document-Entity edges (5)
  // -------------------------------------------------------------------------
  ESTABLISHES: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: [...ALL_NODE_TYPES],
  },
  MENTIONS: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: [...ALL_NODE_TYPES],
  },
  AMENDS: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: ['DOCUMENT'],
  },
  SUPERSEDES: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: ['DOCUMENT'],
  },
  RESPONDS_TO: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: ['DOCUMENT'],
  },

  // -------------------------------------------------------------------------
  // Person relationships (4)
  // -------------------------------------------------------------------------
  REPRESENTS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PERSON'],
  },
  EMPLOYED_BY: {
    sourceTypes: ['PERSON'],
    targetTypes: ['ORGANIZATION'],
  },
  AFFILIATED_WITH: {
    sourceTypes: ['PERSON'],
    targetTypes: ['ORGANIZATION'],
  },
  DEPENDENT_OF: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PERSON'],
  },

  // -------------------------------------------------------------------------
  // Medical edges (9)
  // -------------------------------------------------------------------------
  TREATS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PERSON'],
  },
  EVALUATES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PERSON'],
  },
  DIAGNOSES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['BODY_PART'],
  },
  INJURED: {
    sourceTypes: ['PERSON'],
    targetTypes: ['BODY_PART'],
  },
  PRESCRIBED: {
    sourceTypes: ['PERSON'],
    targetTypes: ['MEDICATION'],
  },
  PERFORMED: {
    sourceTypes: ['PERSON'],
    targetTypes: ['TREATMENT'],
  },
  REVIEWS_UR: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['TREATMENT'],
  },
  REVIEWS_IMR: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['TREATMENT'],
  },
  REFERS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PERSON'],
  },

  // -------------------------------------------------------------------------
  // Legal process edges (8)
  // -------------------------------------------------------------------------
  FILES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PROCEEDING'],
  },
  ADJUDICATES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PROCEEDING'],
  },
  DECIDES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['LEGAL_ISSUE'],
  },
  ORDERS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['CLAIM'],
  },
  AWARDS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['BENEFIT'],
  },
  PERTAINS_TO: {
    sourceTypes: ['LEGAL_ISSUE'],
    targetTypes: ['CLAIM'],
  },
  APPEALS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['PROCEEDING'],
  },
  CITES_STATUTE: {
    sourceTypes: ['DOCUMENT'],
    targetTypes: ['LEGAL_ISSUE'],
  },

  // -------------------------------------------------------------------------
  // Financial edges (5)
  // -------------------------------------------------------------------------
  PAYS: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['BENEFIT'],
  },
  FILES_LIEN: {
    sourceTypes: ['ORGANIZATION', 'PERSON'],
    targetTypes: ['LIEN'],
  },
  SETTLES_LIEN: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['LIEN'],
  },
  DENIES: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['TREATMENT', 'BENEFIT'],
  },
  INSURES: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['ORGANIZATION'],
  },

  // -------------------------------------------------------------------------
  // Rating / Work edges (3)
  // -------------------------------------------------------------------------
  RATES: {
    sourceTypes: ['PERSON'],
    targetTypes: ['RATING'],
  },
  APPORTIONS: {
    sourceTypes: ['PERSON'],
    targetTypes: ['RATING'],
  },
  OFFERS_WORK: {
    sourceTypes: ['ORGANIZATION'],
    targetTypes: ['PERSON'],
  },

  // -------------------------------------------------------------------------
  // Communication (1)
  // -------------------------------------------------------------------------
  SENDS: {
    sourceTypes: ['PERSON', 'ORGANIZATION'],
    targetTypes: ['PERSON', 'ORGANIZATION'],
  },
};

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Validates whether an edge type is allowed between the given source and
 * target node types according to the WC claims domain ontology.
 *
 * @param edgeType  - The edge type to validate
 * @param sourceNodeType - The source node's type
 * @param targetNodeType - The target node's type
 * @returns true if the edge is structurally valid
 */
export function isValidEdge(
  edgeType: GraphEdgeType,
  sourceNodeType: GraphNodeType,
  targetNodeType: GraphNodeType,
): boolean {
  const constraint = EDGE_CONSTRAINTS[edgeType];
  if (!constraint) return false;
  return (
    constraint.sourceTypes.includes(sourceNodeType) &&
    constraint.targetTypes.includes(targetNodeType)
  );
}

/**
 * Returns all edge types that are valid between two node types.
 *
 * Useful for the graph extraction pipeline when it needs to determine which
 * relationship types are even possible between two identified entities.
 *
 * @param sourceNodeType - The source node's type
 * @param targetNodeType - The target node's type
 * @returns Array of valid edge types (may be empty)
 */
export function getValidEdgeTypes(
  sourceNodeType: GraphNodeType,
  targetNodeType: GraphNodeType,
): GraphEdgeType[] {
  const result: GraphEdgeType[] = [];
  for (const [edgeType, constraint] of Object.entries(EDGE_CONSTRAINTS)) {
    if (
      constraint.sourceTypes.includes(sourceNodeType) &&
      constraint.targetTypes.includes(targetNodeType)
    ) {
      result.push(edgeType as GraphEdgeType);
    }
  }
  return result;
}

/**
 * Returns valid target node types for a given edge type.
 *
 * @param edgeType - The edge type to look up
 * @returns Array of valid target node types
 */
export function getValidTargetTypes(edgeType: GraphEdgeType): GraphNodeType[] {
  const constraint = EDGE_CONSTRAINTS[edgeType];
  if (!constraint) return [];
  return [...constraint.targetTypes];
}

/**
 * Returns valid source node types for a given edge type.
 *
 * @param edgeType - The edge type to look up
 * @returns Array of valid source node types
 */
export function getValidSourceTypes(edgeType: GraphEdgeType): GraphNodeType[] {
  const constraint = EDGE_CONSTRAINTS[edgeType];
  if (!constraint) return [];
  return [...constraint.sourceTypes];
}
