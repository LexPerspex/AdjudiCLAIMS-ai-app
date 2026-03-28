/**
 * Document generation service — template-based document generator.
 *
 * Produces letters and notices from claim data using {{field}} placeholder
 * templates. All generated documents are GREEN zone — factual content only,
 * populated from claim data with statutory citations.
 *
 * UPL Note: Generated documents contain factual information and regulatory
 * citations only. They do not contain legal analysis, legal conclusions,
 * or legal advice. Templates that reference legal matters (e.g., counsel
 * referral summary) contain factual summaries for attorney review only.
 *
 * Statutory authorities per template:
 *   - LC 3761: Employer notification within 15 days
 *   - LC 4650, LC 4653: TD benefit rate and payment timing
 *   - 10 CCR 2695.7(c): Delay notification requirements
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A document generation template definition.
 *
 * Templates use {{field}} placeholders populated from claim data, extracted
 * fields, and graph nodes. Missing fields are tracked in the result so the
 * examiner knows what data is still needed.
 */
export interface GenerationTemplate {
  /** Unique template identifier. */
  id: string;
  /** Human-readable template title. */
  title: string;
  /** Description of what this document communicates and when to use it. */
  description: string;
  /** List of claim data fields required to fully populate this template. */
  requiredFields: string[];
  /** Markdown template body with {{field}} placeholders. */
  template: string;
  /** Statutory citations that authorize this document type. */
  statutoryAuthority: string;
}

/**
 * Result of generating a document from a template.
 *
 * Contains the fully populated content and a list of any fields that were
 * missing from the claim data. Missing fields are replaced with
 * "[MISSING: fieldName]" in the content to make gaps visible.
 */
export interface GeneratedDocumentResult {
  /** The template that was used. */
  templateId: string;
  /** Human-readable document title. */
  title: string;
  /** Fully populated document content (Markdown). */
  content: string;
  /** Fields that were required but not found in claim data. */
  missingFields: string[];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const EMPLOYER_NOTIFICATION_LC3761: GenerationTemplate = {
  id: 'employer_notification_lc3761',
  title: 'Employer Notification of Claim (LC 3761)',
  description:
    'Written notification to the employer of record that a workers\' compensation ' +
    'claim has been received. Required within 15 days of claim receipt for ' +
    'indemnity claims per LC 3761.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'dateReceived',
    'bodyParts',
    'examinerName',
  ],
  statutoryAuthority: 'LC 3761; 10 CCR 2695.5(b)',
  template: `# Employer Notification of Workers' Compensation Claim

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{employer}}
**From:** {{insurer}}

## Notice of Claim Filed

This letter is to notify you that a workers' compensation claim has been filed by **{{claimantName}}** for an injury reported on **{{dateOfInjury}}**.

**Date Claim Received:** {{dateReceived}}
**Reported Body Parts:** {{bodyParts}}
**Assigned Examiner:** {{examinerName}}

## Required Information

To process this claim, we require the following from you within 10 business days:

1. **Wage Records** — Complete wage history for the 52 weeks prior to the date of injury, including overtime, bonuses, and any concurrent employment known to you.
2. **Job Description** — The employee's actual physical job duties (not just the job title).
3. **Supervisor's Incident Report** — Date and time of the reported injury, witnesses, and the supervisor's account of how the injury occurred.
4. **Date of Knowledge** — The date your organization first became aware that the employee was injured at work.
5. **Modified Duty Availability** — Whether you can offer modified or light-duty work within any medical restrictions.

## Statutory Authority

This notification is provided pursuant to **California Labor Code Section 3761**, which requires the insurer to notify the employer within 15 days of each claim for indemnity benefits. Your cooperation is required under **10 CCR 2695.5(b)**.

## Contact Information

**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual notification. It does not constitute legal advice or a coverage determination.*`,
};

const TD_BENEFIT_EXPLANATION: GenerationTemplate = {
  id: 'td_benefit_explanation',
  title: 'TD Benefit Rate Explanation Letter',
  description:
    'Explains the Temporary Disability benefit rate calculation to the claimant, ' +
    'including Average Weekly Earnings, the statutory formula, and payment frequency.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'awe',
    'tdRate',
    'statutoryMin',
    'statutoryMax',
    'examinerName',
  ],
  statutoryAuthority: 'LC 4650, LC 4653, LC 4654',
  template: `# Temporary Disability Benefit Explanation

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{claimantName}}
**From:** {{insurer}}

## Your Temporary Disability Benefit Rate

This letter explains how your Temporary Disability (TD) benefit rate was calculated for your workers' compensation claim with **{{employer}}** for an injury on **{{dateOfInjury}}**.

## Calculation

| Component | Amount |
|-----------|--------|
| Average Weekly Earnings (AWE) | {{awe}} |
| TD Rate (2/3 of AWE) | {{tdRate}} |
| Statutory Minimum | {{statutoryMin}} |
| Statutory Maximum | {{statutoryMax}} |

Your TD benefit rate is **{{tdRate}}** per week, calculated as two-thirds (2/3) of your Average Weekly Earnings per **LC 4653**.

## Payment Schedule

- TD payments are made **every two weeks** per **LC 4650(b)**.
- The first payment was due within **14 calendar days** of your employer's knowledge of the injury and wage loss.
- Payments continue until you return to work, reach Maximum Medical Improvement (MMI), or reach the **104-week statutory cap** per **LC 4656**.

## Three-Day Waiting Period

Per **LC 4652**, the first three calendar days of disability are a waiting period and are not compensable unless disability extends beyond 14 days, in which case the waiting period is retroactively compensated.

## Contact

If you have questions about your benefit rate, contact:
**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual explanation of statutory benefit calculations. It does not constitute legal advice.*`,
};

