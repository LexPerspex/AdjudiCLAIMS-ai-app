/**
 * Sandbox claim seed data — three synthetic training claims.
 *
 * These claims are used exclusively in SANDBOX_MODE=true environments.
 * They are clearly marked "(Training)" in claimant names so staff can
 * distinguish them from real claims. Each claim covers a different
 * complexity tier so trainees experience the full product surface.
 *
 * Claim complexity levels:
 *   TRAIN-001 — Simple: single-incident, no attorney, basic deadlines
 *   TRAIN-002 — Medium: cumulative trauma, applicant attorney, liens pending
 *   TRAIN-003 — Complex: accepted claim, active TD payments, investigation complete
 */

import type { DocumentType, DeadlineType, DeadlineStatus, ClaimStatus } from '@prisma/client';

/* ------------------------------------------------------------------ */
/*  Shared interfaces                                                   */
/* ------------------------------------------------------------------ */

export interface SandboxDocument {
  fileName: string;
  documentType: DocumentType;
}

export interface SandboxDeadline {
  type: DeadlineType;
  dueDate: string; // ISO date
  status: DeadlineStatus;
}

export interface SandboxClaim {
  claimNumber: string;
  claimantName: string;
  dateOfInjury: Date;
  bodyParts: string[];
  employer: string;
  insurer: string;
  status: ClaimStatus;
  isCumulativeTrauma: boolean;
  hasApplicantAttorney: boolean;
  isLitigated: boolean;
  /** Indemnity reserve (TD/PD) */
  currentReserveIndemnity: number;
  /** Medical reserve */
  currentReserveMedical: number;
  /** Legal / expense reserve */
  currentReserveLegal: number;
  /** Lien reserve */
  currentReserveLien: number;
  documents: SandboxDocument[];
  deadlines: SandboxDeadline[];
  /** Training scenario description shown in the UI */
  scenarioDescription: string;
}

