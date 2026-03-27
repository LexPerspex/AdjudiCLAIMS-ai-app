/**
 * Graph Entity Extraction Service
 *
 * Converts ExtractedField records into candidate graph nodes and edges using
 * the SubtypeGraphTemplate system. This is the first stage of the graph
 * ingestion pipeline: raw extraction fields are mapped to typed graph
 * entities that downstream services (resolution, merging) will persist.
 *
 * Flow:
 *   Document -> ExtractedFields -> Template lookup -> CandidateNodes + CandidateEdges
 */

import type {
  GraphNodeType,
  GraphEdgeType,
  PersonRole,
  OrgType,
} from '@prisma/client';

import { prisma } from '../../db.js';
import {
  getTemplateForSubtype,
  getNodeMappingsForField,
  getEdgeMappingsForField,
  type SubtypeGraphTemplate,
  type FieldToEdgeMapping,
} from './generated-templates.js';
import { isValidEdge } from './ontology-constraints.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CandidateNode {
  nodeType: GraphNodeType;
  canonicalName: string;
  personRole?: PersonRole;
  orgType?: OrgType;
  properties: Record<string, unknown>;
  sourceDocumentId: string;
  confidence: number;
  sourceFieldName: string;
}

export interface CandidateEdge {
  edgeType: GraphEdgeType;
  sourceNodeKey: string; // canonicalName of source node
  targetNodeKey: string; // canonicalName of target node
  properties: Record<string, unknown>;
  sourceDocumentId: string;
  confidence: number;
  sourceFieldName: string;
}

