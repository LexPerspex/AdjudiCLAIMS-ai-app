import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_DEFINITIONS,
  WORKFLOWS_BY_ID,
} from '../../server/data/workflow-definitions.js';
import type { WorkflowDefinition, WorkflowStep } from '../../server/data/workflow-definitions.js';

/**
 * Phase 10 workflow definition tests.
 *
 * Validates that all 20 workflow definitions exist with correct structure,
 * required fields, unique IDs, and minimum step counts.
 */

const REQUIRED_WORKFLOW_FIELDS: (keyof WorkflowDefinition)[] = [
  'id',
  'title',
  'description',
  'uplZone',
  'authority',
  'featureContext',
  'steps',
  'estimatedMinutes',
];

const REQUIRED_STEP_FIELDS: (keyof WorkflowStep)[] = [
  'id',
  'title',
  'description',
  'authority',
  'complianceNote',
  'isSkippable',
];

const ALL_WORKFLOW_IDS = [
  'new_claim_intake',
  'three_point_contact',
  'coverage_determination',
  'td_benefit_initiation',
  'denial_issuance',
  'ur_treatment_authorization',
  'qme_ame_process',
  'reserve_setting',
  'counsel_referral',
  'delay_notification',
  'employer_notification',
  'doi_audit_response',
  'lien_management',
  'return_to_work',
  'claim_closure',
  'fraud_indicator',
  'subrogation_referral',
  'cumulative_trauma',
  'death_benefit',
  'penalty_self_assessment',
];

describe('Workflow definitions — Phase 10 (all 20 workflows)', () => {
  it('should have exactly 20 workflow definitions', () => {
    expect(WORKFLOW_DEFINITIONS).toHaveLength(20);
  });

  it('should have all 20 workflows in WORKFLOW_DEFINITIONS', () => {
    const ids = WORKFLOW_DEFINITIONS.map((w) => w.id);
    for (const expectedId of ALL_WORKFLOW_IDS) {
      expect(ids).toContain(expectedId);
    }
  });

  it('should have all 20 workflows in WORKFLOWS_BY_ID', () => {
    for (const expectedId of ALL_WORKFLOW_IDS) {
      expect(WORKFLOWS_BY_ID.has(expectedId)).toBe(true);
    }
  });

  it('should have unique workflow IDs', () => {
    const ids = WORKFLOW_DEFINITIONS.map((w) => w.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  describe.each(WORKFLOW_DEFINITIONS)('workflow: $id', (workflow) => {
    it('should have all required fields', () => {
      for (const field of REQUIRED_WORKFLOW_FIELDS) {
        expect(workflow[field], `missing field: ${field}`).toBeDefined();
      }
    });

    it('should have a non-empty title and description', () => {
      expect(workflow.title.length).toBeGreaterThan(0);
      expect(workflow.description.length).toBeGreaterThan(0);
    });

    it('should have a valid uplZone', () => {
      expect(['GREEN', 'YELLOW', 'RED']).toContain(workflow.uplZone);
    });

    it('should have a valid featureContext', () => {
      const validContexts = [
        'CLAIM_INTAKE',
        'BENEFIT_CALCULATION',
        'DEADLINE_TRACKING',
        'MEDICAL_REVIEW',
        'INVESTIGATION',
        'DOCUMENT_REVIEW',
        'CHAT',
        'COVERAGE_DETERMINATION',
        'SETTLEMENT',
        'UTILIZATION_REVIEW',
      ];
      expect(validContexts).toContain(workflow.featureContext);
    });

    it('should have at least 4 steps', () => {
      expect(workflow.steps.length).toBeGreaterThanOrEqual(4);
    });

    it('should have a positive estimatedMinutes', () => {
      expect(workflow.estimatedMinutes).toBeGreaterThan(0);
    });

    it('should have unique step IDs within the workflow', () => {
      const stepIds = workflow.steps.map((s) => s.id);
      const uniqueStepIds = new Set(stepIds);
      expect(uniqueStepIds.size).toBe(stepIds.length);
    });

    it('each step should have all required fields', () => {
      for (const step of workflow.steps) {
        for (const field of REQUIRED_STEP_FIELDS) {
          expect(step[field], `step ${step.id} missing field: ${field}`).toBeDefined();
        }
      }
    });

    it('each step should have non-empty title and description', () => {
      for (const step of workflow.steps) {
        expect(step.title.length, `step ${step.id} empty title`).toBeGreaterThan(0);
        expect(step.description.length, `step ${step.id} empty description`).toBeGreaterThan(0);
      }
    });

    it('skippable steps should have a skipReason', () => {
      for (const step of workflow.steps) {
        if (step.isSkippable) {
          expect(step.skipReason, `step ${step.id} is skippable but has no skipReason`).toBeDefined();
          expect((step.skipReason as string).length).toBeGreaterThan(0);
        }
      }
    });
  });
});
