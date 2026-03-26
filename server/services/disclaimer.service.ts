/**
 * UPL Disclaimer Service
 *
 * Generates zone-appropriate disclaimers for every AI output in the system.
 * This is the user-facing enforcement layer of the UPL compliance pipeline.
 *
 * Zone behavior:
 *   GREEN  -- Brief factual summary disclaimer
 *   YELLOW -- Mandatory "consult defense counsel" disclaimer with feature-specific variant
 *   RED    -- Entire output replaced with attorney referral message
 *
 * Every AI output in the system MUST pass through this service to attach
 * the appropriate disclaimer text. No exceptions.
 *
 * Disclaimer text sourced from: docs/standards/ADJUDICLAIMS_UPL_DISCLAIMER_TEMPLATE.md
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Feature contexts that determine which disclaimer variant to show.
 */
export type FeatureContext =
  | 'medical_summary'
  | 'benefit_calculation'
  | 'deadline'
  | 'document_classification'
  | 'timeline'
  | 'comparable_claims'
  | 'reserve_analysis'
  | 'litigation_risk'
  | 'medical_inconsistency'
  | 'subrogation'
  | 'general';

/**
 * RED zone trigger categories for context-specific attorney referral messages.
 */
export type RedTriggerCategory =
  | 'coverage'
  | 'case_evaluation'
  | 'settlement'
  | 'case_law'
  | 'injured_worker_rights'
  | 'general';

/**
 * Result of disclaimer generation for an AI output.
 *
 * Every AI output in the system must pass through getDisclaimer() to receive
 * appropriate framing. This is a non-negotiable UPL compliance requirement:
 * - GREEN outputs get a brief factual-summary disclaimer
 * - YELLOW outputs get a mandatory "consult defense counsel" warning
 * - RED outputs are blocked entirely and replaced with an attorney referral
 *
 * The isBlocked flag and referralMessage are only set for RED zone results.
 */
export interface DisclaimerResult {
  /** The disclaimer text to display with the AI output. */
  disclaimer: string;
  /** The UPL zone this disclaimer corresponds to. */
  zone: 'GREEN' | 'YELLOW' | 'RED';
  /** True only for RED zone — the AI output must not be delivered. */
  isBlocked: boolean;
  /** Attorney referral message (RED zone only, with trigger-specific guidance). */
  referralMessage?: string;
}

// ---------------------------------------------------------------------------
// Disclaimer text constants
// ---------------------------------------------------------------------------

/**
 * Product-level disclaimer required on every AI output in the system.
 */
export const PRODUCT_DISCLAIMER =
  'This tool provides factual information and data analysis to support claims management decisions. ' +
  'It does not provide legal advice, legal analysis, or legal conclusions. ' +
  'All substantive claims decisions must be made by the claims examiner using independent professional judgment. ' +
  'When legal issues are involved, consult your assigned defense counsel or in-house legal department.';

/**
 * GREEN zone brief disclaimer for factual outputs.
 */
const GREEN_BRIEF = 'AI-generated factual summary. Verify against source documents.';

/**
 * YELLOW zone mandatory disclaimer.
 */
const YELLOW_BRIEF =
  '\u26A0\uFE0F This information may involve legal issues. ' +
  'Consult with assigned defense counsel or in-house legal before making decisions based on this information.';

/**
 * RED zone blocked output message.
 */
const RED_MESSAGE =
  '\uD83D\uDED1 This question involves a legal issue that requires analysis by a licensed attorney.\n\n' +
  'Contact your assigned defense counsel or in-house legal department for guidance on this matter.\n\n' +
  'I can help you prepare a factual claim summary for your counsel referral that includes ' +
  'the relevant medical evidence, claim data, and timeline. Would you like me to generate one?';

// ---------------------------------------------------------------------------
// Feature-specific YELLOW disclaimers
// ---------------------------------------------------------------------------

const YELLOW_FEATURE_DISCLAIMERS: Partial<Record<FeatureContext, string>> = {
  comparable_claims:
    '\u26A0\uFE0F Comparable claims data is provided for informational purposes only and does not ' +
    'constitute a valuation or settlement recommendation. Actual claim outcomes depend on ' +
    'case-specific legal and medical factors. Consult defense counsel before using this ' +
    'data in reserve or settlement discussions.',

  litigation_risk:
    '\u26A0\uFE0F Litigation risk factors are based on statistical patterns and do not constitute ' +
    'a legal assessment of this specific claim. Risk evaluation for individual claims is a ' +
    'legal analysis function. Consult defense counsel for case-specific litigation strategy.',

  medical_inconsistency:
    '\u26A0\uFE0F Medical inconsistency findings are factual observations from the medical records. ' +
    'The legal significance of these inconsistencies requires analysis by defense counsel. ' +
    'Do not draw legal conclusions from medical data discrepancies.',

  subrogation:
    '\u26A0\uFE0F Subrogation potential indicators are based on factual claim data. Whether to ' +
    'pursue subrogation and the legal strategy for recovery require analysis by defense ' +
    'counsel. Consult legal before initiating subrogation actions.',

  reserve_analysis:
    '\u26A0\uFE0F Reserve recommendations are based on actuarial models and comparable claims data. ' +
    'Reserve adequacy involves considerations that may require legal input, particularly ' +
    'for litigated claims. Consult defense counsel for reserve guidance on complex claims.',
};

