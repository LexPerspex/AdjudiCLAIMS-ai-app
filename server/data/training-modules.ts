/**
 * Training module definitions — 4 mandatory modules with assessment questions.
 *
 * All new examiners must complete these modules before accessing the full product.
 * This is a hard gate: no bypass, no supervisor override, no grace period.
 *
 * Passing scores vary by module:
 *   Module 1 — 80% (12/15) — CA WC Framework
 *   Module 2 — 80% (8/10)  — Legal Obligations
 *   Module 3 — 90% (18/20) — UPL Boundary (highest bar — core compliance constraint)
 *   Module 4 — 100% (8/8)  — Using AdjudiCLAIMS (all checkpoints required)
 *
 * Regulatory authority: 10 CCR 2695.6 — every insurer shall adopt and communicate
 * minimum training standards to all claims agents and adjusters.
 *
 * SECURITY NOTE: correctOptionId is NEVER sent to the client. Strip it server-side
 * before including questions in any API response.
 */

export type QuestionType = 'MULTIPLE_CHOICE' | 'SCENARIO' | 'ZONE_CLASSIFICATION' | 'INTERACTIVE';

export interface AssessmentQuestion {
  id: string;                    // e.g., 'mod1_q01'
  questionText: string;
  questionType: QuestionType;
  options: { id: string; text: string }[];
  correctOptionId: string;       // NEVER sent to client
  explanation: string;           // Shown after submission
}

export interface TrainingModuleContent {
  sections: {
    title: string;
    body: string;                // Markdown content for the training material
  }[];
}

export interface TrainingModule {
  id: string;                    // 'module_1', 'module_2', etc.
  title: string;
  description: string;
  estimatedMinutes: number;
  passingScore: number;          // 0.0 to 1.0
  totalQuestions: number;
  questionType: QuestionType;
  content: TrainingModuleContent;
  questions: AssessmentQuestion[];
}

// ---------------------------------------------------------------------------
// Module 1: California Workers' Compensation Framework
// 30 min | 15 multiple-choice questions | 80% passing (12/15)
// ---------------------------------------------------------------------------

const MODULE_1_CONTENT: TrainingModuleContent = {
  sections: [
    {
      title: 'What is Workers\' Compensation?',
      body: `California's workers' compensation system is a **no-fault** insurance system. When a worker
is injured on the job, they are entitled to benefits regardless of who was at fault for the injury.
The employer carries insurance (or is self-insured) to pay those benefits.

**The trade-off:** The worker gets guaranteed benefits without having to prove fault; the employer
gets protection from personal injury lawsuits (exclusive remedy doctrine).

**Governing law:** California Labor Code Divisions 4 and 4.5. Administered by the Division of
Workers' Compensation (DWC) within the Department of Industrial Relations (DIR).`,
    },
    {
      title: 'The Parties in a Workers\' Compensation Claim',
      body: `Every claim involves multiple parties with distinct roles:

- **Injured worker (applicant/claimant):** The person who was hurt. Entitled to benefits under the Labor Code.
- **Employer:** Must carry workers' compensation insurance and provide a DWC-1 Claim Form within **one working day** of learning about the injury (LC 5401).
- **Insurer or TPA:** The carrier or third-party administrator that manages the claim. The examiner works for this party.
- **Defense counsel:** The licensed attorney who represents the insurer's legal interests. Provides legal advice. The examiner does **not** practice law.
- **Applicant attorney:** Represents the injured worker. Represented claims follow different medical-legal procedures (LC 4061–4062).
- **WCAB (Workers' Compensation Appeals Board):** The judicial body that resolves disputed claims. WCAB judges issue awards.
- **DWC (Division of Workers' Compensation):** State agency that administers the WC system and writes CCR Title 8 regulations.
- **DOI (Department of Insurance):** Regulates insurers and audits carriers for compliance via market conduct examinations.`,
    },
    {
      title: 'Claim Lifecycle Overview',
      body: `A workers' compensation claim moves through predictable stages:

1. **Injury occurs** — worker is hurt on the job
2. **Employer provides DWC-1 Claim Form** — within one working day of learning of injury (LC 5401)
3. **Employee returns Claim Form** — signed and dated
4. **Insurer receives claim** — assigned to examiner
5. **Acknowledgment sent** — within 15 calendar days (10 CCR 2695.5(b))
6. **Investigation begins immediately** — AOE/COE, wage verification, medical records
7. **TD payments begin** — within 14 calendar days if disability exists (LC 4650)
8. **Coverage determination** — accept or deny within 40 calendar days (10 CCR 2695.7(b))
9. **Medical treatment** — authorized through MPN and Utilization Review (UR)
10. **Medical-legal evaluation** — QME or AME if disputes arise (LC 4061–4062)
11. **Permanent disability evaluated** — DEU rating if applicable
12. **Claim resolves** — Compromise and Release (C&R), Stipulations with Request for Award, or WCAB adjudication`,
    },
    {
      title: 'Key Terms — Benefits and Medical',
      body: `**Benefits terms:**
- **TD (Temporary Disability):** Wage replacement paid while the worker cannot work due to injury
- **TTD (Temporary Total Disability):** Worker cannot perform any work
- **TPD (Temporary Partial Disability):** Worker can perform some but not all duties
- **PD (Permanent Disability):** Compensation for lasting impairment after MMI
- **WPI (Whole Person Impairment):** AMA Guides rating used to calculate PD percentage
- **AWE (Average Weekly Earnings):** Worker's average weekly pay before injury; basis for TD rate
- **SJDB (Supplemental Job Displacement Benefit):** Voucher for retraining if employer cannot accommodate restrictions

**Medical terms:**
- **PTP (Primary Treating Physician):** The doctor primarily responsible for managing the worker's care
- **QME (Qualified Medical Examiner):** DMEC-certified physician who provides medical-legal opinions
- **AME (Agreed Medical Examiner):** QME agreed upon by both parties (represented cases only)
- **MPN (Medical Provider Network):** Employer's contracted medical network
- **MTUS (Medical Treatment Utilization Schedule):** State-adopted evidence-based treatment guidelines
- **UR (Utilization Review):** Process for authorizing or denying medical treatment requests
- **IMR (Independent Medical Review):** DWC review of UR denials (LC 4610.5)`,
    },
    {
      title: 'Key Terms — Legal Process and Regulatory Bodies',
      body: `**Legal process terms:**
- **DWC-1:** The official claim form the employer gives the injured worker
- **AOE/COE:** Arising Out of Employment / Course of Employment — the two-part test for compensability
- **C&R (Compromise and Release):** Full and final settlement resolving all benefits
- **Stips (Stipulations with Request for Award):** Settlement on agreed permanent disability with future medical open
- **WCAB:** Workers' Compensation Appeals Board — hears disputed claims
- **EAMS:** Electronic Adjudication Management System — WCAB's case management system
- **MSC (Mandatory Settlement Conference):** Pre-trial conference required before trial
- **P&S / MMI:** Permanent and Stationary / Maximum Medical Improvement — point when condition is unlikely to improve
- **Lien:** Third-party claim against a WC settlement (medical providers, EDD, etc.)
- **SIU (Special Investigations Unit):** Insurance anti-fraud unit

**Regulatory bodies:**
- **DOI:** Department of Insurance — regulates insurers, conducts market conduct exams
- **DWC:** Division of Workers' Compensation — administers the WC system
- **DIR:** Department of Industrial Relations — parent agency of DWC
- **CHSWC:** Commission on Health and Safety and Workers' Compensation — advisory body`,
    },
  ],
};

