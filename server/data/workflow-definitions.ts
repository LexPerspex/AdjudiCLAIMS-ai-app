/**
 * Decision workflow definitions — 5 MVP step-by-step workflows.
 *
 * Each workflow guides a claims examiner through a regulatory process
 * with step-by-step instructions, statutory citations, and compliance notes.
 * Progress is tracked per-claim, per-user in the WorkflowProgress DB model.
 *
 * Sources:
 *   - ADJUDICLAIMS_DECISION_WORKFLOWS.md (product spec)
 *   - California Labor Code (LC)
 *   - California Insurance Code (Ins. Code)
 *   - California Code of Regulations, Title 8 (8 CCR) and Title 10 (10 CCR)
 *
 * UPL Note: All workflow steps are GREEN zone (factual/procedural guidance)
 * unless explicitly marked YELLOW. Steps marked YELLOW indicate points where
 * legal complexity exists and defense counsel consultation is recommended.
 * The product never crosses into legal analysis — it identifies factual indicators
 * and routes to counsel when legal judgment is required.
 */

import type { FeatureContext } from './tier1-terms.js';

export type UplZoneType = 'GREEN' | 'YELLOW' | 'RED';

export interface WorkflowStep {
  id: string;                    // e.g., 'intake_step_1'
  title: string;
  description: string;           // What to do in this step
  authority: string;             // Statutory citation
  complianceNote: string;        // Why this matters
  isSkippable: boolean;          // Can this step be skipped?
  skipReason?: string;           // When skipping is allowed
}

