import { describe, it, expect } from 'vitest';
import {
  matchFieldPattern,
  getTemplateForSubtype,
  getNodeMappingsForField,
  getEdgeMappingsForField,
  getSupportedDocumentTypes,
} from '../../../server/services/graph/generated-templates.js';

// ---------------------------------------------------------------------------
// matchFieldPattern
// ---------------------------------------------------------------------------

describe('matchFieldPattern', () => {
  it('matches exact field names (case-insensitive)', () => {
    expect(matchFieldPattern('claimantName', 'claimantName')).toBe(true);
    expect(matchFieldPattern('ClaimantName', 'claimantname')).toBe(true);
  });

  it('rejects non-matching exact names', () => {
    expect(matchFieldPattern('claimantName', 'employerName')).toBe(false);
  });

  it('matches wildcard at end', () => {
    expect(matchFieldPattern('bodyParts', 'bodyParts*')).toBe(true);
    expect(matchFieldPattern('bodyPartsInjured', 'bodyParts*')).toBe(true);
  });

  it('matches wildcard at start', () => {
    expect(matchFieldPattern('prescribedMedication', '*Medication')).toBe(true);
  });

  it('matches wildcard in middle', () => {
    expect(matchFieldPattern('applicantAttorneyName', 'applicant*Name')).toBe(true);
  });

  it('matches single * (any field)', () => {
    expect(matchFieldPattern('anyFieldName', '*')).toBe(true);
  });

  it('returns false for empty inputs', () => {
    expect(matchFieldPattern('', 'pattern')).toBe(false);
    expect(matchFieldPattern('field', '')).toBe(false);
    expect(matchFieldPattern('', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTemplateForSubtype
// ---------------------------------------------------------------------------

describe('getTemplateForSubtype', () => {
  it('returns universal patterns for unknown type', () => {
    const template = getTemplateForSubtype('UNKNOWN_SUBTYPE', 'UNKNOWN_TYPE');
    expect(template.subtype).toBe('UNKNOWN_SUBTYPE');
    expect(template.documentType).toBe('UNKNOWN_TYPE');
    expect(template.nodeMappings.length).toBeGreaterThan(0);
    expect(template.edgeMappings.length).toBeGreaterThan(0);
  });

  it('merges type-specific with universal for AME_QME_REPORT', () => {
    const template = getTemplateForSubtype('QME_INITIAL', 'AME_QME_REPORT');
    const wpiMapping = template.nodeMappings.find(
      (m) => m.fieldPattern === 'wpiRating',
    );
    expect(wpiMapping).toBeDefined();
    expect(wpiMapping!.nodeType).toBe('RATING');

    // Also has universal claimantName
    const claimant = template.nodeMappings.find(
      (m) => m.fieldPattern === 'claimantName',
    );
    expect(claimant).toBeDefined();
  });

  it('includes type-specific edges for AME_QME_REPORT', () => {
    const template = getTemplateForSubtype('QME_INITIAL', 'AME_QME_REPORT');
    const ratesEdge = template.edgeMappings.find(
      (m) => m.edgeType === 'RATES',
    );
    expect(ratesEdge).toBeDefined();
  });

  it('includes WCAB_FILING-specific nodes', () => {
    const template = getTemplateForSubtype('APPLICATION_ORIGINAL', 'WCAB_FILING');
    const judge = template.nodeMappings.find((m) => m.fieldPattern === 'judgeName');
    expect(judge).toBeDefined();
    expect(judge!.personRole).toBe('WCAB_JUDGE');
  });
});

// ---------------------------------------------------------------------------
// getNodeMappingsForField
// ---------------------------------------------------------------------------

describe('getNodeMappingsForField', () => {
  const template = getTemplateForSubtype('QME_INITIAL', 'AME_QME_REPORT');

  it('finds PERSON mapping for claimantName', () => {
    const mappings = getNodeMappingsForField('claimantName', template);
    expect(mappings.length).toBe(1);
    expect(mappings[0]!.nodeType).toBe('PERSON');
    expect(mappings[0]!.personRole).toBe('APPLICANT');
  });

  it('finds ORGANIZATION mapping for employerName', () => {
    const mappings = getNodeMappingsForField('employerName', template);
    expect(mappings.length).toBe(1);
    expect(mappings[0]!.nodeType).toBe('ORGANIZATION');
    expect(mappings[0]!.orgType).toBe('EMPLOYER');
  });

  it('finds BODY_PART mapping for wildcard bodyParts*', () => {
    const mappings = getNodeMappingsForField('bodyPartsInjured', template);
    expect(mappings.length).toBeGreaterThanOrEqual(1);
    expect(mappings[0]!.nodeType).toBe('BODY_PART');
  });

  it('finds MEDICATION mapping for medication wildcard', () => {
    const mappings = getNodeMappingsForField('medicationPrescribed', template);
    expect(mappings.length).toBeGreaterThanOrEqual(1);
    expect(mappings[0]!.nodeType).toBe('MEDICATION');
  });

  it('finds RATING mapping for wpiRating (type-specific)', () => {
    const mappings = getNodeMappingsForField('wpiRating', template);
    expect(mappings.some((m) => m.nodeType === 'RATING')).toBe(true);
  });

  it('returns empty for unrecognized field', () => {
    const mappings = getNodeMappingsForField('unknownField', template);
    expect(mappings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getEdgeMappingsForField
// ---------------------------------------------------------------------------

describe('getEdgeMappingsForField', () => {
  it('finds DIAGNOSES edge for diagnosis field', () => {
    const template = getTemplateForSubtype('PROGRESS_NOTE', 'MEDICAL_REPORT');
    const mappings = getEdgeMappingsForField('diagnosis', template);
    expect(mappings.some((m) => m.edgeType === 'DIAGNOSES')).toBe(true);
  });

  it('finds EMPLOYED_BY edge for averageWeeklyEarnings', () => {
    const template = getTemplateForSubtype('WAGE_DOC', 'WAGE_STATEMENT');
    const mappings = getEdgeMappingsForField('averageWeeklyEarnings', template);
    const employedBy = mappings.filter((m) => m.edgeType === 'EMPLOYED_BY');
    expect(employedBy.length).toBeGreaterThanOrEqual(1);
  });

  it('finds REVIEWS_UR for UR template', () => {
    const template = getTemplateForSubtype('UR_DECISION', 'UTILIZATION_REVIEW');
    const mappings = getEdgeMappingsForField('requestedTreatment', template);
    expect(mappings.some((m) => m.edgeType === 'REVIEWS_UR')).toBe(true);
  });

  it('finds FILES edge for WCAB caseNumber', () => {
    const template = getTemplateForSubtype('APPLICATION', 'WCAB_FILING');
    const mappings = getEdgeMappingsForField('caseNumber', template);
    expect(mappings.some((m) => m.edgeType === 'FILES')).toBe(true);
  });

  it('returns empty for unrecognized field', () => {
    const template = getTemplateForSubtype('ANY', 'MEDICAL_REPORT');
    const mappings = getEdgeMappingsForField('randomField', template);
    // Only universal * patterns might match
    const specific = mappings.filter((m) => m.fieldPattern !== '*');
    expect(specific.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSupportedDocumentTypes
// ---------------------------------------------------------------------------

describe('getSupportedDocumentTypes', () => {
  it('returns sorted list of types with specific templates', () => {
    const types = getSupportedDocumentTypes();
    expect(types.length).toBeGreaterThanOrEqual(5);
    expect(types).toContain('AME_QME_REPORT');
    expect(types).toContain('MEDICAL_REPORT');
    expect(types).toContain('WCAB_FILING');
    expect(types).toContain('UTILIZATION_REVIEW');
    // Verify sorted
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });
});