const MODULE_1_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'mod1_q01',
    questionText:
      'California workers\' compensation is described as a "no-fault" system. What does this mean?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The employer is never at fault for workplace injuries.' },
      { id: 'b', text: 'The injured worker receives benefits regardless of who caused the injury.' },
      { id: 'c', text: 'The insurer cannot deny any claim filed by an injured worker.' },
      { id: 'd', text: 'Fault must be determined before benefits are paid, but the process is streamlined.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Under the no-fault system, an injured worker is entitled to benefits without having to prove the employer was negligent or responsible. In exchange, the worker generally cannot sue the employer in civil court (exclusive remedy doctrine). This is established under California Labor Code Division 4.',
  },
  {
    id: 'mod1_q02',
    questionText:
      'Within how many working days must an employer provide a DWC-1 Claim Form to an injured worker after learning of the injury?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'Three working days' },
      { id: 'b', text: 'Five working days' },
      { id: 'c', text: 'One working day' },
      { id: 'd', text: 'Ten calendar days' },
    ],
    correctOptionId: 'c',
    explanation:
      'Labor Code § 5401 requires the employer to provide a DWC-1 Claim Form within one working day of learning about the injury or work-related illness. Failure to provide the form timely can waive certain defenses and expose the employer to penalties.',
  },
  {
    id: 'mod1_q03',
    questionText:
      'Which state agency conducts market conduct examinations to audit insurance carriers for claims-handling compliance?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'Division of Workers\' Compensation (DWC)' },
      { id: 'b', text: 'Department of Industrial Relations (DIR)' },
      { id: 'c', text: 'Department of Insurance (DOI)' },
      { id: 'd', text: 'Workers\' Compensation Appeals Board (WCAB)' },
    ],
    correctOptionId: 'c',
    explanation:
      'The Department of Insurance (DOI) regulates insurance companies and conducts market conduct examinations that pull claim files and check them against regulatory requirements under the Insurance Code and 10 CCR 2695. The DWC administers the WC system but does not conduct insurer audits.',
  },
  {
    id: 'mod1_q04',
    questionText:
      'What is the AOE/COE test used to determine?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'Whether the injured worker is entitled to permanent disability' },
      { id: 'b', text: 'Whether the injury is compensable — arising out of and in the course of employment' },
      { id: 'c', text: 'Whether the employer has adequate insurance coverage' },
      { id: 'd', text: 'Whether the medical treatment is consistent with MTUS guidelines' },
    ],
    correctOptionId: 'b',
    explanation:
      'AOE/COE stands for "Arising Out of Employment / Course of Employment." This two-part test determines compensability: (1) did the injury arise out of — i.e., was it caused by — the employment? and (2) did it occur in the course of — i.e., during — employment? Both elements must be met for a claim to be compensable.',
  },
  {
    id: 'mod1_q05',
    questionText:
      'What is the difference between a QME and an AME?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A QME is appointed by the court; an AME is selected by the injured worker alone.' },
      { id: 'b', text: 'A QME is used for unrepresented workers; an AME is agreed upon by both parties in represented cases.' },
      { id: 'c', text: 'A QME evaluates permanent disability only; an AME evaluates both temporary and permanent disability.' },
      { id: 'd', text: 'A QME works for the insurer; an AME works for the injured worker.' },
    ],
    correctOptionId: 'b',
    explanation:
      'A Qualified Medical Examiner (QME) is used in unrepresented cases — the DWC Medical Unit provides a panel of three, and the worker selects one. An Agreed Medical Examiner (AME) is used in represented cases — both the applicant attorney and defense counsel agree on a single QME-certified physician. Both processes are governed by LC 4061–4062.',
  },
  {
    id: 'mod1_q06',
    questionText:
      'Which of the following best describes Temporary Partial Disability (TPD)?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The worker cannot perform any work at all during the recovery period.' },
      { id: 'b', text: 'The worker has reached maximum medical improvement with some permanent restrictions.' },
      { id: 'c', text: 'The worker can perform some but not all duties, earning less than pre-injury wages.' },
      { id: 'd', text: 'The worker is permanently unable to return to their usual occupation.' },
    ],
    correctOptionId: 'c',
    explanation:
      'Temporary Partial Disability (TPD) applies when the injured worker can perform modified or limited work but earns less than their pre-injury wage. TPD benefits compensate for the wage differential. This contrasts with Temporary Total Disability (TTD), where the worker cannot perform any work.',
  },
  {
    id: 'mod1_q07',
    questionText:
      'What is a Compromise and Release (C&R)?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A settlement that resolves the claim fully and finally, closing all benefits including future medical.' },
      { id: 'b', text: 'A settlement that resolves permanent disability but leaves future medical care open.' },
      { id: 'c', text: 'An agreement between the insurer and the employer to share liability.' },
      { id: 'd', text: 'A WCAB order requiring the insurer to pay a specific benefit.' },
    ],
    correctOptionId: 'a',
    explanation:
      'A Compromise and Release (C&R) is a full and final settlement that resolves all aspects of the claim, including future medical care. Once approved by a WCAB judge, it typically closes the claim completely. This contrasts with Stipulations with Request for Award (Stips), which leave future medical care open.',
  },
  {
    id: 'mod1_q08',
    questionText:
      'What does it mean when a claim is described as reaching "P&S" or "MMI" status?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The claim has been accepted and benefits are being paid.' },
      { id: 'b', text: 'The worker\'s medical condition has stabilized and is unlikely to improve further with additional treatment.' },
      { id: 'c', text: 'The claim has been denied and is proceeding to the WCAB.' },
      { id: 'd', text: 'The worker has returned to their pre-injury job with no restrictions.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Permanent and Stationary (P&S) / Maximum Medical Improvement (MMI) means the treating physician has determined the worker\'s condition has stabilized and is unlikely to substantially change with further treatment. This status triggers the evaluation for permanent disability (PD) if any impairment remains.',
  },
  {
    id: 'mod1_q09',
    questionText:
      'What is the role of Utilization Review (UR) in a workers\' compensation claim?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'UR determines whether the injured worker\'s injury is compensable.' },
      { id: 'b', text: 'UR is the process for authorizing or denying medical treatment requests based on evidence-based guidelines.' },
      { id: 'c', text: 'UR sets the permanent disability rating for the injured worker.' },
      { id: 'd', text: 'UR is conducted by the WCAB to review disputed claim denials.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Utilization Review (UR) is the process by which the insurer reviews medical treatment requests (RFAs — Requests for Authorization) against evidence-based guidelines, primarily the MTUS (Medical Treatment Utilization Schedule). UR is governed by LC 4610 and 8 CCR 9792.6–9792.12. Denied UR decisions can be appealed through Independent Medical Review (IMR) under LC 4610.5.',
  },
  {
    id: 'mod1_q10',
    questionText:
      'Which party represents the injured worker\'s legal interests in a disputed workers\' compensation case?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The DWC information and assistance officer' },
      { id: 'b', text: 'The defense counsel retained by the insurer' },
      { id: 'c', text: 'The applicant\'s attorney' },
      { id: 'd', text: 'The WCAB judge assigned to the case' },
    ],
    correctOptionId: 'c',
    explanation:
      'The applicant\'s attorney (also called applicant counsel or petitioner\'s counsel) represents the injured worker\'s legal interests. Not all workers have attorneys — unrepresented workers may receive assistance from DWC Information and Assistance Officers, but those officers do not represent the worker. Defense counsel represents the insurer, not the worker.',
  },
  {
    id: 'mod1_q11',
    questionText:
      'What is Independent Medical Review (IMR)?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'An examination conducted by a QME when both parties dispute the diagnosis.' },
      { id: 'b', text: 'A DWC process for reviewing UR denials, where a contracted reviewer applies MTUS guidelines.' },
      { id: 'c', text: 'A DOI audit of the insurer\'s medical authorization practices.' },
      { id: 'd', text: 'A second medical opinion ordered by the WCAB during litigation.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Independent Medical Review (IMR) under LC 4610.5 allows an injured worker to challenge a UR denial by requesting review through the DWC\'s contracted IMR organization (currently Maximus). An independent physician applies MTUS guidelines to determine whether the denied treatment is medically necessary. IMR decisions are binding and can only be appealed on very narrow grounds.',
  },
  {
    id: 'mod1_q12',
    questionText:
      'In the claim lifecycle, what happens at a Mandatory Settlement Conference (MSC)?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The WCAB judge issues a final award without a trial.' },
      { id: 'b', text: 'The parties appear before a WCAB judge to attempt settlement before trial; unresolved issues are set for trial.' },
      { id: 'c', text: 'The injured worker is required to attend a medical examination.' },
      { id: 'd', text: 'The insurer presents its coverage determination to the DWC for approval.' },
    ],
    correctOptionId: 'b',
    explanation:
      'A Mandatory Settlement Conference (MSC) is a pre-trial conference at the WCAB where both parties appear before a judge. The judge facilitates settlement discussions. If the case does not settle, the judge identifies contested issues and sets the case for trial. Attending the MSC is mandatory — failure to appear can result in orders adverse to the non-appearing party.',
  },
  {
    id: 'mod1_q13',
    questionText:
      'What is an MPN (Medical Provider Network)?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A network of WCAB judges certified to hear workers\' compensation cases.' },
      { id: 'b', text: 'An employer\'s contracted network of medical providers from which injured workers must select their treating physician.' },
      { id: 'c', text: 'A state-operated panel of QMEs maintained by the DWC Medical Unit.' },
      { id: 'd', text: 'A database of medical billing codes approved for use in workers\' compensation claims.' },
    ],
    correctOptionId: 'b',
    explanation:
      'A Medical Provider Network (MPN) is an employer-established (or insurer-established) network of physicians that injured workers must use for treatment, subject to certain exceptions. MPNs must be approved by the DWC and comply with access standards under 8 CCR 9767. If a valid MPN exists, the injured worker\'s choice of physician is limited to MPN providers after the initial 30-day period.',
  },
  {
    id: 'mod1_q14',
    questionText:
      'What is the MTUS and what is its role in a workers\' compensation claim?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'The MTUS is a DOI schedule of maximum penalties for claims-handling violations.' },
      { id: 'b', text: 'The MTUS is the state-adopted evidence-based treatment guideline used as the standard in Utilization Review decisions.' },
      { id: 'c', text: 'The MTUS is the DWC\'s schedule of maximum physician fee reimbursements.' },
      { id: 'd', text: 'The MTUS is a list of approved QMEs for medical-legal evaluations.' },
    ],
    correctOptionId: 'b',
    explanation:
      'The Medical Treatment Utilization Schedule (MTUS) is California\'s adopted evidence-based treatment guidelines, based primarily on ACOEM guidelines. UR reviewers apply the MTUS when evaluating requests for authorization (RFAs). Treatment recommended by the PTP that is consistent with MTUS is presumed reasonably required. Treatment not addressed by MTUS requires individualized medical review.',
  },
  {
    id: 'mod1_q15',
    questionText:
      'What does the Supplemental Job Displacement Benefit (SJDB) provide?',
    questionType: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A lump-sum payment to compensate the worker for permanent loss of earning capacity.' },
      { id: 'b', text: 'A non-transferable voucher for retraining or skill enhancement if the employer cannot offer modified or alternative work.' },
      { id: 'd', text: 'Monthly payments to supplement the worker\'s income after returning to part-time work.' },
      { id: 'c', text: 'Reimbursement to the employer for wages paid during the worker\'s light-duty period.' },
    ],
    correctOptionId: 'b',
    explanation:
      'The Supplemental Job Displacement Benefit (SJDB) under LC 4658.7 provides a non-transferable voucher (currently up to $6,000) for education-related retraining or skill enhancement at eligible schools. It is available when the injured worker has permanent partial disability and the employer does not offer modified or alternative work within 60 days of receiving the PD rating.',
  },
];

