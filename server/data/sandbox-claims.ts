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
/*  Exported catalog                                                   */
/* ------------------------------------------------------------------ */

export const SANDBOX_CLAIMS: SandboxClaim[] = [
  CLAIM_TRAIN_001,
  CLAIM_TRAIN_002,
  CLAIM_TRAIN_003,
];