const DELAY_NOTICE: GenerationTemplate = {
  id: 'delay_notice',
  title: 'Delay in Accepting/Denying Claim Notice',
  description:
    'Written notice to the claimant that the coverage determination is being ' +
    'delayed beyond 40 days. Required every 30 days per 10 CCR 2695.7(c).',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'dateReceived',
    'delayReason',
    'outstandingItems',
    'expectedResolutionDate',
    'examinerName',
  ],
  statutoryAuthority: '10 CCR 2695.7(c); LC 5402(b)',
  template: `# Notice of Delay in Coverage Determination

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{claimantName}}
**From:** {{insurer}}

## Notice

This letter is to inform you that a determination on your workers' compensation claim (injury date: **{{dateOfInjury}}**, received: **{{dateReceived}}**) has been delayed beyond the initial 40-day investigation period.

## Reason for Delay

{{delayReason}}

## Outstanding Items

The following information is still being obtained:

{{outstandingItems}}

## Expected Resolution

We anticipate completing the investigation and issuing a determination by **{{expectedResolutionDate}}**.

## Your Rights

- You may be entitled to Temporary Disability benefits during the investigation period if you are losing wages due to the injury.
- You have the right to dispute any delay or decision at the Workers' Compensation Appeals Board (WCAB).
- You may consult with an attorney of your choice at any time.

## Statutory Authority

This notice is provided pursuant to **10 CCR 2695.7(c)**, which requires written notification every 30 days when a coverage determination is delayed. The 90-day presumption under **LC 5402(b)** continues to run regardless of this delay.

## Contact

**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual notification of claim status. It does not constitute legal advice.*`,
};

const BENEFIT_PAYMENT_SCHEDULE: GenerationTemplate = {
  id: 'benefit_payment_schedule',
  title: 'Benefit Payment Schedule Letter',
  description:
    'Outlines the TD payment schedule for the claimant, including payment dates, ' +
    'amounts, and the statutory basis for the payment cycle.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'tdRate',
    'paymentStartDate',
    'paymentFrequency',
    'examinerName',
  ],
  statutoryAuthority: 'LC 4650, LC 4650(b), LC 4650(c)',
  template: `# Benefit Payment Schedule

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{claimantName}}
**From:** {{insurer}}

## Payment Details

This letter confirms your Temporary Disability (TD) benefit payment schedule for your workers' compensation claim (injury date: **{{dateOfInjury}}**).

| Detail | Value |
|--------|-------|
| TD Weekly Rate | {{tdRate}} |
| Payment Start Date | {{paymentStartDate}} |
| Payment Frequency | {{paymentFrequency}} |

## Payment Schedule

Per **LC 4650(b)**, TD payments are issued every two weeks. Your first payment began on **{{paymentStartDate}}** and will continue biweekly until one of the following occurs:

1. You return to full-duty work
2. Your treating physician determines you have reached Maximum Medical Improvement (MMI)
3. You reach the **104-week statutory maximum** per LC 4656

## Late Payment Penalty

Per **LC 4650(c)**, if any TD payment is late, a **10% self-imposed increase** is automatically added to the late payment. This penalty is mandatory and does not require a request.

## Contact

If a payment is late or you have questions:
**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual payment schedule. It does not constitute legal advice.*`,
};