// ---------------------------------------------------------------------------
// Module 2: Your Legal Obligations as a Claims Examiner
// 30 min | 10 scenario questions | 80% passing (8/10)
// ---------------------------------------------------------------------------

const MODULE_2_CONTENT: TrainingModuleContent = {
  sections: [
    {
      title: 'Insurance Code 790.03(h) — The 16 Prohibited Practices',
      body: `Insurance Code § 790.03(h) defines 16 specific prohibited practices in claims handling.
These are not aspirational guidelines — they are statutory prohibitions that carry administrative
penalties and can support bad faith litigation.

Key prohibitions include:

- **(h)(1):** Misrepresenting to claimants pertinent facts or insurance policy provisions
- **(h)(2):** Failing to acknowledge and act reasonably promptly upon communications
- **(h)(3):** Failing to adopt reasonable standards for prompt investigation
- **(h)(4):** Failing to affirm or deny coverage within a reasonable time
- **(h)(5):** Not attempting in good faith to effectuate prompt, fair, equitable settlements
- **(h)(6):** Compelling insureds to institute litigation to recover amounts clearly owed
- **(h)(7):** Attempting to settle a claim for less than reasonable based on advertising
- **(h)(9):** Attempting to settle claims based on altered or misrepresented documents
- **(h)(11):** Delaying investigations or payment by requiring duplicate submissions
- **(h)(13):** Failing to settle promptly under one portion of coverage to influence other portions
- **(h)(14):** Failing to provide reasonable explanation for denial or compromise offer
- **(h)(16):** Delaying payment pending final determination when liability is reasonably clear

**The examiner's duty:** Know these 16 prohibitions. Every claims decision must be evaluated
against this list. When in doubt, document your reasoning and consult your supervisor.`,
    },
    {
      title: 'CCR 2695 — The Four Critical Timeline Requirements',
      body: `The California Fair Claims Settlement Practices Regulations (10 CCR 2695) establish
specific timelines that are the most common source of DOI audit findings. Every examiner must
know these deadlines and track them for every claim:

| Deadline | Requirement | Authority |
|----------|-------------|-----------|
| **15 calendar days** | Acknowledge receipt of any claim communication | 10 CCR 2695.5(b) |
| **40 calendar days** | Accept or deny the claim after receiving proof of claim | 10 CCR 2695.7(b) |
| **14 calendar days** | Issue first TD payment after employer knowledge of injury | LC 4650 |
| **30 calendar days** | Written status update to claimant if investigation/delay continues | 10 CCR 2695.7(c) |

**Missing any of these deadlines is a regulatory violation.** The 14-day TD deadline triggers
an automatic 10% self-imposed penalty under LC 4650(c) for each late payment. The 40-day
determination deadline, if missed without documented reasonable cause, is a direct violation
of 10 CCR 2695.7(b) and a potential DOI audit finding.`,
    },
    {
      title: 'CCR 10109 — Duty to Investigate in Good Faith',
      body: `8 CCR 10109 imposes a duty to conduct a thorough and timely investigation before making
a coverage determination. "Good faith" investigation means:

- **Actively gathering facts** — not passively waiting for information
- **Considering all available evidence** — not selectively gathering evidence that supports denial
- **Documenting the investigation** — every contact, every document, every fact
- **Completing investigation before determination** — you cannot deny based on incomplete investigation
- **Not unreasonably delaying investigation** — investigation delay = claims administration delay = violations

**What you cannot do:**
- Deny a claim because you suspect fraud without completing investigation
- Accept a claim without verifying AOE/COE
- Use investigation delay as a claims management tactic
- Ignore evidence that supports the worker's claim while gathering evidence that supports denial

The investigative record — every call log, every document, every note — must support a reasonable
claims examiner's determination. That record will be reviewed in a DOI audit.`,
    },
    {
      title: 'Consequences of Non-Compliance',
      body: `Non-compliance with claims-handling regulations carries real consequences at multiple levels:

**DOI Administrative Penalties (10 CCR 10108):**
- Each violation per claim can result in an administrative penalty
- Patterns of violations trigger corrective action plans
- Repeated patterns escalate to enforcement proceedings under Ins. Code 790.06
- DOI market conduct exam findings are public record

**Bad Faith Civil Liability:**
- Systematic violations of the duty to deal fairly and in good faith can expose the insurer
  to tort liability beyond contract benefits
- Compensatory damages: the benefit owed plus consequential damages
- Punitive damages: available when conduct is malicious, oppressive, or fraudulent
- Bad faith litigation is expensive, unpredictable, and reputationally damaging

**Personal Consequences:**
- An individual adjuster can be subject to DOI license action
- Negligent claims handling can be cited in disciplinary proceedings
- Documentation of your individual decision-making will be reviewed

**The protection:** Document everything. Follow the regulatory requirements. When in doubt, consult
defense counsel or your supervisor. A well-documented, timely-handled claim is the best defense
against DOI audit findings and bad faith exposure.`,
    },
  ],
};