// ---------------------------------------------------------------------------
// RED zone trigger-specific referral messages
// ---------------------------------------------------------------------------

const RED_TRIGGER_MESSAGES: Record<RedTriggerCategory, string> = {
  coverage:
    '\uD83D\uDED1 Coverage determinations involve legal analysis of policy terms, statutory requirements, ' +
    'and case-specific facts.\n\n' +
    'Contact your assigned defense counsel for a coverage analysis on this claim.\n\n' +
    'I can help you prepare a factual summary of the coverage-relevant information, including ' +
    'policy details, claim facts, and applicable statutory provisions. Would you like me to generate one?',

  case_evaluation:
    '\uD83D\uDED1 Case evaluation and claim strength assessment require legal analysis that is beyond ' +
    'the scope of claims examiner tools.\n\n' +
    'Contact your assigned defense counsel for a case evaluation.\n\n' +
    'I can help you prepare a factual claim summary for your counsel that includes the medical ' +
    'evidence, exposure data, and claim history. Would you like me to generate one?',

  settlement:
    '\uD83D\uDED1 Settlement strategy, valuation, and negotiation guidance require legal analysis.\n\n' +
    'Contact your assigned defense counsel for settlement guidance on this claim.\n\n' +
    'I can help you prepare a factual summary of the claim exposure, including benefit calculations, ' +
    'medical costs, and payment history. Would you like me to generate one?',

  case_law:
    '\uD83D\uDED1 Case law interpretation and application to specific claims is legal analysis that requires ' +
    'a licensed attorney.\n\n' +
    'Contact your assigned defense counsel for legal research on this issue.\n\n' +
    'I can provide the relevant statutory citations and regulatory requirements for this ' +
    'claims handling situation. Would you like me to look those up?',

  injured_worker_rights:
    '\uD83D\uDED1 Questions about injured worker legal rights require attorney analysis.\n\n' +
    'Contact your assigned defense counsel for guidance on this matter.\n\n' +
    'I can provide the factual claim data, benefit calculation, and regulatory deadlines ' +
    'for this claim. Would you like me to prepare that information?',

  general: RED_MESSAGE,
};

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Get the appropriate disclaimer for a given UPL zone and feature context.
 *
 * @param zone - The UPL classification zone (GREEN, YELLOW, or RED).
 * @param featureContext - Optional feature context for variant disclaimers.
 * @param redTrigger - Optional RED zone trigger category for specific referral messages.
 * @returns DisclaimerResult with the disclaimer text, zone, and block status.
 */
export function getDisclaimer(
  zone: 'GREEN' | 'YELLOW' | 'RED',
  featureContext?: FeatureContext,
  redTrigger?: RedTriggerCategory,
): DisclaimerResult {
  switch (zone) {
    case 'GREEN':
      return {
        disclaimer: GREEN_BRIEF,
        zone: 'GREEN',
        isBlocked: false,
      };

    case 'YELLOW': {
      // Use feature-specific disclaimer if available, otherwise use the generic YELLOW
      const context = featureContext ?? 'general';
      const featureDisclaimer = YELLOW_FEATURE_DISCLAIMERS[context];
      const disclaimer = featureDisclaimer ?? YELLOW_BRIEF;

      return {
        disclaimer,
        zone: 'YELLOW',
        isBlocked: false,
      };
    }

    case 'RED': {
      // Use trigger-specific referral message if available
      const trigger = redTrigger ?? 'general';
      const referralMessage = RED_TRIGGER_MESSAGES[trigger];

      return {
        disclaimer: PRODUCT_DISCLAIMER,
        zone: 'RED',
        isBlocked: true,
        referralMessage,
      };
    }
  }
}

/**
 * Get the product-level disclaimer that must appear on every AI output.
 *
 * This is the baseline disclaimer required regardless of zone classification.
 */
export function getProductDisclaimer(): string {
  return PRODUCT_DISCLAIMER;
}
