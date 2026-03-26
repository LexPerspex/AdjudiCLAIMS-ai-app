/**
 * Letter templates for claims correspondence.
 *
 * All templates are GREEN zone — factual content only. No legal reasoning,
 * no recommendations, no conclusions. Every template cites its statutory
 * authority and uses {{token}} placeholders for claim-specific data.
 *
 * UPL Note: These templates populate factual claim data into structured
 * correspondence. They do not advise on coverage, liability, or settlement.
 *
 * Statutory sources:
 *   - LC 4650: TD payment timing (14-day cycle, first payment within 14 days)
 *   - LC 4652: 3-day waiting period
 *   - LC 4653: TD rate formula (2/3 AWE, statutory min/max)
 *   - LC 4654: Maximum TD duration
 *   - LC 3761: Employer notification within 15 days of claim receipt
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A letter template definition.
 *
 * Templates use a simple {{token}} replacement engine. Tokens are populated
 * from claim data (claimNumber, claimantName, dateOfInjury, etc.) and optional
 * overrides (tdRate, awe, etc.). Missing tokens are replaced with 'N/A' to
 * ensure no raw placeholders appear in the final output.
 *
 * Each template cites its statutory authority and includes a disclaimer noting
 * the letter is factual content only (not legal advice). This is essential
 * because some letters are sent directly to claimants.
 */
export interface LetterTemplate {
  /** Unique template identifier (e.g., 'td-benefit-explanation'). */
  id: string;
  /** Prisma LetterType enum value for database storage. */
  letterType: string; // matches LetterType enum in Prisma schema
  /** Human-readable template title. */
  title: string;
  /** Description of what this letter communicates and when to use it. */
  description: string;
  /** List of claim data fields needed to populate this template. */
  requiredFields: string[]; // What claim data is needed
  /** Markdown template body with {{token}} placeholders. */
  template: string; // Markdown with {{token}} placeholders
  /** Statutory citations that authorize this letter type. */
  statutoryAuthority: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TD_BENEFIT_EXPLANATION: LetterTemplate = {
  id: 'td-benefit-explanation',
  letterType: 'TD_BENEFIT_EXPLANATION',
  title: 'TD Benefit Explanation Letter',
  description:
    'Explains the Temporary Disability benefit rate calculation to the claimant, ' +
    'including Average Weekly Earnings, the statutory formula, applicable minimum ' +
    'and maximum rates, and payment frequency.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'tdRate',
    'awe',
    'statutoryMin',
    'statutoryMax',
    'injuryYear',
  ],
  statutoryAuthority: 'LC 4650, LC 4653, LC 4654',
  template: `# Temporary Disability Benefit Explanation

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Claimant:** {{claimantName}}
**Employer:** {{claimantName}} — {{employer}}
**Insurer:** {{insurer}}
**Date of Injury:** {{dateOfInjury}}

---

## TD Benefit Rate Calculation

Your Temporary Disability (TD) benefit rate has been calculated based on the statutory formula set forth in California Labor Code Section 4653.

**Average Weekly Earnings (AWE):** \${{awe}}

Per LC 4653, the TD rate is two-thirds (2/3) of the Average Weekly Earnings, subject to the statutory minimum and maximum for the injury year.

**Calculated TD Rate:** \${{tdRate}} per week

**Injury Year:** {{injuryYear}}
**Statutory Minimum ({{injuryYear}}):** \${{statutoryMin}} per week
**Statutory Maximum ({{injuryYear}}):** \${{statutoryMax}} per week

## Payment Frequency

Per LC 4650, TD benefit payments are made every 14 days (biweekly). The first payment is due within 14 calendar days of the employer's knowledge of the injury and disability.

## TD Duration

Per LC 4654, TD benefits are payable for up to 104 compensable weeks within a period of five years from the date of injury, unless otherwise specified by statute.

---

*This letter explains the arithmetic calculation of your TD benefit rate based on the data in the claim file. It does not constitute legal advice. If you have questions about your claim, you may consult with an attorney of your choice.*

**{{insurer}}**
{{examinerName}}
Claims Examiner`,
};

