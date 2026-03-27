/**
 * Tier 1 — Dismissable term definitions for claims examiner education.
 *
 * These are basic terms that new examiners see by default. Once an examiner
 * demonstrates understanding (dismisses the term), it stays hidden unless
 * they re-enable it. Content is static regulatory data — user state (dismissals)
 * is tracked in the EducationProfile DB model.
 *
 * Sources:
 *   - California Labor Code (LC)
 *   - California Insurance Code (Ins. Code)
 *   - California Code of Regulations, Title 8 (8 CCR) and Title 10 (10 CCR)
 *   - DWC forms and procedures
 *   - ADJUDICLAIMS_REGULATORY_EDUCATION_SPEC.md
 *
 * UPL Note: All definitions are factual/educational (GREEN zone). These explain
 * what terms mean — they do not advise on what the examiner should decide.
 */

export type FeatureContext =
  | 'CLAIM_INTAKE'
  | 'BENEFIT_CALCULATION'
  | 'DEADLINE_TRACKING'
  | 'MEDICAL_REVIEW'
  | 'INVESTIGATION'
  | 'DOCUMENT_REVIEW'
  | 'CHAT'
  | 'COVERAGE_DETERMINATION'
  | 'SETTLEMENT'
  | 'UTILIZATION_REVIEW';

export type Tier1Category =
  | 'BENEFITS'
  | 'MEDICAL'
  | 'LEGAL_PROCESS'
  | 'REGULATORY_BODIES'
  | 'CLAIM_LIFECYCLE'
  | 'DOCUMENTS_FORMS';

export interface Tier1Term {
  id: string;
  abbreviation: string;
  fullName: string;
  definition: string;
  category: Tier1Category;
  featureContexts: FeatureContext[];
}