const MODULE_2_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'mod2_q01',
    questionText:
      `**Scenario:** An injured worker calls your direct line on Day 12 after the employer reported the claim. She asks whether her claim has been accepted. You have not yet completed your investigation. What are your regulatory obligations at this point?`,
    questionType: 'SCENARIO',
    options: [
      {
        id: 'a',
        text: 'You must deny the claim because investigation is incomplete and you cannot confirm compensability.',
      },
      {
        id: 'b',
        text: 'You must acknowledge the call, advise the worker the investigation is ongoing, and send a written status update within 30 days of the first written communication — and you should also assess whether the 40-day determination deadline requires action.',
      },
      {
        id: 'c',
        text: 'Because the call is verbal and not written, no regulatory deadline is triggered by this contact.',
      },
      {
        id: 'd',
        text: 'You must accept the claim provisionally and begin TD payments to avoid a 10% penalty.',
      },
    ],
    correctOptionId: 'b',
    explanation:
      'Under 10 CCR 2695.5(b), you must acknowledge and respond promptly to all claim communications, including phone calls. Under 10 CCR 2695.7(c), if the investigation or determination is delayed beyond 30 days, you must send a written status update. The 40-day determination deadline (10 CCR 2695.7(b)) is also approaching and should be tracked. A provisional acceptance or denial before investigation completion is not required — but the communication and status update obligations are active.',
  },
  {
    id: 'mod2_q02',
    questionText:
      `**Scenario:** You receive a Request for Authorization (RFA) from the Primary Treating Physician for an MRI on Day 5. Your UR review is not complete. What is the deadline for your UR response?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'Within 5 business days for non-expedited requests (LC 4610(g)).' },
      { id: 'b', text: 'Within 14 calendar days — the same as the TD payment deadline.' },
      { id: 'c', text: 'Within 30 calendar days — the same as the status update obligation.' },
      { id: 'd', text: 'Within 40 calendar days — the same as the coverage determination deadline.' },
    ],
    correctOptionId: 'a',
    explanation:
      'Under LC 4610(g), UR decisions on non-expedited requests must be communicated within 5 business days of receiving all information reasonably necessary to make the decision (not to exceed 14 calendar days from receipt of the RFA). Expedited (urgent) requests must be decided within 72 hours. Failing to respond within these timelines results in a deemed approval of the treatment request.',
  },
  {
    id: 'mod2_q03',
    questionText:
      `**Scenario:** You have gathered sufficient investigation to conclude the claim is compensable. The employer reported the injury 16 days ago. The worker has been off work since the date of injury. You have not yet issued any TD payment. What is the regulatory consequence?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'No consequence if you make the first payment within the 40-day determination window.' },
      { id: 'b', text: 'A mandatory self-imposed 10% increase on each late TD payment (LC 4650(c)), and potential DOI audit finding.' },
      { id: 'c', text: 'You must immediately apply for a delay extension from the DWC.' },
      { id: 'd', text: 'The claim is automatically accepted and future denials are waived.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Under LC 4650, the first TD payment must be issued within 14 calendar days of the date the employer had knowledge of the injury and disability. Here, Day 16 means the payment is 2 days late. LC 4650(c) requires a self-imposed penalty of 10% on every late TD payment — not just the first one. This is an automatic statutory penalty, not discretionary. The delay also creates a potential DOI audit finding under 10 CCR 2695.7.',
  },
  {
    id: 'mod2_q04',
    questionText:
      `**Scenario:** You receive a written proof of claim (completed DWC-1 Claim Form with medical documentation) on March 1. Your investigation is ongoing. What is the latest date you may accept or deny the claim without violating 10 CCR 2695.7(b)?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'March 15 (14 days)' },
      { id: 'b', text: 'March 31 (30 days)' },
      { id: 'c', text: 'April 10 (40 days)' },
      { id: 'd', text: 'April 30 (60 days)' },
    ],
    correctOptionId: 'c',
    explanation:
      '10 CCR 2695.7(b) requires the insurer to accept or deny the claim within 40 calendar days of receiving proof of claim. Starting from March 1, 40 calendar days brings the deadline to April 10. Missing this deadline requires documented reasonable cause and triggers a written status update obligation. Each day of delay beyond this date without documented cause is a potential DOI audit finding.',
  },
  {
    id: 'mod2_q05',
    questionText:
      `**Scenario:** You deny a claim but your denial letter does not explain the specific reasons for denial or the basis for the denial under the applicable statutes. Which Insurance Code prohibition have you violated?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'Ins. Code 790.03(h)(11) — requiring duplicate submissions' },
      { id: 'b', text: 'Ins. Code 790.03(h)(3) — failing to adopt reasonable investigative standards' },
      { id: 'c', text: 'Ins. Code 790.03(h)(14) — failing to provide reasonable explanation for denial' },
      { id: 'd', text: 'Ins. Code 790.03(h)(6) — compelling claimants to institute litigation' },
    ],
    correctOptionId: 'c',
    explanation:
      'Insurance Code 790.03(h)(14) prohibits failing to provide a reasonable explanation of the basis in the policy or applicable law for the denial of a claim or for the offer of a compromise settlement. Under 10 CCR 2695.7(h), denial letters must be in writing, specify the applicable policy provision or statute, explain the factual basis for the denial, and advise the claimant of their right to seek legal assistance or contact the DOI.',
  },
  {
    id: 'mod2_q06',
    questionText:
      `**Scenario:** During your investigation, you receive a statement from a witness that strongly supports the worker's claim. You also receive a surveillance report that is ambiguous. You include the surveillance report in your denial but do not document the witness statement. What standard have you violated?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'No violation — you are entitled to weigh evidence as you see fit.' },
      { id: 'b', text: 'The duty to investigate in good faith under 8 CCR 10109 — you must consider all available evidence, not selectively document evidence favoring denial.' },
      { id: 'c', text: 'The 30-day status update requirement under 10 CCR 2695.7(c).' },
      { id: 'd', text: 'The prohibition on requiring duplicate submissions under Ins. Code 790.03(h)(11).' },
    ],
    correctOptionId: 'b',
    explanation:
      '8 CCR 10109 requires good faith investigation, which means considering all available evidence — not selectively gathering or documenting only evidence that supports a predetermined outcome. Selectively excluding favorable evidence from the file is a classic bad faith indicator. The full investigative record, including all evidence for and against the claim, must be documented. In a DOI audit or bad faith litigation, the absence of the witness statement from your file will raise serious questions.',
  },
  {
    id: 'mod2_q07',
    questionText:
      `**Scenario:** The injured worker has been receiving TD payments for 6 months. Your investigation now reveals evidence of fraud. You want to terminate TD immediately without written notice. Is this permissible?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'Yes — fraud is a valid basis for immediate termination of all benefits without notice.' },
      { id: 'b', text: 'No — you must first refer to SIU and follow your company\'s documented fraud investigation protocol. TD termination based on suspected fraud requires documentation of the factual basis and may require defense counsel involvement.' },
      { id: 'c', text: 'Yes — once you have any evidence of fraud, you are required to immediately stop all payments.' },
      { id: 'd', text: 'No — you can only terminate TD benefits at P&S, which requires a physician opinion.' },
    ],
    correctOptionId: 'b',
    explanation:
      'Suspected fraud does not authorize immediate termination of benefits without proper process. Immediate termination without proper documentation and referral can itself constitute a claims-handling violation. The correct procedure is to refer to SIU, document the factual basis for the suspicion, involve defense counsel in strategy decisions, and follow your company\'s documented fraud response protocol. Ins. Code 790.03(h)(16) prohibits delaying payment when liability is reasonably clear — terminating benefits on incomplete fraud grounds can violate this provision.',
  },
  {
    id: 'mod2_q08',
    questionText:
      `**Scenario:** An insurer receives 500 DOI audit findings in a single market conduct examination showing a pattern of late acknowledgments, late determinations, and missing denial explanation language. What is the likely regulatory outcome beyond per-claim penalties?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'No additional consequence — DOI can only assess penalties on a per-claim basis.' },
      { id: 'b', text: 'The DOI may require a corrective action plan, increase audit frequency, and may initiate enforcement proceedings under Ins. Code 790.06 — which can include license suspension.' },
      { id: 'c', text: 'The insurer is automatically required to hire additional examiners.' },
      { id: 'd', text: 'The findings are reported to the DWC, which then increases the insurer\'s workers\' compensation premium.' },
    ],
    correctOptionId: 'b',
    explanation:
      'A pattern of violations in a DOI market conduct examination triggers escalating regulatory responses. Beyond per-claim administrative penalties under 10 CCR 10108, the DOI may: (1) require a corrective action plan (CAP) with specific remediation steps and timelines; (2) increase audit frequency for future examinations; (3) initiate enforcement proceedings under Ins. Code 790.06, which can result in license suspension or revocation and civil penalties up to $10,000 per violation. Company-level enforcement is the most serious outcome of a pattern of violations.',
  },
  {
    id: 'mod2_q09',
    questionText:
      `**Scenario:** The injured worker's attorney sends a demand letter containing a settlement offer. You believe the offer is too high. You do not respond for 45 days. Which prohibition applies?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'Ins. Code 790.03(h)(2) — failure to acknowledge and act reasonably promptly upon communications.' },
      { id: 'b', text: 'Ins. Code 790.03(h)(9) — settling claims based on altered documents.' },
      { id: 'c', text: 'Ins. Code 790.03(h)(16) — delaying payment pending final determination.' },
      { id: 'd', text: 'No violation — settlement demands do not trigger acknowledgment requirements.' },
    ],
    correctOptionId: 'a',
    explanation:
      'Insurance Code 790.03(h)(2) prohibits failing to acknowledge and act reasonably promptly upon communications with respect to claims arising under insurance policies. A 45-day non-response to a written settlement demand from applicant counsel is not "reasonably prompt" and violates this provision. Under 10 CCR 2695.5(b), written communications must be acknowledged within 15 calendar days. The failure to respond can also support an (h)(5) violation — failure to attempt in good faith to effectuate prompt, fair settlement.',
  },
  {
    id: 'mod2_q10',
    questionText:
      `**Scenario:** You determine the claim is compensable and clearly owes significant permanent disability benefits based on the QME report. Your supervisor instructs you to delay processing the PD award because the company is having a bad financial quarter. You comply and delay PD payment for 4 months without communicating with the worker. Which prohibitions are implicated?`,
    questionType: 'SCENARIO',
    options: [
      { id: 'a', text: 'Ins. Code 790.03(h)(16) — delaying payment when liability is reasonably clear — and potentially (h)(2) for failure to communicate.' },
      { id: 'b', text: 'No violation because a supervisor instruction is a valid business justification for delay.' },
      { id: 'c', text: 'Ins. Code 790.03(h)(7) only — attempting to settle for less than a reasonable amount.' },
      { id: 'd', text: 'Only the DOI penalty provisions apply; no specific Insurance Code prohibition is violated.' },
    ],
    correctOptionId: 'a',
    explanation:
      'Insurance Code 790.03(h)(16) directly prohibits delaying payment of claims when liability is reasonably clear. A supervisor instruction to delay does not create a valid legal defense — the examiner has an independent obligation to comply with regulations. Additionally, 790.03(h)(2) is implicated by the failure to communicate with the worker over 4 months, violating the 30-day status update requirement. Both the examiner and the supervisor could face individual consequences, and the company faces bad faith exposure because the delay was financially motivated rather than investigation-justified.',
  },
];

// ---------------------------------------------------------------------------
// Module 3: The UPL Boundary — What You Cannot Do
// 20 min | 20 zone classification questions | 90% passing (18/20)
// ---------------------------------------------------------------------------

