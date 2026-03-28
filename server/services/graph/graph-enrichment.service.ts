/**
 * Graph Enrichment Orchestrator
 *
 * Step 6 of the document processing pipeline. Orchestrates entity extraction,
 * resolution, and persistence into the claim knowledge graph.
 *
 * Flow:
 *   Document -> extractEntities() -> resolveAndMerge() -> persist nodes/edges
 *
 * Fault-tolerant: individual node/edge failures are logged but do not block
 * other operations or the wider pipeline.
 */

import { prisma } from '../../db.js';
import { extractEntities } from './entity-extraction.service.js';
import { resolveAndMerge } from './entity-resolution.service.js';
import { noisyOr } from './confidence.js';
import { processGraphWorkflowTriggers } from './graph-workflow-bridge.service.js';
import { processGraphDeadlineTriggers } from './graph-deadline-bridge.service.js';
import { processGraphInvestigationTriggers } from './graph-investigation-bridge.service.js';
import { processGraphBenefitTriggers } from './graph-benefit-bridge.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  documentId: string;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesUpdated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON field that should be a string array.
 * Handles both actual arrays (from Prisma JSON) and stringified arrays.
 */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not valid JSON
    }
  }
  return [];
}

/**
 * Add a value to a string array if not already present (case-insensitive).
 */
