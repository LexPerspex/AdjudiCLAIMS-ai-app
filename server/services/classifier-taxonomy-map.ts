/**
 * Taxonomy mapping — maps @adjudica/document-classifier types and subtypes
 * to AdjudiCLAIMS Prisma DocumentType enum values.
 *
 * The classifier package uses 11 parent types with 188 subtypes.
 * AdjudiCLAIMS uses a 25-value DocumentType Prisma enum.
 * This module bridges the two taxonomies.
 *
 * Mapping strategy:
 *   1. Subtype-first — specific subtypes map to precise Prisma types
 *   2. Type-level fallback — parent type maps to the best-fit Prisma type
 *
 * Access level detection — certain subtypes/types indicate attorney-only
 * content that examiners should not access directly.
 */

import type { DocumentType as PrismaDocumentType, AccessLevel } from '@prisma/client';

// ---------------------------------------------------------------------------
// Subtype → Prisma DocumentType (precise mapping)
// ---------------------------------------------------------------------------

/**
 * Maps classifier subtypes to AdjudiCLAIMS Prisma DocumentType.
 * Only subtypes that need specific (non-default) mapping are listed.
 * Unmapped subtypes fall through to the type-level default.
 */
const SUBTYPE_TO_PRISMA: Record<string, PrismaDocumentType> = {
  // OFFICIAL_FORMS subtypes — claim forms
  CLAIM_FORM_DWC1: 'DWC1_CLAIM_FORM',
  CLAIM_FORM: 'DWC1_CLAIM_FORM',

  // OFFICIAL_FORMS subtypes — employer records
  EMPLOYER_REPORT_INJURY: 'EMPLOYER_REPORT',
  EMPLOYER_REPORT: 'EMPLOYER_REPORT',

  // OFFICIAL_FORMS subtypes — benefit notices
  CLAIM_ACCEPTANCE_LETTER: 'BENEFIT_NOTICE',
  CLAIM_DENIAL_LETTER: 'BENEFIT_NOTICE',
  CLAIM_DELAY_NOTICE: 'BENEFIT_NOTICE',
  NOTICE_OF_BENEFITS: 'BENEFIT_NOTICE',

  // OFFICIAL_FORMS subtypes — utilization review
  MEDICAL_TREATMENT_AUTHORIZATION_RFA: 'UTILIZATION_REVIEW',
  IMR_APPLICATION_FORM: 'UTILIZATION_REVIEW',
  IMR_DETERMINATION_FORM: 'UTILIZATION_REVIEW',

  // OFFICIAL_FORMS subtypes — medical
  FIRST_REPORT_OF_INJURY_PHYSICIAN: 'MEDICAL_REPORT',

  // OFFICIAL_FORMS subtypes — DWC official forms (NEW)
  DEU_RATING_REQUEST_FORM: 'DWC_OFFICIAL_FORM',
  QME_PANEL_REQUEST_FORM_105: 'DWC_OFFICIAL_FORM',
  QME_PANEL_REQUEST_FORM_106: 'DWC_OFFICIAL_FORM',
  FIRST_FILL_PHARMACY_FORM: 'DWC_OFFICIAL_FORM',
  MPN_AUTHORIZATION: 'DWC_OFFICIAL_FORM',
  DISTRICT_SPECIFIC_FORM: 'DWC_OFFICIAL_FORM',

  // OFFICIAL_FORMS subtypes — return to work (NEW)
  OFFER_OF_WORK_REGULAR_AD_10133_53: 'RETURN_TO_WORK',
  OFFER_OF_WORK_MODIFIED_AD_10118: 'RETURN_TO_WORK',
  SJDB_VOUCHER_6000: 'RETURN_TO_WORK',
  SJDB_VOUCHER_8000: 'RETURN_TO_WORK',
  SJDB_VOUCHER_10000: 'RETURN_TO_WORK',

  // MEDICAL subtypes — QME/AME reports
  QME_REPORT_INITIAL: 'AME_QME_REPORT',
  QME_REPORT_SUPPLEMENTAL: 'AME_QME_REPORT',
  AME_REPORT: 'AME_QME_REPORT',
  IME_REPORT: 'AME_QME_REPORT',
  PSYCH_EVAL_REPORT_QME_AME: 'AME_QME_REPORT',
  APPORTIONMENT_REPORT: 'AME_QME_REPORT',
  MEDICAL_LEGAL_QME_AME_IME: 'AME_QME_REPORT',

  // MEDICAL subtypes — imaging
  DIAGNOSTICS_IMAGING: 'IMAGING_REPORT',
  DIAGNOSTICS_LAB_RESULTS: 'IMAGING_REPORT',
  DIAGNOSTICS: 'IMAGING_REPORT',

  // MEDICAL subtypes — utilization review
  UTILIZATION_REVIEW_DECISION_REGULAR: 'UTILIZATION_REVIEW',
  UTILIZATION_REVIEW_DECISION_EXPEDITED: 'UTILIZATION_REVIEW',
  UTILIZATION_REVIEW_DECISION: 'UTILIZATION_REVIEW',
  INDEPENDENT_MEDICAL_REVIEW_DECISION: 'UTILIZATION_REVIEW',
  MEDICAL_TREATMENT_AUTHORIZATION: 'UTILIZATION_REVIEW',
  MEDICAL_TREATMENT_DENIAL_UR: 'UTILIZATION_REVIEW',

  // MEDICAL subtypes — billing
  BILLING_UB04: 'BILLING_STATEMENT',
  BILLING_CMS_1500: 'BILLING_STATEMENT',
  BILLING_SUPERBILLS: 'BILLING_STATEMENT',
  BILLING_UB04_HCFA_SUPERBILLS: 'BILLING_STATEMENT',
  MEDICAL_BILL_INITIAL: 'BILLING_STATEMENT',
  MEDICAL_BILL_SECOND_REQUEST: 'BILLING_STATEMENT',
  MEDICAL_BILL_COLLECTION_NOTICE: 'BILLING_STATEMENT',
  EXPLANATION_OF_REVIEW_EOR: 'BILLING_STATEMENT',

  // MEDICAL subtypes — pharmacy
  PHARMACY_RECORDS: 'PHARMACY_RECORD',

  // CORRESPONDENCE subtypes — legal correspondence
  DEFENSE_COUNSEL_LETTER_INFORMATIONAL: 'LEGAL_CORRESPONDENCE',
  DEFENSE_COUNSEL_LETTER_DEMAND: 'LEGAL_CORRESPONDENCE',
  DEFENSE_COUNSEL_LETTER: 'LEGAL_CORRESPONDENCE',
  DEMAND_LETTER_FORMAL: 'LEGAL_CORRESPONDENCE',

  // DISCOVERY subtypes — deposition transcripts
  DEPOSITION_TRANSCRIPT: 'DEPOSITION_TRANSCRIPT',

  // DISCOVERY subtypes — discovery requests (NEW)
  SUBPOENA_SDT_ISSUED: 'DISCOVERY_REQUEST',
  SUBPOENA_SDT_RECEIVED: 'DISCOVERY_REQUEST',
  SUBPOENAED_RECORDS_MEDICAL: 'DISCOVERY_REQUEST',
  SUBPOENAED_RECORDS_EMPLOYMENT: 'DISCOVERY_REQUEST',
  SUBPOENAED_RECORDS_OTHER: 'DISCOVERY_REQUEST',
  SUBPOENAED_RECORDS: 'DISCOVERY_REQUEST',
  DEPOSITION_NOTICE_APPLICANT: 'DISCOVERY_REQUEST',
  DEPOSITION_NOTICE_DEFENDANT: 'DISCOVERY_REQUEST',
  DEPOSITION_NOTICE_MEDICAL_WITNESS: 'DISCOVERY_REQUEST',
  DEPOSITION_NOTICE: 'DISCOVERY_REQUEST',

  // EMPLOYMENT subtypes — wage
  WAGE_STATEMENTS_PRE_INJURY: 'WAGE_STATEMENT',
  WAGE_STATEMENTS_POST_INJURY: 'WAGE_STATEMENT',
  WAGE_STATEMENTS_EARNING_RECORDS: 'WAGE_STATEMENT',
  TIMECARDS_SCHEDULES: 'WAGE_STATEMENT',

  // EMPLOYMENT subtypes — employer records
  JOB_DESCRIPTION_PRE_INJURY: 'EMPLOYER_REPORT',
  JOB_DESCRIPTIONS_ESSENTIAL_FUNCTIONS: 'EMPLOYER_REPORT',
  PERSONNEL_FILES: 'EMPLOYER_REPORT',
  SAFETY_TRAINING_LOGS_INCIDENT_REPORTS: 'EMPLOYER_REPORT',

  // EMPLOYMENT subtypes — return to work (NEW)
  WORK_RESTRICTIONS_POST_INJURY: 'RETURN_TO_WORK',
  VOCATIONAL_EVALUATION_REPORT: 'RETURN_TO_WORK',
  TRAINING_COMPLETION_CERTIFICATE: 'RETURN_TO_WORK',

  // ADMINISTRATIVE_COURT subtypes — settlements (unchanged)
  STIPULATIONS_WITH_REQUEST_FOR_AWARD_PARTIAL: 'SETTLEMENT_DOCUMENT',
  STIPULATIONS_WITH_REQUEST_FOR_AWARD_FULL: 'SETTLEMENT_DOCUMENT',
  STIPULATIONS_WITH_REQUEST_FOR_AWARD: 'SETTLEMENT_DOCUMENT',
  STIPS_WITH_REQUEST_FOR_AWARD_PACKAGE: 'SETTLEMENT_DOCUMENT',
  COMPROMISE_AND_RELEASE_STANDARD: 'SETTLEMENT_DOCUMENT',
  COMPROMISE_AND_RELEASE_MSA: 'SETTLEMENT_DOCUMENT',
  COMPROMISE_AND_RELEASE: 'SETTLEMENT_DOCUMENT',
  CR_PACKAGE_WITH_ADDENDA: 'SETTLEMENT_DOCUMENT',
  SETTLEMENT_DEMAND_LETTER: 'SETTLEMENT_DOCUMENT',
  SETTLEMENT_CONFERENCE_STATEMENT: 'SETTLEMENT_DOCUMENT',
  SETTLEMENT_AGREEMENT_DRAFT: 'SETTLEMENT_DOCUMENT',
  SETTLEMENT_AGREEMENT_EXECUTED: 'SETTLEMENT_DOCUMENT',

  // ADMINISTRATIVE_COURT subtypes — WCAB filings (NEW)
  APPLICATION_FOR_ADJUDICATION_ORIGINAL: 'WCAB_FILING',
  APPLICATION_FOR_ADJUDICATION_AMENDED: 'WCAB_FILING',
  APPLICATION_FOR_ADJUDICATION_PACKAGE: 'WCAB_FILING',
  APPLICATION_FOR_ADJUDICATION: 'WCAB_FILING',
  DECLARATION_OF_READINESS_REGULAR: 'WCAB_FILING',
  DECLARATION_OF_READINESS_EXPEDITED: 'WCAB_FILING',
  DECLARATION_OF_READINESS_MSC: 'WCAB_FILING',
  DECLARATION_OF_READINESS: 'WCAB_FILING',
  DOR_STATUS_MSC_EXPEDITED: 'WCAB_FILING',
  PETITION_RECONSIDERATION_FILED: 'WCAB_FILING',
  PETITION_RECONSIDERATION_OPPOSITION: 'WCAB_FILING',
  PETITION_RECONSIDERATION_REPLY: 'WCAB_FILING',
  PETITION_REMOVAL_FILED: 'WCAB_FILING',
  PETITION_REMOVAL_ANSWER: 'WCAB_FILING',
  PETITION_REOPENING: 'WCAB_FILING',
  PETITION_SERIOUS_WILLFUL: 'WCAB_FILING',
  ORDER_APPOINTING_QME_PANEL: 'WCAB_FILING',
  ORDER_ON_SANCTIONS: 'WCAB_FILING',
  ORDER_ON_LIEN: 'WCAB_FILING',
  ORDER_ON_RECONSIDERATION: 'WCAB_FILING',
  ORDER_ON_MSC: 'WCAB_FILING',
  ORDER_INTERLOCUTORY: 'WCAB_FILING',
  ORDER_FINAL: 'WCAB_FILING',
  MINUTES_ORDERS_FINDINGS_AWARD: 'WCAB_FILING',
  ATTORNEY_FEE_DISCLOSURE: 'WCAB_FILING',

  // RATING_RTW_AIDS subtypes — payment records (NEW — was BENEFIT_NOTICE)
  TD_PAYMENT_RECORD_ONGOING: 'PAYMENT_RECORD',
  TD_PAYMENT_RECORD_RETROACTIVE: 'PAYMENT_RECORD',
  PD_PAYMENT_RECORD_ADVANCE: 'PAYMENT_RECORD',
  PD_PAYMENT_RECORD_ONGOING: 'PAYMENT_RECORD',
  PD_PAYMENT_RECORD_FINAL: 'PAYMENT_RECORD',
  PD_RATING_CONVERSION: 'PAYMENT_RECORD',
  PD_RATING_CALCULATION_WORKSHEET: 'PAYMENT_RECORD',
  EXPENSE_REIMBURSEMENT: 'PAYMENT_RECORD',

  // LIENS subtypes (NEW — was falling back to BILLING_STATEMENT)
  LIEN_MEDICAL_PROVIDER: 'LIEN_CLAIM',
  LIEN_ATTORNEY_COSTS: 'LIEN_CLAIM',
  LIEN_HOSPITAL: 'LIEN_CLAIM',
  LIEN_PHARMACY: 'LIEN_CLAIM',
  LIEN_AMBULANCE_TRANSPORT: 'LIEN_CLAIM',
  LIEN_SELF_PROCUREMENT_MEDICAL: 'LIEN_CLAIM',
  LIEN_EDD_OVERPAYMENT: 'LIEN_CLAIM',
  LIEN_RESOLUTION: 'LIEN_CLAIM',
  LIEN_DISMISSAL: 'LIEN_CLAIM',

  // SUMMARIES_CHRONOLOGIES subtypes — work product (NEW)
  TRIAL_BRIEF: 'WORK_PRODUCT',
  PRETRIAL_CONFERENCE_STATEMENT: 'WORK_PRODUCT',
  SETTLEMENT_VALUATION_MEMO: 'WORK_PRODUCT',
  CASE_ANALYSIS_MEMO: 'WORK_PRODUCT',

  // SUMMARIES_CHRONOLOGIES subtypes — medical chronologies (NEW)
  MEDICAL_CHRONOLOGY_TIMELINE: 'MEDICAL_CHRONOLOGY',
  QME_AME_SUMMARY_WITH_ISSUE_LIST: 'MEDICAL_CHRONOLOGY',
  DEPOSITION_SUMMARY: 'MEDICAL_CHRONOLOGY',
  VOCATIONAL_EXPERT_REPORT: 'MEDICAL_CHRONOLOGY',
  ECONOMIST_REPORT: 'MEDICAL_CHRONOLOGY',
  LIFE_CARE_PLANNER_REPORT: 'MEDICAL_CHRONOLOGY',
  ACCIDENT_RECONSTRUCTIONIST_REPORT: 'MEDICAL_CHRONOLOGY',
  BIOMECHANICAL_EXPERT_REPORT: 'MEDICAL_CHRONOLOGY',

  // SURVEILLANCE_INVESTIGATION subtypes
  INVESTIGATOR_REPORT: 'INVESTIGATION_REPORT',
  WITNESS_STATEMENT: 'INVESTIGATION_REPORT',
  SURVEILLANCE_VIDEO: 'INVESTIGATION_REPORT',
  SOCIAL_MEDIA_EVIDENCE: 'INVESTIGATION_REPORT',
  ACTIVITY_DIARY_SELF_REPORTED: 'INVESTIGATION_REPORT',
};