const MODULE_3_CONTENT: TrainingModuleContent = {
  sections: [
    {
      title: 'What is Unauthorized Practice of Law (UPL)?',
      body: `Under **California Business and Professions Code § 6125**, only licensed attorneys may
practice law in California. Practicing law includes:

- Giving legal advice
- Preparing legal documents for others
- Representing others in legal proceedings
- Applying law to specific facts to reach legal conclusions

**You are a claims examiner, not an attorney.** AdjudiCLAIMS is a claims information tool,
not a legal advisor. Understanding this boundary protects you, your company, and the product.`,
    },
    {
      title: 'Why UPL Matters to Claims Examiners',
      body: `The UPL boundary matters to you directly:

**When you interpret a statute and tell an injured worker what they are "legally entitled to" —**
that is legal advice.

**When an AI tool tells you what the law "requires" you to do in a specific disputed case —**
that is legal advice.

Neither you nor an AI tool is licensed to provide legal advice. The consequences:

- **Criminal:** Practicing law without a license is a misdemeanor under B&P Code § 6126
- **Civil:** The carrier faces malpractice-type exposure for unlicensed legal advice
- **Regulatory:** Glass Box faces regulatory enforcement for an AI product that dispenses legal conclusions

**AdjudiCLAIMS is designed to make this boundary clear and impossible to cross.** The product
will not answer questions that require legal analysis. When you encounter a legal question,
the product directs you to defense counsel — the licensed professional whose job it is to answer that question.`,
    },
    {
      title: 'The Green / Yellow / Red Zone System',
      body: `Every AdjudiCLAIMS interaction is classified into one of three zones:

---

### GREEN Zone — Factual Information (AI Responds Freely)

Facts, regulations, deadline calculations, document summaries, process explanations.
The product provides information from its knowledge base with citations.

**Examples:**
- "What does LC 4650 require?"
- "Calculate TD at 2/3 AWE based on $900 weekly earnings."
- "Summarize the diagnoses in this medical report."
- "When is the 40-day determination deadline for a claim received on March 1?"

---

### YELLOW Zone — Flagged Information (AI Responds with Disclaimer)

Information with legal or factual implications that require examiner judgment or supervisor/counsel input.
The product provides the data but flags the interpretive judgment as belonging to the examiner.

**Examples:**
- "The medical report identifies three body parts. The claim form lists two. Discuss with supervisor or counsel."
- "Comparable claim data shows resolution range of $45K–$85K. Consult defense counsel for settlement authority."

---

### RED Zone — Blocked (Redirected to Defense Counsel)

Legal analysis, coverage opinions, case strategy, settlement recommendations, legal conclusions.
The product NEVER provides this content. These queries are blocked with a referral to defense counsel.

**Examples:**
- "Should I deny this claim?"
- "Is this injury compensable based on the evidence?"
- "What is the maximum we could lose at trial?"
- "Does our policy cover this type of claim?"`,
    },
    {
      title: 'The 11 Mandatory Triggers for Defense Counsel',
      body: `In addition to RED zone query blocks, specific situations require the examiner to stop
and consult a licensed defense attorney before proceeding:

1. **Disputed compensability** requiring legal analysis of AOE/COE
2. **Coverage questions** involving policy interpretation or exclusions
3. **Potential fraud** requiring legal strategy decisions
4. **Subrogation decisions** — whether to pursue, amount, strategy
5. **Settlement authority requests** — determining settlement value
6. **Lien disputes** — legal priority and resolution strategy
7. **Penalty exposure assessment** — evaluating the carrier's own liability exposure
8. **WCAB hearing preparation** — any trial strategy or legal argument
9. **Applicant attorney correspondence** requiring a legal response
10. **Cumulative trauma legal exposure analysis** — industrial causation legal questions
11. **Death benefit calculations** with disputed dependents

AdjudiCLAIMS will prompt you to consult defense counsel when these triggers are detected.
The product generates a structured referral summary — claim facts, regulatory context, and
the specific legal question for counsel — to make the consultation efficient.`,
    },
  ],
};

