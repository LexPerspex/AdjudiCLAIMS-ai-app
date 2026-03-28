/**
 * Workflow trigger map service — maps DocumentType to workflow triggers.
 *
 * When a document is classified in the pipeline, this service determines
 * which decision workflows should be started or updated for the claim.
 *
 * Design:
 *   - Static mapping from DocumentType enum values to workflow triggers
 *   - Duplicate prevention: checks for active (non-complete) workflows
 *     before creating new WorkflowProgress records
 *   - Non-fatal: trigger failures do not block the document pipeline
 *
 * UPL Note: All triggered workflows are GREEN zone (factual/procedural).
 * This service routes documents to the correct procedural workflow —
 * it does not perform legal analysis.
 */

import { type Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { WORKFLOWS_BY_ID } from '../data/workflow-definitions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowTrigger {
  /** The workflow definition ID to trigger (must exist in workflow-definitions.ts). */
  workflowId: string;
  /** Human-readable reason why this workflow was triggered. */
  reason: string;
  /** Priority level for examiner attention. */
  priority: 'high' | 'medium' | 'low';
}

export interface TriggerMapResult {
  /** Workflows that were triggered (or already active) for this document type. */
  triggeredWorkflows: WorkflowTrigger[];
  /** The document type that was used for the lookup. */
  documentType: string;
}

// ---------------------------------------------------------------------------
// Static trigger map
// ---------------------------------------------------------------------------

/**
 * Maps DocumentType enum values to the workflows they should trigger.
 *
 * Not every DocumentType has triggers — unmapped types (e.g., OTHER,
 * CORRESPONDENCE, IMAGING_REPORT) return an empty array. This is
 * intentional: those document types do not initiate examiner workflows.
 *
 * Workflow IDs must match entries in workflow-definitions.ts.
 */
const DOCUMENT_TYPE_TRIGGERS: Record<string, WorkflowTrigger[]> = {
  DWC1_CLAIM_FORM: [
    {
      workflowId: 'new_claim_intake',
      reason: 'New DWC-1 claim form received',
      priority: 'high',
    },
    {
      workflowId: 'three_point_contact',
      reason: 'Initiate three-point contact per 10 CCR 2695.5',
      priority: 'high',
    },
  ],
  MEDICAL_REPORT: [
    {
      workflowId: 'reserve_setting',
      reason: 'New medical report requires review — reassess reserves',
      priority: 'medium',
    },
  ],
  AME_QME_REPORT: [
    {
      workflowId: 'qme_ame_process',
      reason: 'QME/AME report received — review findings',
      priority: 'high',
    },
  ],
  UTILIZATION_REVIEW: [
    {
      workflowId: 'ur_treatment_authorization',
      reason: 'UR determination received',
      priority: 'high',
    },
  ],
  BILLING_STATEMENT: [
    {
      workflowId: 'lien_management',
      reason: 'Billing received — check for lien implications',
      priority: 'low',
    },
  ],
  WAGE_STATEMENT: [
    {
      workflowId: 'reserve_setting',
      reason: 'Wage data received — recalculate AWE and reserves',
      priority: 'medium',
    },
  ],
  LEGAL_CORRESPONDENCE: [
    {
      workflowId: 'counsel_referral',
      reason: 'Legal correspondence — route to defense counsel',
      priority: 'high',
    },
  ],
  BENEFIT_NOTICE: [
    {
      workflowId: 'td_benefit_initiation',
      reason: 'Benefit notice — verify payment compliance',
      priority: 'medium',
    },
  ],
  EMPLOYER_REPORT: [
    {
      workflowId: 'three_point_contact',
      reason: 'Employer report received — update investigation',
      priority: 'medium',
    },
  ],
  WCAB_FILING: [
    {
      workflowId: 'counsel_referral',
      reason: 'WCAB filing — legal review required',
      priority: 'high',
    },
  ],
  SETTLEMENT_DOCUMENT: [
    {
      workflowId: 'counsel_referral',
      reason: 'Settlement document — attorney review required',
      priority: 'high',
    },
  ],
  RETURN_TO_WORK: [
    {
      workflowId: 'return_to_work',
      reason: 'RTW document — evaluate offer compliance',
      priority: 'medium',
    },
  ],
  LIEN_CLAIM: [
    {
      workflowId: 'lien_management',
      reason: 'Lien filed — initiate lien management workflow',
      priority: 'medium',
    },
  ],
  DISCOVERY_REQUEST: [
    {
      workflowId: 'counsel_referral',
      reason: 'Discovery request — attorney handling required',
      priority: 'high',
    },
  ],
  DWC_OFFICIAL_FORM: [
    {
      workflowId: 'reserve_setting',
      reason: 'DWC form received — review and update reserves',
      priority: 'low',
    },
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the workflow triggers for a given document type.
 *
 * Returns an empty array for unmapped document types — this is expected
 * for types like OTHER, CORRESPONDENCE, IMAGING_REPORT, etc. that do not
 * initiate examiner workflows.
 */
export function getTriggersForDocumentType(
  documentType: string,
): WorkflowTrigger[] {
  return DOCUMENT_TYPE_TRIGGERS[documentType] ?? [];
}

/**
 * Process workflow triggers for a classified document.
 *
 * 1. Looks up triggers for the document type
 * 2. For each trigger, checks if the workflow is already active
 *    (non-complete) for this claim+user pair to avoid duplicates
 * 3. Creates new WorkflowProgress records for workflows not yet active
 * 4. Returns the result with the list of triggered workflows
 *
 * @param claimId - The claim the document belongs to.
 * @param userId  - The user who uploaded / is responsible for the document.
 * @param documentType - The classified DocumentType enum value.
 * @returns Summary of workflows that were triggered.
 */
export async function processWorkflowTriggers(
  claimId: string,
  userId: string,
  documentType: string,
): Promise<TriggerMapResult> {
  const triggers = getTriggersForDocumentType(documentType);

  if (triggers.length === 0) {
    return { triggeredWorkflows: [], documentType };
  }

  const triggeredWorkflows: WorkflowTrigger[] = [];

  for (const trigger of triggers) {
    // Validate the workflow ID exists in definitions
    const workflowDef = WORKFLOWS_BY_ID.get(trigger.workflowId);
    if (!workflowDef) {
      // Skip unknown workflow IDs — this is a config error, not a runtime error
      continue;
    }

    // Check if this workflow is already active (not complete) for this claim+user
    const existing = await prisma.workflowProgress.findUnique({
      where: {
        claimId_userId_workflowId: {
          claimId,
          userId,
          workflowId: trigger.workflowId,
        },
      },
      select: { isComplete: true },
    });

    // Skip if the workflow is already active (exists and not complete)
    if (existing && !existing.isComplete) {
      continue;
    }

    // If the workflow was previously completed, we allow re-triggering
    // by deleting the old record first (new document = new workflow cycle)
    if (existing && existing.isComplete) {
      await prisma.workflowProgress.delete({
        where: {
          claimId_userId_workflowId: {
            claimId,
            userId,
            workflowId: trigger.workflowId,
          },
        },
      });
    }

    // Create the initial WorkflowProgress record with all steps PENDING
    const initialStatuses = workflowDef.steps.map((step) => ({
      stepId: step.id,
      status: 'PENDING' as const,
    }));

    await prisma.workflowProgress.create({
      data: {
        claimId,
        userId,
        workflowId: trigger.workflowId,
        stepStatuses: initialStatuses as unknown as Prisma.InputJsonValue,
        isComplete: false,
      },
    });

    triggeredWorkflows.push(trigger);
  }

  return { triggeredWorkflows, documentType };
}
