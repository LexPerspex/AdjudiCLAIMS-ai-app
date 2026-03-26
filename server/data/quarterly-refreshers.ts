/**
 * Quarterly refresher definitions — periodic assessment modules for ongoing education.
 *
 * Each quarter, examiners complete a short refresher assessment to maintain
 * proficiency. Refreshers reuse the AssessmentQuestion format from the
 * training module system for consistency.
 *
 * Passing score: 80% (4/5) for all refreshers.
 *
 * Regulatory authority: 10 CCR 2695.6 — ongoing training standards.
 */

import type { AssessmentQuestion } from './training-modules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A quarterly refresher assessment module.
 *
 * Part of the Layer 3 ongoing education system. Examiners complete one refresher
 * per quarter to maintain proficiency. Questions reuse the AssessmentQuestion
 * format from the training module system for consistency.
 *
 * Refresher content strategy:
 * - Each quarter focuses on a specific competency area (deadlines, UPL, benefits, etc.)
 * - 5 questions per refresher keeps the assessment brief (~5 minutes)
 * - 80% passing score (4/5) balances rigor with accessibility
 * - Failed refreshers can be retried immediately (no lockout)
 *
 * Per 10 CCR 2695.6: insurers must provide ongoing training to claims professionals.
 */
export interface QuarterlyRefresher {
  /** Quarter identifier used as the primary key (e.g., '2026-Q1'). */
  id: string;             // e.g., '2026-Q1'
  /** Display-friendly quarter string. */
  quarter: string;        // e.g., '2026-Q1'
  /** Assessment title describing the competency area covered. */
  title: string;
  /** Description of what this refresher covers and why. */
  description: string;
  /** Minimum score to pass (0.0 to 1.0). All refreshers use 0.8 (80%). */
  passingScore: number;   // 0.0 to 1.0
  /** Number of questions in the assessment. */
  totalQuestions: number;
  /** Assessment questions with correct answers (stripped before client delivery). */
  questions: AssessmentQuestion[];
}

// ---------------------------------------------------------------------------
// Q1 2026 — Deadline Management Best Practices
// ---------------------------------------------------------------------------

const Q1_2026_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'ref_q1_2026_01',
    questionText:
      'Under LC 4650, what is the maximum number of calendar days an insurer has to issue ' +
      'the first TD payment after learning of an employee\'s disability?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: '7 calendar days' },
      { id: 'b', text: '14 calendar days' },
      { id: 'c', text: '30 calendar days' },
      { id: 'd', text: '40 calendar days' },
    ],
    correctOptionId: 'b',
    explanation:
      'LC 4650 requires the first TD payment within 14 calendar days of the employer\'s ' +
      'knowledge of the injury and disability. Late payments trigger a self-imposed penalty.',
  },
  {
    id: 'ref_q1_2026_02',
    questionText:
      'An insurer must send an acknowledgment letter to the injured worker within how many ' +
      'calendar days of receiving the claim?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: '5 calendar days' },
      { id: 'b', text: '10 calendar days' },
      { id: 'c', text: '15 calendar days' },
      { id: 'd', text: '30 calendar days' },
    ],
    correctOptionId: 'c',
    explanation:
      '10 CCR 2695.5(b) requires the insurer to acknowledge receipt of the claim within ' +
      '15 calendar days.',
  },
  {
    id: 'ref_q1_2026_03',
    questionText:
      'What is the deadline for making a coverage determination (accept or deny) on a new claim?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: '14 calendar days' },
      { id: 'b', text: '30 calendar days' },
      { id: 'c', text: '40 calendar days' },
      { id: 'd', text: '90 calendar days' },
    ],
    correctOptionId: 'c',
    explanation:
      '10 CCR 2695.7(b) requires the insurer to accept or deny the claim within 40 calendar days.',
  },
  {
    id: 'ref_q1_2026_04',
    questionText:
      'If a TD payment is late, what is the self-imposed penalty percentage under current law?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: '5%' },
      { id: 'b', text: '10%' },
      { id: 'c', text: '15%' },
      { id: 'd', text: '25%' },
    ],
    correctOptionId: 'b',
    explanation:
      'Under LC 4650(d), a 10% self-imposed increase applies to late TD payments. ' +
      '(Note: SB 1234 increases this to 15% effective 2026-07-01.)',
  },
  {
    id: 'ref_q1_2026_05',
    questionText:
      'An employer must provide the DWC-1 Claim Form to the employee within what timeframe ' +
      'after learning of the injury?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: '1 working day' },
      { id: 'b', text: '3 working days' },
      { id: 'c', text: '5 working days' },
      { id: 'd', text: '10 working days' },
    ],
    correctOptionId: 'a',
    explanation:
      'LC 5401(a) requires the employer to provide the DWC-1 Claim Form within one working day ' +
      'of having knowledge or notice of the injury.',
  },
];