// ---------------------------------------------------------------------------
// Type → Prisma DocumentType (fallback mapping)
// ---------------------------------------------------------------------------

/**
 * Default mapping when no subtype-level override applies.
 */
const TYPE_TO_PRISMA: Record<string, PrismaDocumentType> = {
  ADMINISTRATIVE_COURT: 'WCAB_FILING',
  OFFICIAL_FORMS: 'DWC_OFFICIAL_FORM',
  MEDICAL: 'MEDICAL_REPORT',
  CORRESPONDENCE: 'CORRESPONDENCE',
  DISCOVERY: 'DISCOVERY_REQUEST',
  EMPLOYMENT: 'EMPLOYER_REPORT',
  LETTERS_ROUTINE_CORRESPONDENCE: 'CORRESPONDENCE',
  SUMMARIES_CHRONOLOGIES: 'MEDICAL_CHRONOLOGY',
  RATING_RTW_AIDS: 'PAYMENT_RECORD',
  LIENS: 'LIEN_CLAIM',
  SURVEILLANCE_INVESTIGATION: 'INVESTIGATION_REPORT',
};

// ---------------------------------------------------------------------------
// Access level detection
// ---------------------------------------------------------------------------

/** Subtypes that indicate attorney-only documents */
const ATTORNEY_ONLY_SUBTYPES = new Set([
  // Court filings and settlements require attorney handling
  'PETITION_RECONSIDERATION_FILED',
  'PETITION_RECONSIDERATION_OPPOSITION',
  'PETITION_RECONSIDERATION_REPLY',
  'PETITION_REMOVAL_FILED',
  'PETITION_REMOVAL_ANSWER',
  'PETITION_REOPENING',
  'PETITION_SERIOUS_WILLFUL',
  'SETTLEMENT_DEMAND_LETTER',
  'SETTLEMENT_AGREEMENT_DRAFT',
  'SETTLEMENT_AGREEMENT_EXECUTED',
  'ATTORNEY_FEE_DISCLOSURE',
  // Depositions
  'DEPOSITION_TRANSCRIPT',
  'DEPOSITION_NOTICE_APPLICANT',
  'DEPOSITION_NOTICE_DEFENDANT',
  'DEPOSITION_NOTICE_MEDICAL_WITNESS',
  'DEPOSITION_NOTICE',
  // Legal strategy documents
  'TRIAL_BRIEF',
  'PRETRIAL_CONFERENCE_STATEMENT',
  'SETTLEMENT_VALUATION_MEMO',
  'CASE_ANALYSIS_MEMO',
]);

