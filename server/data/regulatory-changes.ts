/**
 * Static regulatory change data — sample changes for Layer 3 ongoing education.
 *
 * In production, regulatory changes would come from a managed data source
 * (admin portal or regulatory feed). For MVP, we use static data to validate
 * the notification and acknowledgment workflow.
 *
 * Each change includes the affected statutes, urgency level, and effective date
 * so examiners can prioritize review.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChangeUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * A regulatory change notification entry.
 *
 * Part of the Layer 3 ongoing education system. When statutes, regulations,
 * or fee schedules change, examiners receive these notifications and must
 * acknowledge them. Unacknowledged changes appear as pending items in the
 * examiner's education dashboard.
 *
 * Urgency levels determine display priority:
 * - CRITICAL: Immediate compliance impact, requires same-day review
 * - HIGH: Significant procedural change, review within 1 week
 * - MEDIUM: Moderate change, review before effective date
 * - LOW: Informational, no immediate action required
 */
export interface RegulatoryChange {
  /** Unique identifier (e.g., 'rc-2026-001'). */
  id: string;
  /** Short title including the bill number or rule source. */
  title: string;
  /** One-paragraph summary of the change and examiner impact. */
  description: string;
  /** When the change takes effect (ISO date string). */
  effectiveDate: string; // ISO date string
  /** Statutory sections affected (e.g., ['LC 4650', 'LC 4650.5']). */
  affectedStatutes: string[];
  /** Urgency level for display prioritization. */
  urgency: ChangeUrgency;
  /** Markdown body with detailed explanation of what changed and examiner impact. */
  details: string;
}

// ---------------------------------------------------------------------------
// Static regulatory changes
// ---------------------------------------------------------------------------

export const REGULATORY_CHANGES: RegulatoryChange[] = [
  {
    id: 'rc-2026-001',
    title: 'SB 1234 — Increased Late-Payment Penalty Under LC 4650',
    description:
      'Senate Bill 1234 increases the self-imposed penalty for late TD payments from 10% to 15%, ' +
      'effective July 1, 2026. Examiners must ensure TD payment issuance within 14 calendar days ' +
      'of knowledge of disability to avoid the higher penalty.',
    effectiveDate: '2026-07-01',
    affectedStatutes: ['LC 4650', 'LC 4650.5'],
    urgency: 'HIGH',
    details: `## What Changed

**Senate Bill 1234** amends Labor Code § 4650 to increase the self-imposed penalty for late
temporary disability (TD) payments.

### Previous Rule
- Late TD payments triggered a **10% self-imposed penalty** (LC 4650(d)).

### New Rule (effective 2026-07-01)
- Late TD payments now trigger a **15% self-imposed penalty**.
- The 14-calendar-day payment deadline remains unchanged.

### Examiner Impact
- Review all open claims with active TD to confirm payment schedules meet the 14-day window.
- Update internal checklists to reflect the higher penalty rate.
- No change to the payment calculation itself — only the penalty percentage changes.

### Regulatory Authority
Labor Code § 4650 as amended by SB 1234 (2026).`,
  },
  {
    id: 'rc-2026-002',
    title: 'AB 5678 — Modified UR Timeline for Expedited Reviews',
    description:
      'Assembly Bill 5678 shortens the Utilization Review (UR) timeline for expedited review ' +
      'requests from 72 hours to 48 hours, effective October 1, 2026. Affects all UR decisions ' +
      'on treatment requests marked as urgent by the treating physician.',
    effectiveDate: '2026-10-01',
    affectedStatutes: ['LC 4610', 'LC 4610.5', '8 CCR 9792.9.1'],
    urgency: 'MEDIUM',
    details: `## What Changed

**Assembly Bill 5678** amends Labor Code § 4610 to accelerate the expedited Utilization Review
(UR) timeline.

### Previous Rule
- Expedited UR decisions required within **72 hours** of receipt of the request.

### New Rule (effective 2026-10-01)
- Expedited UR decisions required within **48 hours** of receipt of the request.
- Standard (non-expedited) UR timelines remain at 5 working days.

### Examiner Impact
- Flag urgent treatment requests for immediate UR processing.
- Coordinate with UR nurses to ensure the shorter turnaround is met.
- Update deadline tracking to reflect the 48-hour window for expedited requests.

### Regulatory Authority
Labor Code § 4610 as amended by AB 5678 (2026); 8 CCR § 9792.9.1.`,
  },
  {
    id: 'rc-2026-003',
    title: 'DWC Rulemaking — Updated OMFS Fee Schedule for Physical Therapy',
    description:
      'The Division of Workers\' Compensation updated the Official Medical Fee Schedule (OMFS) ' +
      'for physical therapy codes, effective April 15, 2026. Reimbursement rates for CPT 97110 ' +
      'and 97140 increased by 3.2%.',
    effectiveDate: '2026-04-15',
    affectedStatutes: ['LC 5307.1', '8 CCR 9789.10'],
    urgency: 'LOW',
    details: `## What Changed

The **DWC adopted updated OMFS rates** for physical therapy (PT) procedure codes effective
April 15, 2026.

### Key Changes
- **CPT 97110** (Therapeutic exercises): Rate increased from $42.80 to $44.17 per unit.
- **CPT 97140** (Manual therapy): Rate increased from $38.50 to $39.73 per unit.
- All other PT codes remain unchanged in this update cycle.

### Examiner Impact
- Lien reviews involving PT services on or after April 15, 2026 must use the new rates.
- No action needed for PT bills processed before the effective date.
- The OMFS calculator in AdjudiCLAIMS will be updated automatically.

### Regulatory Authority
Labor Code § 5307.1; 8 CCR § 9789.10 (OMFS — Physician/Non-Physician Practitioner).`,
  },
];

/** Map for O(1) lookup by change ID. */
export const REGULATORY_CHANGES_BY_ID = new Map(
  REGULATORY_CHANGES.map((c) => [c.id, c]),
);
