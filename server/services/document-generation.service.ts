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

const MEDICAL_AUTHORIZATION: GenerationTemplate = {
  id: 'medical_authorization',
  title: 'Pre-Authorization Request for Medical Treatment (LC 4600)',
  description:
    'Pre-authorization request to the utilization review organization for medical ' +
    'treatment requested by the treating physician. Documents the clinical rationale ' +
    'and statutory authority for the treatment request.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'treatingPhysician',
    'requestedTreatment',
    'diagnosisCode',
    'clinicalRationale',
    'requestedStartDate',
    'examinerName',
  ],
  statutoryAuthority: 'LC 4600; 8 CCR 9792.6 et seq.',
  template: `# Pre-Authorization Request for Medical Treatment

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}
**Authorization Request No.:** {{claimNumber}}-AUTH-{{currentDate}}

**To:** Utilization Review Organization
**From:** {{insurer}} — Claims Examiner: {{examinerName}}

## Patient Information

| Field | Value |
|-------|-------|
| Claimant | {{claimantName}} |
| Date of Injury | {{dateOfInjury}} |
| Claim Number | {{claimNumber}} |

## Treating Physician

**Physician/Provider:** {{treatingPhysician}}

## Requested Treatment

**Treatment Requested:** {{requestedTreatment}}
**ICD Diagnosis Code(s):** {{diagnosisCode}}
**Requested Start Date:** {{requestedStartDate}}

## Clinical Rationale

{{clinicalRationale}}

## Statutory Authority

This authorization request is submitted pursuant to **California Labor Code Section 4600**, which requires the employer to provide all medical treatment reasonably required to cure or relieve the injured worker from the effects of the industrial injury.

Utilization review of this request is governed by **8 CCR 9792.6 et seq.** A decision is required within the applicable timeframes:
- **Prospective/Concurrent:** Decision within **5 business days** (or 3 days for urgent requests) per 8 CCR 9792.9(b).
- **Retrospective:** Decision within **30 days** per 8 CCR 9792.9(c).

## Contact

**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual pre-authorization request. It does not constitute a coverage determination or legal advice.*`,
};

const DENIAL_LETTER: GenerationTemplate = {
  id: 'denial_letter',
  title: 'Coverage Denial Letter with Appeal Rights (LC 5402)',
  description:
    'Written denial of workers\' compensation coverage following investigation, ' +
    'stating the basis for denial and the claimant\'s rights to appeal before ' +
    'the Workers\' Compensation Appeals Board (WCAB). Required within 90 days ' +
    'per LC 5402(b) to avoid presumption of compensability.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'denialBasis',
    'investigationSummary',
    'examinerName',
  ],
  statutoryAuthority: 'LC 5402(b); 10 CCR 2695.7(c)',
  template: `# Notice of Denial of Workers' Compensation Benefits

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{claimantName}}
**From:** {{insurer}}
**Re:** Workers' Compensation Claim — {{employer}} — Injury Date {{dateOfInjury}}

## Notice of Denial

After a complete investigation, **{{insurer}}** has determined that the above-referenced workers' compensation claim is **DENIED**.

## Basis for Denial

{{denialBasis}}

## Summary of Investigation

{{investigationSummary}}

## Your Appeal Rights

You have the right to dispute this denial. The following options are available to you:

1. **File a Workers' Compensation Claim Form (DWC 1)** — If you have not already done so, you may file a DWC 1 claim form.

2. **File an Application for Adjudication of Claim** — You may file an Application for Adjudication of Claim (DWC-ADJ-1) with the **Workers' Compensation Appeals Board (WCAB)** in your district.

3. **Request an Expedited Hearing** — If you require immediate medical treatment, you may request an expedited hearing before the WCAB.

4. **Consult an Attorney** — You have the right to consult with an attorney of your choice at any time. Many workers' compensation attorneys work on a contingency basis.

**Time Limit:** Workers' compensation claims are subject to a **statute of limitations**. You should act promptly to protect your rights.

## WCAB Contact Information

You may locate your local WCAB district office through the California Department of Industrial Relations website at **www.dir.ca.gov/dwc**.

## Statutory Authority

This denial is issued pursuant to **California Labor Code Section 5402(b)**, which requires a coverage determination within 90 days of receipt of the claim form. This denial is final unless appealed to the WCAB.

## Contact

**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual notice of the coverage determination. This letter does not constitute legal advice. You have the right to consult an attorney.*`,
};