/** Text patterns indicating legal analysis content */
const LEGAL_ANALYSIS_PATTERNS = [
  'legal opinion',
  'legal analysis',
  'case law',
  'precedent',
  'legal strategy',
  'liability analysis',
  'legal exposure',
  'legal conclusion',
  'legal advice',
];

/** Text patterns indicating work product */
const WORK_PRODUCT_PATTERNS = [
  'attorney work product',
  'work product',
  'defense strategy',
  'litigation plan',
  'case evaluation',
  'settlement strategy',
  'trial strategy',
];

/** Text patterns indicating attorney-client privilege */
const PRIVILEGED_PATTERNS = [
  'attorney-client privilege',
  'privileged communication',
  'privileged and confidential',
  'attorney client privilege',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TaxonomyMapResult {
  /** Mapped Prisma DocumentType */
  prismaDocumentType: PrismaDocumentType;
  /** Original classifier subtype (stored as documentSubtype) */
  classifierSubtype: string | null;
  /** Original classifier parent type */
  classifierType: string | null;
  /** Detected access level */
  accessLevel: AccessLevel;
  /** Whether the text contains legal analysis language */
  containsLegalAnalysis: boolean;
  /** Whether the text contains work product indicators */
  containsWorkProduct: boolean;
  /** Whether the text contains privileged communication indicators */
  containsPrivileged: boolean;
}

/**
 * Map a classifier result to AdjudiCLAIMS Prisma types + access level detection.
 *
 * @param classifierType - Parent type from @adjudica/document-classifier (e.g., "MEDICAL")
 * @param classifierSubtype - Subtype from classifier (e.g., "QME_REPORT_INITIAL")
 * @param documentText - Raw document text for access level scanning
 */
export function mapClassifierResult(
  classifierType: string | null,
  classifierSubtype: string | null,
  documentText: string,
): TaxonomyMapResult {
  // Map subtype first (more precise), then fall back to type
  let prismaDocumentType: PrismaDocumentType = 'OTHER';

  if (classifierSubtype && classifierSubtype in SUBTYPE_TO_PRISMA) {
    prismaDocumentType = SUBTYPE_TO_PRISMA[classifierSubtype] ?? 'OTHER';
  } else if (classifierType && classifierType in TYPE_TO_PRISMA) {
    prismaDocumentType = TYPE_TO_PRISMA[classifierType] ?? 'OTHER';
  }

  // Access level detection
  const accessFlags = detectAccessLevel(classifierSubtype, documentText);

  return {
    prismaDocumentType,
    classifierSubtype,
    classifierType,
    ...accessFlags,
  };
}

/**
 * Detect access level from subtype and document text content.
 */
function detectAccessLevel(
  subtype: string | null,
  text: string,
): {
  accessLevel: AccessLevel;
  containsLegalAnalysis: boolean;
  containsWorkProduct: boolean;
  containsPrivileged: boolean;
} {
  const lower = text.toLowerCase();

  const containsLegalAnalysis = LEGAL_ANALYSIS_PATTERNS.some((p) =>
    lower.includes(p),
  );
  const containsWorkProduct = WORK_PRODUCT_PATTERNS.some((p) =>
    lower.includes(p),
  );
  const containsPrivileged = PRIVILEGED_PATTERNS.some((p) =>
    lower.includes(p),
  );

  const isAttorneyOnlySubtype = subtype
    ? ATTORNEY_ONLY_SUBTYPES.has(subtype)
    : false;

  // ATTORNEY_ONLY if any indicator is present
  const accessLevel: AccessLevel =
    isAttorneyOnlySubtype ||
    containsLegalAnalysis ||
    containsWorkProduct ||
    containsPrivileged
      ? 'ATTORNEY_ONLY'
      : 'EXAMINER_ONLY';

  return {
    accessLevel,
    containsLegalAnalysis,
    containsWorkProduct,
    containsPrivileged,
  };
}