export interface WorkflowDefinition {
  id: string;                    // e.g., 'new_claim_intake'
  title: string;
  description: string;
  uplZone: UplZoneType;
  authority: string;             // Primary statutory authority
  featureContext: FeatureContext;
  steps: WorkflowStep[];
  estimatedMinutes: number;
}

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. NEW CLAIM INTAKE (First 48 Hours)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'new_claim_intake',
    title: 'New Claim Intake (First 48 Hours)',
    description:
      'Regulatory procedures required within 48 hours of receiving a workers\' ' +
      'compensation claim notice. Covers receipt logging, claim file creation, ' +
      'acknowledgment, employer notification, investigation initiation, initial ' +
      'reserves, and deadline activation. All regulatory clocks start on Day 0 — ' +
      'do not wait for a complete file before beginning.',
    uplZone: 'GREEN',
    authority: '10 CCR 2695.5(b); LC 5401; 8 CCR 10101; 8 CCR 10109',
    featureContext: 'CLAIM_INTAKE',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'intake_step_1',
        title: 'Receive and log claim notice',
        description:
          'Log the date and method of receipt (mail, fax, email, phone). ' +
          'This date starts ALL regulatory clocks simultaneously: the 15-day ' +
          'acknowledgment, the 14-day first TD payment (from employer knowledge), ' +
          'the 40-day accept/deny, and the 90-day presumption. Verify the DWC-1 ' +
          'has both employee and employer sections. Note the source of notice — ' +
          'it may be the claim form, a verbal report, or a medical provider notice. ' +
          'An incomplete form does not pause the clocks.',
        authority: '10 CCR 2695.5(b); LC 5401',
        complianceNote:
          'Under 10 CCR 2695.5(b), acknowledgment of receipt is due within 15 ' +
          'calendar days. The clock starts on the date you receive any form of ' +
          'notice — not on the date the file is complete. Failure to log the ' +
          'receipt date accurately makes every downstream deadline unreliable ' +
          'and is the single most common finding in DOI audits.',
        isSkippable: false,
      },
      {
        id: 'intake_step_2',
        title: 'Create the claim file',
        description:
          'Set up the administrative record with all required fields: claimant ' +
          'information, employer information, insurer/TPA information, injury ' +
          'details, date of knowledge, and claim number. Review every auto-populated ' +
          'field against the source DWC-1 — correct extraction errors before ' +
          'proceeding. Enter a contemporaneous entry in the claim log per ' +
          '8 CCR 10103. Undocumented activity is treated as no activity in a ' +
          'DWC audit.',
        authority: '8 CCR 10101 (claim file contents); 8 CCR 10103 (claim log)',
        complianceNote:
          '8 CCR 10101 specifies the required contents of a workers\' compensation ' +
          'claim file. 8 CCR 10103 requires a contemporaneous claim log. A claim ' +
          'file that lacks required fields or a current log entry may be treated ' +
          'as a regulatory violation regardless of whether the underlying claim ' +
          'was handled correctly.',
        isSkippable: false,
      },
      {
        id: 'intake_step_3',
        title: 'Send written acknowledgment to injured worker',
        description:
          'Send a written acknowledgment confirming receipt of the claim. Include ' +
          'your name, direct contact information, and claim number. Send within ' +
          '1–3 business days as best practice — the regulatory maximum is 15 ' +
          'calendar days. Use the standard template or customize, but do not ' +
          'delay sending while waiting for additional information.',
        authority: '10 CCR 2695.5(b) — acknowledgment within 15 calendar days',
        complianceNote:
          'Failure to acknowledge claim receipt within 15 calendar days is a ' +
          'per-se violation of 10 CCR 2695.5(b) and a bad faith indicator under ' +
          'Ins. Code 790.03(h)(2). It is one of the most frequently cited DOI ' +
          'audit findings. Send the acknowledgment even if the file is incomplete ' +
          '— the acknowledgment confirms receipt, not file completeness.',
        isSkippable: false,
      },
      {
        id: 'intake_step_4',
        title: 'Notify the employer',
        description:
          'Send written notification of claim receipt to the employer of record. ' +
          'Use this contact to begin gathering employer-specific information: ' +
          'wage records, job description, supervisor\'s account of the incident, ' +
          'and — critically — the employer\'s date of knowledge of the injury ' +
          '(which may differ from the claim form date and controls the TD and ' +
          'presumption deadlines).',
        authority: 'LC 3761 (employer notification within 15 days for indemnity claims); 10 CCR 2695.5(b)',
        complianceNote:
          'Under LC 3761, the insurer must notify the employer within 15 days of ' +
          'each claim for indemnity. Employer notification is also the opportunity ' +
          'to determine the employer\'s date of knowledge — the date controls the ' +
          '14-day TD payment clock (LC 4650) and the 90-day presumption clock ' +
          '(LC 5402(b)). Using the claim form date instead of the actual knowledge ' +
          'date is a common and costly mistake.',
        isSkippable: false,
      },
      {
        id: 'intake_step_5',
        title: 'Begin investigation immediately',
        description:
          'Start the Three-Point Contact Protocol (Workflow 2) — contact the ' +
          'injured worker, the employer, and the treating physician. Request all ' +
          'available documentation. Do not wait for documents to arrive before ' +
          'beginning. Investigation starts on Day 0, not when the file is complete. ' +
          'If fraud indicators are present (Monday morning claim, delayed reporting, ' +
          'no witnesses), initiate SIU referral while continuing the standard ' +
          'investigation.',
        authority: '10 CCR 2695.5(e) (investigation begins immediately); 8 CCR 10109 (duty to investigate)',
        complianceNote:
          '10 CCR 2695.5(e) requires investigation to begin immediately upon ' +
          'receipt of proof of claim. Under Ins. Code 790.03(h)(3), the insurer ' +
          'must conduct a reasonable investigation before making a coverage ' +
          'determination. Investigation that begins after the 40-day window has ' +
          'closed — or worse, after a denial — is a bad faith red flag. An ' +
          'investigation has to support a denial; a denial cannot justify an ' +
          'after-the-fact investigation.',
        isSkippable: false,
      },
      {
        id: 'intake_step_6',
        title: 'Set initial reserves',
        description:
          'Estimate total claim cost across four categories: indemnity (TD and PD ' +
          'wage replacement), medical treatment, legal expense (ALAE — defense ' +
          'attorney fees), and liens (medical provider liens, EDD, Medicare). ' +
          'Use injury type, body part, worker demographics, and comparable claim ' +
          'benchmarks. Set a realistic estimate — do not use the system minimum. ' +
          'Initial reserves are estimates that will be refined; the key is to ' +
          'avoid systematic under-reserving. Document your rationale for each ' +
          'category.',
        authority: 'No specific statutory deadline; supports Ins. Code 790.03(h)(6) (good faith settlement obligation)',
        complianceNote:
          'Adequate reserves are a prerequisite to good faith settlement under ' +
          'Ins. Code 790.03(h)(6). A claim reserved too low cannot be settled ' +
          'fairly because the examiner lacks the authority to approve a fair ' +
          'settlement amount. Under-reserving across a book of business also ' +
          'affects carrier solvency reporting and actuarial pricing. Set reserves ' +
          'within 48 hours as a carrier best practice.',
        isSkippable: true,
        skipReason:
          'May be deferred briefly when critical wage or medical data is completely ' +
          'unavailable, but must be completed within 48 hours of claim receipt. ' +
          'Never skip permanently — open claims must always carry reserves.',
      },
      {
        id: 'intake_step_7',
        title: 'Activate deadline tracking',
        description:
          'Confirm that all five regulatory deadline clocks are running from the ' +
          'correct source dates: (1) 15-day acknowledgment from claim receipt; ' +
          '(2) 14-day first TD payment from employer knowledge date; (3) 40-day ' +
          'accept/deny from proof of claim receipt; (4) 90-day presumption from ' +
          'employer knowledge date; (5) 30-day delay notification cycle if the ' +
          'determination is delayed past Day 40. Review each deadline date and ' +
          'confirm the source date is correct — especially employer knowledge date, ' +
          'which may differ from claim form date.',
        authority: '10 CCR 2695.5(b); LC 4650; 10 CCR 2695.7(b); LC 5402(b); 10 CCR 2695.7(c)',
        complianceNote:
          'Five separate regulatory clocks run simultaneously from Day 0, each ' +
          'with different source dates and consequences for missing them. The ' +
          '14-day TD clock and 90-day presumption clock run from EMPLOYER KNOWLEDGE ' +
          'DATE — not claim receipt date. Using the wrong source date understates ' +
          'urgency and results in late payments and missed presumption windows. ' +
          'Confirm every source date before closing the intake workflow.',
        isSkippable: false,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. THREE-POINT CONTACT PROTOCOL
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'three_point_contact',
    title: 'Three-Point Contact Protocol',
    description:
      'Industry-standard first investigative step requiring contact with the three ' +
      'parties who know the most about the claim: the injured worker, the employer, ' +
      'and the treating physician. Must begin immediately upon receipt of proof of ' +
      'claim. Best practice is all three contacts within 24–48 hours. Every contact ' +
      'attempt — successful or not — must be documented contemporaneously in the ' +
      'claim log.',
    uplZone: 'GREEN',
    authority: '10 CCR 2695.5(e); 8 CCR 10109; Ins. Code 790.03(h)(3)',
    featureContext: 'INVESTIGATION',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'three_point_step_1',
        title: 'Contact the injured worker',
        description:
          'Introduce yourself and your role. Conduct a substantive conversation — ' +
          'not a checklist. Gather: mechanism of injury (how it happened in detail), ' +
          'body parts affected, current symptoms, treating physician name and ' +
          'location, current work status (off work, modified duty, or full duty), ' +
          'prior injuries to the same body parts, and representation status ' +
          '(do they have an attorney?). If the worker reports attorney representation, ' +
          'note it immediately and route all future communication through counsel. ' +
          'Document the conversation as a narrative, not a form.',
        authority: '10 CCR 2695.5(e); 8 CCR 10109(a)',
        complianceNote:
          'Under 8 CCR 10109, the duty to investigate requires gathering "all ' +
          'reasonably available information." The injured worker is the primary ' +
          'source of information about the mechanism of injury. A call that produces ' +
          'only one-word answers to checklist questions does not satisfy the ' +
          'investigative duty. If the worker is represented by an attorney, ' +
          'direct contact with the worker violates California professional conduct ' +
          'rules — redirect immediately.',
        isSkippable: false,
      },
      {
        id: 'three_point_step_2',
        title: 'Contact the employer',
        description:
          'Contact the direct supervisor AND the HR representative separately if ' +
          'possible — each may have different information. Gather: confirmation of ' +
          'employment and job duties (the actual physical duties, not just the ' +
          'official title), the date the employer FIRST learned of the injury ' +
          '(critical — this controls TD and presumption deadlines), whether any ' +
          'witnesses were present, whether modified duty is available, and wage ' +
          'records for the 52 weeks prior to injury. Note any discrepancies between ' +
          'the employer\'s account and the worker\'s account — document both ' +
          'accurately without resolving the contradiction.',
        authority: '10 CCR 2695.5(e); 8 CCR 10109(a); LC 4453 (AWE calculation)',
        complianceNote:
          'The employer contact is not redundant with the DWC-1 form. The form ' +
          'reflects what HR wrote — the supervisor may know facts HR does not. ' +
          'The employer\'s date of knowledge (when the supervisor first heard about ' +
          'the injury) often predates the DWC-1 completion date and controls both ' +
          'the 14-day TD deadline (LC 4650) and the 90-day presumption (LC 5402(b)). ' +
          'Skipping this contact and relying on the form is a common cause of ' +
          'missed TD deadlines.',
        isSkippable: false,
      },
      {
        id: 'three_point_step_3',
        title: 'Contact the treating physician',
        description:
          'Identify the primary treating physician (PTP) from the claim form or ' +
          'worker contact. Submit a written request for: diagnosis, current ' +
          'treatment plan, work restrictions, anticipated duration of disability, ' +
          'return-to-work prognosis, and whether the injury is consistent with ' +
          'the reported mechanism of injury. If two phone contact attempts fail, ' +
          'send a written request via certified mail or fax with a specific ' +
          'response deadline. An unresponsive physician does not excuse the ' +
          'investigation duty — pursue alternative medical sources (ER records, ' +
          'urgent care).',
        authority: '10 CCR 2695.5(e); 8 CCR 10109(a); LC 4600 (medical treatment obligation)',
        complianceNote:
          'Medical evidence from the treating physician is essential for three ' +
          'downstream obligations: verifying wage loss for TD initiation (LC 4650), ' +
          'assessing compensability for the coverage determination (10 CCR 2695.7(b)), ' +
          'and routing utilization review (LC 4610). Delaying physician contact ' +
          'delays all three. Physicians are slow to respond — contact early and ' +
          'document every attempt.',
        isSkippable: false,
      },
      {
        id: 'three_point_step_4',
        title: 'Document all contact attempts',
        description:
          'Record every contact attempt — successful or not — with the date, time, ' +
          'method (phone, email, certified mail, fax), the specific person contacted ' +
          'or the number called, and the outcome (reached/voicemail/no answer). ' +
          'For voicemails, note that a voicemail was left. For written requests, ' +
          'retain the sent copy and note the expected response deadline. Log ' +
          'off-system contacts (phone calls, in-person meetings) manually — ' +
          'the audit trail requires documentation of all activity, not just ' +
          'activity taken through the claims system.',
        authority: '8 CCR 10103 (claim log — contemporaneous documentation); 8 CCR 10109',
        complianceNote:
          'In a DOI audit or WCAB proceeding, undocumented activity is treated ' +
          'as no activity. Three phone calls that are not logged did not happen. ' +
          'Documenting unsuccessful attempts is not just good practice — it is ' +
          'the evidentiary record that demonstrates the investigation was conducted ' +
          'in good faith when a party was unresponsive. The claim log is the ' +
          'investigative record.',
        isSkippable: false,
      },
      {
        id: 'three_point_step_5',
        title: 'Assess investigation completeness',
        description:
          'After completing the three-point contact, conduct an inventory: what ' +
          'information is in the file, and what is still missing? Determine whether ' +
          'the current information supports a coverage determination or whether ' +
          'additional steps are needed (witness statements, index bureau / ISO ' +
          'ClaimSearch for prior claims, surveillance, medical records). Identify ' +
          'any red flags requiring SIU referral. For each outstanding item, note ' +
          'what action is planned and by what date. The investigation must be ' +
          'sufficient to support the determination — not just sufficient to ' +
          'check the three-contact boxes.',
        authority: '8 CCR 10109(a) (all reasonably available information)',
        complianceNote:
          'Ins. Code 790.03(h)(4) prohibits denying a claim without completing ' +
          'a reasonable investigation. The investigation completeness assessment ' +
          'is your documented confirmation that you gathered all material information ' +
          'before making a coverage decision. Gaps in investigation that are ' +
          'identified and addressed here are an investment — gaps discovered ' +
          'after a denial become evidence of bad faith.',
        isSkippable: false,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. COVERAGE DETERMINATION (Accept / Delay / Deny)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'coverage_determination',
    title: 'Coverage Determination (Accept / Delay / Deny)',
    description:
      'Formal decision on whether the claim is compensable under California ' +
      'workers\' compensation. Must be made within 40 calendar days of proof of ' +
      'claim receipt, or every 30 days thereafter if delayed, and no later than ' +
      '90 days from employer knowledge (after which compensability is presumed). ' +
      'Factual investigation is GREEN zone. Claims involving complex legal issues ' +
      '(cumulative trauma, apportionment, disputed causation, multiple employers) ' +
      'are YELLOW — consult defense counsel before issuing a determination.',
    uplZone: 'YELLOW',
    authority: 'Ins. Code 790.03(h)(5); 10 CCR 2695.7(b); LC 5402(b); 10 CCR 2695.7(h)',
    featureContext: 'COVERAGE_DETERMINATION',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'coverage_step_1',
        title: 'Review investigation findings',
        description:
          'Assemble all evidence gathered: injured worker statement, employer ' +
          'statement, medical records, wage data, witness statements, index bureau ' +
          'results, and any additional investigation. Assess whether the ' +
          'investigation is sufficiently complete to support a determination. ' +
          'Outstanding items that are material to compensability must be pursued ' +
          'before issuing a determination. Begin this review at Day 20–25 to leave ' +
          'time for a determination before the Day 40 deadline.',
        authority: '8 CCR 10109(a) (investigation must include all reasonably available information)',
        complianceNote:
          'Ins. Code 790.03(h)(4) prohibits issuing a coverage denial without ' +
          'completing a reasonable investigation. The investigation review is ' +
          'the documented checkpoint confirming the investigation is adequate ' +
          'before a determination is made. An investigation that is complete ' +
          'enough to deny must also be complete enough to document — the ' +
          'investigative record is the defense against a bad faith finding.',
        isSkippable: false,
      },
      {
        id: 'coverage_step_2',
        title: 'Assess compensability (AOE/COE)',
        description:
          'Evaluate whether the evidence supports three elements: (a) the injury ' +
          'occurred as described, (b) it arose out of employment (AOE), and ' +
          '(c) it occurred in the course of employment (COE). For each element, ' +
          'note the supporting evidence and any contradicting evidence. For ' +
          'straightforward claims — clear mechanism, consistent accounts, ' +
          'supporting medical — this is a routine factual determination. For ' +
          'complex claims — see Step 3 before proceeding.',
        authority: 'Ins. Code 790.03(h)(4), (h)(5); 8 CCR 10109(a)',
        complianceNote:
          'The AOE/COE determination is the examiner\'s professional judgment ' +
          'based on established facts. It is GREEN when the facts are clear and ' +
          'consistent. It becomes YELLOW when causation is disputed, when medical ' +
          'opinions conflict, or when legal doctrines (apportionment, cumulative ' +
          'trauma, serious and willful misconduct) are implicated. The product ' +
          'organizes factual evidence — the determination is yours.',
        isSkippable: false,
      },
      {
        id: 'coverage_step_3',
        title: 'Identify legal complexity — YELLOW zone check',
        description:
          'Before issuing a determination, identify whether the claim involves ' +
          'legal issues requiring defense counsel. Common triggers: disputed ' +
          'causation or conflicting medical opinions; cumulative trauma allegations; ' +
          'pre-existing condition apportionment (LC 4663/4664); multiple employer ' +
          'liability; serious and willful misconduct; third-party subrogation; ' +
          'policy coverage disputes; or attorney representation. If any trigger ' +
          'is present, prepare a factual summary and consult defense counsel before ' +
          'proceeding to Step 4. Factual indicators are GREEN; applying legal ' +
          'doctrines to those facts is YELLOW.',
        authority: 'Cal. Bus. & Prof. Code § 6125 (UPL prohibition); Ins. Code 790.03(h)(14)',
        complianceNote:
          'Apportionment analysis under LC 4663–4664, cumulative trauma causation, ' +
          'and multiple-employer liability require application of California case ' +
          'law (Benson, Escobedo, Vigil) — this constitutes legal analysis that ' +
          'only a licensed attorney may perform. An examiner who independently ' +
          'analyzes apportionment and issues a determination based on that analysis ' +
          'may have engaged in unauthorized practice of law and may have issued ' +
          'an incorrect determination that exposes the carrier to additional liability.',
        isSkippable: false,
      },
      {
        id: 'coverage_step_4a',
        title: 'If compensable: Issue acceptance letter',
        description:
          'Issue a written acceptance formally accepting the claim. The letter must ' +
          'specify the accepted body parts, the date of injury, and the benefits ' +
          'the worker is entitled to receive. Update claim status to accepted. ' +
          'Proceed to Workflow 4 (TD Benefit Initiation) and ensure any pending TD ' +
          'payments are issued immediately. Acceptance triggers downstream benefit ' +
          'obligations — the acceptance letter is the starting gun for benefit ' +
          'delivery.',
        authority: '10 CCR 2695.7(b); Ins. Code 790.03(h)(5)',
        complianceNote:
          'Once accepted, the carrier is obligated to pay all covered benefits ' +
          'promptly. Acceptance does not end the examiner\'s responsibilities — ' +
          'it initiates ongoing obligations for TD payments (LC 4650), medical ' +
          'authorization (LC 4600), and periodic reserve review. Partial acceptance ' +
          '(accepting some body parts while investigating others) is permissible ' +
          'but must be clearly documented.',
        isSkippable: true,
        skipReason:
          'This step applies only if the determination is to accept. Skip and proceed to ' +
          'step_4b if denying, or step_4c if more time is needed.',
      },
      {
        id: 'coverage_step_4b',
        title: 'If not compensable: Issue denial — refer to Denial Issuance Workflow',
        description:
          'If the investigation supports a finding that the claim is not compensable, ' +
          'proceed to the Denial Issuance Workflow (Workflow 5) for the required ' +
          'denial steps. A denial must include a specific factual basis, the ' +
          'regulatory or policy authority supporting the denial, and notice of the ' +
          'worker\'s right to dispute at the WCAB. Best practice: supervisor review ' +
          'before issuance for all denials; defense counsel review for any ' +
          'non-routine denial.',
        authority: '10 CCR 2695.7(h) (written denial requirements); Ins. Code 790.03(h)(14)',
        complianceNote:
          'An improper denial is one of the most costly outcomes in California ' +
          'workers\' compensation. It can result in LC 5814 penalties (up to 25% ' +
          'of delayed benefits), DOI audit findings, WCAB bad faith exposure, and ' +
          'the attachment of the LC 5402(b) presumption if the denial is late. ' +
          'Before issuing a denial, confirm: (a) the investigation is complete, ' +
          '(b) the factual basis is documented, and (c) legal complexity has been ' +
          'evaluated and counsel consulted if required.',
        isSkippable: true,
        skipReason:
          'This step applies only if the determination is to deny. Skip and proceed to ' +
          'step_4a if accepting, or step_4c if more time is needed.',
      },
      {
        id: 'coverage_step_4c',
        title: 'If more time needed: Issue delay letter',
        description:
          'If the investigation cannot be completed within 40 days, send a written ' +
          'delay notification to the claimant specifying: what information is still ' +
          'outstanding, what steps are being taken to obtain it, and the expected ' +
          'timeline for a determination. A new delay letter is required every 30 ' +
          'days until the determination is made. Track the 90-day presumption ' +
          'deadline as an absolute backstop — a delay letter does not prevent the ' +
          'presumption from attaching.',
        authority: '10 CCR 2695.7(c) (30-day delay notification cycle); LC 5402(b) (90-day presumption)',
        complianceNote:
          'Delay is appropriate only when the investigation is genuinely incomplete ' +
          'due to outstanding material information. It is NOT a strategy to avoid ' +
          'a difficult determination. DOI auditors and WCAB judges assess whether ' +
          'delay was reasonable (waiting for a QME appointment scheduled promptly) ' +
          'or strategic (waiting without pursuing available information). The ' +
          '90-day presumption is an absolute backstop — delay letters do not ' +
          'extend the presumption window. If Day 90 is approaching with the ' +
          'investigation incomplete, escalate to supervisor immediately.',
        isSkippable: true,
        skipReason:
          'This step applies only when a determination cannot be made within 40 days. ' +
          'Skip if accepting or denying within the 40-day window.',
      },
      {
        id: 'coverage_step_5',
        title: 'Update reserves after determination',
        description:
          'Revisit all four reserve categories (indemnity, medical, ALAE, liens) ' +
          'after the coverage decision. Acceptance typically requires reserves ' +
          'at full expected claim cost. Denial reduces but does not eliminate ' +
          'reserves — denied claims are frequently litigated and the presumption ' +
          'risk remains until the claim is formally closed. Document the rationale ' +
          'for any reserve change. Update within 48 hours of the determination.',
        authority: 'Carrier financial reporting; supports Ins. Code 790.03(h)(6)',
        complianceNote:
          'Reserves set too low after a coverage determination constrain the ' +
          'examiner\'s settlement authority under Ins. Code 790.03(h)(6) — you ' +
          'cannot settle a claim fairly if the reserve authority does not cover ' +
          'a reasonable settlement. A denied claim that is subsequently litigated ' +
          'and reversed will cost more than a properly reserved claim that was ' +
          'accepted. Maintain reserves on denied claims at a level that reflects ' +
          'the realistic probability of reversal.',
        isSkippable: false,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. TD BENEFIT INITIATION AND ONGOING PAYMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'td_benefit_initiation',
    title: 'TD Benefit Initiation and Ongoing Payment',
    description:
      'Temporary Disability (TD) wage replacement must begin within 14 calendar ' +
      'days of employer knowledge of injury AND disability — even if the claim ' +
      'has not been accepted or denied and even if the investigation is incomplete. ' +
      'TD continues biweekly until the worker returns to full duty, reaches Maximum ' +
      'Medical Improvement (MMI), or hits the 104-week statutory cap. Late payments ' +
      'trigger a mandatory 10% self-imposed penalty under LC 4650(c). TD calculation ' +
      'is statutory arithmetic — this entire workflow is GREEN zone.',
    uplZone: 'GREEN',
    authority: 'LC 4650; LC 4650(b); LC 4650(c); LC 4650(d); LC 4653; LC 4654',
    featureContext: 'BENEFIT_CALCULATION',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'td_step_1',
        title: 'Determine employer\'s date of knowledge',
        description:
          'Identify the date the employer first knew that the employee was (a) ' +
          'injured at work AND (b) losing wages due to the injury. Both elements ' +
          'must be present. This date is often earlier than the claim form date — ' +
          'the employer may have known about the injury when the supervisor saw ' +
          'it happen, long before the DWC-1 was filed. Confirm with the employer ' +
          'during the Three-Point Contact. The 14-day TD clock starts on the ' +
          'employer knowledge date, not on the claim receipt date.',
        authority: 'LC 4650; LC 5402(a)',
        complianceNote:
          'Under LC 5402(a), "knowledge" means actual knowledge of the injury, ' +
          'which may be the date of a witnessed incident, the date the employee ' +
          'first reported verbally, or the date the DWC-1 was received — whichever ' +
          'is earliest. Using the claim receipt date when the employer knew earlier ' +
          'means the first TD payment is already overdue on Day 1 of your ' +
          'investigation. This is the single most common cause of LC 4650(c) ' +
          'self-imposed penalties for new examiners.',
        isSkippable: false,
      },
      {
        id: 'td_step_2',
        title: 'Verify wage loss',
        description:
          'Confirm that the injured worker is actually losing wages due to the ' +
          'industrial injury. Determine: Is the worker entirely off work? On modified ' +
          'duty at reduced hours or pay? Has the employer provided salary continuation? ' +
          'Has the treating physician issued work restrictions that the employer ' +
          'cannot accommodate? TD is payable only when there is actual wage loss ' +
          'caused by the industrial injury. If the employer offers modified duty ' +
          'within the physician\'s restrictions and the worker refuses, that may ' +
          'affect TD — consult defense counsel before stopping payments on that basis.',
        authority: 'LC 4650 (applies when employee suffers wage loss); LC 4600',
        complianceNote:
          'TD is not automatic — it requires both a work injury AND wage loss ' +
          'caused by that injury. However, when both elements are present, payment ' +
          'is mandatory within 14 days. The failure to verify wage loss is different ' +
          'from delaying payment while investigating — if wage loss is present ' +
          'and documented, you must pay. If wage loss is genuinely disputed, ' +
          'document the dispute and the basis for it.',
        isSkippable: false,
      },
      {
        id: 'td_step_3',
        title: 'Calculate Average Weekly Earnings (AWE)',
        description:
          'Gather wage records for the 52 weeks prior to the date of injury: pay ' +
          'stubs, W-2, payroll records. AWE generally includes all regular ' +
          'compensation — base pay, regular overtime, and recurring bonuses. ' +
          'Divide total earnings for the period by 52 to get AWE. If the worker ' +
          'was employed less than 52 weeks, was a seasonal worker, had concurrent ' +
          'employment, or had irregular hours, a non-standard calculation method ' +
          'under LC 4453(b)–(d) may apply — consult your supervisor. Do not delay ' +
          'the first payment while waiting for complete wage records — use the ' +
          'best available data and adjust when actuals arrive.',
        authority: 'LC 4453 (AWE calculation methods); LC 4453(a)–(d)',
        complianceNote:
          'Under LC 4650(d), TD payments must begin even during the investigation — ' +
          'which means before you have complete wage records. Use the wage data ' +
          'on the DWC-1 or the employer\'s initial estimate as the basis for the ' +
          'first payment, adjust when actual records arrive, and pay any shortfall ' +
          'with the next scheduled payment. Using only the base hourly rate without ' +
          'overtime and bonuses is the most common AWE error and results in ' +
          'systematic underpayment with retroactive penalties.',
        isSkippable: false,
      },
      {
        id: 'td_step_4',
        title: 'Calculate the TD rate',
        description:
          'TD rate = 2/3 of AWE, bounded by the statutory minimum and maximum ' +
          'in effect on the date of injury. The minimum and maximum change ' +
          'annually — use the rates for the injury date year, not the current ' +
          'year. Confirm the calculated rate is above the minimum and below the ' +
          'maximum. If AWE x 2/3 falls below the minimum, use the minimum. If it ' +
          'exceeds the maximum, use the maximum. Verify the calculation against ' +
          'the source wage data before issuing the first payment.',
        authority: 'LC 4653 (TD rate = 2/3 of AWE); LC 4653(c)–(d) (statutory minimum and maximum)',
        complianceNote:
          'The TD rate formula is statutory — there is no discretion in the ' +
          'calculation. An error in the TD rate is not just an administrative ' +
          'mistake; every subsequent biweekly payment is wrong, the error ' +
          'compounds over the life of the claim, and each underpayment carries ' +
          'a 10% self-imposed penalty when corrected. Verify the rate once, ' +
          'carefully, before setting up the recurring payment schedule.',
        isSkippable: false,
      },
      {
        id: 'td_step_5',
        title: 'Issue first TD payment',
        description:
          'Issue the first TD payment covering the disability period from the ' +
          'first day of wage loss through the payment date. Note the 3-day waiting ' +
          'period: under LC 4652, the first 3 calendar days of disability are not ' +
          'initially compensable. However, under LC 4652.5, if disability extends ' +
          'beyond 14 calendar days, those 3 days become retroactively compensable ' +
          'and must be paid. Issue the first payment by Day 14 from employer ' +
          'knowledge — no exceptions. If the 10-day mark has passed without ' +
          'payment, the first payment is at risk of being late.',
        authority: 'LC 4650 (first payment within 14 days of employer knowledge); LC 4652 (3-day waiting period); LC 4652.5 (retroactive waiting period)',
        complianceNote:
          'LC 4650(d) is among the most aggressively enforced provisions in ' +
          'California workers\' compensation. The 14-day deadline runs from ' +
          'employer knowledge — not from claim acceptance, not from completion ' +
          'of investigation, not from receipt of medical records. A carrier ' +
          'that withholds TD during investigation because it has not yet decided ' +
          'to accept the claim has violated LC 4650(d). The penalty under ' +
          'LC 4650(c) is mandatory — 10% of the late payment, self-imposed.',
        isSkippable: false,
      },
      {
        id: 'td_step_6',
        title: 'Set up recurring biweekly payment schedule',
        description:
          'After the first payment, establish a recurring payment schedule: one ' +
          'payment every 14 calendar days. Payments must be received by the ' +
          'worker on the due date — not initiated on the due date. Account for ' +
          'processing and mailing time. Track each scheduled payment date. If a ' +
          'payment is going to be late for any reason, the 10% penalty applies ' +
          'automatically — do not wait for a complaint. Review the schedule each ' +
          'time you receive new medical information that might indicate a change ' +
          'in work status.',
        authority: 'LC 4650(b) (every 14 days); LC 4650(c) (10% penalty for late payments)',
        complianceNote:
          'The 10% self-imposed penalty under LC 4650(c) is not waivable and ' +
          'does not require a petition. It attaches automatically the moment a ' +
          'payment is late. The examiner must identify and apply the penalty — ' +
          'not wait for the worker or their attorney to claim it. A pattern of ' +
          'late TD payments across a book of business is a significant DOI audit ' +
          'finding and may constitute a pattern of bad faith under Ins. Code § 790.03.',
        isSkippable: false,
      },
      {
        id: 'td_step_7',
        title: 'Monitor for TD termination events',
        description:
          'TD benefits stop only when a valid termination event occurs: (a) return ' +
          'to full duty with a physician\'s written release; (b) Maximum Medical ' +
          'Improvement (MMI) determination by the treating physician or a QME/AME; ' +
          '(c) the 104-week statutory cap is reached (LC 4654); or (d) the worker ' +
          'refuses a valid offer of modified duty within physician-stated restrictions ' +
          '(consult defense counsel before stopping on this basis). Track cumulative ' +
          'weeks paid against the 104-week cap. Notify supervisor when the cap is ' +
          'within 8 weeks. Never stop TD based on an assumption that the worker ' +
          '"must be better by now."',
        authority: 'LC 4656 (TD termination conditions); LC 4654 (104-week cap); LC 4658 (vocational rehabilitation)',
        complianceNote:
          'Stopping TD without a documented valid basis is one of the leading ' +
          'causes of LC 5814 penalty findings. Under LC 5814, unreasonable delay ' +
          'or refusal to pay benefits can result in a penalty of up to 25% of ' +
          'the delayed amount, plus attorney\'s fees, plus interest. The burden ' +
          'is on the carrier to prove TD has properly ended — not on the worker ' +
          'to prove it continues. Document every termination event with the ' +
          'specific medical or statutory basis.',
        isSkippable: false,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. DENIAL ISSUANCE
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'denial_issuance',
    title: 'Denial Issuance',
    description:
      'Formal issuance of a written claim denial for a workers\' compensation claim ' +
      'determined to be non-compensable. A denial must be supported by a completed ' +
      'investigation, a specific factual basis, and the statutory or regulatory ' +
      'authority supporting the denial. Non-routine denials (disputed causation, ' +
      'cumulative trauma, complex medical) require defense counsel review before ' +
      'issuance. The denial letter is both the carrier\'s legal position and the ' +
      'worker\'s notice of their rights — it must be accurate, complete, and timely. ' +
      'This workflow is YELLOW because the denial decision itself may involve legal ' +
      'complexity requiring counsel, even though the administrative steps are GREEN.',
    uplZone: 'YELLOW',
    authority: '10 CCR 2695.7(b)(1); 10 CCR 2695.7(h); Ins. Code 790.03(h)(4); Ins. Code 790.03(h)(14); LC 5402(b)',
    featureContext: 'COVERAGE_DETERMINATION',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'denial_step_1',
        title: 'Confirm the investigative basis for denial',
        description:
          'Before drafting the denial letter, confirm that the investigation is ' +
          'complete and that the factual record supports non-compensability. ' +
          'Document the specific facts that establish the basis for denial — not ' +
          'a conclusion ("the claim is not AOE/COE") but the underlying facts ' +
          '("the employer\'s account, the medical evidence, and the witness ' +
          'statements are consistent in showing the injury did not occur at work"). ' +
          'Confirm that the investigation addressed all three AOE/COE elements. ' +
          'If the investigation is still incomplete, issue a delay letter instead ' +
          '(Workflow 3, Step 4c) and complete the investigation.',
        authority: 'Ins. Code 790.03(h)(4) (no denial without completed investigation); 8 CCR 10109(a)',
        complianceNote:
          'An improper denial — one not supported by a completed investigation — ' +
          'violates Ins. Code 790.03(h)(4) and is a per-se bad faith finding. ' +
          'The investigation has to support the denial; a denial issued to ' +
          'prompt the worker to prove their claim is reversed. In California, ' +
          'the burden of proving non-compensability is on the carrier after a ' +
          'denial is issued. A denial issued without adequate investigation is a ' +
          'denial issued without the evidence to support it.',
        isSkippable: false,
      },
      {
        id: 'denial_step_2',
        title: 'Identify legal complexity — YELLOW zone check before proceeding',
        description:
          'Before drafting the denial, assess whether the claim involves legal ' +
          'issues requiring defense counsel. Key triggers: disputed or complex ' +
          'causation; cumulative trauma; pre-existing condition apportionment ' +
          '(LC 4663/4664); conflicting medical opinions requiring a QME/AME; ' +
          'multiple employers; serious and willful misconduct; fraud; third-party ' +
          'subrogation; attorney representation; or any situation where the denial ' +
          'rationale requires application of case law rather than clear statutory ' +
          'authority. If any trigger is present, prepare a factual summary and ' +
          'consult defense counsel before proceeding. The examiner may identify ' +
          'the factual indicators; only counsel analyzes the legal implications.',
        authority: 'Cal. Bus. & Prof. Code § 6125 (UPL prohibition); Ins. Code 790.03(h)(14)',
        complianceNote:
          'Denial letters in complex cases routinely become exhibits at WCAB ' +
          'hearings. A denial letter that misstates the legal basis, incorrectly ' +
          'applies an apportionment doctrine, or relies on case law analysis ' +
          'without legal review may result in: reversal of the denial, LC 5814 ' +
          'penalties on all delayed benefits, WCAB sanctions, and DOI referral. ' +
          'Defense counsel review of non-routine denials is a cost-effective ' +
          'investment compared to the cost of a reversed denial.',
        isSkippable: false,
      },
      {
        id: 'denial_step_3',
        title: 'Draft the denial letter with all required elements',
        description:
          'Prepare the denial letter with the following required elements: ' +
          '(1) the specific reasons for the denial stated clearly; ' +
          '(2) the factual basis — the specific evidence and investigation findings ' +
          'that support the denial; ' +
          '(3) the statutory, regulatory, or policy authority for the denial ' +
          '(cite the specific code section, not just "the claim is not covered"); ' +
          '(4) notice of the worker\'s right to dispute the denial at the WCAB, ' +
          'including WCAB contact information; ' +
          '(5) identification of any benefits that are NOT denied (e.g., medical ' +
          'treatment under LC 5402(c) continues during investigation regardless ' +
          'of denial status for the first 30 days).',
        authority: '10 CCR 2695.7(h) (written denial requirements); Ins. Code 790.03(h)(14) (explanation required)',
        complianceNote:
          'A denial letter that omits any required element is defective on its ' +
          'face. A denial without a specific factual basis ("insufficient evidence" ' +
          'with no explanation) violates Ins. Code 790.03(h)(14). A denial without ' +
          'WCAB dispute rights violates the worker\'s procedural rights and can ' +
          'be set aside on that basis alone. Every element serves a legal purpose — ' +
          'the factual basis documents the investigation, the authority identifies ' +
          'the legal theory, the dispute notice protects the worker\'s rights.',
        isSkippable: false,
      },
      {
        id: 'denial_step_4',
        title: 'Supervisor review before issuance',
        description:
          'Submit the denial letter for supervisor review before sending. Best ' +
          'practice is supervisor review for ALL denials. Defense counsel review ' +
          'is strongly recommended for any non-routine denial. Supervisor or ' +
          'counsel may: confirm the investigative basis is adequate, identify ' +
          'missing elements in the letter, assess litigation risk and recommend ' +
          'a different approach, verify the denial complies with regulatory ' +
          'requirements, and confirm the timing does not risk triggering the ' +
          'LC 5402(b) presumption.',
        authority: 'Carrier best practice; Ins. Code 790.03(h)(5) (timely determination)',
        complianceNote:
          'The review step is not a bureaucratic delay — it is a quality control ' +
          'checkpoint on one of the most consequential decisions in the claims ' +
          'process. A denial reversed at the WCAB costs the carrier the original ' +
          'benefit amount plus LC 5814 penalties (up to 25%), attorney\'s fees, ' +
          'and interest. The cost of a supervisor review is measured in minutes; ' +
          'the cost of an improper denial is measured in thousands of dollars ' +
          'and audit findings.',
        isSkippable: false,
      },
      {
        id: 'denial_step_5',
        title: 'Issue denial letter before the applicable deadline',
        description:
          'Send the denial letter to all required parties: the injured worker ' +
          '(or their attorney if represented), the employer, and any lien claimants ' +
          'of record. Send via a method that creates a delivery record (certified ' +
          'mail, fax with confirmation, or electronic delivery with receipt). ' +
          'Issue by Day 40 from proof of claim receipt — or earlier if the 90-day ' +
          'presumption deadline from employer knowledge is sooner. Log the issuance ' +
          'date, method, and recipients in the claim log immediately.',
        authority: '10 CCR 2695.7(b) (40-day deadline); LC 5402(b) (90-day presumption from employer knowledge)',
        complianceNote:
          'A denial issued on Day 41 is a late denial under 10 CCR 2695.7(b). ' +
          'A denial issued after the 90-day employer knowledge window has the ' +
          'presumption already attached — the denial is still valid but the ' +
          'carrier now bears the burden of overcoming the presumption at the WCAB. ' +
          'Track both deadlines — the 40-day regulatory deadline AND the 90-day ' +
          'presumption deadline from employer knowledge, which may be earlier. ' +
          'Use the earlier of the two as your actual deadline.',
        isSkippable: false,
      },
      {
        id: 'denial_step_6',
        title: 'Post-denial: Update reserves, assign defense counsel, preserve file',
        description:
          'After issuance: (1) Update reserves — denied claims are not closed ' +
          'claims. Maintain reserves reflecting the realistic probability of ' +
          'reversal and litigation costs. (2) Assign defense counsel if the ' +
          'worker is represented or litigation is expected. (3) Preserve the ' +
          'entire investigation file — do not discard or modify any document ' +
          'after the denial. The file is the carrier\'s evidentiary record if ' +
          'the denial is disputed at the WCAB. (4) Continue providing emergency ' +
          'or first-aid medical treatment under LC 5402(c) if within the first ' +
          '30 days — denial of the claim does not automatically terminate medical ' +
          'obligations in all circumstances.',
        authority: 'LC 5402(c) (first 30 days medical); carrier litigation guidelines; Ins. Code 790.03(h)(6)',
        complianceNote:
          'A denied claim is not an inactive claim. It is a claim in dispute that ' +
          'is highly likely to be filed at the WCAB. Reserves must reflect litigation ' +
          'costs (ALAE) even on a denied claim. Defense counsel should be assigned ' +
          'before the first WCAB conference date. The evidentiary file is the ' +
          'carrier\'s defense — any gap in the investigation record becomes the ' +
          'applicant attorney\'s argument at trial. Preserve everything.',
        isSkippable: false,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helper — O(1) access by workflow ID
// ─────────────────────────────────────────────────────────────────────────────
export const WORKFLOWS_BY_ID = new Map(
  WORKFLOW_DEFINITIONS.map((w) => [w.id, w]),
);
