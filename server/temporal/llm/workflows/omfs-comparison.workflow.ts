/**
 * OMFS comparison workflow — compares lien bills against OMFS rates.
 *
 * This is a fire-and-forget workflow: the route starts it and returns
 * the workflow ID for status polling. GREEN zone feature — factual
 * fee schedule comparison with no legal analysis.
 *
 * V8 SANDBOX: This file runs in Temporal's deterministic V8 sandbox.
 * It CANNOT import Node.js modules, Prisma, or anything except
 * @temporalio/workflow. Types are duplicated here, not imported.
 */

import { proxyActivities } from '@temporalio/workflow';

// ---------------------------------------------------------------------------
// Activity interface (duplicated — V8 sandbox cannot import from activities)
// ---------------------------------------------------------------------------

interface BillComparisonLineItem {
  cptCode: string;
  description: string;
  amountClaimed: number;
  omfsAllowed: number | null;
  isOvercharge: boolean;
  overchargeAmount: number;
}

interface OmfsComparisonActivityResult {
  lineItems: BillComparisonLineItem[];
  totalClaimed: number;
  totalOmfsAllowed: number;
  totalDiscrepancy: number;
  discrepancyPercent: number;
  disclaimer: string;
  isStubData: boolean;
}

interface OmfsActivities {
  runOmfsComparisonActivity(lienId: string): Promise<OmfsComparisonActivityResult>;
}

// ---------------------------------------------------------------------------
// Activity proxies
// ---------------------------------------------------------------------------

const activities = proxyActivities<OmfsActivities>({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '5s',
    backoffCoefficient: 2,
  },
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * OMFS comparison workflow.
 *
 * Runs OMFS bill comparison on all line items of a lien, updating
 * each line item with the OMFS rate and overcharge data.
 */
export async function omfsComparisonWorkflow(
  lienId: string,
): Promise<OmfsComparisonActivityResult> {
  return activities.runOmfsComparisonActivity(lienId);
}
