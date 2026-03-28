/**
 * Workflow engine service — decision workflow lifecycle management.
 *
 * Manages the creation, step completion, step skipping, and progress
 * tracking of decision workflows for a given claim and user.
 *
 * Workflows are defined statically in workflow-definitions.ts.
 * Progress is persisted per-claim, per-user, per-workflow in
 * the WorkflowProgress Prisma model.
 *
 * UPL Note: All workflows are GREEN zone (factual/procedural guidance)
 * unless steps are explicitly annotated YELLOW. This service enforces
 * no legal conclusions — it tracks examiner procedural compliance only.
 */

import { type Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { WORKFLOWS_BY_ID, WORKFLOW_DEFINITIONS } from '../data/workflow-definitions.js';
import type { WorkflowDefinition } from '../data/workflow-definitions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Persisted status of a single workflow step.
 *
 * Stored as JSON array in WorkflowProgress.stepStatuses. Each entry tracks
 * whether the step is pending, completed, or skipped. Skipped steps must
 * have a reason explaining why (for audit trail). Steps marked as
 * isSkippable=false in the workflow definition cannot be skipped.
 */
interface StepStatusEntry {
  /** The workflow step ID this status belongs to. */
  stepId: string;
  /** Current status: PENDING (not started), COMPLETED, or SKIPPED. */
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  /** ISO timestamp when the step was completed (only for COMPLETED). */
  completedAt?: string;
  /** Examiner-provided reason for skipping (required for SKIPPED). */
  skipReason?: string;
}

export interface WorkflowProgressDetail {
  workflowId: string;
  title: string;
  isComplete: boolean;
  startedAt: Date;
  completedAt: Date | null;
  steps: {
    id: string;
    title: string;
    description: string;
    authority: string;
    status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
    completedAt?: string;
    skipReason?: string;
  }[];
  completedSteps: number;
  totalSteps: number;
  percentComplete: number;
}

export interface WorkflowSummary {
  id: string;
  title: string;
  description: string;
  uplZone: string;
  authority: string;
  estimatedMinutes: number;
  stepCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the stepStatuses JSON field from the database into a typed array.
 * Prisma returns Json fields as `unknown`; we cast and validate shape here.
 */
function parseStepStatuses(raw: unknown): StepStatusEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as StepStatusEntry[];
}

/**
 * Determine whether all non-skipped steps are COMPLETED, meaning the
 * workflow as a whole is complete.
 */
function checkAllComplete(statuses: StepStatusEntry[]): boolean {
  if (statuses.length === 0) return false;
  return statuses.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a workflow definition by ID.
 * Returns null if the workflow ID is not recognised.
 */
export function getWorkflow(workflowId: string): WorkflowDefinition | null {
  return WORKFLOWS_BY_ID.get(workflowId) ?? null;
}

/**
 * Return summary metadata for all workflow definitions.
 * Full step detail is not included — use getWorkflowProgress for that.
 */
export function getAllWorkflows(): WorkflowSummary[] {
  return WORKFLOW_DEFINITIONS.map((w) => ({
    id: w.id,
    title: w.title,
    description: w.description,
    uplZone: w.uplZone,
    authority: w.authority,
    estimatedMinutes: w.estimatedMinutes,
    stepCount: w.steps.length,
  }));
}

/**
 * Start a workflow for a claim/user pair.
 *
 * Creates a WorkflowProgress record initialised with all steps set to PENDING.
 * Throws if the workflow has already been started (unique constraint violation
 * on [claimId, userId, workflowId]).
 *
 * @throws Error if the workflowId is not a recognised workflow.
 * @throws Error (Prisma P2002) if the workflow was already started.
 */
export async function startWorkflow(
  userId: string,
  claimId: string,
  workflowId: string,
): Promise<WorkflowProgressDetail> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflowId: "${workflowId}"`);
  }

  const initialStatuses: StepStatusEntry[] = workflow.steps.map((step) => ({
    stepId: step.id,
    status: 'PENDING',
  }));

  const record = await prisma.workflowProgress.create({
    data: {
      claimId,
      userId,
      workflowId,
      stepStatuses: initialStatuses as unknown as Prisma.InputJsonValue,
      isComplete: false,
    },
  });

  return buildProgressDetail(workflow, record);
}

/**
 * Mark a step as COMPLETED.
 *
 * If all non-skipped steps are now complete, sets isComplete = true and
 * records completedAt on the WorkflowProgress row.
 *
 * @throws Error if the workflowId or stepId is not recognised.
 * @throws Error if no WorkflowProgress record exists for the given identifiers.
 */
export async function completeStep(
  userId: string,
  claimId: string,
  workflowId: string,
  stepId: string,
): Promise<WorkflowProgressDetail> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflowId: "${workflowId}"`);
  }

  const stepDef = workflow.steps.find((s) => s.id === stepId);
  if (!stepDef) {
    throw new Error(`Unknown stepId: "${stepId}" in workflow "${workflowId}"`);
  }

  const record = await prisma.workflowProgress.findUniqueOrThrow({
    where: { claimId_userId_workflowId: { claimId, userId, workflowId } },
  });

  const statuses = parseStepStatuses(record.stepStatuses);

  const updated = statuses.map((s) =>
    s.stepId === stepId
      ? ({ stepId, status: 'COMPLETED', completedAt: new Date().toISOString() } as StepStatusEntry)
      : s,
  );

  const nowComplete = checkAllComplete(updated);
  const completedAt = nowComplete ? new Date() : null;

  const saved = await prisma.workflowProgress.update({
    where: { id: record.id },
    data: {
      stepStatuses: updated as unknown as Prisma.InputJsonValue,
      isComplete: nowComplete,
      ...(nowComplete ? { completedAt } : {}),
    },
  });

  return buildProgressDetail(workflow, saved);
}