const MODULE_3_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'mod3_q01',
    questionText:
      'CLASSIFY: "What is the current TD rate for a worker with Average Weekly Earnings of $1,200?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Factual arithmetic calculation using a statutory formula' },
      { id: 'YELLOW', text: 'YELLOW — Statistical data requiring a disclaimer' },
      { id: 'RED', text: 'RED — Legal analysis, must be blocked' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. Calculating TD using the statutory formula (2/3 of AWE, subject to max/min rates under LC 4453) is a factual arithmetic calculation. The product can compute and display this with a citation to LC 4653 and the current DWC rate schedule. No legal judgment is required.',
  },
  {
    id: 'mod3_q02',
    questionText:
      'CLASSIFY: "Based on the investigation so far, should I deny this claim?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can summarize the investigation findings' },
      { id: 'YELLOW', text: 'YELLOW — The AI can answer with a disclaimer about supervisor review' },
      { id: 'RED', text: 'RED — Legal conclusion about claim outcome; must be blocked and referred to defense counsel' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. "Should I deny?" is a request for a legal conclusion — it asks the AI to apply the law to the facts and recommend a legal determination. That is the unauthorized practice of law. AdjudiCLAIMS blocks this query entirely and directs the examiner to defense counsel. The AI can separately summarize investigation findings (GREEN), but it cannot tell the examiner what legal outcome to reach.',
  },
  {
    id: 'mod3_q03',
    questionText:
      'CLASSIFY: "What are the 16 prohibited practices under Insurance Code 790.03(h)?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Factual recitation of statutory text and DOI regulatory content' },
      { id: 'YELLOW', text: 'YELLOW — Legal information requiring a disclaimer' },
      { id: 'RED', text: 'RED — Legal analysis that must be blocked' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. Reciting the text of a statute — what the law says — is factual information, not legal advice. AdjudiCLAIMS can and should provide the text of IC 790.03(h) with all 16 subsections, with a citation to the statute. This is regulatory education, not legal analysis.',
  },
  {
    id: 'mod3_q04',
    questionText:
      'CLASSIFY: "The QME report says the worker has 8% WPI to the lumbar spine. What is the permanent disability rating?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — PD rating calculation using the statutory AMA Guides formula and PDRS' },
      { id: 'YELLOW', text: 'YELLOW — Rating has legal implications and requires a disclaimer' },
      { id: 'RED', text: 'RED — PD determination is a legal conclusion for the WCAB' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. Converting WPI to a PD rating using the AMA Guides, age, and occupation multipliers under LC 4660 and the Permanent Disability Rating Schedule (PDRS) is a factual calculation. AdjudiCLAIMS can perform this calculation and display the result with full citations. The WCAB ultimately approves PD awards, but the calculation itself is arithmetic using a published formula.',
  },
  {
    id: 'mod3_q05',
    questionText:
      'CLASSIFY: "Is this injury compensable? The worker says it happened at work but there are no witnesses."',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can list the investigative steps needed to evaluate compensability' },
      { id: 'YELLOW', text: 'YELLOW — The AI can provide the investigative checklist with a disclaimer about judgment' },
      { id: 'RED', text: 'RED — Compensability determination is a legal conclusion; must be blocked' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. Asking whether a specific injury "is compensable" is requesting a legal conclusion — applying AOE/COE law to specific facts to determine legal entitlement. That is legal advice. The product blocks this and refers to defense counsel. Note: the product CAN provide the investigation checklist (GREEN) and flag that witnesses were not identified (potentially YELLOW), but it cannot say "this injury is/is not compensable."',
  },
  {
    id: 'mod3_q06',
    questionText:
      'CLASSIFY: "What is the 40-day deadline for this claim, given the proof of claim was received on April 5?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Deadline calculation using a fixed regulatory timeline' },
      { id: 'YELLOW', text: 'YELLOW — Deadline has legal consequences and requires a disclaimer' },
      { id: 'RED', text: 'RED — Determining legal deadlines is legal advice' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. Calculating a regulatory deadline by adding 40 calendar days to a known date is straightforward arithmetic. The regulatory timeline is fixed by 10 CCR 2695.7(b). AdjudiCLAIMS tracks and displays these deadlines — that is a core product feature. The deadline is May 15 (April 5 + 40 days).',
  },
  {
    id: 'mod3_q07',
    questionText:
      'CLASSIFY: "The medical report lists a diagnosis not mentioned in the DWC-1. What is the legal significance of this discrepancy for our coverage exposure?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can explain that discrepancies should be investigated' },
      { id: 'YELLOW', text: 'YELLOW — The AI can flag the discrepancy and note it should be discussed with defense counsel, without reaching a legal conclusion about coverage' },
      { id: 'RED', text: 'RED — Analyzing legal significance for coverage exposure is legal analysis' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. Asking about the "legal significance for coverage exposure" is requesting legal analysis — applying coverage law to a specific factual discrepancy to reach a conclusion about the carrier\'s legal obligations. That is legal advice. The product can flag that the discrepancy exists (a factual observation, GREEN zone) and note that discrepancies between reported and diagnosed conditions should be discussed with defense counsel (YELLOW zone), but it cannot analyze the legal significance for coverage.',
  },
  {
    id: 'mod3_q08',
    questionText:
      'CLASSIFY: "What is the MTUS guideline for physical therapy following a lumbar strain with no radiculopathy?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — MTUS guideline lookup is factual regulatory information' },
      { id: 'YELLOW', text: 'YELLOW — Medical recommendations require a disclaimer about physician judgment' },
      { id: 'RED', text: 'RED — Medical advice is equivalent to legal advice and must be blocked' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. The MTUS (Medical Treatment Utilization Schedule) is a published state-adopted regulatory document. Retrieving and displaying its guidelines for a specific condition and treatment type is a factual lookup — the equivalent of reading a statute. AdjudiCLAIMS can retrieve and display MTUS guidelines with citations to the specific section. UR decisions require physician judgment, but displaying what the MTUS says is factual information.',
  },
  {
    id: 'mod3_q09',
    questionText:
      'CLASSIFY: "Similar lumbar strain claims at this employer have settled between $28,000 and $52,000. This claim appears to have similar characteristics."',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Settlement data is factual information the AI can provide freely' },
      { id: 'YELLOW', text: 'YELLOW — Statistical data with legal/settlement implications; requires disclaimer and counsel referral for settlement authority decisions' },
      { id: 'RED', text: 'RED — Settlement recommendations are legal advice; must be blocked entirely' },
    ],
    correctOptionId: 'YELLOW',
    explanation:
      'This is a YELLOW zone response. Presenting comparable claim settlement data is factual statistical information — not a recommendation. However, because this data has direct implications for settlement authority decisions (a legal judgment call), the product must present it with a mandatory disclaimer: "This statistical data is provided for informational purposes. Settlement authority decisions require defense counsel consultation and supervisor approval." The examiner is informed but the legal judgment about whether and for how much to settle is not made by the AI.',
  },
  {
    id: 'mod3_q10',
    questionText:
      'CLASSIFY: "Does our policy cover injuries that occur during the employee\'s lunch break off-premises?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can explain the general "going and coming" rule under California WC law' },
      { id: 'YELLOW', text: 'YELLOW — Coverage questions need a disclaimer about specific policy terms' },
      { id: 'RED', text: 'RED — Policy coverage interpretation is legal analysis; must be blocked and referred to defense counsel' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. "Does our policy cover [specific scenario]?" is a request for a coverage opinion — applying policy language and legal rules (the "going and coming" rule, the personal comfort doctrine) to specific facts to reach a legal conclusion about coverage. That is legal analysis. The product can explain what the going and coming rule says in general (GREEN), but it cannot apply it to give a coverage opinion on a specific claim. That requires defense counsel.',
  },
  {
    id: 'mod3_q11',
    questionText:
      'CLASSIFY: "Summarize the medical records for this claim, listing all diagnoses, body parts, restrictions, and work status."',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Document summarization is a factual extraction task' },
      { id: 'YELLOW', text: 'YELLOW — Medical summaries have legal implications and require a disclaimer' },
      { id: 'RED', text: 'RED — Medical record analysis is equivalent to giving medical advice' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone request. Extracting and summarizing information that is already present in medical records — diagnoses, body parts, restrictions, work status — is a factual extraction and summarization task. The AI is reading and organizing information, not interpreting or reaching medical or legal conclusions. AdjudiCLAIMS includes this as a core feature with citations to the source documents. The result is accompanied by a note that all medical decisions remain with treating physicians.',
  },
  {
    id: 'mod3_q12',
    questionText:
      'CLASSIFY: "The worker has been on TD for 100 weeks. Can we terminate TD now?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can explain the 104-week TD cap rule and the current week count' },
      { id: 'YELLOW', text: 'YELLOW — TD termination eligibility is factual but has significant legal consequences; requires a disclaimer and note about exceptions' },
      { id: 'RED', text: 'RED — Determining whether to terminate TD is a legal conclusion' },
    ],
    correctOptionId: 'YELLOW',
    explanation:
      'This is a YELLOW zone question. The AI can and should explain: (1) LC 4656 imposes a 104-week cap on TD for most injuries (240 weeks for certain severe injuries); (2) at 100 weeks, the worker has 4 weeks remaining under the standard cap; (3) exceptions exist (severe injury categories, delays attributable to the employer/insurer). The product flags the approaching deadline and the exceptions but notes: "TD termination decisions should be confirmed with defense counsel given the legal consequences of improper termination." The fact pattern is factual; the decision is legal judgment.',
  },
  {
    id: 'mod3_q13',
    questionText:
      'CLASSIFY: "What are the examiner\'s investigation obligations within the first 40 days of a claim?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Recitation of regulatory investigative obligations is factual regulatory information' },
      { id: 'YELLOW', text: 'YELLOW — Investigation advice requires a disclaimer about case-specific facts' },
      { id: 'RED', text: 'RED — Investigation strategy is legal advice' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. What the regulations require of an examiner — investigation obligations, contact requirements, documentation standards — is factual regulatory information found in 8 CCR 10109, 10 CCR 2695.7, and related regulations. AdjudiCLAIMS can display the regulatory checklist with citations. Explaining what the law requires in general is education; telling the examiner what to do in a specific disputed case is legal advice.',
  },
  {
    id: 'mod3_q14',
    questionText:
      'CLASSIFY: "We have a potential subrogation opportunity against a third-party driver. Should we pursue it and for how much?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can explain the subrogation statutes and general process' },
      { id: 'YELLOW', text: 'YELLOW — Subrogation opportunities require a disclaimer about legal strategy' },
      { id: 'RED', text: 'RED — Subrogation strategy decisions are legal analysis requiring defense counsel' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. "Should we pursue [subrogation] and for how much?" is a request for legal strategy advice — applying subrogation law (LC 3852, Witt v. Jackson, etc.) to specific facts to reach a legal conclusion about litigation strategy and case value. That is legal advice. This is also one of the 11 mandatory triggers for defense counsel consultation. The product can explain what subrogation is and how it works generally (GREEN), but it cannot advise on whether to pursue a specific subrogation claim.',
  },
  {
    id: 'mod3_q15',
    questionText:
      'CLASSIFY: "What does \'permanent and stationary\' mean, and how does it affect the claim?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Definition of a standard term and its regulatory effect on the claim lifecycle' },
      { id: 'YELLOW', text: 'YELLOW — P&S status has legal consequences requiring a disclaimer' },
      { id: 'RED', text: 'RED — Determining P&S status requires physician and legal judgment' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. Explaining what "permanent and stationary" (P&S) / Maximum Medical Improvement (MMI) means — that it is the point where a physician determines the condition has stabilized and is unlikely to substantially improve — and its effect on the claim (triggers PD evaluation, ends TD eligibility) is factual regulatory and medical information. This is standard definitional content that belongs in Tier 1 education. The question is about what the term means generally, not whether a specific worker has reached P&S.',
  },
  {
    id: 'mod3_q16',
    questionText:
      'CLASSIFY: "Has this worker reached maximum medical improvement based on the most recent PR-4 report?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Reading the physician\'s opinion from the report is factual extraction' },
      { id: 'YELLOW', text: 'YELLOW — The AI can note what the report says with a disclaimer about physician determination' },
      { id: 'RED', text: 'RED — Determining MMI status is a medical and legal conclusion; must be blocked' },
    ],
    correctOptionId: 'YELLOW',
    explanation:
      'This is a YELLOW zone question. The AI can extract and display what the PR-4 report actually states about work status and prognosis — that is factual document extraction (GREEN). However, concluding that the worker "has reached MMI" based on document contents involves an interpretive inference that has significant legal consequences (triggering PD evaluation, ending TD). The appropriate response is: "The PR-4 dated [date] states [exact language]. P&S/MMI determination is made by the treating physician and should be reviewed with your supervisor." The AI reports facts; the determination belongs to the treating physician.',
  },
  {
    id: 'mod3_q17',
    questionText:
      'CLASSIFY: "Calculate the penalty amount for a TD payment that was 8 days late on a $900/week TD rate."',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Statutory penalty calculation using the LC 4650(c) 10% formula' },
      { id: 'YELLOW', text: 'YELLOW — Penalty calculations have legal implications and need a disclaimer' },
      { id: 'RED', text: 'RED — Penalty determinations are legal conclusions requiring defense counsel' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone question. LC 4650(c) specifies that every late TD payment shall be increased by 10% as a self-imposed penalty. The formula is fixed: 10% of the late payment amount. Calculating 10% of the weekly TD amount (2/3 × $900 = $600/week, 10% = $60) is arithmetic using a statutory formula. AdjudiCLAIMS includes this calculation in its benefit calculator with a citation to LC 4650(c). This is factual calculation, not legal judgment.',
  },
  {
    id: 'mod3_q18',
    questionText:
      'CLASSIFY: "The applicant\'s attorney is demanding a response to their settlement demand. What should our response say?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can draft a factual acknowledgment letter' },
      { id: 'YELLOW', text: 'YELLOW — Correspondence with applicant counsel needs a disclaimer' },
      { id: 'RED', text: 'RED — Drafting a legal response to applicant counsel\'s demand is legal work requiring defense counsel' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. Drafting a substantive response to a legal demand from applicant counsel is legal work — it requires legal judgment about what positions to take, what to admit or deny, what to offer, and what legal consequences flow from the response. This is one of the 11 mandatory triggers for defense counsel: "Applicant attorney correspondence requiring a legal response." The AI can acknowledge that a communication was received (a factual act), but drafting the legal response content is unauthorized practice of law.',
  },
  {
    id: 'mod3_q19',
    questionText:
      'CLASSIFY: "Show me the open deadlines on this claim and which ones are at risk of being missed."',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — Deadline tracking and alert display is a core product feature based on factual dates and regulatory timelines' },
      { id: 'YELLOW', text: 'YELLOW — Deadline risk assessment has legal consequences and requires a disclaimer' },
      { id: 'RED', text: 'RED — Advising on deadline risk is legal advice' },
    ],
    correctOptionId: 'GREEN',
    explanation:
      'This is a GREEN zone request. AdjudiCLAIMS\'s Regulatory Deadline Dashboard is designed precisely to display open deadlines and flag those at risk. Calculating deadlines from dates (factual arithmetic using regulatory timelines) and flagging those that are approaching or past is a factual display function. This is regulatory education and compliance support — not legal advice. The product shows what the deadlines are; the examiner takes action.',
  },
  {
    id: 'mod3_q20',
    questionText:
      'CLASSIFY: "The worker was injured during a company softball game. Is this AOE/COE, or can we deny?"',
    questionType: 'ZONE_CLASSIFICATION',
    options: [
      { id: 'GREEN', text: 'GREEN — The AI can explain the recreational activity / employer-sponsored event rule' },
      { id: 'YELLOW', text: 'YELLOW — The AI can explain the legal test and flag that this fact pattern requires legal analysis with a disclaimer' },
      { id: 'RED', text: 'RED — Applying AOE/COE law to a specific fact pattern to conclude compensability is a legal analysis; must be blocked' },
    ],
    correctOptionId: 'RED',
    explanation:
      'This is a RED zone question. The recreational activity / employer-sponsored event exception to workers\' compensation coverage involves a multi-factor legal test under LC 3600(a)(9) (voluntary participation, primarily for benefit of employee, etc.). Asking whether a specific injury "is AOE/COE" or "can we deny" is requesting a legal conclusion about compensability. The product can explain what the relevant legal standard says in general (GREEN), but applying it to "a worker at a company softball game" to recommend accept or deny is legal analysis. This requires defense counsel — it is one of the 11 mandatory triggers (disputed compensability requiring legal analysis).',
  },
];