export const TIER1_TERMS: Tier1Term[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // BENEFITS (~15 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'benefits_awe',
    abbreviation: 'AWE',
    fullName: 'Average Weekly Earnings',
    definition:
      "The worker's average weekly pay before the injury occurred, calculated from wages earned in the year prior to the date of injury. AWE is the foundation of most California WC benefit calculations — TD, PD advances, and death benefits are all derived from it. Under LC 4453, AWE is typically the gross weekly wage (pre-tax), not take-home pay.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'CLAIM_INTAKE', 'SETTLEMENT'],
  },
  {
    id: 'benefits_td',
    abbreviation: 'TD',
    fullName: 'Temporary Disability',
    definition:
      'A wage-replacement benefit paid to injured workers who cannot work, or can only work at reduced capacity, while they are recovering from a work injury. TD is paid at two-thirds of the worker\'s AWE, subject to a state-set maximum and minimum rate (adjusted annually). Under LC 4650, the first TD payment must be made within 14 days of the employer\'s knowledge of the disability.',
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'DEADLINE_TRACKING', 'SETTLEMENT'],
  },
  {
    id: 'benefits_ttd',
    abbreviation: 'TTD',
    fullName: 'Temporary Total Disability',
    definition:
      'A type of TD benefit paid when the injured worker is completely unable to work due to their injury. TTD is paid at 2/3 of AWE up to the state maximum weekly rate. It continues until the worker returns to work, reaches Maximum Medical Improvement (MMI), or reaches the 104-week cap (with some exceptions for certain serious injuries under LC 4656).',
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'DEADLINE_TRACKING'],
  },
  {
    id: 'benefits_tpd',
    abbreviation: 'TPD',
    fullName: 'Temporary Partial Disability',
    definition:
      "A type of TD benefit paid when the injured worker can perform some work but not their full pre-injury duties, resulting in reduced earnings. TPD is paid at two-thirds of the difference between the worker's pre-injury AWE and their actual earnings during the period of partial disability. Less common than TTD in practice.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION'],
  },
  {
    id: 'benefits_pd',
    abbreviation: 'PD',
    fullName: 'Permanent Disability',
    definition:
      "A benefit paid to injured workers who have a lasting impairment after reaching Maximum Medical Improvement (MMI). The amount depends on a PD rating calculated from the Whole Person Impairment (WPI) percentage assigned by the QME or AME, the worker's occupation, their age at injury, and the applicable Permanent Disability Rating Schedule (PDRS). PD is paid in weekly installments per LC 4650.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'benefits_sjdb',
    abbreviation: 'SJDB',
    fullName: 'Supplemental Job Displacement Benefit',
    definition:
      'A non-transferable voucher that injured workers can use to pay for retraining or skill enhancement at state-approved schools if they cannot return to their pre-injury job and the employer does not offer modified or alternative work. Under LC 4658.7, the voucher amount is $6,000 for injuries on or after January 1, 2013. It is provided in addition to PD benefits.',
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'benefits_mmi',
    abbreviation: 'MMI',
    fullName: 'Maximum Medical Improvement',
    definition:
      "The point in a worker's recovery when their medical condition has stabilized and is unlikely to improve further with additional treatment. Also called \"Permanent and Stationary\" (P&S) in California WC. When a worker reaches MMI/P&S, the treating physician issues a report rating the permanent impairment. TD benefits end at MMI and PD benefits may begin.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'benefits_ps',
    abbreviation: 'P&S',
    fullName: 'Permanent and Stationary',
    definition:
      "California's term for the point when a worker's medical condition has reached Maximum Medical Improvement (MMI) — the condition is stable and unlikely to change significantly with further treatment. The treating physician issues a Permanent and Stationary report that includes a WPI rating and work restrictions. This report triggers the permanent disability evaluation process.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW'],
  },
  {
    id: 'benefits_cola',
    abbreviation: 'COLA',
    fullName: 'Cost of Living Adjustment',
    definition:
      'An annual increase applied to certain ongoing TD and PD benefit rates to reflect inflation and changes in the state average weekly wage. Under LC 4659, workers receiving long-term PTD or life pension benefits are entitled to annual COLA increases. The adjustment rate is determined by the Department of Industrial Relations based on the statewide average weekly wage.',
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION'],
  },
  {
    id: 'benefits_death_benefit',
    abbreviation: 'Death Benefit',
    fullName: 'Death Benefit',
    definition:
      "A benefit paid to the dependents of a worker who dies as a result of a work-related injury or illness. Under LC 4702, the total death benefit amount depends on the number of total and partial dependents. As of 2022, the total death benefit for one total dependent is $320,000. A burial expense allowance (currently $10,000 under LC 4701) is paid separately from the death benefit.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'CLAIM_INTAKE'],
  },
  {
    id: 'benefits_ptd',
    abbreviation: 'PTD',
    fullName: 'Permanent Total Disability',
    definition:
      "A benefit for workers who are permanently and totally unable to work in any capacity due to their work injury. Under LC 4452, PTD is paid for life at the same rate as TD (2/3 of AWE, subject to maximums). Certain injuries create a conclusive presumption of PTD under LC 4662 (e.g., total loss of use of both eyes, both hands, or any combination thereof).",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'benefits_life_pension',
    abbreviation: 'Life Pension',
    fullName: 'Life Pension',
    definition:
      'An additional lifetime benefit paid to workers with high permanent disability ratings (70% or above under LC 4659). A life pension is paid weekly, in addition to the regular PD payment, after the PD award is exhausted. The amount is calculated based on the PD percentage and the worker\'s AWE.',
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'benefits_wage_statement',
    abbreviation: 'Wage Statement',
    fullName: 'Wage Statement / Wage Verification',
    definition:
      "Documentation of an injured worker's earnings used to calculate the Average Weekly Earnings (AWE) and the resulting TD and PD benefit rates. A wage statement typically comes from the employer in the form of pay stubs, payroll records, or a completed DWC wage form. Under LC 4453, if wages cannot be determined, a reasonable estimate is used. Accurate wage verification is critical — errors in AWE affect every benefit payment on the claim.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'CLAIM_INTAKE', 'INVESTIGATION'],
  },
  {
    id: 'benefits_td_max_min',
    abbreviation: 'TD Max/Min',
    fullName: 'Temporary Disability Maximum and Minimum Weekly Rates',
    definition:
      "The state-set ceiling and floor for weekly TD benefit payments, adjusted each January 1 based on the statewide average weekly wage. No injured worker receives more than the maximum or less than the minimum, regardless of their actual AWE. The maximum and minimum rates are published annually by the DWC. As of 2024, the maximum TD rate is $1,619.15/week; the minimum is $242.86/week.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION'],
  },
  {
    id: 'benefits_apportionment',
    abbreviation: 'Apportionment',
    fullName: 'Apportionment',
    definition:
      "The process of dividing a worker's permanent disability between the current work injury and other causes — such as prior injuries, pre-existing conditions, or non-industrial factors. Under LC 4663 and LC 4664, physicians must address apportionment in their medical-legal reports. Apportionment reduces the amount of PD the carrier owes for the current claim. For example, if a worker has 40% total disability but 25% is apportioned to a prior injury, the carrier for the current claim owes PD based on 15% only.",
    category: 'BENEFITS',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW', 'SETTLEMENT'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MEDICAL (~20 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'medical_qme',
    abbreviation: 'QME',
    fullName: 'Qualified Medical Evaluator',
    definition:
      'A physician certified by the DWC Medical Unit to conduct independent medical evaluations in disputed California workers\' compensation claims. A QME is assigned through the DWC\'s random panel process when the injured worker is represented by an attorney and the parties cannot agree on an AME. The QME\'s medical-legal report resolves disputed medical questions such as causation, disability rating, and work restrictions.',
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'INVESTIGATION', 'SETTLEMENT'],
  },
  {
    id: 'medical_ame',
    abbreviation: 'AME',
    fullName: 'Agreed Medical Evaluator',
    definition:
      "A physician that both the injured worker's attorney and the defense (claims examiner/defense counsel) jointly agree to use for a medical-legal evaluation in a disputed claim. Unlike a QME, an AME is selected by mutual agreement — not through a DWC panel. AME evaluations tend to be used in more complex or high-value claims where the parties want a specific specialist. The AME's report has the same legal weight as a QME report.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'medical_ptp',
    abbreviation: 'PTP',
    fullName: 'Primary Treating Physician',
    definition:
      "The physician primarily responsible for managing the injured worker's medical care during recovery. The PTP coordinates treatment, requests authorizations for specialist referrals or procedures, and issues PR-2 and P&S reports used for benefit calculations. Under 8 CCR 9785, the injured worker has the right to select their own PTP within the employer's Medical Provider Network (MPN), subject to specific rules.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW'],
  },
  {
    id: 'medical_pqme',
    abbreviation: 'PQME',
    fullName: 'Panel Qualified Medical Evaluator',
    definition:
      'A QME assigned through the DWC\'s random panel process. When there is a medical dispute in a represented claim, the DWC provides a panel of three QMEs in the relevant specialty. Each party strikes one name, and the remaining physician becomes the Panel QME for the evaluation. "PQME" and "Panel QME" are used interchangeably.',
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'INVESTIGATION'],
  },
  {
    id: 'medical_mpn',
    abbreviation: 'MPN',
    fullName: 'Medical Provider Network',
    definition:
      "A network of physicians and other healthcare providers that an insurer or employer establishes and gets approved by the DWC for treating injured workers. When an employer has a DWC-approved MPN, the injured worker is generally required to treat within the network. MPNs allow the carrier to direct care to qualified, cost-effective providers while ensuring the worker has access to appropriate treatment under 8 CCR 9767.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW', 'CLAIM_INTAKE'],
  },
  {
    id: 'medical_mtus',
    abbreviation: 'MTUS',
    fullName: 'Medical Treatment Utilization Schedule',
    definition:
      "California's evidence-based treatment guidelines, adopted by the DWC and based primarily on the ACOEM Practice Guidelines. Under LC 4600.1, the MTUS sets the standard for what medical treatment is presumptively reasonable and necessary for injured workers. Treatment that falls within MTUS guidelines must be authorized unless there is clear evidence it is inappropriate for the specific patient.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW'],
  },
  {
    id: 'medical_wpi',
    abbreviation: 'WPI',
    fullName: 'Whole Person Impairment',
    definition:
      'A numeric percentage (0–100%) that quantifies the degree to which a work injury has permanently impaired the injured worker\'s overall functional capacity, based on the AMA Guides to the Evaluation of Permanent Impairment (5th edition) as adopted in California. A WPI rating is assigned by the QME or AME at the P&S stage and is the starting point for calculating permanent disability (PD) benefits.',
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'medical_acoem',
    abbreviation: 'ACOEM',
    fullName: 'American College of Occupational and Environmental Medicine',
    definition:
      "The professional medical organization whose evidence-based practice guidelines form the foundation of California's MTUS. When a claims examiner or utilization reviewer asks whether a requested treatment is appropriate, the ACOEM guidelines (as incorporated into the MTUS) are the primary reference. Treatment supported by ACOEM guidelines has a presumption of medical necessity under LC 4600.1.",
    category: 'MEDICAL',
    featureContexts: ['UTILIZATION_REVIEW', 'MEDICAL_REVIEW'],
  },
  {
    id: 'medical_imr',
    abbreviation: 'IMR',
    fullName: 'Independent Medical Review',
    definition:
      "A process by which a denial or modification of medical treatment by a Utilization Review (UR) organization can be challenged. Under LC 4610.5, an injured worker (or their physician) can request IMR within 30 days of receiving a UR denial. The IMR is conducted by a DWC-contracted independent organization using MTUS/ACOEM guidelines. IMR decisions are final and binding except in cases of fraud, conflict of interest, or material misrepresentation.",
    category: 'MEDICAL',
    featureContexts: ['UTILIZATION_REVIEW', 'MEDICAL_REVIEW'],
  },
  {
    id: 'medical_ur',
    abbreviation: 'UR',
    fullName: 'Utilization Review',
    definition:
      "The process by which the insurer or TPA reviews requests for medical treatment to determine whether the requested care is medically necessary and appropriate under the MTUS. Under LC 4610, the UR organization must make a decision within specific timeframes: prospective UR decisions must be made within 5 business days of receiving the request (up to 14 days with documented delay notice); concurrent UR within 1 business day.",
    category: 'MEDICAL',
    featureContexts: ['UTILIZATION_REVIEW', 'MEDICAL_REVIEW', 'DEADLINE_TRACKING'],
  },
  {
    id: 'medical_hco',
    abbreviation: 'HCO',
    fullName: 'Health Care Organization',
    definition:
      'A DWC-certified organization that provides comprehensive medical care for injured workers as an alternative to a standard MPN. HCOs are less common than MPNs and offer a managed care model for WC medical treatment. Employers who utilize HCOs must comply with specific enrollment, disclosure, and grievance procedures under 8 CCR 9770.',
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW'],
  },
  {
    id: 'medical_pr2',
    abbreviation: 'PR-2',
    fullName: 'Treating Physician\'s Progress Report (Form DWC PR-2)',
    definition:
      'The standard DWC form used by the Primary Treating Physician (PTP) to report on the injured worker\'s medical status during treatment. PR-2 reports document diagnosis, treatment provided, work status (full duty, modified duty, or off work), and expected duration of disability. These reports are the primary basis for TD benefit decisions while the worker is actively treating. Under 8 CCR 9785, PR-2s must be sent to the claims examiner within 5 days of the office visit.',
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'BENEFIT_CALCULATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'medical_pr4',
    abbreviation: 'PR-4',
    fullName: 'Treating Physician\'s Permanent and Stationary Report (Form DWC PR-4)',
    definition:
      "The standard DWC form used by the Primary Treating Physician (PTP) to report the injured worker's condition at the P&S (Permanent and Stationary) stage. The PR-4 documents the final diagnosis, WPI percentage, work restrictions, need for future medical care, and apportionment opinion. This report is used to calculate permanent disability (PD) benefits.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'BENEFIT_CALCULATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'medical_pdrs',
    abbreviation: 'PDRS',
    fullName: 'Permanent Disability Rating Schedule',
    definition:
      "California's official schedule for converting a physician's WPI rating into a permanent disability percentage, which then determines the dollar value of PD benefits. The PDRS takes into account the WPI, the worker's occupation (occupational adjustment), and the worker's age at the time of injury (age adjustment). The current PDRS was adopted in 2005 and applies to most injuries on or after January 1, 2005.",
    category: 'MEDICAL',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'medical_ama_guides',
    abbreviation: 'AMA Guides',
    fullName: 'AMA Guides to the Evaluation of Permanent Impairment',
    definition:
      "A publication by the American Medical Association that provides standardized methods for physicians to evaluate and rate permanent impairment. California WC uses the 5th edition of the AMA Guides (as of 2005) to rate WPI for injuries on or after January 1, 2005. Physicians use the Guides' specific measurement criteria for each body part or system to arrive at an objective impairment percentage.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'BENEFIT_CALCULATION'],
  },
  {
    id: 'medical_omfs',
    abbreviation: 'OMFS',
    fullName: 'Official Medical Fee Schedule',
    definition:
      "California's schedule of maximum allowable fees for medical services provided to injured workers. Under LC 5307.1, the DWC adopts the OMFS to set reimbursement rates for medical providers. The OMFS is organized by type of service (e.g., physician services, hospital inpatient, pharmacy) and is updated periodically. Providers cannot bill more than the OMFS rate for workers' compensation patients.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW'],
  },
  {
    id: 'medical_future_medical',
    abbreviation: 'Future Medical',
    fullName: 'Future Medical Treatment',
    definition:
      "Medical care that a physician determines the injured worker will need beyond the point of P&S, on an ongoing basis, to maintain the level of improvement achieved during recovery. Future medical is a benefit owed under LC 4600 and is a standard component of both open claims and settlement negotiations. It is often described in the P&S/PR-4 report as palliative care, maintenance care, or periodic follow-up.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'medical_rfa',
    abbreviation: 'RFA',
    fullName: 'Request for Authorization',
    definition:
      "The formal request a treating physician submits to the claims examiner or UR organization to authorize a specific medical treatment, procedure, referral, or diagnostic test for an injured worker. Under LC 4610 and 8 CCR 9792.6.1, an RFA must be submitted on the DWC RFA form and include supporting clinical information. The UR clock starts when a complete RFA is received.",
    category: 'MEDICAL',
    featureContexts: ['UTILIZATION_REVIEW', 'MEDICAL_REVIEW', 'DEADLINE_TRACKING'],
  },
  {
    id: 'medical_lien',
    abbreviation: 'Lien',
    fullName: 'Medical Lien',
    definition:
      "A claim by a medical provider, interpreter, or other service provider for payment of bills related to treatment or services provided to an injured worker. Lien claimants file their claims with the WCAB and their liens are adjudicated as part of the overall case resolution. Under LC 4903, certain lien types (e.g., medical treatment, interpreter) are allowable against WC awards. Unresolved liens can complicate and delay case settlement.",
    category: 'MEDICAL',
    featureContexts: ['SETTLEMENT', 'MEDICAL_REVIEW'],
  },
  {
    id: 'medical_spinal_surgery_second_opinion',
    abbreviation: 'SSSO',
    fullName: 'Spinal Surgery Second Opinion',
    definition:
      "Under LC 4062, when a physician recommends spinal surgery and the insurer does not object, the insurer may require the injured worker to obtain a second opinion from a physician in the insurer's MPN before surgery is authorized. The second-opinion physician is chosen by the worker from a list of three physicians provided by the insurer. If the second-opinion physician disagrees, a third-opinion (tiebreaker) process follows.",
    category: 'MEDICAL',
    featureContexts: ['MEDICAL_REVIEW', 'UTILIZATION_REVIEW'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEGAL_PROCESS (~15 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'legal_aoe_coe',
    abbreviation: 'AOE/COE',
    fullName: 'Arising Out of Employment / Course of Employment',
    definition:
      "The two-part legal test that determines whether an injury is compensable as a work-related injury in California. \"Arising out of employment\" (AOE) means the injury was caused by or connected to the worker's job duties. \"Course of employment\" (COE) means the injury occurred while the worker was performing their job duties (including going to and from work under the \"going and coming\" rule exceptions). Both elements must be present for a claim to be compensable.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['INVESTIGATION', 'COVERAGE_DETERMINATION', 'CLAIM_INTAKE'],
  },
  {
    id: 'legal_subrogation',
    abbreviation: 'Subrogation',
    fullName: 'Subrogation',
    definition:
      "The right of the workers' compensation insurer to recover money paid on a claim from a third party whose negligence caused or contributed to the worker's injury. Under LC 3852, if a third party (for example, a negligent driver who caused an auto accident injuring the worker) is legally responsible for the injury, the insurer can seek reimbursement from that party for benefits paid. Identifying subrogation potential early can significantly reduce claim costs.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['INVESTIGATION', 'COVERAGE_DETERMINATION', 'SETTLEMENT'],
  },
  {
    id: 'legal_cnr',
    abbreviation: 'C&R',
    fullName: 'Compromise and Release',
    definition:
      "A type of settlement agreement in California WC where the injured worker receives a lump-sum payment in exchange for releasing all future claims against the insurer, including future medical treatment. Under LC 5001, a C&R must be approved by a WCAB judge to be legally binding. C&Rs are used to fully resolve a claim. Once approved, the carrier has no further liability for the claim — medical or indemnity.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT'],
  },
  {
    id: 'legal_stipulated_award',
    abbreviation: 'Stipulated Award',
    fullName: 'Stipulated Findings and Award',
    definition:
      "A type of settlement agreement in California WC where the parties agree on the extent of permanent disability and the carrier's liability, but keep future medical care open (i.e., the carrier remains responsible for ongoing treatment). Unlike a C&R, a Stipulated Award does not close out medical — the worker retains the right to seek medical treatment for the industrial injury. It is approved by a WCAB judge and becomes an enforceable order.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT'],
  },
  {
    id: 'legal_msc',
    abbreviation: 'MSC',
    fullName: 'Mandatory Settlement Conference',
    definition:
      'A required pre-trial conference at the WCAB where the parties — the injured worker (or their attorney) and the defense (carrier/TPA and their counsel) — appear before a WCAB judge to attempt settlement or narrow the issues for trial. MSCs are set after a Declaration of Readiness to Proceed (DOR) is filed. If the case does not settle at the MSC, a trial date is set.',
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_dor',
    abbreviation: 'DOR',
    fullName: 'Declaration of Readiness to Proceed',
    definition:
      "A document filed by either party with the WCAB to request a hearing or trial date, signaling that the party believes the case is ready to be adjudicated. A DOR is typically filed when settlement negotiations have stalled or when a specific issue (e.g., an unpaid benefit or a disputed medical question) needs WCAB resolution. Filing a DOR starts the formal WCAB litigation process.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_wcj',
    abbreviation: 'WCJ',
    fullName: 'Workers\' Compensation Judge',
    definition:
      'A judicial officer of the Workers\' Compensation Appeals Board (WCAB) who presides over hearings, trials, and settlement approvals in California WC cases. WCJs have authority to approve settlements, issue awards, impose LC 5814 penalties for unreasonable delay, and resolve disputed issues. WCJ decisions can be appealed to the WCAB commissioners and then to the California Court of Appeal.',
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_5814_penalty',
    abbreviation: 'LC 5814',
    fullName: 'Labor Code Section 5814 Penalty',
    definition:
      "A financial penalty imposed by the WCAB when an employer or insurer unreasonably delays or refuses to pay compensation. The penalty is up to 25% of the delayed benefit amount, paid directly to the injured worker. LC 5814 penalties are a tool the WCAB uses to enforce timely claims handling — an examiner who misses a TD payment deadline, delays medical authorization, or unreasonably denies a claim can trigger this penalty.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['BENEFIT_CALCULATION', 'DEADLINE_TRACKING', 'SETTLEMENT'],
  },
  {
    id: 'legal_bad_faith',
    abbreviation: 'Bad Faith',
    fullName: 'Bad Faith Claims Handling',
    definition:
      "A legal term for an insurer's unreasonable refusal to honor its obligations under the policy or applicable law. In California WC, bad faith claims can arise when an examiner denies a claim without adequate investigation, delays payment without justification, makes unreasonably low settlement offers, or otherwise fails to handle the claim fairly. Bad faith can result in civil liability beyond the WC system, including compensatory and punitive damages.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['COVERAGE_DETERMINATION', 'SETTLEMENT', 'INVESTIGATION'],
  },
  {
    id: 'legal_siu',
    abbreviation: 'SIU',
    fullName: 'Special Investigations Unit',
    definition:
      "A specialized unit within an insurance carrier or TPA responsible for investigating suspected workers' compensation fraud. When an examiner identifies red flags of fraud — inconsistent injury histories, surveillance evidence, prior claims history, or employer concerns — the claim is referred to the SIU. Under Ins. Code 1877.4, carriers are required to have anti-fraud plans and to refer suspected fraud cases to the California Department of Insurance (CDI) Fraud Division.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['INVESTIGATION', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_applicant_attorney',
    abbreviation: 'Applicant Attorney',
    fullName: 'Applicant\'s Attorney',
    definition:
      "An attorney who represents the injured worker (\"applicant\") in a workers' compensation claim. In California WC, attorney fees for applicant attorneys are set by the WCAB, typically 9–12% of the PD award. Once an injured worker retains an attorney, all communications about the claim go through the attorney — the examiner should not directly contact a represented worker about legal or factual issues without the attorney's consent.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['INVESTIGATION', 'SETTLEMENT', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_defense_counsel',
    abbreviation: 'Defense Counsel',
    fullName: 'Defense Counsel',
    definition:
      "An attorney retained by the insurer or TPA to represent the employer/carrier at the WCAB. Defense counsel handles legal proceedings, advises the examiner on legal strategy, prepares for hearings and trials, and negotiates settlements in complex cases. The examiner handles the day-to-day claims management; defense counsel handles the legal work. On claims involving legal disputes, coverage questions, or litigation, the examiner and defense counsel work together.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['SETTLEMENT', 'INVESTIGATION', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'legal_rogs',
    abbreviation: 'ROGS',
    fullName: 'Interrogatories (Requests for Discovery)',
    definition:
      "Written questions or requests for documents that one party sends to the other as part of the WCAB discovery process. In WC litigation, ROGS (interrogatories) are used to gather information about the injured worker's employment history, prior injuries, medical treatment, and other relevant facts. The examiner provides information to defense counsel to respond to discovery requests. Failing to respond timely to discovery can result in evidentiary sanctions.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['INVESTIGATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'legal_presumption_5402',
    abbreviation: 'LC 5402 Presumption',
    fullName: 'LC 5402(b) Compensability Presumption',
    definition:
      "Under Labor Code 5402(b), if the claims administrator does not deny a workers' compensation claim within 90 days of the employer's knowledge of the injury, the injury is presumed to be compensable (work-related). Once this presumption attaches, the burden of proof shifts — the carrier must prove the claim is NOT compensable rather than the worker proving it IS. This presumption is very difficult to overcome and is one of the most critical deadlines in California WC claims handling.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['DEADLINE_TRACKING', 'COVERAGE_DETERMINATION', 'CLAIM_INTAKE'],
  },
  {
    id: 'legal_eor',
    abbreviation: 'EOR',
    fullName: 'Explanation of Review',
    definition:
      "A written document the claims examiner sends to a medical provider explaining how a bill was processed, what amount was paid, and why any portion was reduced or denied. Under 8 CCR 9792.5.5, an EOR must accompany every payment or denial of a medical bill and must explain the reason for any adjustment. Proper EORs are required for compliance and help medical providers understand billing decisions.",
    category: 'LEGAL_PROCESS',
    featureContexts: ['MEDICAL_REVIEW', 'DOCUMENT_REVIEW'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REGULATORY_BODIES (~10 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'body_dwc',
    abbreviation: 'DWC',
    fullName: 'Division of Workers\' Compensation',
    definition:
      "The California state agency within the Department of Industrial Relations (DIR) that administers the workers' compensation system. The DWC sets regulations (8 CCR), certifies QMEs, maintains the EAMS case management system, operates WCAB district offices across the state, and audits claims handlers for regulatory compliance. The DWC's Administrative Director issues regulations and orders affecting claims handling.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE', 'DEADLINE_TRACKING', 'MEDICAL_REVIEW'],
  },
  {
    id: 'body_dir',
    abbreviation: 'DIR',
    fullName: 'Department of Industrial Relations',
    definition:
      "The California state department that oversees workplace safety, labor standards, and workers' compensation. The DWC, Cal/OSHA, and the Labor Commissioner's Office are all divisions of the DIR. For claims examiners, the DIR is most relevant as the parent agency of the DWC — regulatory authority and audit oversight flow from the DIR.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'body_wcab',
    abbreviation: 'WCAB',
    fullName: 'Workers\' Compensation Appeals Board',
    definition:
      "The quasi-judicial body that adjudicates disputed workers' compensation claims in California. The WCAB operates through district offices statewide, where Workers' Compensation Judges (WCJs) preside over hearings, trials, and settlement approvals. The seven commissioners of the WCAB hear appeals from WCJ decisions (called \"reconsideration\"). The WCAB is the forum where most disputed WC issues are resolved.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['SETTLEMENT', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'body_doi',
    abbreviation: 'DOI',
    fullName: 'California Department of Insurance',
    definition:
      "The California state agency that regulates the insurance industry, including workers' compensation insurers. The DOI enforces the California Insurance Code (including the Unfair Claims Settlement Practices Act at Ins. Code § 790.03) through market conduct examinations — audits of claim files for regulatory compliance. DOI findings can result in administrative penalties and corrective action plans.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['INVESTIGATION', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'body_wcirb',
    abbreviation: 'WCIRB',
    fullName: 'Workers\' Compensation Insurance Rating Bureau',
    definition:
      "A California nonprofit organization that collects and analyzes workers' compensation claims data and recommends pure premium rates to the Insurance Commissioner. The WCIRB also maintains the experience rating system used to calculate employer experience modification factors (\"X-Mods\"). Accurate and timely claim reporting to the WCIRB is required under 10 CCR 2509.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'body_eams',
    abbreviation: 'EAMS',
    fullName: 'Electronic Adjudication Management System',
    definition:
      "The DWC's electronic case management system used to file documents, track WCAB proceedings, and manage WC litigation in California. Claims examiners and their defense counsel use EAMS to file documents at the WCAB, check case status, and manage hearing dates. All WCAB filings must go through EAMS in jurisdictions where it is available.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['DOCUMENT_REVIEW', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'body_chswc',
    abbreviation: 'CHSWC',
    fullName: 'Commission on Health and Safety and Workers\' Compensation',
    definition:
      "A California state commission that studies the workers' compensation system and makes recommendations for reform to the Governor and Legislature. CHSWC publishes research reports on WC costs, outcomes, and trends. While not a regulatory or enforcement body, CHSWC's findings often inform legislative changes to the WC system that affect claims handling.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'body_cdi',
    abbreviation: 'CDI',
    fullName: 'California Department of Insurance (Fraud Division)',
    definition:
      "The fraud investigation and enforcement arm of the California DOI. The CDI Fraud Division investigates workers' compensation insurance fraud — both claimant fraud (false claims) and employer fraud (premium evasion, misclassification). Under Ins. Code 1877.4, carriers are required to report suspected fraud to the CDI. The SIU works with the CDI on criminal fraud referrals.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['INVESTIGATION'],
  },
  {
    id: 'body_scif',
    abbreviation: 'SCIF',
    fullName: 'State Compensation Insurance Fund',
    definition:
      "A California public enterprise fund that serves as the insurer of last resort for employers who cannot obtain workers' compensation insurance in the private market. SCIF is the largest writer of workers' compensation insurance in California. It operates similarly to a private insurer but is a state entity. Examiners at SCIF operate under the same regulatory requirements as private carrier examiners.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'body_tpa',
    abbreviation: 'TPA',
    fullName: 'Third-Party Administrator',
    definition:
      "A company hired by self-insured employers to administer workers' compensation claims on their behalf. Self-insured employers (large companies that retain their own WC risk rather than buying insurance) are required to have a licensed TPA manage their claims under 8 CCR 15300. TPA claims examiners have the same regulatory obligations as carrier examiners.",
    category: 'REGULATORY_BODIES',
    featureContexts: ['CLAIM_INTAKE'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CLAIM_LIFECYCLE (~15 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'lifecycle_three_point_contact',
    abbreviation: '3-Point Contact',
    fullName: 'Three-Point Contact',
    definition:
      "An early investigation requirement in which the claims examiner contacts the three key parties in a new claim: (1) the injured worker, (2) the employer, and (3) the treating physician. The purpose is to gather the basic facts of the claim — how the injury occurred, the worker's employment status, the medical diagnosis — before making any coverage determination. Many carriers require three-point contact within 3 business days of claim receipt.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['INVESTIGATION', 'CLAIM_INTAKE'],
  },
  {
    id: 'lifecycle_compensability',
    abbreviation: 'Compensability',
    fullName: 'Compensability / Compensable Claim',
    definition:
      "Whether a workers' compensation claim meets the legal requirements to be covered — specifically, whether the injury arose out of and in the course of employment (AOE/COE). A \"compensable\" claim is one the carrier accepts as work-related and agrees to pay benefits on. A determination of compensability is the first major decision point in every claim and must be made based on a reasonable investigation, not assumption.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['COVERAGE_DETERMINATION', 'CLAIM_INTAKE', 'INVESTIGATION'],
  },
  {
    id: 'lifecycle_reserves',
    abbreviation: 'Reserves',
    fullName: 'Claim Reserves',
    definition:
      "The dollar amount set aside by the insurer to cover anticipated future payments on a claim — including TD, PD, medical treatment, and legal costs. Adequate reserving is required under insurance regulations and actuarial standards. Under-reserving (setting reserves too low) can distort the carrier's financial picture; over-reserving inflates costs. Reserves are updated as new information is received (medical reports, MMI, legal proceedings).",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['CLAIM_INTAKE', 'BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'lifecycle_froi',
    abbreviation: 'FROI',
    fullName: 'First Report of Injury',
    definition:
      "A report filed by the employer with the insurer (and in some cases with the state) documenting the initial facts of a work injury. The FROI triggers the claims handling process and starts regulatory deadlines (including the 90-day LC 5402(b) presumption period). Employers are required to file the FROI within a specified timeframe after learning of the injury. The FROI is the examiner's first information about the claim.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['CLAIM_INTAKE', 'INVESTIGATION'],
  },
  {
    id: 'lifecycle_notice_of_delay',
    abbreviation: 'Notice of Delay',
    fullName: 'Notice of Delay (Delay Letter)',
    definition:
      "A written notice sent to the injured worker when the claims examiner cannot complete the coverage investigation within the required timeframe. Under 10 CCR 2695.7(c), if a determination cannot be made within 40 days of receiving the proof of claim, the examiner must send a written notice every 30 days explaining what information is needed and why the determination is pending. Failure to send required delay notices is a separate regulatory violation.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['COVERAGE_DETERMINATION', 'DEADLINE_TRACKING'],
  },
  {
    id: 'lifecycle_denial',
    abbreviation: 'Denial Letter',
    fullName: 'Claim Denial / Notice of Denial',
    definition:
      "A written notice sent to the injured worker when the insurer determines the claim is not compensable or a specific benefit is not owed. Under 10 CCR 2695.7(b)(1), the denial letter must explain the factual and legal basis for the denial in plain language. The injured worker has the right to file an Application for Adjudication at the WCAB to contest a denial. A denial must always be based on a completed investigation.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['COVERAGE_DETERMINATION', 'INVESTIGATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'lifecycle_open_claim',
    abbreviation: 'Open Claim',
    fullName: 'Open Claim',
    definition:
      "A workers' compensation claim in which the insurer's liability is ongoing — benefits are still being paid, medical treatment is ongoing, or the case has not been formally resolved by settlement or WCAB order. Most examiners carry 125–175 open claims at any given time. An open claim requires active management: tracking deadlines, authorizing treatment, paying benefits on time, and moving toward resolution.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['CLAIM_INTAKE', 'BENEFIT_CALCULATION'],
  },
  {
    id: 'lifecycle_closed_claim',
    abbreviation: 'Closed Claim',
    fullName: 'Closed Claim',
    definition:
      "A workers' compensation claim that has been fully resolved — either through a C&R, a Stipulated Award where the medical has ended, or a WCAB order. Once a claim is closed, no further benefits are owed (for a C&R) or defined obligations remain (for a Stipulated Award). Proper claim closure requires confirmation that all required notices were sent, all liens resolved, and all documentation filed.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['SETTLEMENT'],
  },
  {
    id: 'lifecycle_subrogation_referral',
    abbreviation: 'Subrogation Referral',
    fullName: 'Subrogation Identification and Referral',
    definition:
      "The process of identifying and referring claims with third-party liability potential to the carrier's subrogation unit. Early identification of subrogation — at claim intake — is critical because statutes of limitations for third-party actions are typically 2–3 years. Examiners should look for indicators such as motor vehicle accidents, defective products, or third-party premises liability at the time of initial investigation.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['INVESTIGATION', 'CLAIM_INTAKE'],
  },
  {
    id: 'lifecycle_diary',
    abbreviation: 'Diary',
    fullName: 'Claim Diary / Diary Date',
    definition:
      "A future date set by the examiner as a reminder to follow up on a specific action or deadline on a claim. Effective claims management requires setting diary dates for: expected medical reports, upcoming UR deadlines, TD payment due dates, approaching 5402(b) windows, scheduled hearings, and any other pending action. Missing diary dates is one of the most common causes of regulatory violations.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['DEADLINE_TRACKING', 'CLAIM_INTAKE'],
  },
  {
    id: 'lifecycle_experience_mod',
    abbreviation: 'X-Mod',
    fullName: 'Experience Modification Factor',
    definition:
      "A multiplier applied to an employer's workers' compensation insurance premium based on their actual claims history compared to the expected claims for their industry. A high X-Mod (above 1.0) indicates more claims or higher claim costs than average, resulting in a higher premium. A low X-Mod (below 1.0) rewards employers with good safety records. Timely, accurate claims reporting to the WCIRB affects employer X-Mods.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'lifecycle_rtw',
    abbreviation: 'RTW',
    fullName: 'Return to Work',
    definition:
      "The process of transitioning an injured worker back to employment — either to their pre-injury job, a modified-duty position, or an alternative position — as quickly as medically feasible. Early, safe return to work reduces TD costs and promotes worker recovery. Under LC 3209.3, employers with 50 or more employees who offer modified or alternative work meeting specific criteria can avoid SJDB voucher liability.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW'],
  },
  {
    id: 'lifecycle_modified_duty',
    abbreviation: 'Modified Duty',
    fullName: 'Modified Duty / Light Duty',
    definition:
      "Temporary job accommodations that allow an injured worker to return to work while still recovering, within the restrictions set by their treating physician. Modified duty might involve reduced hours, lighter tasks, a different position, or other accommodations. Offering appropriate modified duty stops TD payments and can prevent SJDB voucher liability. The offer must be bona fide — consistent with the medical restrictions and actually available.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW'],
  },
  {
    id: 'lifecycle_caseload',
    abbreviation: 'Caseload',
    fullName: 'Claims Examiner Caseload',
    definition:
      "The total number of open claims assigned to a single claims examiner at any given time. Industry standards typically place examiners at 125–175 open claims. An appropriate caseload allows the examiner to meet all regulatory deadlines, conduct thorough investigations, and actively manage each claim. Excessive caseloads are a common root cause of missed deadlines and regulatory violations.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['CLAIM_INTAKE'],
  },
  {
    id: 'lifecycle_reopen',
    abbreviation: 'Petition to Reopen',
    fullName: 'Petition to Reopen (New and Further Disability)',
    definition:
      "A request filed at the WCAB by the injured worker to reopen a previously settled or adjudicated claim because their condition has worsened. Under LC 5410, a petition to reopen for new and further disability must be filed within 5 years of the date of injury. If granted, the carrier may owe additional medical treatment or indemnity benefits beyond the original settlement or award.",
    category: 'CLAIM_LIFECYCLE',
    featureContexts: ['SETTLEMENT', 'CLAIM_INTAKE'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENTS_FORMS (~10 terms)
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'doc_dwc1',
    abbreviation: 'DWC-1',
    fullName: 'DWC-1 Claim Form',
    definition:
      "The official California workers' compensation claim form that an injured worker completes to formally report a work injury and claim benefits. Under LC 5401, the employer must provide the DWC-1 to the injured worker within one working day of learning of the injury. The worker completes Part A (worker's section); the employer completes Part B (employer's section) and forwards both to the insurer. Receipt of the completed DWC-1 starts regulatory deadlines, including the 90-day presumption clock under LC 5402(b).",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['CLAIM_INTAKE', 'COVERAGE_DETERMINATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'doc_notice_of_benefits',
    abbreviation: 'Notice of Benefits',
    fullName: 'Notice of Benefits (DWC Notice)',
    definition:
      "A written notice the claims examiner sends to the injured worker when benefits are accepted and payments begin. Under 8 CCR 9812 and 10 CCR 2695.7, the examiner must notify the worker of the benefits they are receiving, the payment amount, and the duration. Benefit notices must be clear, accurate, and sent promptly. Inaccurate benefit notices can create Ins. Code 790.03(h)(8) issues if the stated benefit differs from what is actually paid.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['BENEFIT_CALCULATION', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'doc_notice_of_assessment',
    abbreviation: 'Notice of Assessment',
    fullName: 'Notice of Assessment',
    definition:
      "An official notice from the DWC or DOI informing the insurer or TPA that an administrative penalty has been assessed for a regulatory violation found during an audit. The Notice of Assessment specifies the statutory basis for each violation, the number of files cited, and the total penalty amount. The carrier has the right to contest the assessment through an administrative appeal process.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['INVESTIGATION', 'DEADLINE_TRACKING'],
  },
  {
    id: 'doc_application_adjudication',
    abbreviation: 'App / Application',
    fullName: 'Application for Adjudication of Claim',
    definition:
      "The formal document filed by the injured worker (or their attorney) with the WCAB to initiate the dispute resolution process. Filing an Application gives the WCAB jurisdiction over the claim and is required before any hearing or trial can be held. The Application identifies the parties, the date of injury, the body parts claimed, and the benefits sought. Receipt of an Application is a key trigger to assign defense counsel.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['DOCUMENT_REVIEW', 'COVERAGE_DETERMINATION'],
  },
  {
    id: 'doc_med_legal_report',
    abbreviation: 'Med-Legal Report',
    fullName: 'Medical-Legal Evaluation Report',
    definition:
      "A formal medical report prepared by a QME or AME for the purpose of resolving disputed medical issues in a WC claim. Unlike a treating physician's report (PR-2, PR-4), a medical-legal report is prepared specifically for legal purposes — to address causation, disability rating, apportionment, and work restrictions. Under 8 CCR 9793, med-legal reports must address specific required elements and use the AMA Guides for WPI ratings.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['MEDICAL_REVIEW', 'DOCUMENT_REVIEW', 'SETTLEMENT'],
  },
  {
    id: 'doc_work_status_report',
    abbreviation: 'Work Status Report',
    fullName: 'Work Status Report / Work Capacity Form',
    definition:
      "A document from the treating physician that describes the injured worker's ability to work — whether they are off work, on modified/light duty, or cleared for full duty. Work status reports from the PTP (often documented on PR-2 forms) drive TD benefit decisions. When a work status report clears the worker for full duty, TD benefits stop. When it restricts work, modified duty opportunities must be evaluated.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['BENEFIT_CALCULATION', 'MEDICAL_REVIEW', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'doc_omfs_bill',
    abbreviation: 'Medical Bill',
    fullName: 'Medical Provider Bill (OMFS-Regulated)',
    definition:
      "An invoice from a medical provider for treatment services rendered to an injured worker. Under LC 5307.1, all medical bills in the WC system are subject to the OMFS fee schedule — providers cannot charge more than the scheduled rate. The examiner (or a bill review vendor) reviews each bill against the OMFS, pays the allowed amount, and sends an Explanation of Review (EOR) to the provider explaining any adjustments.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['MEDICAL_REVIEW', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'doc_sjdb_voucher',
    abbreviation: 'SJDB Voucher',
    fullName: 'Supplemental Job Displacement Benefit Voucher',
    definition:
      "The formal voucher document issued to an eligible injured worker, providing $6,000 to use for retraining or skill enhancement at state-approved schools. The voucher is non-transferable and expires 2 years after it is issued or 5 years after the date of injury, whichever is later. Under LC 4658.7, the voucher must be issued within 60 days of the PD payment becoming due when the worker is not returning to their pre-injury employer.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['BENEFIT_CALCULATION', 'SETTLEMENT'],
  },
  {
    id: 'doc_wage_verification_form',
    abbreviation: 'Wage Form',
    fullName: 'Wage Verification Form',
    definition:
      "A form sent to the employer to document the injured worker's earnings for the period used to calculate the Average Weekly Earnings (AWE). Wage verification forms request gross weekly wages, hours worked, and any additional compensation (overtime, bonuses, per diem) for the year prior to injury. Accurate completion of the wage form is essential to calculating correct TD and PD benefit rates.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['BENEFIT_CALCULATION', 'CLAIM_INTAKE', 'DOCUMENT_REVIEW'],
  },
  {
    id: 'doc_sf_10',
    abbreviation: 'SF-10 / Compromise Form',
    fullName: 'Compromise and Release Agreement Form',
    definition:
      "The standard WCAB form used to document a Compromise and Release (C&R) settlement agreement. The SF-10 (or the current WCAB version of this form) captures the settlement terms, including the lump-sum amount, the body parts covered, and the releases being given. It must be signed by the injured worker, their attorney (if represented), and the claims examiner or defense counsel, then submitted to the WCAB for judicial approval under LC 5001.",
    category: 'DOCUMENTS_FORMS',
    featureContexts: ['SETTLEMENT', 'DOCUMENT_REVIEW'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup structures
// ─────────────────────────────────────────────────────────────────────────────

/** O(1) lookup by term ID */
export const TIER1_TERMS_BY_ID = new Map<string, Tier1Term>(
  TIER1_TERMS.map((t) => [t.id, t]),
);

/** Terms grouped by category */
export const TIER1_TERMS_BY_CATEGORY: Record<Tier1Category, Tier1Term[]> =
  TIER1_TERMS.reduce(
    (acc, term) => {
      const existing: Tier1Term[] | undefined = acc[term.category] as Tier1Term[] | undefined;
      if (!existing) {
        acc[term.category] = [];
      }
      acc[term.category].push(term);
      return acc;
    },
    {} as Record<Tier1Category, Tier1Term[]>,
  );

/** Terms applicable to a specific feature context */
export function getTermsForContext(context: FeatureContext): Tier1Term[] {
  return TIER1_TERMS.filter((t) => t.featureContexts.includes(context));
}
