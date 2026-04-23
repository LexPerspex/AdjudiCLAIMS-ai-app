import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_DEFINITIONS,
  WORKFLOWS_BY_ID,
} from '../../server/data/workflow-definitions.js';

/**
 * AJC-18 — Citation integrity & spec alignment tests for the 20 decision workflows.
 *
 * The 20 workflows themselves were authored across two prior commits:
 *   - 7752aba (Phase 6) — first 5 workflows
 *   - 90af9d5 (Phase 10 Tier 2 batch) — remaining 15 workflows
 *
 * AJC-18 is the audit ticket for that work. These tests add rigor on top of
 * the structural checks in workflows-phase10.test.ts:
 *
 *   1. Every workflow's `authority` field references at least one recognised
 *      California statutory source (LC, 8 CCR, 10 CCR, Ins. Code, MTUS, or
 *      explicitly "Carrier compliance guidelines" for non-statutory steps).
 *   2. Every step's `authority` field references the same set, OR is explicitly
 *      a non-statutory operational note. We allow a small whitelist of
 *      operational citations so steps like "Report to supervisor" don't fail.
 *   3. Spec alignment: the 20 workflow IDs match the 20 sections in
 *      docs/product/ADJUDICLAIMS_DECISION_WORKFLOWS.md (asserted via the
 *      ALL_WORKFLOW_IDS registry).
 *   4. UPL invariant: no workflow is RED-zoned. Workflows that touch
 *      counsel-referral judgment may be YELLOW; pure factual workflows are
 *      GREEN.
 */

const ALL_WORKFLOW_IDS_FROM_SPEC = [
  'new_claim_intake', // Spec § Workflow 1
  'three_point_contact', // Spec § Workflow 2
  'coverage_determination', // Spec § Workflow 3
  'td_benefit_initiation', // Spec § Workflow 4
  'ur_treatment_authorization', // Spec § Workflow 5
  'qme_ame_process', // Spec § Workflow 6
  'reserve_setting', // Spec § Workflow 7
  'counsel_referral', // Spec § Workflow 8
  'denial_issuance', // Spec § Workflow 9
  'delay_notification', // Spec § Workflow 10
  'employer_notification', // Spec § Workflow 11
  'doi_audit_response', // Spec § Workflow 12
  'lien_management', // Spec § Workflow 13
  'return_to_work', // Spec § Workflow 14
  'claim_closure', // Spec § Workflow 15
  'fraud_indicator', // Spec § Workflow 16
  'subrogation_referral', // Spec § Workflow 17
  'cumulative_trauma', // Spec § Workflow 18
  'death_benefit', // Spec § Workflow 19
  'penalty_self_assessment', // Spec § Workflow 20
];

// California statutory citation patterns. A valid `authority` must contain at
// least one of these.
const STATUTORY_PATTERNS = [
  /\bLC\s*\d/, // Labor Code (e.g., "LC 4650")
  /\b8\s*CCR\s*\d/, // Title 8 California Code of Regulations
  /\b10\s*CCR\s*\d/, // Title 10 California Code of Regulations
  /\bIns\.?\s*Code\s*\d/i, // Insurance Code
  /\bMTUS\b/, // Medical Treatment Utilization Schedule
  /\bOMFS\b/, // Official Medical Fee Schedule
];

// Step-level operational citations that are intentionally non-statutory.
// These are allowed because some steps describe internal claim ops (e.g.,
// "Report to supervisor", "Select panel counsel"). Any authority that begins
// with "Carrier " is also accepted as an internal-procedure citation.
const STEP_OPERATIONAL_CITATIONS = [
  'Carrier ', // covers "Carrier compliance guidelines", "Carrier panel guidelines", "Carrier internal procedures", etc.
  'Internal claim handling protocol',
  'No specific statutory deadline', // used by step authors when the regulation imposes a duty without a numeric clock
];

function hasStatutoryReference(authority: string): boolean {
  return STATUTORY_PATTERNS.some((rx) => rx.test(authority));
}

function isAllowedOperationalAuthority(authority: string): boolean {
  return STEP_OPERATIONAL_CITATIONS.some((op) =>
    authority.toLowerCase().includes(op.toLowerCase()),
  );
}

describe('AJC-18 — workflow citation integrity', () => {
  it('exports exactly the 20 spec-defined workflow IDs', () => {
    const actual = WORKFLOW_DEFINITIONS.map((w) => w.id).sort();
    const expected = [...ALL_WORKFLOW_IDS_FROM_SPEC].sort();
    expect(actual).toEqual(expected);
  });

  it('WORKFLOWS_BY_ID lookup map contains every spec workflow', () => {
    for (const id of ALL_WORKFLOW_IDS_FROM_SPEC) {
      expect(WORKFLOWS_BY_ID.has(id), `missing workflow: ${id}`).toBe(true);
    }
  });

  it('no workflow is in the RED zone (UPL invariant)', () => {
    for (const w of WORKFLOW_DEFINITIONS) {
      expect(w.uplZone, `${w.id} is RED — workflows must be GREEN or YELLOW`).not.toBe('RED');
    }
  });

  describe.each(WORKFLOW_DEFINITIONS)('workflow $id', (w) => {
    it('top-level authority cites at least one CA statutory source', () => {
      expect(
        hasStatutoryReference(w.authority),
        `workflow ${w.id} authority="${w.authority}" lacks a recognised CA statutory citation (LC / 8 CCR / 10 CCR / Ins. Code / MTUS)`,
      ).toBe(true);
    });

    it('every step has an authority field that is statutory OR allowlisted operational', () => {
      for (const step of w.steps) {
        const isStatutory = hasStatutoryReference(step.authority);
        const isOperational = isAllowedOperationalAuthority(step.authority);
        expect(
          isStatutory || isOperational,
          `workflow ${w.id} step ${step.id} authority="${step.authority}" is neither statutory nor an allowlisted operational citation`,
        ).toBe(true);
      }
    });

    it('every step has a compliance note of at least 40 chars (no placeholder/TODO content)', () => {
      for (const step of w.steps) {
        expect(
          step.complianceNote.length,
          `workflow ${w.id} step ${step.id} complianceNote too short (length=${String(step.complianceNote.length)})`,
        ).toBeGreaterThanOrEqual(40);
        expect(
          /\bTODO\b|\bTBD\b|\bFIXME\b/i.test(step.complianceNote),
          `workflow ${w.id} step ${step.id} complianceNote contains TODO/TBD/FIXME`,
        ).toBe(false);
      }
    });

    it('every step description is at least 60 chars (substantive, not a stub)', () => {
      for (const step of w.steps) {
        expect(
          step.description.length,
          `workflow ${w.id} step ${step.id} description too short (length=${String(step.description.length)})`,
        ).toBeGreaterThanOrEqual(60);
      }
    });

    it('skippable steps have a non-trivial skipReason', () => {
      for (const step of w.steps) {
        if (step.isSkippable) {
          expect(step.skipReason, `step ${step.id} is skippable without a skipReason`).toBeDefined();
          expect(
            (step.skipReason as string).length,
            `step ${step.id} skipReason too short`,
          ).toBeGreaterThanOrEqual(20);
        } else {
          expect(
            step.skipReason,
            `step ${step.id} is not skippable but has a skipReason set`,
          ).toBeUndefined();
        }
      }
    });
  });
});