// ---------------------------------------------------------------------------
// Q2 2026 — UPL Compliance Review
// ---------------------------------------------------------------------------

const Q2_2026_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'ref_q2_2026_01',
    questionText:
      'A claims examiner asks AdjudiCLAIMS: "Should we accept or deny this claim?" ' +
      'What UPL zone does this query fall into?',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'a', text: 'GREEN — factual data retrieval' },
      { id: 'b', text: 'YELLOW — statistical with disclaimer' },
      { id: 'c', text: 'RED — requires legal analysis, blocked' },
    ],
    correctOptionId: 'c',
    explanation:
      'Coverage determination (accept/deny) is a legal conclusion that constitutes the ' +
      'practice of law. AI cannot make or recommend this decision for a non-attorney user. ' +
      'The query is blocked with a referral to defense counsel.',
  },
  {
    id: 'ref_q2_2026_02',
    questionText:
      'Which of the following is a GREEN zone query that AdjudiCLAIMS can answer for an examiner?',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'a', text: '"What is the QME\'s WPI rating for this claim?"' },
      { id: 'b', text: '"Is this claim compensable under AOE/COE?"' },
      { id: 'c', text: '"Should we settle this claim for $50,000?"' },
      { id: 'd', text: '"Draft a denial letter for this claim."' },
    ],
    correctOptionId: 'a',
    explanation:
      'Extracting factual medical data (WPI rating from a QME report) is pure data retrieval — ' +
      'GREEN zone. The other options involve legal analysis (compensability, settlement value) ' +
      'or legal document drafting.',
  },
  {
    id: 'ref_q2_2026_03',
    questionText:
      'Under California law, who is authorized to provide legal advice to a claims examiner ' +
      'about a workers\' compensation claim?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The claims supervisor' },
      { id: 'b', text: 'The AI system' },
      { id: 'c', text: 'A licensed California attorney' },
      { id: 'd', text: 'The senior examiner on the team' },
    ],
    correctOptionId: 'c',
    explanation:
      'Cal. Bus. & Prof. Code § 6125 restricts the practice of law to licensed attorneys. ' +
      'Neither supervisors, senior examiners, nor AI systems may provide legal advice.',
  },
  {
    id: 'ref_q2_2026_04',
    questionText:
      'AdjudiCLAIMS returns a YELLOW zone response. What must always accompany the response?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A supervisor approval signature' },
      { id: 'b', text: 'A mandatory disclaimer directing the user to consult defense counsel' },
      { id: 'c', text: 'An automatic email to the applicant attorney' },
      { id: 'd', text: 'Nothing — YELLOW responses are treated the same as GREEN' },
    ],
    correctOptionId: 'b',
    explanation:
      'YELLOW zone responses contain statistical or comparative data that could be misinterpreted ' +
      'as legal guidance. They must always include a mandatory disclaimer directing the examiner ' +
      'to consult defense counsel for legal interpretation.',
  },
  {
    id: 'ref_q2_2026_05',
    questionText:
      'The three UPL enforcement layers in AdjudiCLAIMS are: query classifier (pre-chat), ' +
      'system prompt (during generation), and ___.',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'Supervisor review (post-generation)' },
      { id: 'b', text: 'Output validator (post-generation prohibited language detection)' },
      { id: 'c', text: 'Applicant attorney approval (post-generation)' },
      { id: 'd', text: 'WCAB filing (post-generation)' },
    ],
    correctOptionId: 'b',
    explanation:
      'The three enforcement layers are: (1) query classifier — pre-chat zone classification, ' +
      '(2) system prompt — role-specific prompt enforcing zone boundaries during generation, ' +
      '(3) output validator — post-generation prohibited language detection.',
  },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const QUARTERLY_REFRESHERS: QuarterlyRefresher[] = [
  {
    id: '2026-Q1',
    quarter: '2026-Q1',
    title: 'Deadline Management Best Practices',
    description:
      'Review key statutory deadlines for TD payments, claim acknowledgment, and coverage ' +
      'determinations. Ensures examiners maintain proficiency with critical timeline requirements.',
    passingScore: 0.8,
    totalQuestions: 5,
    questions: Q1_2026_QUESTIONS,
  },
  {
    id: '2026-Q2',
    quarter: '2026-Q2',
    title: 'UPL Compliance Review',
    description:
      'Refresher on the Unauthorized Practice of Law (UPL) boundary — GREEN/YELLOW/RED zone ' +
      'classification, prohibited AI behaviors, and proper defense counsel referral.',
    passingScore: 0.8,
    totalQuestions: 5,
    questions: Q2_2026_QUESTIONS,
  },
];

/** Map for O(1) lookup by quarter. */
export const QUARTERLY_REFRESHERS_BY_ID = new Map(
  QUARTERLY_REFRESHERS.map((r) => [r.id, r]),
);