/* ------------------------------------------------------------------ */
/*  TRAIN-001: Simple claim — single incident, no attorney             */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_001: SandboxClaim = {
  claimNumber: 'TRAIN-001',
  claimantName: 'Jane Smith (Training)',
  dateOfInjury: new Date('2025-08-15'),
  bodyParts: ['lumbar spine', 'left knee'],
  employer: 'Training Corp',
  insurer: 'Training Insurance Co',
  status: 'OPEN',
  isCumulativeTrauma: false,
  hasApplicantAttorney: false,
  isLitigated: false,
  currentReserveIndemnity: 15000,
  currentReserveMedical: 8500,
  currentReserveLegal: 2000,
  currentReserveLien: 0,
  scenarioDescription:
    'Straightforward slip-and-fall. Single date of injury, no attorney, no litigation. ' +
    'Practice: acknowledging the claim, setting reserves, and tracking the 15-day and 40-day deadlines.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',          documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Dr. Johnson Initial Report.pdf', documentType: 'MEDICAL_REPORT' },
    { fileName: 'Employer Incident Report.pdf',   documentType: 'EMPLOYER_REPORT' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY', dueDate: '2025-08-30', status: 'MET' },
    { type: 'DETERMINE_40DAY',   dueDate: '2025-09-24', status: 'PENDING' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-002: Cumulative trauma — attorney involved, under investigation */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_002: SandboxClaim = {
  claimNumber: 'TRAIN-002',
  claimantName: 'Robert Chen (Training)',
  dateOfInjury: new Date('2025-06-01'), // Cumulative period end date
  bodyParts: ['cervical spine', 'right shoulder', 'bilateral wrists'],
  employer: 'Training Tech Solutions',
  insurer: 'Training Insurance Co',
  status: 'UNDER_INVESTIGATION',
  isCumulativeTrauma: true,
  hasApplicantAttorney: true,
  isLitigated: false,
  currentReserveIndemnity: 45000,
  currentReserveMedical: 32000,
  currentReserveLegal: 8500,
  currentReserveLien: 12000,
  scenarioDescription:
    'Cumulative trauma claim with applicant attorney. Multi-part body, ongoing AOE/COE investigation. ' +
    'Practice: managing attorney correspondence, investigation checklist, and lien tracking.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                 documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Applicant Attorney Notice of Repr.pdf', documentType: 'LEGAL_CORRESPONDENCE' },
    { fileName: 'Dr. Lee Orthopedic Eval.pdf',           documentType: 'MEDICAL_REPORT' },
    { fileName: 'Dr. Patel Neurology Report.pdf',        documentType: 'MEDICAL_REPORT' },
    { fileName: 'IME Dr. Nguyen - Cervical.pdf',         documentType: 'AME_QME_REPORT' },
    { fileName: 'Employer Job Description.pdf',          documentType: 'EMPLOYER_REPORT' },
    { fileName: 'Medical Provider Lien - City Ortho.pdf',documentType: 'LIEN_CLAIM' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',   dueDate: '2025-06-16', status: 'MET' },
    { type: 'DETERMINE_40DAY',     dueDate: '2025-07-11', status: 'MISSED' },
    { type: 'DELAY_NOTICE_30DAY',  dueDate: '2025-07-01', status: 'MET' },
    { type: 'UR_PROSPECTIVE_5DAY', dueDate: '2025-09-15', status: 'PENDING' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-003: Accepted claim with active TD payments                  */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_003: SandboxClaim = {
  claimNumber: 'TRAIN-003',
  claimantName: 'Maria Garcia (Training)',
  dateOfInjury: new Date('2025-04-10'),
  bodyParts: ['right ankle'],
  employer: 'Training Retail Group',
  insurer: 'Training Insurance Co',
  status: 'ACCEPTED',
  isCumulativeTrauma: false,
  hasApplicantAttorney: false,
  isLitigated: false,
  currentReserveIndemnity: 22000,
  currentReserveMedical: 14000,
  currentReserveLegal: 1500,
  currentReserveLien: 0,
  scenarioDescription:
    'Accepted claim with active temporary disability payments. Investigation complete, treatment ongoing. ' +
    'Practice: calculating TD rates, issuing benefit notices, managing payment schedule, and tracking return-to-work.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',              documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Wage Statement - Training Retail.pdf',documentType: 'WAGE_STATEMENT' },
    { fileName: 'Dr. Torres Orthopedic Eval.pdf',     documentType: 'MEDICAL_REPORT' },
    { fileName: 'Ankle X-Ray Report.pdf',             documentType: 'IMAGING_REPORT' },
    { fileName: 'Investigation Summary.pdf',           documentType: 'INVESTIGATION_REPORT' },
    { fileName: 'TD Benefit Notice - Week 1.pdf',     documentType: 'BENEFIT_NOTICE' },
    { fileName: 'TD Benefit Notice - Week 2.pdf',     documentType: 'BENEFIT_NOTICE' },
    { fileName: 'Physical Therapy Referral.pdf',      documentType: 'MEDICAL_REPORT' },
    { fileName: 'Return to Work Assessment.pdf',      documentType: 'RETURN_TO_WORK' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',       dueDate: '2025-04-25', status: 'MET' },
    { type: 'DETERMINE_40DAY',         dueDate: '2025-05-20', status: 'MET' },
    { type: 'TD_FIRST_14DAY',          dueDate: '2025-04-24', status: 'MET' },
    { type: 'TD_SUBSEQUENT_14DAY',     dueDate: '2025-05-08', status: 'MET' },
    { type: 'EMPLOYER_NOTIFY_15DAY',   dueDate: '2025-04-25', status: 'MET' },
    { type: 'UR_RETROSPECTIVE_30DAY',  dueDate: '2025-09-30', status: 'PENDING' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-004: Lien-heavy claim — multiple medical liens, OMFS review  */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_004: SandboxClaim = {
  claimNumber: 'TRAIN-004',
  claimantName: 'Tomás Rivera (Training)',
  dateOfInjury: new Date('2024-11-08'),
  bodyParts: ['lumbar spine', 'right hip'],
  employer: 'Training Construction LLC',
  insurer: 'Training Insurance Co',
  status: 'ACCEPTED',
  isCumulativeTrauma: false,
  hasApplicantAttorney: true,
  isLitigated: true,
  currentReserveIndemnity: 38000,
  currentReserveMedical: 26500,
  currentReserveLegal: 12000,
  currentReserveLien: 47500,
  scenarioDescription:
    'Construction back injury with five outstanding provider liens. ' +
    'Practice: lien intake, OMFS comparison, negotiation tracking, and WCAB filing fee verification.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Pain Management Lien.pdf',              documentType: 'LIEN_CLAIM' },
    { fileName: 'Imaging Center Lien.pdf',               documentType: 'LIEN_CLAIM' },
    { fileName: 'PT Provider Lien.pdf',                  documentType: 'LIEN_CLAIM' },
    { fileName: 'Surgery Center Lien.pdf',               documentType: 'LIEN_CLAIM' },
    { fileName: 'Pharmacy Lien.pdf',                     documentType: 'LIEN_CLAIM' },
    { fileName: 'Dr. Park Surgical Report.pdf',          documentType: 'MEDICAL_REPORT' },
    { fileName: 'OMFS Comparison Worksheet.pdf',         documentType: 'CORRESPONDENCE' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2024-11-23', status: 'MET' },
    { type: 'DETERMINE_40DAY',       dueDate: '2024-12-18', status: 'MET' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-005: MMI / PD calculation — applicant near MMI status        */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_005: SandboxClaim = {
  claimNumber: 'TRAIN-005',
  claimantName: 'Aisha Patel (Training)',
  dateOfInjury: new Date('2024-02-20'),
  bodyParts: ['cervical spine'],
  employer: 'Training Office Group',
  insurer: 'Training Insurance Co',
  status: 'ACCEPTED',
  isCumulativeTrauma: false,
  hasApplicantAttorney: true,
  isLitigated: false,
  currentReserveIndemnity: 65000,
  currentReserveMedical: 18000,
  currentReserveLegal: 6500,
  currentReserveLien: 0,
  scenarioDescription:
    'Cervical injury reaching MMI; PD rating in dispute. ' +
    'Practice: WPI extraction, PD-rate calculation, life-pension analysis, and PDA letter drafting.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'QME Dr. Hassan - Cervical Eval.pdf',    documentType: 'AME_QME_REPORT' },
    { fileName: 'PTP MMI Report.pdf',                    documentType: 'MEDICAL_REPORT' },
    { fileName: 'Wage Statement - Office Group.pdf',     documentType: 'WAGE_STATEMENT' },
    { fileName: 'TD History Summary.pdf',                documentType: 'PAYMENT_RECORD' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2024-03-06', status: 'MET' },
    { type: 'DETERMINE_40DAY',       dueDate: '2024-03-31', status: 'MET' },
    { type: 'TD_FIRST_14DAY',        dueDate: '2024-03-05', status: 'MET' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-006: UR dispute — IMR pending, treatment authorization       */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_006: SandboxClaim = {
  claimNumber: 'TRAIN-006',
  claimantName: 'David Kim (Training)',
  dateOfInjury: new Date('2025-03-12'),
  bodyParts: ['right shoulder'],
  employer: 'Training Manufacturing Inc',
  insurer: 'Training Insurance Co',
  status: 'ACCEPTED',
  isCumulativeTrauma: false,
  hasApplicantAttorney: false,
  isLitigated: false,
  currentReserveIndemnity: 18500,
  currentReserveMedical: 22000,
  currentReserveLegal: 3500,
  currentReserveLien: 0,
  scenarioDescription:
    'Shoulder injury with denied UR for arthroscopic surgery. ' +
    'Practice: UR timeline review, MTUS guideline lookup, IMR processing, and treatment authorization workflow.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Dr. Williams RTW Eval.pdf',             documentType: 'MEDICAL_REPORT' },
    { fileName: 'MRI Right Shoulder.pdf',                documentType: 'IMAGING_REPORT' },
    { fileName: 'Surgery Pre-Auth Request.pdf',          documentType: 'UTILIZATION_REVIEW' },
    { fileName: 'UR Denial Notice.pdf',                  documentType: 'UTILIZATION_REVIEW' },
    { fileName: 'IMR Application.pdf',                   documentType: 'CORRESPONDENCE' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2025-03-27', status: 'MET' },
    { type: 'DETERMINE_40DAY',       dueDate: '2025-04-21', status: 'MET' },
    { type: 'UR_PROSPECTIVE_5DAY',   dueDate: '2025-08-15', status: 'MET' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-007: Complex AOE/COE — multi-body-part denial scenario       */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_007: SandboxClaim = {
  claimNumber: 'TRAIN-007',
  claimantName: 'Sandra Okonkwo (Training)',
  dateOfInjury: new Date('2025-05-04'),
  bodyParts: ['lumbar spine', 'left knee', 'psyche'],
  employer: 'Training Healthcare Network',
  insurer: 'Training Insurance Co',
  status: 'UNDER_INVESTIGATION',
  isCumulativeTrauma: false,
  hasApplicantAttorney: true,
  isLitigated: false,
  currentReserveIndemnity: 28000,
  currentReserveMedical: 19500,
  currentReserveLegal: 9000,
  currentReserveLien: 0,
  scenarioDescription:
    'Slip-and-fall with disputed psyche claim and prior knee injury (apportionment issue). ' +
    'Practice: per-body-part AOE/COE determination, apportionment analysis, and counsel referral.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Recorded Statement Transcript.pdf',     documentType: 'CORRESPONDENCE' },
    { fileName: 'Prior Knee MRI 2022.pdf',               documentType: 'IMAGING_REPORT' },
    { fileName: 'Psych Eval Dr. Brennan.pdf',            documentType: 'MEDICAL_REPORT' },
    { fileName: 'Orthopedic Eval Dr. Cho.pdf',           documentType: 'MEDICAL_REPORT' },
    { fileName: 'Witness Statement - Coworker.pdf',      documentType: 'CORRESPONDENCE' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2025-05-19', status: 'MET' },
    { type: 'DELAY_NOTICE_30DAY',    dueDate: '2025-06-03', status: 'MET' },
    { type: 'DETERMINE_40DAY',       dueDate: '2025-06-13', status: 'PENDING' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-008: Medical billing review — high-volume payment processing */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_008: SandboxClaim = {
  claimNumber: 'TRAIN-008',
  claimantName: 'Marcus Johnson (Training)',
  dateOfInjury: new Date('2024-09-01'),
  bodyParts: ['lumbar spine', 'left foot'],
  employer: 'Training Logistics Co',
  insurer: 'Training Insurance Co',
  status: 'ACCEPTED',
  isCumulativeTrauma: false,
  hasApplicantAttorney: false,
  isLitigated: false,
  currentReserveIndemnity: 31000,
  currentReserveMedical: 58000,
  currentReserveLegal: 2500,
  currentReserveLien: 4500,
  scenarioDescription:
    'Long-running accepted claim with extensive medical billing history. ' +
    'Practice: medical billing overview, OMFS compliance review, pharmacy formulary, and payment ledger reconciliation.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Hospital Billing Statement.pdf',         documentType: 'BILLING_STATEMENT' },
    { fileName: 'PT Billing Statement.pdf',               documentType: 'BILLING_STATEMENT' },
    { fileName: 'Pharmacy Billing - Q3.pdf',              documentType: 'PHARMACY_RECORD' },
    { fileName: 'DME Vendor Billing.pdf',                 documentType: 'BILLING_STATEMENT' },
    { fileName: 'Diagnostic Imaging Billing.pdf',         documentType: 'BILLING_STATEMENT' },
    { fileName: 'Payment Ledger Summary.pdf',             documentType: 'PAYMENT_RECORD' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2024-09-16', status: 'MET' },
    { type: 'DETERMINE_40DAY',       dueDate: '2024-10-11', status: 'MET' },
    { type: 'TD_FIRST_14DAY',        dueDate: '2024-09-15', status: 'MET' },
    { type: 'UR_RETROSPECTIVE_30DAY', dueDate: '2025-04-15', status: 'MET' },
  ],
};

/* ------------------------------------------------------------------ */
/*  TRAIN-009: Missed-deadline remediation — recovery scenario         */
/* ------------------------------------------------------------------ */

const CLAIM_TRAIN_009: SandboxClaim = {
  claimNumber: 'TRAIN-009',
  claimantName: 'Linda Nguyen (Training)',
  dateOfInjury: new Date('2025-01-22'),
  bodyParts: ['right wrist'],
  employer: 'Training Restaurant Group',
  insurer: 'Training Insurance Co',
  status: 'OPEN',
  isCumulativeTrauma: false,
  hasApplicantAttorney: false,
  isLitigated: false,
  currentReserveIndemnity: 9500,
  currentReserveMedical: 6200,
  currentReserveLegal: 1500,
  currentReserveLien: 0,
  scenarioDescription:
    'Newly transferred claim with two missed deadlines (15-day acknowledgment and 14-day TD). ' +
    'Practice: penalty exposure calculation, late-payment remediation, and DWC penalty notice response.',
  documents: [
    { fileName: 'DWC-1 Claim Form.pdf',                  documentType: 'DWC1_CLAIM_FORM' },
    { fileName: 'Initial Medical Report.pdf',             documentType: 'MEDICAL_REPORT' },
    { fileName: 'Wage Statement.pdf',                     documentType: 'WAGE_STATEMENT' },
    { fileName: 'Penalty Notice from DWC.pdf',            documentType: 'CORRESPONDENCE' },
  ],
  deadlines: [
    { type: 'ACKNOWLEDGE_15DAY',     dueDate: '2025-02-06', status: 'MISSED' },
    { type: 'DETERMINE_40DAY',       dueDate: '2025-03-03', status: 'PENDING' },
    { type: 'TD_FIRST_14DAY',        dueDate: '2025-02-05', status: 'MISSED' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Exported catalog                                                   */
/* ------------------------------------------------------------------ */

/**
 * Curated set of synthetic training claims covering the core feature surface
 * area. Each claim exercises a distinct workflow so trainees can practice
 * end-to-end without ever touching real PHI/PII.
 */
export const SANDBOX_CLAIMS: SandboxClaim[] = [
  CLAIM_TRAIN_001,
  CLAIM_TRAIN_002,
  CLAIM_TRAIN_003,
  CLAIM_TRAIN_004,
  CLAIM_TRAIN_005,
  CLAIM_TRAIN_006,
  CLAIM_TRAIN_007,
  CLAIM_TRAIN_008,
  CLAIM_TRAIN_009,
];