/**
 * Mark a step as SKIPPED with an explanatory reason.
 *
 * Only steps whose definition has isSkippable = true may be skipped.
 * If all non-skipped steps are now complete after skipping, the workflow
 * is marked complete.
 *
 * @throws Error if the workflowId or stepId is not recognised.
 * @throws Error if the step is not skippable.
 * @throws Error if no WorkflowProgress record exists for the given identifiers.
 */
export async function skipStep(
  userId: string,
  claimId: string,
  workflowId: string,
  stepId: string,
  reason: string,
): Promise<WorkflowProgressDetail> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflowId: "${workflowId}"`);
  }

  const stepDef = workflow.steps.find((s) => s.id === stepId);
  if (!stepDef) {
    throw new Error(`Unknown stepId: "${stepId}" in workflow "${workflowId}"`);
  }

  if (!stepDef.isSkippable) {
    throw new Error(
      `Step "${stepId}" in workflow "${workflowId}" is not skippable.`,
    );
  }

  const record = await prisma.workflowProgress.findUniqueOrThrow({
    where: { claimId_userId_workflowId: { claimId, userId, workflowId } },
  });

  const statuses = parseStepStatuses(record.stepStatuses);

  const updated = statuses.map((s) =>
    s.stepId === stepId
      ? ({ stepId, status: 'SKIPPED', skipReason: reason } as StepStatusEntry)
      : s,
  );

  const nowComplete = checkAllComplete(updated);
  const completedAt = nowComplete ? new Date() : null;

  const saved = await prisma.workflowProgress.update({
    where: { id: record.id },
    data: {
      stepStatuses: updated as unknown as Prisma.InputJsonValue,
      isComplete: nowComplete,
      ...(nowComplete ? { completedAt } : {}),
    },
  });

  return buildProgressDetail(workflow, saved);
}

/**
 * Retrieve merged workflow definition + persisted progress for a
 * claim/user/workflow combination.
 *
 * Returns a fully hydrated WorkflowProgressDetail merging static step
 * metadata with per-step statuses from the database.
 *
 * @throws Error if the workflowId is not recognised.
 * @throws Error if no WorkflowProgress record exists (workflow not started).
 */
export async function getWorkflowProgress(
  userId: string,
  claimId: string,
  workflowId: string,
): Promise<WorkflowProgressDetail> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflowId: "${workflowId}"`);
  }

  const record = await prisma.workflowProgress.findUniqueOrThrow({
    where: { claimId_userId_workflowId: { claimId, userId, workflowId } },
  });

  return buildProgressDetail(workflow, record);
}

