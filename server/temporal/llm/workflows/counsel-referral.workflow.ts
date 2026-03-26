/**
 * Counsel referral workflow — generates factual claim summaries for defense counsel.
 *
 * This is a fire-and-forget workflow: the route starts it and returns
 * the workflow ID for status polling. The examiner can check back later
 * for the result.
 *
 * V8 SANDBOX: This file runs in Temporal's deterministic V8 sandbox.
 * It CANNOT import Node.js modules, Prisma, or anything except
 * @temporalio/workflow. Types are duplicated here, not imported.
 */

import { proxyActivities } from '@temporalio/workflow';

// ---------------------------------------------------------------------------
// Activity interface (duplicated — V8 sandbox cannot import from activities)
// ---------------------------------------------------------------------------

interface ReferralResult {
  summary: string;
  sections: string[];
  wasBlocked: boolean;
  validationResult: 'PASS' | 'FAIL';
  violationCount: number;
}

interface CounselReferralActivities {
  generateReferralSummary(
    claimId: string,
    userId: string,
    legalIssue: string,
  ): Promise<ReferralResult>;
}

// ---------------------------------------------------------------------------
// Activity proxies
// ---------------------------------------------------------------------------

const activities = proxyActivities<CounselReferralActivities>({
  startToCloseTimeout: '60s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '5s',
    backoffCoefficient: 2,
  },
});

// ---------------------------------------------------------------------------
// Workflow input/output types
// ---------------------------------------------------------------------------

export interface CounselReferralWorkflowInput {
  claimId: string;
  userId: string;
  legalIssue: string;
}

export interface CounselReferralWorkflowResult {
  summary: string;
  sections: string[];
  wasBlocked: boolean;
  validationResult: 'PASS' | 'FAIL';
  violationCount: number;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Counsel referral workflow.
 *
 * Generates a factual summary of a claim for defense counsel referral.
 * The summary is validated for UPL compliance before delivery.
 */
export async function counselReferralWorkflow(
  input: CounselReferralWorkflowInput,
): Promise<CounselReferralWorkflowResult> {
  const result = await activities.generateReferralSummary(
    input.claimId,
    input.userId,
    input.legalIssue,
  );

  return {
    summary: result.summary,
    sections: result.sections,
    wasBlocked: result.wasBlocked,
    validationResult: result.validationResult,
    violationCount: result.violationCount,
  };
}