// ---------------------------------------------------------------------------
// Module 4: Using AdjudiCLAIMS
// 20 min | 8 interactive checkpoints | 100% passing (8/8)
// ---------------------------------------------------------------------------

const MODULE_4_CONTENT: TrainingModuleContent = {
  sections: [
    {
      title: 'Product Overview',
      body: `AdjudiCLAIMS is organized around six primary areas:

- **Dashboard** — Open claims overview, deadline alerts, compliance score, priority queue
- **Claim View** — Full claim detail, documents, medical records, correspondence, regulatory deadline panel
- **Document Upload** — Upload documents for classification, OCR, and data extraction
- **Claims Chat** — AI-assisted Q&A about claim facts, regulations, and procedures (zone-filtered)
- **Benefit Calculator** — TD/PD calculations with statutory citations and wage data entry
- **Compliance Dashboard** — Portfolio-wide deadline tracking, audit readiness score, pending actions

Every area embeds regulatory education. You will always see the "why" alongside the "what."`,
    },
    {
      title: 'Reading AI Outputs — Zone Badges and Citations',
      body: `Every AdjudiCLAIMS AI output includes four elements:

1. **Zone badge** — A colored tag (GREEN, YELLOW, or RED) indicating the classification of the response.
   Every response has one. GREEN = factual information. YELLOW = information + required disclaimer.
   RED = blocked with counsel referral.

2. **Citation** — Every factual statement links to its source: the specific statute, CCR section,
   or document that supports it. If you cannot see a citation, the statement is flagged as unverified.

3. **Disclaimer** — YELLOW zone responses always include a disclaimer. The disclaimer text is prescribed
   by the Glass Box UPL Disclaimer Standard and cannot be customized. Read it; it tells you what
   action to take with this information.

4. **Confidence indicator** — When the AI's output is based on incomplete or potentially stale information,
   it says so. "This calculation is based on wage data entered by the examiner — verify against employer
   wage records." Do not skip confidence flags.`,
    },
    {
      title: 'Managing Education Content (Tier 1 and Tier 2)',
      body: `**Tier 1 (Dismissable Basics):** Term definitions, acronym expansions, process overviews.
Shown by default on first occurrence. Click **"Got it"** to dismiss permanently for that term.

- Dismissals are stored in your education profile
- Dismissed terms show a subtle underline — hover for a quick reminder without re-enabling the full explanation
- To reset: go to **Settings > Education Preferences > Reset dismissed terms**
- Your supervisor can force-reset all dismissals if needed for retraining

**Tier 2 (Always-Present Core):** Statutory authority, regulatory reasoning, consequences.
These are **NEVER dismissable**. They appear in the context panel alongside every decision-point feature.

- Default view for new examiners (first 30 days): expanded
- Default for experienced examiners: collapsed to single-line citation, expandable with one click
- Format: **Authority | Standard | Consequence** — read all three every time you are unsure

The Glass Box principle: transparency is not a feature. It is the architecture. Tier 2 content
cannot be removed because the regulatory context IS the product.`,
    },
    {
      title: 'Generating Counsel Referral Summaries',
      body: `When a RED zone trigger is detected — or when you identify a situation requiring defense counsel —
AdjudiCLAIMS generates a structured Counsel Referral Summary:

**Summary contents:**
- Claim identifier and key facts (dates, parties, injury type)
- Regulatory context (which statutes and regulations are implicated)
- The specific legal question requiring counsel input
- Supporting documents (attached or linked from the claim file)
- Suggested response deadline

**How to generate:**
1. From any claim view, click **"Refer to Counsel"** in the action menu
2. The system pre-populates the summary from claim data
3. Add the specific question in your own words
4. Review and send via your firm's communication channel, or export as PDF

The summary is logged in the claim's audit trail. Defense counsel's response can be attached
to the claim record directly. The audit trail shows you identified the legal issue and promptly
referred it — critical documentation for DOI audit and bad faith defense.`,
    },
    {
      title: 'Reporting Errors and Getting Help',
      body: `**Reporting errors:**
Every AI output and education display includes a **"Report an error"** link (flag icon).
Error reports are routed to the Glass Box content team within one business day.

Reports automatically include:
- The exact content displayed (text, citations, zone badge)
- The claim context (anonymized — no PHI/PII)
- Timestamp and product version

You add: a brief description of what is incorrect and (if known) the correct information.

**Getting help:**
- **In-product help:** Click the "?" icon in any section header for contextual guidance
- **Supervisor escalation:** Use the "Escalate" button in the claim action menu
- **Technical support:** Use the "Support" link in the footer — include your ticket number in any follow-up`,
    },
  ],
};

const MODULE_4_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'mod4_q01',
    questionText:
      'CHECKPOINT 1: Navigate to the Regulatory Deadline Dashboard for claim #DEMO-001. Locate the 40-day determination deadline. What date is shown, and what color is the deadline indicator?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'I found the deadline panel in the Claim View. The 40-day deadline is shown with a color-coded indicator based on days remaining (green = safe, yellow = approaching, red = past due).',
      },
      {
        id: 'b',
        text: 'I could not find a deadline panel in the Claim View.',
      },
      {
        id: 'c',
        text: 'Deadline information is only available on the main Dashboard, not in individual Claim Views.',
      },
      {
        id: 'd',
        text: 'Deadlines are shown in the Documents tab, not the Claim View.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'The Regulatory Deadline Dashboard is embedded in every Claim View as a persistent panel. It displays all open regulatory deadlines with color-coded indicators: green (>7 days remaining), yellow (3–7 days remaining), red (≤2 days remaining or past due). The 40-day determination deadline is tracked from the date proof of claim was received. This is a core Tier 2 education display — it is always visible and cannot be dismissed.',
  },
  {
    id: 'mod4_q02',
    questionText:
      'CHECKPOINT 2: In the Claims Chat for claim #DEMO-001, ask: "What is the TD rate for this claim?" Identify the zone badge color and the citation shown in the response.',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'The response shows a GREEN zone badge and cites LC 4653 and the DWC rate schedule. The TD rate is calculated at 2/3 of AWE.',
      },
      {
        id: 'b',
        text: 'The response shows a YELLOW zone badge and includes a disclaimer about verifying the calculation with counsel.',
      },
      {
        id: 'c',
        text: 'The response shows a RED zone badge and directs me to defense counsel.',
      },
      {
        id: 'd',
        text: 'The chat does not show a zone badge on this response.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'TD rate calculations are GREEN zone. The response will show a GREEN badge because this is factual arithmetic (2/3 of AWE under LC 4653, subject to weekly max/min from the current DWC rate schedule). Every Claims Chat response displays a zone badge — no exceptions. If you see a response without a zone badge, use the "Report an error" function immediately.',
  },
  {
    id: 'mod4_q03',
    questionText:
      'CHECKPOINT 3: In the Claims Chat for claim #DEMO-001, ask: "Should I deny this claim?" Describe what happens.',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'The chat displays a RED zone block message explaining this requires legal analysis, and offers to generate a Counsel Referral Summary.',
      },
      {
        id: 'b',
        text: 'The chat answers the question with a recommendation but adds a disclaimer.',
      },
      {
        id: 'c',
        text: 'The chat summarizes the investigation facts and suggests the claim should be denied based on the evidence.',
      },
      {
        id: 'd',
        text: 'The chat does not respond and shows a system error.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      '"Should I deny?" is a RED zone query — it asks for a legal conclusion about claim outcome. The product blocks this query and displays a message explaining that coverage/compensability determinations require legal analysis by a licensed attorney. The block message includes a "Generate Counsel Referral Summary" button. This is the UPL classifier in action — it fires before the LLM generates any response to the restricted query.',
  },
  {
    id: 'mod4_q04',
    questionText:
      'CHECKPOINT 4: Navigate to the Benefit Calculator. Enter AWE of $1,080/week for a total temporary disability claim. What is the weekly TD rate shown, and what statute is cited?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'The calculator shows $720/week (2/3 × $1,080) and cites LC 4653 with the current weekly maximum rate from the DWC schedule.',
      },
      {
        id: 'b',
        text: 'The calculator shows $540/week (1/2 × $1,080) and cites LC 4650.',
      },
      {
        id: 'c',
        text: 'The calculator requires a physician report before it will display a TD rate.',
      },
      {
        id: 'd',
        text: 'The calculator shows $1,080/week because the full AWE is paid during total disability.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'Under LC 4653, temporary total disability is paid at 2/3 of the worker\'s Average Weekly Earnings (AWE), subject to a weekly maximum and minimum rate set by the DWC. For $1,080 AWE: 2/3 × $1,080 = $720/week. The current maximum weekly TD rate is updated annually. The calculator will check whether the computed rate exceeds the current maximum and cap it if necessary. LC 4653 is always cited alongside the DWC rate schedule.',
  },
  {
    id: 'mod4_q05',
    questionText:
      'CHECKPOINT 5: In claim #DEMO-001, locate the "AWE" term in the Benefit Calculator. A Tier 1 tooltip appears. Dismiss it permanently using the correct control. Where does this dismissal preference get saved?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'I clicked "Got it" on the AWE tooltip. The dismissal is saved to my Education Profile and applies only to my account.',
      },
      {
        id: 'b',
        text: 'I clicked "Got it" and the tooltip disappeared, but I am not sure if it will come back.',
      },
      {
        id: 'c',
        text: 'I dismissed the tooltip and it was removed for all users on the team.',
      },
      {
        id: 'd',
        text: 'There is no "Got it" button — the tooltip dismisses on its own after 10 seconds.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'Tier 1 dismissals are stored in your individual Education Profile, keyed to your user account and the specific term ID. Dismissing "AWE" removes the tooltip for AWE only on your account — not for other team members. Other examiners still see the tooltip until they dismiss it. After dismissal, the AWE text shows a subtle underline so you can still hover for a quick reminder. To restore: Settings > Education Preferences > Reset dismissed terms.',
  },
  {
    id: 'mod4_q06',
    questionText:
      'CHECKPOINT 6: Find the Tier 2 education panel on the Regulatory Deadline Dashboard showing the LC 4650 "14-day TD payment" rule. Attempt to close or dismiss this panel. What happens?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'The panel cannot be fully dismissed — it can be collapsed to a single-line citation but not removed. There is no "Got it" / dismiss button on Tier 2 content.',
      },
      {
        id: 'b',
        text: 'The panel has a "Got it" button that permanently dismisses it, same as Tier 1 content.',
      },
      {
        id: 'c',
        text: 'The panel can be hidden by switching to "Expert Mode" in Settings.',
      },
      {
        id: 'd',
        text: 'I was able to close the panel by clicking the X button.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'Tier 2 content is NEVER dismissable — this is a hard design constraint of the Glass Box architecture. The regulatory context (authority, standard, consequence) is the product itself, not a supplement to it. Tier 2 panels can be collapsed to a single-line citation (e.g., "LC 4650 | 14-day payment deadline") with one click to expand, but they cannot be removed. There is no "Expert Mode" or bypass. If you see a "dismiss" control on Tier 2 content, use the "Report an error" function.',
  },
  {
    id: 'mod4_q07',
    questionText:
      'CHECKPOINT 7: In the Claims Chat for claim #DEMO-001, you receive a YELLOW zone response about comparable settlement data. The response includes a disclaimer. What does the disclaimer instruct you to do?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'The disclaimer states that the statistical data is for informational purposes only and that settlement authority decisions require defense counsel consultation and supervisor approval.',
      },
      {
        id: 'b',
        text: 'The disclaimer states that the data may be incorrect and should not be used for any purpose.',
      },
      {
        id: 'c',
        text: 'The disclaimer states that I should accept the settlement range shown and submit it for approval.',
      },
      {
        id: 'd',
        text: 'YELLOW zone responses do not include disclaimers — only RED zone responses include disclaimers.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'YELLOW zone disclaimers are mandatory and prescribed by the Glass Box UPL Disclaimer Standard. For comparable settlement data, the disclaimer must state that the information is statistical, provided for informational purposes, and that settlement authority decisions require defense counsel consultation and supervisor approval. YELLOW zone responses always include a disclaimer — it is a defining characteristic of the YELLOW zone. If you see a YELLOW badge without a disclaimer, use "Report an error."',
  },
  {
    id: 'mod4_q08',
    questionText:
      'CHECKPOINT 8: Generate a Counsel Referral Summary for claim #DEMO-001. The legal question is: "The worker was injured at a company-sponsored event. Advise on compensability." Which section of the summary form do you use to enter this question, and what does the system automatically populate?',
    questionType: 'INTERACTIVE',
    options: [
      {
        id: 'a',
        text: 'I entered the specific legal question in the "Question for Counsel" field. The system automatically populated: claim identifier, key dates, injury description, implicated statutes (LC 3600(a)(9)), relevant uploaded documents, and suggested response deadline.',
      },
      {
        id: 'b',
        text: 'I typed the question in the main chat window and the system converted it to a referral summary.',
      },
      {
        id: 'c',
        text: 'The referral summary only contains the question I type — no automatic population occurs.',
      },
      {
        id: 'd',
        text: 'I could not find the "Refer to Counsel" function in the claim action menu.',
      },
    ],
    correctOptionId: 'a',
    explanation:
      'The Counsel Referral Summary is generated from the "Refer to Counsel" button in the claim action menu. The examiner enters the specific legal question in the "Question for Counsel" field. The system auto-populates: claim ID and parties, key dates (injury date, claim receipt date, open deadlines), the regulatory context for the detected legal issue (here, LC 3600(a)(9) — recreational activity compensability), supporting documents linked to the claim file, and a suggested response deadline based on the next claim deadline. This summary is logged in the audit trail — documenting that the examiner promptly identified and referred the legal question.',
  },
];

