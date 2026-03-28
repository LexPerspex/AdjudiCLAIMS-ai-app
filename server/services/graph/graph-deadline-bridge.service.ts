/**
 * Graph Deadline Bridge Service
 *
 * Maps graph date entities to deadline recalculation. When the graph enrichment
 * pipeline discovers or updates date-bearing entities, this bridge recalculates
 * or creates regulatory deadlines as appropriate.
 *
 * Trigger mapping:
 *   CLAIM node with dateOfInjury    → recalculate all pending deadlines
 *   EMPLOYED_BY edge with endDate   → create TD_SUBSEQUENT_14DAY deadline
 *   REVIEWS_UR edge with decision   → create UR_RETROSPECTIVE_30DAY deadline
 */

import { prisma } from '../../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeadlineBridgeResult {
  deadlinesRecalculated: number;
  deadlinesCreated: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add calendar days to a date. */
function addCalendarDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// ---------------------------------------------------------------------------
// Deadline type → statutory period mapping (calendar days)
// ---------------------------------------------------------------------------

const DEADLINE_DAYS: Record<string, { days: number }> = {
  ACKNOWLEDGE_15DAY: { days: 15 },
  DETERMINE_40DAY: { days: 40 },
  TD_FIRST_14DAY: { days: 14 },
  TD_SUBSEQUENT_14DAY: { days: 14 },
  DELAY_NOTICE_30DAY: { days: 30 },
  UR_PROSPECTIVE_5DAY: { days: 5 },
  UR_RETROSPECTIVE_30DAY: { days: 30 },
  EMPLOYER_NOTIFY_15DAY: { days: 15 },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Process graph entity creation events and manage regulatory deadlines.
 *
 * @param claimId  - The claim these graph entities belong to
 * @param newNodes - Newly created/updated graph nodes
 * @param newEdges - Newly created/updated graph edges
 * @returns Summary of deadlines recalculated and created
 */
export async function processGraphDeadlineTriggers(
  claimId: string,
  newNodes: Array<{ nodeType: string; properties: Record<string, unknown> }>,
  newEdges: Array<{ edgeType: string; properties: Record<string, unknown> }>,
): Promise<DeadlineBridgeResult> {
  let deadlinesRecalculated = 0;
  let deadlinesCreated = 0;

  // --- CLAIM node with updated dateOfInjury → recalculate all pending deadlines ---

  for (const node of newNodes) {
    if (node.nodeType === 'CLAIM' && node.properties['dateOfInjury']) {
      const newInjuryDate = new Date(node.properties['dateOfInjury'] as string);

      // Find all pending deadlines for this claim
      const pendingDeadlines = await prisma.regulatoryDeadline.findMany({
        where: { claimId, status: 'PENDING' },
      });

      for (const deadline of pendingDeadlines) {
        const config = DEADLINE_DAYS[deadline.deadlineType];
        if (config) {
          const newDueDate = addCalendarDays(newInjuryDate, config.days);
          await prisma.regulatoryDeadline.update({
            where: { id: deadline.id },
            data: { dueDate: newDueDate },
          });
          deadlinesRecalculated++;
        }
      }
    }
  }

  // --- Edge-based deadline creation ---

  for (const edge of newEdges) {
    // EMPLOYED_BY with endDate → create TD_SUBSEQUENT_14DAY if not exists
    if (edge.edgeType === 'EMPLOYED_BY' && edge.properties['endDate']) {
      const endDate = new Date(edge.properties['endDate'] as string);
      const dueDate = addCalendarDays(endDate, 14);

      const existing = await prisma.regulatoryDeadline.findFirst({
        where: { claimId, deadlineType: 'TD_SUBSEQUENT_14DAY' },
      });

      if (!existing) {
        await prisma.regulatoryDeadline.create({
          data: {
            claimId,
            deadlineType: 'TD_SUBSEQUENT_14DAY',
            dueDate,
            status: 'PENDING',
            statutoryAuthority: 'LC 4650',
          },
        });
        deadlinesCreated++;
      }
    }

    // REVIEWS_UR with decision date → create UR_RETROSPECTIVE_30DAY if not exists
    if (edge.edgeType === 'REVIEWS_UR' && edge.properties['decisionDate']) {
      const decisionDate = new Date(edge.properties['decisionDate'] as string);
      const dueDate = addCalendarDays(decisionDate, 30);

      const existing = await prisma.regulatoryDeadline.findFirst({
        where: { claimId, deadlineType: 'UR_RETROSPECTIVE_30DAY' },
      });

      if (!existing) {
        await prisma.regulatoryDeadline.create({
          data: {
            claimId,
            deadlineType: 'UR_RETROSPECTIVE_30DAY',
            dueDate,
            status: 'PENDING',
            statutoryAuthority: 'LC 4610',
          },
        });
        deadlinesCreated++;
      }
    }
  }

  return { deadlinesRecalculated, deadlinesCreated };
}
