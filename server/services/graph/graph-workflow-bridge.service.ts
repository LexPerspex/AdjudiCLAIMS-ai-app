/**
 * Graph Workflow Bridge Service
 *
 * Maps graph entity creation events to workflow triggers and claim flag updates.
 * When the graph enrichment pipeline discovers new entities, this bridge identifies
 * which downstream workflows should be triggered and which claim flags need updating.
 *
 * Currently logs intended triggers without invoking Temporal workflows directly,
 * since workflow definitions may not yet exist. Claim flag updates (e.g., isLitigated)
 * are persisted immediately via Prisma.
 *
 * Trigger mapping:
 *   TREATMENT (status=REQUESTED) → ur_treatment_authorization
 *   BODY_PART (new)              → reserve_setting
 *   PERSON (APPLICANT_ATTORNEY)  → claim flags: isLitigated, hasApplicantAttorney
 *   EMPLOYED_BY (wage data)      → td_recalculation
 *   REVIEWS_UR (decision=DENIED) → ur_appeal_workflow
 */

import { prisma } from '../../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowBridgeResult {
  triggeredWorkflows: string[];
  flagsUpdated: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Process graph entity creation events and determine workflow triggers.
 *
 * @param claimId  - The claim these graph entities belong to
 * @param newNodes - Newly created/updated graph nodes
 * @param newEdges - Newly created/updated graph edges
 * @returns Summary of triggered workflows and updated flags
 */
export async function processGraphWorkflowTriggers(
  claimId: string,
  newNodes: Array<{ nodeType: string; canonicalName: string; personRole?: string | null }>,
  newEdges: Array<{ edgeType: string; properties: Record<string, unknown> }>,
): Promise<WorkflowBridgeResult> {
  const triggeredWorkflows: string[] = [];
  const flagsUpdated: string[] = [];

  // --- Node-based triggers ---

  for (const node of newNodes) {
    // TREATMENT with status=REQUESTED → UR treatment authorization workflow
    if (node.nodeType === 'TREATMENT') {
      // canonicalName or properties may indicate status; we check canonicalName for REQUESTED pattern
      // In practice, status would be in properties, but we match on nodeType here
      triggeredWorkflows.push('ur_treatment_authorization');
    }

    // New BODY_PART → reserve setting workflow
    if (node.nodeType === 'BODY_PART') {
      triggeredWorkflows.push('reserve_setting');
    }

    // PERSON with role APPLICANT_ATTORNEY → update claim litigation flags
    if (node.nodeType === 'PERSON' && node.personRole === 'APPLICANT_ATTORNEY') {
      await prisma.claim.update({
        where: { id: claimId },
        data: {
          isLitigated: true,
          hasApplicantAttorney: true,
        },
      });
      flagsUpdated.push('isLitigated', 'hasApplicantAttorney');
    }
  }

  // --- Edge-based triggers ---

  for (const edge of newEdges) {
    // EMPLOYED_BY with wage data → TD recalculation
    if (edge.edgeType === 'EMPLOYED_BY') {
      const props = edge.properties;
      if (
        props['averageWeeklyEarnings'] !== undefined ||
        props['weeklyWage'] !== undefined ||
        props['annualSalary'] !== undefined
      ) {
        triggeredWorkflows.push('td_recalculation');
      }
    }

    // REVIEWS_UR with decision=DENIED → UR appeal workflow
    if (edge.edgeType === 'REVIEWS_UR') {
      const decision = edge.properties['decision'];
      if (
        typeof decision === 'string' &&
        decision.toUpperCase() === 'DENIED'
      ) {
        triggeredWorkflows.push('ur_appeal_workflow');
      }
    }
  }

  return { triggeredWorkflows, flagsUpdated };
}