// ---------------------------------------------------------------------------
// Assembled Modules
// ---------------------------------------------------------------------------

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'module_1',
    title: 'California Workers\' Compensation Framework',
    description:
      'An introduction to the California workers\' compensation system: its no-fault structure, the parties involved, the claim lifecycle from injury through resolution, and the essential regulatory vocabulary every examiner must know before managing a claim.',
    estimatedMinutes: 30,
    passingScore: 0.8,         // 80% — 12 of 15 questions
    totalQuestions: 15,
    questionType: 'MULTIPLE_CHOICE',
    content: MODULE_1_CONTENT,
    questions: MODULE_1_QUESTIONS,
  },
  {
    id: 'module_2',
    title: 'Your Legal Obligations as a Claims Examiner',
    description:
      'Covers the 16 prohibited practices under Insurance Code § 790.03(h), the four critical regulatory timelines (15-day, 40-day, 14-day, 30-day), the duty to investigate in good faith under CCR 10109, and the consequences of non-compliance including DOI audit findings, administrative penalties, and bad faith exposure.',
    estimatedMinutes: 30,
    passingScore: 0.8,         // 80% — 8 of 10 questions
    totalQuestions: 10,
    questionType: 'SCENARIO',
    content: MODULE_2_CONTENT,
    questions: MODULE_2_QUESTIONS,
  },
  {
    id: 'module_3',
    title: 'The UPL Boundary — What You Cannot Do',
    description:
      'Defines Unauthorized Practice of Law under B&P Code § 6125, explains why this boundary applies to claims examiners and to AI-assisted claims tools, and trains examiners to classify any query or product output as GREEN (factual), YELLOW (flagged with disclaimer), or RED (blocked — defense counsel required). Includes the 11 mandatory triggers for consulting defense counsel. Highest passing threshold: 90%.',
    estimatedMinutes: 20,
    passingScore: 0.9,         // 90% — 18 of 20 questions — highest bar
    totalQuestions: 20,
    questionType: 'ZONE_CLASSIFICATION',
    content: MODULE_3_CONTENT,
    questions: MODULE_3_QUESTIONS,
  },
  {
    id: 'module_4',
    title: 'Using AdjudiCLAIMS',
    description:
      'Interactive walkthrough of the product: navigating the dashboard, claim view, document upload, claims chat, benefit calculator, and compliance dashboard. Trains examiners to read zone badges and citations, dismiss Tier 1 education content, understand Tier 2 always-present regulatory context, generate counsel referral summaries, and report errors. All 8 checkpoints must be completed successfully — no partial credit.',
    estimatedMinutes: 20,
    passingScore: 1.0,         // 100% — all 8 checkpoints required
    totalQuestions: 8,
    questionType: 'INTERACTIVE',
    content: MODULE_4_CONTENT,
    questions: MODULE_4_QUESTIONS,
  },
];

/**
 * Lookup helper — find a module by its ID in O(1).
 *
 * Usage:
 *   const mod = TRAINING_MODULES_BY_ID.get('module_3');
 */
export const TRAINING_MODULES_BY_ID = new Map(
  TRAINING_MODULES.map((m) => [m.id, m]),
);

/**
 * Returns a module's questions stripped of correctOptionId — safe to send to the client.
 *
 * IMPORTANT: Never send correctOptionId to the client. Assessment scoring must be performed
 * server-side by comparing the client's submission against the server-held correct answer.
 */
export function getQuestionsForClient(
  moduleId: string,
): Omit<AssessmentQuestion, 'correctOptionId'>[] | null {
  const mod = TRAINING_MODULES_BY_ID.get(moduleId);
  if (!mod) return null;
  return mod.questions.map(({ correctOptionId: _stripped, ...rest }) => rest);
}

/**
 * Grade a single answer submission server-side.
 *
 * @param moduleId   - The training module ID
 * @param questionId - The question ID (e.g., 'mod3_q01')
 * @param optionId   - The option ID the examinee selected (e.g., 'GREEN')
 * @returns { correct, explanation } or null if the question is not found
 */
export function gradeAnswer(
  moduleId: string,
  questionId: string,
  optionId: string,
): { correct: boolean; explanation: string } | null {
  const mod = TRAINING_MODULES_BY_ID.get(moduleId);
  if (!mod) return null;

  const question = mod.questions.find((q) => q.id === questionId);
  if (!question) return null;

  return {
    correct: question.correctOptionId === optionId,
    explanation: question.explanation,
  };
}

/**
 * Determine whether a completed attempt passes the module.
 *
 * @param moduleId      - The training module ID
 * @param correctCount  - Number of questions answered correctly
 * @returns { passes, score, required } or null if module not found
 */
export function evaluateAttempt(
  moduleId: string,
  correctCount: number,
): { passes: boolean; score: number; required: number; total: number } | null {
  const mod = TRAINING_MODULES_BY_ID.get(moduleId);
  if (!mod) return null;

  const score = correctCount / mod.totalQuestions;
  const passes = score >= mod.passingScore;
  const required = Math.ceil(mod.passingScore * mod.totalQuestions);

  return { passes, score, required, total: mod.totalQuestions };
}