/**
 * Auto-advance workflow steps based on a newly classified document type.
 *
 * When a document is classified, certain workflow steps can be automatically
 * completed. For example, receiving a DWC-1 claim form auto-completes the
 * "Receive and log claim notice" step in the new_claim_intake workflow.
 *
 * This function finds all active (non-complete) WorkflowProgress records for
 * the claim with the given workflowId (any user), updates matching steps to
 * COMPLETED, and checks if the workflow is now fully complete.
 *
 * @param claimId - The claim to advance.
 * @param workflowId - The workflow to advance steps in.
 * @param documentType - The classified DocumentType that triggers auto-completion.
 * @returns The step IDs that were advanced and whether the workflow is now complete.
 */
export async function autoAdvanceWorkflow(
  claimId: string,
  workflowId: string,
  documentType: string,
): Promise<{ stepsAdvanced: string[]; isComplete: boolean }> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return { stepsAdvanced: [], isComplete: false };
  }

  const workflowMap = AUTO_COMPLETE_MAP[workflowId];
  if (!workflowMap) {
    return { stepsAdvanced: [], isComplete: false };
  }

  const stepsToComplete = workflowMap[documentType];
  if (!stepsToComplete || stepsToComplete.length === 0) {
    return { stepsAdvanced: [], isComplete: false };
  }

  // Find all active workflow progress records for this claim+workflow (any user)
  const records = await prisma.workflowProgress.findMany({
    where: { claimId, workflowId, isComplete: false },
  });

  if (records.length === 0) {
    return { stepsAdvanced: [], isComplete: false };
  }

  const allAdvanced: string[] = [];
  let anyComplete = false;

  for (const record of records) {
    const statuses = parseStepStatuses(record.stepStatuses);
    const advanced: string[] = [];

    const updated = statuses.map((s) => {
      if (stepsToComplete.includes(s.stepId) && s.status === 'PENDING') {
        advanced.push(s.stepId);
        return { stepId: s.stepId, status: 'COMPLETED' as const, completedAt: new Date().toISOString() };
      }
      return s;
    });

    if (advanced.length > 0) {
      const nowComplete = checkAllComplete(updated);
      const completedAt = nowComplete ? new Date() : null;

      await prisma.workflowProgress.update({
        where: { id: record.id },
        data: {
          stepStatuses: updated as unknown as Prisma.InputJsonValue,
          isComplete: nowComplete,
          ...(nowComplete ? { completedAt } : {}),
        },
      });

      allAdvanced.push(...advanced);
      if (nowComplete) anyComplete = true;
    }
  }

  return { stepsAdvanced: [...new Set(allAdvanced)], isComplete: anyComplete };
}

/**
 * Get workflows that need examiner attention for a claim, sorted by urgency.
 *
 * Returns all active (non-complete) workflows for the claim with a count of
 * pending steps and an urgency classification based on workflow start date:
 *   - overdue: started more than 5 days ago with pending steps
 *   - due_soon: started more than 2 days ago with pending steps
 *   - normal: all others
 *
 * @param claimId - The claim to check workflows for.
 * @returns Array of workflows needing attention, sorted by urgency.
 */