const LIEN_NOTICE: GenerationTemplate = {
  id: 'lien_notice',
  title: 'Lien Filing Notification (LC 4903.1)',
  description:
    'Written notification to the claimant and parties of record that a lien ' +
    'claim has been filed against the workers\' compensation claim by a lien ' +
    'claimant. Documents the lien amount, basis, and procedural requirements ' +
    'per LC 4903.1.',
  requiredFields: [
    'claimNumber',
    'claimantName',
    'dateOfInjury',
    'insurer',
    'lienClaimant',
    'lienAmount',
    'lienBasis',
    'servicesRenderedDates',
    'examinerName',
  ],
  statutoryAuthority: 'LC 4903.1; LC 4903.05; 8 CCR 10770',
  template: `# Notice of Lien Claim Filing

**Date:** {{currentDate}}
**Claim Number:** {{claimNumber}}

**To:** {{claimantName}}
**From:** {{insurer}} — Claims Examiner: {{examinerName}}
**Re:** Lien Claim Filed Against Workers' Compensation Claim

## Notice

You are hereby notified that a **lien claim** has been filed against your workers' compensation claim (Claim No. {{claimNumber}}, injury date {{dateOfInjury}}).

## Lien Claimant Information

| Field | Value |
|-------|-------|
| Lien Claimant | {{lienClaimant}} |
| Lien Amount Claimed | {{lienAmount}} |
| Services Rendered | {{servicesRenderedDates}} |

## Basis for Lien

{{lienBasis}}

## What This Means

A lien claimant is asserting a right to be paid directly from any workers' compensation award or settlement in your case. This lien does not change your right to receive workers' compensation benefits — it affects how a portion of any benefits paid may be distributed.

## Your Rights

- You have the right to contest this lien before the Workers' Compensation Appeals Board (WCAB).
- If you have an attorney, they should be notified of this lien immediately.
- The lien claimant must satisfy filing and activation fee requirements per **LC 4903.05** or the lien may be subject to dismissal.

## Procedural Requirements

Under **LC 4903.1**, liens must be filed and activated in compliance with WCAB rules:
- Lien activation fees apply per **8 CCR 10770**.
- Lien conferences are scheduled by the WCAB to resolve disputed liens.

## Statutory Authority

This notice is provided pursuant to **California Labor Code Section 4903.1**, which governs lien claims in workers' compensation proceedings.

## Contact

**Examiner:** {{examinerName}}
**Claim Number:** {{claimNumber}}

---
*This is a factual notification of a lien filing. It does not constitute legal advice. Please consult your attorney regarding the effect of this lien on your claim.*`,
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
  MEDICAL_AUTHORIZATION,
  DENIAL_LETTER,
  LIEN_NOTICE,
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

// ---------------------------------------------------------------------------
// HTML Export
// ---------------------------------------------------------------------------

/**
 * Metadata for HTML letter export.
 */
export interface LetterHtmlMetadata {
  /** Claim number for the letter header. */
  claimNumber: string;
  /** Human-readable letter type (e.g., 'TD Benefit Explanation'). */
  letterType: string;
  /** When the letter was generated. */
  generatedAt: Date;
  /** Name or identifier of who generated the letter. */
  generatedBy: string;
}

/**
 * Convert a subset of Markdown to HTML.
 *
 * Handles the most common patterns found in AdjudiCLAIMS letter templates:
 *   - `## Heading` → <h2>
 *   - `# Heading` → <h1>
 *   - `**bold**` → <strong>
 *   - `| table | cells |` → <table> rows
 *   - `- bullet` → <ul><li>
 *   - `1. item` → <ol><li>
 *   - blank lines → paragraph breaks
 *   - `---` → <hr>
 *   - `*italic*` → <em>
 *
 * This is intentionally simple — no external dependencies.
 */
function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHeaderDone = false;

  const closeList = () => {
    if (inUl) { htmlLines.push('</ul>'); inUl = false; }
    if (inOl) { htmlLines.push('</ol>'); inOl = false; }
  };

  const closeTable = () => {
    if (inTable) { htmlLines.push('</tbody></table>'); inTable = false; tableHeaderDone = false; }
  };

  const inlineMarkdown = (text: string): string => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      closeTable();
      htmlLines.push('<hr>');
      continue;
    }

    // Table rows
    if (/^\|/.test(line.trim())) {
      if (!inTable) {
        closeList();
        htmlLines.push('<table><thead>');
        inTable = true;
        tableHeaderDone = false;
      }
      // Check if this is the separator row (|---|---|)
      if (/^\|\s*[-:]+\s*\|/.test(line.trim())) {
        htmlLines.push('</thead><tbody>');
        tableHeaderDone = true;
        continue;
      }
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());
      if (!tableHeaderDone) {
        const cellHtml = cells.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('');
        htmlLines.push(`<tr>${cellHtml}</tr>`);
      } else {
        const cellHtml = cells.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('');
        htmlLines.push(`<tr>${cellHtml}</tr>`);
      }
      continue;
    } else {
      closeTable();
    }

    // Headings
    if (/^### /.test(line)) {
      closeList();
      htmlLines.push(`<h3>${inlineMarkdown(line.replace(/^### /, ''))}</h3>`);
      continue;
    }
    if (/^## /.test(line)) {
      closeList();
      htmlLines.push(`<h2>${inlineMarkdown(line.replace(/^## /, ''))}</h2>`);
      continue;
    }
    if (/^# /.test(line)) {
      closeList();
      htmlLines.push(`<h1>${inlineMarkdown(line.replace(/^# /, ''))}</h1>`);
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line.trim())) {
      if (inOl) { htmlLines.push('</ol>'); inOl = false; }
      if (!inUl) { htmlLines.push('<ul>'); inUl = true; }
      htmlLines.push(`<li>${inlineMarkdown(line.trim().replace(/^[-*] /, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line.trim())) {
      if (inUl) { htmlLines.push('</ul>'); inUl = false; }
      if (!inOl) { htmlLines.push('<ol>'); inOl = true; }
      htmlLines.push(`<li>${inlineMarkdown(line.trim().replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Close open lists on blank or regular lines
    if (line.trim() === '') {
      closeList();
      htmlLines.push('<br>');
      continue;
    }

    // Regular paragraph line
    closeList();
    htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  closeTable();

  return htmlLines.join('\n');
}

/**
 * Generate a printable HTML document from a letter's Markdown content.
 *
 * Produces a complete HTML page with:
 *   - Glass Box Solutions letterhead
 *   - Letter metadata (claim number, date, type, generated by)
 *   - Body content converted from Markdown to HTML
 *   - Footer with mandatory UPL disclaimer + "Generated by AdjudiCLAIMS"
 *   - Print-friendly CSS with @media print rules
 *
 * The returned HTML string can be served with Content-Type: text/html and
 * allows the browser's native Print → Save as PDF to handle PDF conversion
 * without requiring a server-side PDF library dependency.
 *
 * All generated documents are GREEN zone — factual content only.
 * The UPL disclaimer in the footer is mandatory on every export.
 *
 * @param markdownContent - The letter body in Markdown format.
 * @param metadata - Claim number, letter type, generation timestamp, and author.
 * @returns Complete HTML document string.
 */
export function generateLetterHtml(
  markdownContent: string,
  metadata: LetterHtmlMetadata,
): string {
  const formattedDate = metadata.generatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const bodyHtml = markdownToHtml(markdownContent);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AdjudiCLAIMS — ${metadata.letterType} — ${metadata.claimNumber}</title>
  <style>
    /* Base styles */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.75in 1in;
    }

    /* Letterhead */
    .letterhead {
      border-bottom: 2px solid #1a3a5c;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .letterhead .company-name {
      font-size: 18pt;
      font-weight: bold;
      color: #1a3a5c;
      letter-spacing: 0.02em;
    }
    .letterhead .company-tagline {
      font-size: 9pt;
      color: #555;
      font-style: italic;
      margin-top: 2px;
    }
    .letterhead .company-address {
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }

    /* Metadata block */
    .letter-meta {
      background: #f5f7fa;
      border: 1px solid #d0d7e0;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 20px;
      font-size: 10pt;
    }
    .letter-meta table { width: 100%; }
    .letter-meta td { padding: 2px 8px 2px 0; }
    .letter-meta td:first-child { font-weight: bold; width: 140px; }

    /* Body content */
    .letter-body h1 { font-size: 14pt; margin: 16px 0 8px; color: #1a3a5c; }
    .letter-body h2 { font-size: 12pt; margin: 14px 0 6px; color: #1a3a5c; }
    .letter-body h3 { font-size: 11pt; margin: 12px 0 4px; }
    .letter-body p { margin: 6px 0; }
    .letter-body ul, .letter-body ol { margin: 6px 0 6px 24px; }
    .letter-body li { margin: 3px 0; }
    .letter-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 11pt;
    }
    .letter-body th, .letter-body td {
      border: 1px solid #ccc;
      padding: 5px 8px;
      text-align: left;
    }
    .letter-body th { background: #eef2f7; font-weight: bold; }
    .letter-body hr { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
    .letter-body strong { font-weight: bold; }
    .letter-body em { font-style: italic; }
    .letter-body br { display: block; margin: 4px 0; content: ""; }

    /* UPL Footer */
    .letter-footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ccc;
      font-size: 8.5pt;
      color: #555;
    }
    .upl-disclaimer {
      background: #fff8e1;
      border: 1px solid #f0c040;
      border-radius: 3px;
      padding: 8px 10px;
      margin-bottom: 8px;
      font-size: 8.5pt;
    }
    .upl-disclaimer strong { color: #8a6000; }
    .generated-by { font-size: 8pt; color: #888; margin-top: 4px; }

    /* Print styles */
    @media print {
      body { padding: 0; margin: 0; font-size: 11pt; }
      .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .letter-meta { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .upl-disclaimer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .letter-body table { page-break-inside: avoid; }
      h1, h2, h3 { page-break-after: avoid; }
      @page { margin: 0.75in 1in; }
    }
  </style>
</head>
<body>

  <!-- Letterhead -->
  <div class="letterhead">
    <div class="company-name">Glass Box Solutions, Inc.</div>
    <div class="company-tagline">From Black Box to Glass Box — Transparent AI for California Workers' Compensation</div>
    <div class="company-address">AdjudiCLAIMS Claims Management Platform</div>
  </div>

  <!-- Letter metadata -->
  <div class="letter-meta">
    <table>
      <tr>
        <td>Claim Number:</td>
        <td><strong>${metadata.claimNumber}</strong></td>
        <td>Letter Type:</td>
        <td>${metadata.letterType}</td>
      </tr>
      <tr>
        <td>Generated:</td>
        <td>${formattedDate}</td>
        <td>Generated By:</td>
        <td>${metadata.generatedBy}</td>
      </tr>
    </table>
  </div>

  <!-- Letter body -->
  <div class="letter-body">
    ${bodyHtml}
  </div>

  <!-- Footer with UPL disclaimer -->
  <div class="letter-footer">
    <div class="upl-disclaimer">
      <strong>NOTICE — Not Legal Advice:</strong> This document was generated by AdjudiCLAIMS
      and contains factual information and statutory citations only. It does not constitute
      legal advice, legal analysis, or a legal conclusion. All legal matters must be referred
      to licensed defense counsel. This document is subject to attorney review before use in
      any legal proceeding.
    </div>
    <div class="generated-by">
      Generated by AdjudiCLAIMS &mdash; Glass Box Solutions, Inc. &mdash; ${formattedDate}
    </div>
  </div>

</body>
</html>`;
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