const COUNSEL_REFERRAL_SUMMARY: GenerationTemplate = {
  id: 'counsel_referral_summary',
  title: 'Factual Summary for Defense Counsel Referral',
  description:
    'Factual summary of claim data prepared for defense counsel referral. ' +
    'Contains only factual information — no legal analysis or conclusions.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'bodyParts',
    'dateReceived',
    'claimStatus',
    'referralReason',
    'examinerName',
  ],
  statutoryAuthority: 'Ins. Code 790.03(h)(14)',
  template: `# Defense Counsel Referral — Factual Summary

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Prepared By:** {{examinerName}}

## Claim Overview

| Field | Value |
|-------|-------|
| Claimant | {{claimantName}} |
| Employer | {{employer}} |
| Insurer | {{insurer}} |
| Date of Injury | {{dateOfInjury}} |
| Date Received | {{dateReceived}} |
| Body Parts | {{bodyParts}} |
| Current Status | {{claimStatus}} |

## Reason for Referral

{{referralReason}}

## Factual Summary

This claim was received on **{{dateReceived}}** for an injury reported on **{{dateOfInjury}}**. The claimant, **{{claimantName}}**, was employed by **{{employer}}** at the time of injury. The reported body parts are: **{{bodyParts}}**.

## Documents Available

The following documents are available in the claim file for your review. Please request specific documents through the claims system.

## Requested Action

Please review the factual record and advise on the legal issues identified in the referral reason above.

---
*This summary contains factual information only. No legal analysis or conclusions have been made by the examiner. All legal determinations are deferred to licensed counsel.*`,
};

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const GENERATION_TEMPLATES: GenerationTemplate[] = [
  EMPLOYER_NOTIFICATION_LC3761,
  TD_BENEFIT_EXPLANATION,
  DELAY_NOTICE,
  BENEFIT_PAYMENT_SCHEDULE,
  COUNSEL_REFERRAL_SUMMARY,
];

const TEMPLATES_BY_ID = new Map(GENERATION_TEMPLATES.map((t) => [t.id, t]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date to YYYY-MM-DD string. Returns '[MISSING]' for null/undefined.
 */
function formatDate(d: Date | null | undefined): string {
  if (!d) return '[MISSING]';
  return d.toISOString().split('T')[0] ?? '[MISSING]';
}

/**
 * Replace all {{field}} placeholders in a template string.
 * Missing fields are replaced with "[MISSING: fieldName]" to make gaps visible.
 * Returns both the populated content and the list of missing fields.
 */
function replaceFields(
  template: string,
  data: Record<string, string>,
): { content: string; missingFields: string[] } {
  const missingFields: string[] = [];

  const content = template.replace(/\{\{(\w+)\}\}/g, (_match, field: string) => {
    const value = data[field];
    if (value === undefined || value === '' || value === '[MISSING]') {
      missingFields.push(field);
      return `[MISSING: ${field}]`;
    }
    return value;
  });

  // Deduplicate missing fields (a field may appear multiple times in template)
  const uniqueMissing = [...new Set(missingFields)];

  return { content, missingFields: uniqueMissing };
}

/**
 * Parse a JSON field that may be a string array into a joined string.
 */
function parseJsonArray(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.join(', ');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch {
      return raw;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all available document generation templates.
 */
export function getAvailableTemplates(): GenerationTemplate[] {
  return GENERATION_TEMPLATES;
}

/**
 * Look up a template by ID.
 */
export function getTemplate(templateId: string): GenerationTemplate | null {
  return TEMPLATES_BY_ID.get(templateId) ?? null;
}

/**
 * Generate a document from a template, populated with claim data.
 *
 * Fetches claim data from the database (claim, documents, extracted fields,
 * graph nodes if available), looks up the template, fills in placeholders,
 * and identifies any missing fields.
 *
 * @param templateId - The template to generate from.
 * @param claimId - The claim to pull data from.
 * @param overrides - Optional field overrides (e.g., delayReason, referralReason).
 * @returns Generated document content with missing field tracking.
 *
 * @throws Error if the template ID is not recognised.
 * @throws Error if the claim is not found.
 */
export async function generateDocument(
  templateId: string,
  claimId: string,
  overrides?: Record<string, string>,
): Promise<GeneratedDocumentResult> {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown template: "${templateId}"`);
  }

  // Fetch claim data
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      claimNumber: true,
      claimantName: true,
      dateOfInjury: true,
      bodyParts: true,
      employer: true,
      insurer: true,
      status: true,
      dateReceived: true,
      assignedExaminer: {
        select: { name: true },
      },
    },
  });

  if (!claim) {
    throw new Error(`Claim not found: "${claimId}"`);
  }

  // Fetch extracted fields for additional data
  const extractedFields = await prisma.extractedField.findMany({
    where: {
      document: { claimId },
    },
    select: {
      fieldName: true,
      fieldValue: true,
    },
  });

  // Build the data map from claim and extracted fields
  const data: Record<string, string> = {
    claimNumber: claim.claimNumber,
    claimantName: claim.claimantName,
    dateOfInjury: formatDate(claim.dateOfInjury),
    employer: claim.employer,
    insurer: claim.insurer,
    dateReceived: formatDate(claim.dateReceived),
    bodyParts: parseJsonArray(claim.bodyParts) || '[MISSING]',
    examinerName: claim.assignedExaminer?.name ?? '[MISSING]',
    claimStatus: claim.status,
    currentDate: formatDate(new Date()),
  };

  // Add extracted fields to data map (field names are used as keys)
  for (const field of extractedFields) {
    if (!data[field.fieldName]) {
      data[field.fieldName] = field.fieldValue;
    }
  }

  // Apply overrides last (highest priority)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      data[key] = value;
    }
  }

  const { content, missingFields } = replaceFields(template.template, data);

  return {
    templateId: template.id,
    title: template.title,
    content,
    missingFields,
  };
}