export async function getWorkflowsNeedingAttention(
  claimId: string,
): Promise<Array<{ workflowId: string; title: string; pendingSteps: number; urgency: 'overdue' | 'due_soon' | 'normal' }>> {
  const records = await prisma.workflowProgress.findMany({
    where: { claimId, isComplete: false },
  });

  const now = new Date();
  const results: Array<{ workflowId: string; title: string; pendingSteps: number; urgency: 'overdue' | 'due_soon' | 'normal' }> = [];

  for (const record of records) {
    const workflow = getWorkflow(record.workflowId);
    if (!workflow) continue;

    const statuses = parseStepStatuses(record.stepStatuses);
    const pendingSteps = statuses.filter((s) => s.status === 'PENDING').length;

    if (pendingSteps === 0) continue;

    const daysSinceStart = (now.getTime() - record.startedAt.getTime()) / (1000 * 60 * 60 * 24);

    let urgency: 'overdue' | 'due_soon' | 'normal';
    if (daysSinceStart > 5) {
      urgency = 'overdue';
    } else if (daysSinceStart > 2) {
      urgency = 'due_soon';
    } else {
      urgency = 'normal';
    }

    results.push({
      workflowId: record.workflowId,
      title: workflow.title,
      pendingSteps,
      urgency,
    });
  }

  // Sort by urgency: overdue first, then due_soon, then normal
  const urgencyOrder = { overdue: 0, due_soon: 1, normal: 2 };
  results.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return results;
}

// ---------------------------------------------------------------------------
// Auto-complete map — maps workflow+documentType to auto-completable step IDs
// ---------------------------------------------------------------------------

/**
 * Static map of workflow ID → document type → step IDs that can be
 * auto-completed when a document of that type is classified.
 *
 * Only the initial receipt/logging steps are auto-completed — substantive
 * review steps always require examiner action.
 */
const AUTO_COMPLETE_MAP: Record<string, Record<string, string[]>> = {
  new_claim_intake: {
    DWC1_CLAIM_FORM: ['intake_step_1'],       // Receive and log claim notice
    EMPLOYER_REPORT: ['intake_step_4'],        // Notify the employer
  },
  three_point_contact: {
    EMPLOYER_REPORT: ['three_point_step_2'],   // Contact the employer
    MEDICAL_REPORT: ['three_point_step_3'],    // Contact the treating physician
  },
  qme_ame_process: {
    AME_QME_REPORT: ['qme_step_3'],           // Receive QME/AME report
  },
  ur_treatment_authorization: {
    UTILIZATION_REVIEW: ['ur_step_1'],         // Receive UR determination
  },
  reserve_setting: {
    WAGE_STATEMENT: ['reserve_step_1'],        // Gather financial data
    MEDICAL_REPORT: ['reserve_step_2'],        // Review medical data
  },
  lien_management: {
    LIEN_CLAIM: ['lien_step_1'],              // Receive and log lien
    BILLING_STATEMENT: ['lien_step_2'],       // Review billing
  },
  return_to_work: {
    RETURN_TO_WORK: ['rtw_step_1'],           // Receive RTW document
  },
  employer_notification: {
    EMPLOYER_REPORT: ['employer_step_1'],      // Receive employer report
  },
};

// ---------------------------------------------------------------------------
// Internal builder
// ---------------------------------------------------------------------------

/**
 * Merge a workflow definition with a persisted WorkflowProgress record
 * into a WorkflowProgressDetail response shape.
 */
function buildProgressDetail(
  workflow: WorkflowDefinition,
  record: {
    workflowId: string;
    isComplete: boolean;
    startedAt: Date;
    completedAt: Date | null;
    stepStatuses: unknown;
  },
): WorkflowProgressDetail {
  const statuses = parseStepStatuses(record.stepStatuses);
  const statusMap = new Map(statuses.map((s) => [s.stepId, s]));

  const steps = workflow.steps.map((stepDef) => {
    const progress = statusMap.get(stepDef.id);
    const status = progress?.status ?? 'PENDING';
    return {
      id: stepDef.id,
      title: stepDef.title,
      description: stepDef.description,
      authority: stepDef.authority,
      status,
      ...(progress?.completedAt ? { completedAt: progress.completedAt } : {}),
      ...(progress?.skipReason ? { skipReason: progress.skipReason } : {}),
    };
  });

  const completedSteps = steps.filter((s) => s.status === 'COMPLETED').length;
  const totalSteps = steps.length;
  const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return {
    workflowId: record.workflowId,
    title: workflow.title,
    isComplete: record.isComplete,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    steps,
    completedSteps,
    totalSteps,
    percentComplete,
  };
}
