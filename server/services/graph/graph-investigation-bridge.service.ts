/**
 * Graph Investigation Bridge Service
 *
 * Maps graph entity presence to investigation checklist auto-completion.
 * When the graph enrichment pipeline discovers persons with specific roles
 * or employment edges with wage data, this bridge marks the corresponding
 * investigation checklist items as complete.
 *
 * Trigger mapping:
 *   PERSON (APPLICANT) with contactInfo        → THREE_POINT_CONTACT_WORKER
 *   PERSON (EMPLOYER_REP)                      → THREE_POINT_CONTACT_EMPLOYER
 *   PERSON (TREATING_PHYSICIAN)                → THREE_POINT_CONTACT_PROVIDER
 *   EMPLOYED_BY edge with wage data            → AWE_VERIFIED
 */

import { prisma } from '../../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestigationBridgeResult {
  itemsCompleted: number;
  itemTypes: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Process graph entity creation events and auto-complete investigation items.
 *
 * @param claimId  - The claim these graph entities belong to
 * @param newNodes - Newly created/updated graph nodes
 * @param newEdges - Newly created/updated graph edges
 * @returns Summary of investigation items auto-completed
 */
export async function processGraphInvestigationTriggers(
  claimId: string,
  newNodes: Array<{ nodeType: string; personRole?: string | null; properties: Record<string, unknown> }>,
  newEdges: Array<{ edgeType: string; properties: Record<string, unknown> }>,
): Promise<InvestigationBridgeResult> {
  let itemsCompleted = 0;
  const itemTypes: string[] = [];

  // Collect item types to auto-complete based on graph entities
  const itemsToComplete: string[] = [];

  // --- Node-based triggers ---

  for (const node of newNodes) {
    if (node.nodeType !== 'PERSON') continue;

    // APPLICANT with contactInfo → THREE_POINT_CONTACT_WORKER
    if (node.personRole === 'APPLICANT' && node.properties['contactInfo']) {
      itemsToComplete.push('THREE_POINT_CONTACT_WORKER');
    }

    // EMPLOYER_REP → THREE_POINT_CONTACT_EMPLOYER
    if (node.personRole === 'EMPLOYER_REP') {
      itemsToComplete.push('THREE_POINT_CONTACT_EMPLOYER');
    }

    // TREATING_PHYSICIAN → THREE_POINT_CONTACT_PROVIDER
    if (node.personRole === 'TREATING_PHYSICIAN') {
      itemsToComplete.push('THREE_POINT_CONTACT_PROVIDER');
    }
  }

  // --- Edge-based triggers ---

  for (const edge of newEdges) {
    // EMPLOYED_BY with wage data → AWE_VERIFIED
    if (edge.edgeType === 'EMPLOYED_BY') {
      const props = edge.properties;
      if (
        props['averageWeeklyEarnings'] !== undefined ||
        props['weeklyWage'] !== undefined ||
        props['annualSalary'] !== undefined
      ) {
        itemsToComplete.push('AWE_VERIFIED');
      }
    }
  }

  // --- Mark items complete ---

  for (const itemType of itemsToComplete) {
    const result = await prisma.investigationItem.updateMany({
      where: {
        claimId,
        itemType: itemType as never,
        isComplete: false,
      },
      data: {
        isComplete: true,
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      itemsCompleted += result.count;
      itemTypes.push(itemType);
    }
  }

  return { itemsCompleted, itemTypes };
}