function addUnique(arr: string[], value: string): string[] {
  const lower = value.toLowerCase().trim();
  if (arr.some((v) => v.toLowerCase().trim() === lower)) return arr;
  return [...arr, value];
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Enrich the claim knowledge graph with entities extracted from a document.
 *
 * Orchestration steps:
 *   1. Extract candidate nodes and edges from the document
 *   2. Resolve candidates against existing graph nodes (dedup/merge)
 *   3. Persist new nodes and update existing ones
 *   4. Persist new edges and update existing ones
 *
 * @param documentId - The document to process
 * @returns Summary of graph changes
 */
export async function enrichGraph(
  documentId: string,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    documentId,
    nodesCreated: 0,
    nodesUpdated: 0,
    edgesCreated: 0,
    edgesUpdated: 0,
    errors: [],
  };

  // --- Step 1: Extract candidate nodes and edges ---
  const extraction = await extractEntities(documentId);

  if (
    extraction.candidateNodes.length === 0 &&
    extraction.candidateEdges.length === 0
  ) {
    return result;
  }

  // --- Step 2: Get claim context ---
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { claimId: true },
  });

  if (!document) {
    result.errors.push(`Document not found: ${documentId}`);
    return result;
  }

  const { claimId } = document;

  // --- Bridge tracking arrays ---
  const createdNodes: Array<{ nodeType: string; canonicalName: string; personRole?: string | null; properties: Record<string, unknown> }> = [];
  const createdEdges: Array<{ edgeType: string; properties: Record<string, unknown> }> = [];

  // --- Step 3: Resolve entities against existing graph ---
  const resolutionInput = extraction.candidateNodes.map((cn) => ({
    name: cn.canonicalName,
    nodeType: cn.nodeType,
    personRole: cn.personRole,
    orgType: cn.orgType,
  }));

  const resolvedNodes = await resolveAndMerge(resolutionInput, claimId);

  // --- Step 4: Persist nodes ---
  // Map canonical name (lowercased) -> persisted node ID for edge linking
  const nameToNodeId = new Map<string, string>();

  for (let i = 0; i < resolvedNodes.length; i++) {
    const resolved = resolvedNodes[i];
    const candidate = extraction.candidateNodes[i];

    try {
      if (resolved.resolution.matchTier === 'new') {
        // Create new node
        const node = await prisma.graphNode.create({
          data: {
            claimId,
            nodeType: candidate.nodeType,
            canonicalName: resolved.resolution.resolvedName,
            aliases: [],
            properties: candidate.properties,
            personRole: candidate.personRole ?? null,
            orgType: candidate.orgType ?? null,
            sourceDocumentIds: [documentId],
            confidence: candidate.confidence,
          },
        });

        nameToNodeId.set(
          resolved.resolution.resolvedName.toLowerCase().trim(),
          node.id,
        );
        createdNodes.push({
          nodeType: candidate.nodeType,
          canonicalName: resolved.resolution.resolvedName,
          personRole: candidate.personRole ?? null,
          properties: candidate.properties as Record<string, unknown>,
        });
        result.nodesCreated++;
      } else {
        // Update existing node (exact or fuzzy match)
        const existingNodeId = resolved.resolution.existingNodeId!;

        // Fetch current node to merge data
        const existing = await prisma.graphNode.findUnique({
          where: { id: existingNodeId },
        });

        if (existing) {
          const existingAliases = parseStringArray(existing.aliases);
          const existingSourceDocs = parseStringArray(
            existing.sourceDocumentIds,
          );

          // Merge aliases — add candidate name if different from canonical
          let updatedAliases = existingAliases;
          if (
            candidate.canonicalName.toLowerCase().trim() !==
            existing.canonicalName.toLowerCase().trim()
          ) {
            updatedAliases = addUnique(
              existingAliases,
              candidate.canonicalName,
            );
          }

          // Add documentId to source documents
          const updatedSourceDocs = addUnique(existingSourceDocs, documentId);

          // Combine confidence via noisy-OR
          const combinedConfidence = noisyOr([
            existing.confidence,
            candidate.confidence,
          ]);

          await prisma.graphNode.update({
            where: { id: existingNodeId },
            data: {
              aliases: updatedAliases,
              sourceDocumentIds: updatedSourceDocs,
              confidence: combinedConfidence,
            },
          });

          nameToNodeId.set(
            existing.canonicalName.toLowerCase().trim(),
            existingNodeId,
          );
          result.nodesUpdated++;
        }
      }
    } catch (err) {
      result.errors.push(
        `Node "${candidate.canonicalName}" failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // --- Step 5: Persist edges ---
  for (const candidateEdge of extraction.candidateEdges) {
    try {
      // Look up source and target node IDs
      const sourceNodeId = nameToNodeId.get(
        candidateEdge.sourceNodeKey.toLowerCase().trim(),
      );
      const targetNodeId = nameToNodeId.get(
        candidateEdge.targetNodeKey.toLowerCase().trim(),
      );

      if (!sourceNodeId || !targetNodeId) {
        // Skip edges where either end wasn't resolved
        continue;
      }

      // Check if an identical edge already exists
      const existingEdge = await prisma.graphEdge.findFirst({
        where: {
          claimId,
          edgeType: candidateEdge.edgeType,
          sourceNodeId,
          targetNodeId,
        },
      });

      if (existingEdge) {
        // Update existing edge — merge confidence and sources
        const existingSourceDocs = parseStringArray(
          existingEdge.sourceDocumentIds,
        );
        const updatedSourceDocs = addUnique(existingSourceDocs, documentId);
        const combinedConfidence = noisyOr([
          existingEdge.confidence,
          candidateEdge.confidence,
        ]);

        await prisma.graphEdge.update({
          where: { id: existingEdge.id },
          data: {
            sourceDocumentIds: updatedSourceDocs,
            confidence: combinedConfidence,
          },
        });

        result.edgesUpdated++;
      } else {
        // Create new edge
        await prisma.graphEdge.create({
          data: {
            claimId,
            edgeType: candidateEdge.edgeType,
            sourceNodeId,
            targetNodeId,
            properties: candidateEdge.properties,
            sourceDocumentIds: [documentId],
            confidence: candidateEdge.confidence,
          },
        });

        createdEdges.push({
          edgeType: candidateEdge.edgeType,
          properties: candidateEdge.properties as Record<string, unknown>,
        });
        result.edgesCreated++;
      }
    } catch (err) {
      result.errors.push(
        `Edge "${candidateEdge.edgeType}" (${candidateEdge.sourceNodeKey} -> ${candidateEdge.targetNodeKey}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // --- Bridge processing (non-fatal) ---
  try {
    await Promise.all([
      processGraphWorkflowTriggers(claimId, createdNodes, createdEdges),
      processGraphDeadlineTriggers(claimId, createdNodes, createdEdges),
      processGraphInvestigationTriggers(claimId, createdNodes, createdEdges),
      processGraphBenefitTriggers(claimId, createdEdges),
    ]);
  } catch (err) {
    console.warn('[graph-enrichment] Bridge processing failed:', err instanceof Error ? err.message : String(err));
  }

  return result;
}