export interface ExtractionResult {
  candidateNodes: CandidateNode[];
  candidateEdges: CandidateEdge[];
  documentType: string;
  documentSubtype: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Try to JSON-parse a field value as an array. Returns null if the value
 * is not a JSON array.
 */
function tryParseArray(value: string): string[] | null {
  if (!value.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {
    // Not valid JSON — treat as scalar
  }
  return null;
}

/**
 * Build a deduplication key for a candidate node.
 */
function nodeKey(nodeType: GraphNodeType, canonicalName: string): string {
  return `${nodeType}:${canonicalName.toLowerCase().trim()}`;
}

/**
 * Resolve the source node key for an edge mapping given the current set of
 * candidate nodes and extracted fields.
 */
function resolveSourceKey(
  mapping: FieldToEdgeMapping,
  candidateNodes: CandidateNode[],
  fieldsMap: Map<string, string>,
): string | null {
  switch (mapping.sourceStrategy) {
    case 'document_author': {
      // First PERSON node that is a physician/QME/AME role
      const authorRoles: Set<string> = new Set([
        'TREATING_PHYSICIAN',
        'QME',
        'AME',
        'SURGEON',
        'RADIOLOGIST',
        'PSYCHIATRIST',
        'PSYCHOLOGIST',
        'CHIROPRACTOR',
      ]);
      const author = candidateNodes.find(
        (n) => n.nodeType === 'PERSON' && n.personRole && authorRoles.has(n.personRole),
      );
      return author?.canonicalName ?? null;
    }
    case 'applicant': {
      const applicant = candidateNodes.find(
        (n) => n.nodeType === 'PERSON' && n.personRole === 'APPLICANT',
      );
      return applicant?.canonicalName ?? null;
    }
    case 'employer': {
      const employer = candidateNodes.find(
        (n) => n.nodeType === 'ORGANIZATION' && n.orgType === 'EMPLOYER',
      );
      return employer?.canonicalName ?? null;
    }
    case 'field_ref': {
      // Look up another extracted field by targetFieldPattern
      if (mapping.targetFieldPattern) {
        for (const [fn, fv] of fieldsMap) {
          if (fn.toLowerCase() === mapping.targetFieldPattern.toLowerCase()) {
            return fv;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Resolve the target node key for an edge mapping.
 */
function resolveTargetKey(
  mapping: FieldToEdgeMapping,
  fieldValue: string,
  candidateNodes: CandidateNode[],
  claimId: string,
  fieldsMap: Map<string, string>,
): string | null {
  // Note: some templates use 'field_ref' as targetStrategy (not in the TS
  // union but present in the data). We handle it alongside the declared types.
  const strategy = mapping.targetStrategy as string;

  switch (strategy) {
    case 'field_value_node': {
      // The target is the node created from this field's value
      return fieldValue;
    }
    case 'applicant': {
      const applicant = candidateNodes.find(
        (n) => n.nodeType === 'PERSON' && n.personRole === 'APPLICANT',
      );
      return applicant?.canonicalName ?? null;
    }
    case 'claim': {
      return `CLAIM:${claimId}`;
    }
    case 'body_part': {
      const bodyPart = candidateNodes.find((n) => n.nodeType === 'BODY_PART');
      return bodyPart?.canonicalName ?? null;
    }
    case 'field_ref': {
      // Look up another extracted field by targetFieldPattern
      if (mapping.targetFieldPattern) {
        for (const [fn, fv] of fieldsMap) {
          if (fn.toLowerCase() === mapping.targetFieldPattern.toLowerCase()) {
            return fv;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Determine the node type for a source key used in edge validation.
 * Looks up the candidate node by canonicalName and returns its type,
 * falling back to heuristic detection.
 */
function resolveNodeType(
  key: string,
  candidateNodes: CandidateNode[],
): GraphNodeType {
  // Check CLAIM: prefix
  if (key.startsWith('CLAIM:')) return 'CLAIM';

  // Find matching candidate node
  const lowerKey = key.toLowerCase().trim();
  const match = candidateNodes.find(
    (n) => n.canonicalName.toLowerCase().trim() === lowerKey,
  );
  return match?.nodeType ?? 'PERSON';
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract candidate graph nodes and edges from a document's extracted fields.
 *
 * @param documentId - The document to process
 * @returns Candidate nodes and edges ready for resolution/merging
 * @throws Error if the document is not found
 */
export async function extractEntities(
  documentId: string,
): Promise<ExtractionResult> {
  // 1. Fetch document with extracted fields
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extractedFields: true },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const documentType = document.documentType ?? 'UNKNOWN';
  const documentSubtype = document.documentSubtype ?? null;

  // 2. Get template for this document type/subtype
  const template: SubtypeGraphTemplate = getTemplateForSubtype(
    documentSubtype ?? documentType,
    documentType,
  );

  // Build a map of field name -> value for quick lookup
  const fieldsMap = new Map<string, string>();
  for (const field of document.extractedFields) {
    fieldsMap.set(field.fieldName, field.fieldValue);
  }

  // 3. Process each extracted field
  const allCandidateNodes: CandidateNode[] = [];
  const rawCandidateEdges: CandidateEdge[] = [];

  for (const field of document.extractedFields) {
    const fieldConfidence =
      field.confidence != null && field.confidence >= 0
        ? field.confidence
        : 0.5;

    // 3a. Node mappings
    const nodeMappings = getNodeMappingsForField(field.fieldName, template);
    for (const mapping of nodeMappings) {
      // Handle array fields — create one node per element
      const arrayValues = tryParseArray(field.fieldValue);
      const values = arrayValues ?? [field.fieldValue];

      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed) continue;

        const candidateNode: CandidateNode = {
          nodeType: mapping.nodeType,
          canonicalName: mapping.nameSource === 'value' ? trimmed : field.fieldName,
          properties: {},
          sourceDocumentId: documentId,
          confidence: fieldConfidence,
          sourceFieldName: field.fieldName,
        };

        if (mapping.personRole) {
          candidateNode.personRole = mapping.personRole;
        }
        if (mapping.orgType) {
          candidateNode.orgType = mapping.orgType;
        }

        allCandidateNodes.push(candidateNode);
      }
    }

    // 3b. Edge mappings
    const edgeMappings = getEdgeMappingsForField(field.fieldName, template);
    for (const mapping of edgeMappings) {
      const sourceKey = resolveSourceKey(mapping, allCandidateNodes, fieldsMap);
      const targetKey = resolveTargetKey(
        mapping,
        field.fieldValue,
        allCandidateNodes,
        document.claimId,
        fieldsMap,
      );

      if (!sourceKey || !targetKey) continue;

      rawCandidateEdges.push({
        edgeType: mapping.edgeType,
        sourceNodeKey: sourceKey,
        targetNodeKey: targetKey,
        properties: {},
        sourceDocumentId: documentId,
        confidence: fieldConfidence,
        sourceFieldName: field.fieldName,
      });
    }
  }

  // 4. Deduplicate candidate nodes by (nodeType + canonicalName)
  const seen = new Map<string, CandidateNode>();
  for (const node of allCandidateNodes) {
    const key = nodeKey(node.nodeType, node.canonicalName);
    if (!seen.has(key)) {
      seen.set(key, node);
    } else {
      // Keep the one with higher confidence
      const existing = seen.get(key)!;
      if (node.confidence > existing.confidence) {
        seen.set(key, node);
      }
    }
  }
  const candidateNodes = Array.from(seen.values());

  // 5. Validate candidate edges via ontology constraints
  const candidateEdges = rawCandidateEdges.filter((edge) => {
    const sourceType = resolveNodeType(edge.sourceNodeKey, candidateNodes);
    const targetType = resolveNodeType(edge.targetNodeKey, candidateNodes);
    return isValidEdge(edge.edgeType, sourceType, targetType);
  });

  // 6. Return result
  return {
    candidateNodes,
    candidateEdges,
    documentType,
    documentSubtype,
  };
}