const TD_PAYMENT_SCHEDULE: LetterTemplate = {
  id: 'td-payment-schedule',
  letterType: 'TD_PAYMENT_SCHEDULE',
  title: 'TD Payment Schedule Letter',
  description:
    'Provides biweekly payment dates and amounts for a specific TD benefit period. ' +
    'Lists each payment due date and amount based on the calculated TD rate.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'tdRate',
    'paymentStartDate',
    'paymentEndDate',
  ],
  statutoryAuthority: 'LC 4650',
  template: `# TD Payment Schedule

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Claimant:** {{claimantName}}
**Insurer:** {{insurer}}
**Date of Injury:** {{dateOfInjury}}

---

## Payment Details

**TD Weekly Rate:** \${{tdRate}}
**Biweekly Payment Amount:** Two times the weekly rate, per the 14-day cycle under LC 4650.
**Payment Period:** {{paymentStartDate}} through {{paymentEndDate}}

## Payment Schedule

Per LC 4650, TD benefit payments are due every 14 calendar days. The first payment is due within 14 days of the employer's knowledge of injury and disability.

Payments for the period {{paymentStartDate}} through {{paymentEndDate}} will be issued on a biweekly (every 14 days) basis at the rate of \${{tdRate}} per week.

## Late Payment Penalty

Per LC 4650(c), if any TD payment is not made within 14 days of the due date, a self-imposed 10% increase shall be paid with the late payment.

---

*This schedule reflects the payment dates and amounts calculated from the claim file data. It does not constitute legal advice.*

**{{insurer}}**
{{examinerName}}
Claims Examiner`,
};

const WAITING_PERIOD_NOTICE: LetterTemplate = {
  id: 'waiting-period-notice',
  letterType: 'WAITING_PERIOD_NOTICE',
  title: 'Waiting Period Notice',
  description:
    'Explains the 3-day waiting period per LC 4652, when it applies, and when ' +
    'the waiting period is retroactively compensable.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
  ],
  statutoryAuthority: 'LC 4652',
  template: `# Waiting Period Notice

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Claimant:** {{claimantName}}
**Employer:** {{employer}}
**Insurer:** {{insurer}}
**Date of Injury:** {{dateOfInjury}}

---

## 3-Day Waiting Period — LC 4652

Per California Labor Code Section 4652, no TD benefits are payable for the first three days of disability unless one of the following conditions is met:

1. **The injured worker is hospitalized as an inpatient** — If the employee is admitted to a hospital as an inpatient, the waiting period does not apply and TD benefits begin from the first day of disability.

2. **The disability exceeds 14 days** — If the period of disability extends beyond 14 calendar days, TD benefits become payable retroactively from the first day of disability, including the initial 3-day waiting period.

## What This Means

- If your disability lasts **3 days or fewer**, no TD benefits are payable under LC 4652.
- If your disability lasts **4 to 14 days**, TD benefits begin on the 4th day of disability.
- If your disability exceeds **14 days**, TD benefits are paid retroactively from day 1.
- If you were **hospitalized as an inpatient**, TD benefits begin from day 1 regardless of total disability duration.

## Body Parts on Claim

{{bodyParts}}

---

*This notice explains the statutory waiting period provisions. It does not constitute legal advice. If you have questions about your claim, you may consult with an attorney of your choice.*

**{{insurer}}**
{{examinerName}}
Claims Examiner`,
};

