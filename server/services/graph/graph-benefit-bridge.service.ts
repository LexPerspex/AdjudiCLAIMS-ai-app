/**
 * Graph Benefit Bridge Service
 *
 * Maps wage and injury data from graph edges to benefit calculation readiness.
 * When the graph enrichment pipeline discovers employment or injury edges with
 * relevant financial data, this bridge identifies which benefit calculations
 * can be triggered.
 *
 * This bridge does NOT call the benefit calculator directly — it identifies
 * what data is available and logs which calculations would be possible.
 *
 * Trigger mapping:
 *   EMPLOYED_BY edge with averageWeeklyEarnings → td_rate_calculation
 *   INJURED edge with dateOfInjury              → benefit_year_determination
 *   Both present                                → full_benefit_calculation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenefitBridgeResult {
  calculationsTriggered: string[];
  wageDataFound: boolean;
  injuryDateFound: boolean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Process graph edge creation events and identify benefit calculation readiness.
 *
 * @param claimId  - The claim these graph edges belong to
 * @param newEdges - Newly created/updated graph edges
 * @returns Summary of available benefit calculations
 */
export async function processGraphBenefitTriggers(
  _claimId: string,
  newEdges: Array<{ edgeType: string; properties: Record<string, unknown> }>,
): Promise<BenefitBridgeResult> {
  const calculationsTriggered: string[] = [];
  let wageDataFound = false;
  let injuryDateFound = false;

  for (const edge of newEdges) {
    // EMPLOYED_BY with averageWeeklyEarnings → TD rate calculation possible
    if (edge.edgeType === 'EMPLOYED_BY') {
      if (edge.properties['averageWeeklyEarnings'] !== undefined) {
        wageDataFound = true;
        calculationsTriggered.push('td_rate_calculation');
      }
    }

    // INJURED with dateOfInjury → benefit year determination possible
    if (edge.edgeType === 'INJURED') {
      if (edge.properties['dateOfInjury'] !== undefined) {
        injuryDateFound = true;
        calculationsTriggered.push('benefit_year_determination');
      }
    }
  }

  // If both wage data and injury date found, full calculation is possible
  if (wageDataFound && injuryDateFound) {
    calculationsTriggered.push('full_benefit_calculation');
  }

  return { calculationsTriggered, wageDataFound, injuryDateFound };
}
