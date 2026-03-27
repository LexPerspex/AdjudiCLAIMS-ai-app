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