const EMPLOYER_NOTIFICATION_LC3761: LetterTemplate = {
  id: 'employer-notification-lc3761',
  letterType: 'EMPLOYER_NOTIFICATION_LC3761',
  title: 'Employer Notification — LC 3761',
  description:
    'Standard employer notification within 15 days of claim receipt per LC 3761. ' +
    'Includes claim number, claimant name, date of injury, and employer obligations.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'dateReceived',
    'bodyParts',
  ],
  statutoryAuthority: 'LC 3761',
  template: `# Employer Notification of Workers' Compensation Claim

**Date:** {{currentDate}}
**To:** {{employer}}
**From:** {{insurer}}
**Re:** Workers' Compensation Claim — {{claimantName}}

---

## Notice of Claim Filed

Per California Labor Code Section 3761, this letter serves as notification that the following workers' compensation claim has been filed:

**Claim Number:** {{claimNumber}}
**Claimant:** {{claimantName}}
**Date of Injury:** {{dateOfInjury}}
**Body Parts Claimed:** {{bodyParts}}
**Date Claim Received:** {{dateReceived}}

## Employer Obligations

Per LC 3761 and applicable regulations, the employer is reminded of the following obligations:

1. **No Discrimination** — Per LC 132a, it is unlawful to discriminate against an employee for filing a workers' compensation claim.
2. **Post Notice** — Per LC 3550, employers must post notice of workers' compensation coverage in a conspicuous location.
3. **Provide Claim Form** — Per LC 5401, the employer must provide a claim form (DWC-1) to the employee within one working day of knowledge of injury.
4. **Cooperate with Investigation** — The employer should provide requested employment and wage records to facilitate claims investigation.

## Contact Information

For questions regarding this claim, contact:

**{{insurer}}**
{{examinerName}}
Claims Examiner

---

*This notification is issued pursuant to LC 3761. It provides factual information about the claim filing and summarizes statutory employer obligations. It does not constitute legal advice.*`,
};

const BENEFIT_ADJUSTMENT_NOTICE: LetterTemplate = {
  id: 'benefit-adjustment-notice',
  letterType: 'BENEFIT_ADJUSTMENT_NOTICE',
  title: 'Benefit Adjustment Notice',
  description:
    'Notification of TD rate change due to updated Average Weekly Earnings or ' +
    'statutory maximum change. Shows prior rate, new rate, and effective date.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'tdRate',
    'awe',
    'statutoryMin',
    'statutoryMax',
    'injuryYear',
  ],
  statutoryAuthority: 'LC 4653',
  template: `# Benefit Adjustment Notice

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Claimant:** {{claimantName}}
**Insurer:** {{insurer}}
**Date of Injury:** {{dateOfInjury}}

---

## Notice of TD Rate Adjustment

This letter notifies you that your Temporary Disability (TD) benefit rate has been adjusted based on updated information in the claim file.

## Updated Calculation

Per LC 4653, the TD rate is two-thirds (2/3) of Average Weekly Earnings (AWE), subject to the statutory minimum and maximum for the injury year.

**Updated Average Weekly Earnings (AWE):** \${{awe}}
**Updated TD Rate:** \${{tdRate}} per week

**Injury Year:** {{injuryYear}}
**Statutory Minimum ({{injuryYear}}):** \${{statutoryMin}} per week
**Statutory Maximum ({{injuryYear}}):** \${{statutoryMax}} per week

## Reason for Adjustment

The TD rate has been recalculated based on updated wage information or a change in the applicable statutory rate limits. The updated rate shown above will apply to all future TD payments from the effective date of this notice.

## Payment Impact

Future biweekly payments will reflect the updated weekly rate of \${{tdRate}}. Per LC 4650, payments continue on the established 14-day cycle.

---

*This notice provides the updated benefit calculation based on claim file data. It does not constitute legal advice. If you have questions about your claim, you may consult with an attorney of your choice.*

**{{insurer}}**
{{examinerName}}
Claims Examiner`,
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LETTER_TEMPLATES: LetterTemplate[] = [
  TD_BENEFIT_EXPLANATION,
  TD_PAYMENT_SCHEDULE,
  WAITING_PERIOD_NOTICE,
  EMPLOYER_NOTIFICATION_LC3761,
  BENEFIT_ADJUSTMENT_NOTICE,
];
