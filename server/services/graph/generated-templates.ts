/**
 * SubtypeGraphTemplate System
 *
 * Maps document subtypes/types to graph entity templates — when a document
 * is processed, its extraction fields are mapped to GraphNode and GraphEdge
 * records using these templates.
 *
 * Uses pattern-based matching (glob-like with * wildcard) so that new
 * extraction fields automatically map without code changes.
 */

import type {
  GraphNodeType,
  GraphEdgeType,
  PersonRole,
  OrgType,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldToNodeMapping {
  /** Extraction field name pattern (exact or * wildcard) */
  fieldPattern: string;
  /** Graph node type to create */
  nodeType: GraphNodeType;
  /** PersonRole if nodeType is PERSON */
  personRole?: PersonRole;
  /** OrgType if nodeType is ORGANIZATION */
  orgType?: OrgType;
  /** Which field value property becomes the node's canonicalName */
  nameSource: 'value' | 'fieldName';
}

export interface FieldToEdgeMapping {
  /** Extraction field name pattern */
  fieldPattern: string;
  /** Edge type to create */
  edgeType: GraphEdgeType;
  /** How to determine source node */
  sourceStrategy: 'document_author' | 'applicant' | 'employer' | 'field_ref';
  /** How to determine target node */
  targetStrategy: 'field_value_node' | 'applicant' | 'claim' | 'body_part';
  /** Optional: field providing the target node name */
  targetFieldPattern?: string;
}

export interface SubtypeGraphTemplate {
  /** Document subtype this template applies to */
  subtype: string;
  /** Document type (parent) */
  documentType: string;
  /** Node mappings — which fields create nodes */
  nodeMappings: FieldToNodeMapping[];
  /** Edge mappings — which fields create edges */
  edgeMappings: FieldToEdgeMapping[];
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Glob-like field pattern matching. `*` matches any characters.
 * Case-insensitive.
 */
export function matchFieldPattern(fieldName: string, pattern: string): boolean {
  if (!fieldName || !pattern) return false;
  const lower = fieldName.toLowerCase();
  const pLower = pattern.toLowerCase();

  if (!pLower.includes('*')) {
    return lower === pLower;
  }

  // Convert glob to regex: escape special chars, replace * with .*
  const escaped = pLower
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(lower);
}

// ---------------------------------------------------------------------------
// Universal patterns (apply to ALL document types)
// ---------------------------------------------------------------------------

const UNIVERSAL_NODE_PATTERNS: FieldToNodeMapping[] = [
  // Applicant / Claimant
  { fieldPattern: 'claimantName', nodeType: 'PERSON', personRole: 'APPLICANT', nameSource: 'value' },
  { fieldPattern: 'applicantName', nodeType: 'PERSON', personRole: 'APPLICANT', nameSource: 'value' },
  { fieldPattern: 'injuredWorker*', nodeType: 'PERSON', personRole: 'APPLICANT', nameSource: 'value' },

  // Employer / Carrier
  { fieldPattern: 'employerName', nodeType: 'ORGANIZATION', orgType: 'EMPLOYER', nameSource: 'value' },
  { fieldPattern: 'insuranceCarrier', nodeType: 'ORGANIZATION', orgType: 'CARRIER', nameSource: 'value' },
  { fieldPattern: 'carrierName', nodeType: 'ORGANIZATION', orgType: 'CARRIER', nameSource: 'value' },
  { fieldPattern: 'tpaName', nodeType: 'ORGANIZATION', orgType: 'TPA_ORG', nameSource: 'value' },

  // Physicians
  { fieldPattern: 'treatingPhysician', nodeType: 'PERSON', personRole: 'TREATING_PHYSICIAN', nameSource: 'value' },
  { fieldPattern: 'physicianName', nodeType: 'PERSON', personRole: 'TREATING_PHYSICIAN', nameSource: 'value' },
  { fieldPattern: 'qmePhysicianName', nodeType: 'PERSON', personRole: 'QME', nameSource: 'value' },
  { fieldPattern: 'amePhysicianName', nodeType: 'PERSON', personRole: 'AME', nameSource: 'value' },
  { fieldPattern: 'surgeonName', nodeType: 'PERSON', personRole: 'SURGEON', nameSource: 'value' },
  { fieldPattern: 'radiologistName', nodeType: 'PERSON', personRole: 'RADIOLOGIST', nameSource: 'value' },

  // Attorneys
  { fieldPattern: 'applicantAttorney*', nodeType: 'PERSON', personRole: 'APPLICANT_ATTORNEY', nameSource: 'value' },
  { fieldPattern: 'defenseAttorney*', nodeType: 'PERSON', personRole: 'DEFENSE_ATTORNEY', nameSource: 'value' },
  { fieldPattern: 'attorneyName', nodeType: 'PERSON', personRole: 'APPLICANT_ATTORNEY', nameSource: 'value' },

  // Body parts (array fields)
  { fieldPattern: 'bodyParts*', nodeType: 'BODY_PART', nameSource: 'value' },
  { fieldPattern: 'injuredBodyPart*', nodeType: 'BODY_PART', nameSource: 'value' },
  { fieldPattern: 'affectedBodyPart*', nodeType: 'BODY_PART', nameSource: 'value' },

  // Medications
  { fieldPattern: 'medication*', nodeType: 'MEDICATION', nameSource: 'value' },
  { fieldPattern: 'prescribedMedication*', nodeType: 'MEDICATION', nameSource: 'value' },

  // Treatments
  { fieldPattern: 'requestedTreatment', nodeType: 'TREATMENT', nameSource: 'value' },
  { fieldPattern: 'authorizedTreatment', nodeType: 'TREATMENT', nameSource: 'value' },
  { fieldPattern: 'treatmentType', nodeType: 'TREATMENT', nameSource: 'value' },
  { fieldPattern: 'procedureName', nodeType: 'TREATMENT', nameSource: 'value' },

  // Facilities
  { fieldPattern: 'facilityName', nodeType: 'ORGANIZATION', orgType: 'MEDICAL_FACILITY', nameSource: 'value' },
  { fieldPattern: 'providerName', nodeType: 'ORGANIZATION', orgType: 'MEDICAL_FACILITY', nameSource: 'value' },
  { fieldPattern: 'pharmacyName', nodeType: 'ORGANIZATION', orgType: 'PHARMACY', nameSource: 'value' },
];

const UNIVERSAL_EDGE_PATTERNS: FieldToEdgeMapping[] = [
  // Medical edges
  { fieldPattern: 'diagnos*', edgeType: 'DIAGNOSES', sourceStrategy: 'document_author', targetStrategy: 'body_part' },
  { fieldPattern: 'workRestriction*', edgeType: 'OFFERS_WORK', sourceStrategy: 'employer', targetStrategy: 'applicant' },
  { fieldPattern: 'medication*', edgeType: 'PRESCRIBED', sourceStrategy: 'document_author', targetStrategy: 'field_value_node' },

  // Financial edges
  { fieldPattern: 'averageWeeklyEarnings', edgeType: 'EMPLOYED_BY', sourceStrategy: 'applicant', targetStrategy: 'field_ref', targetFieldPattern: 'employerName' },
  { fieldPattern: 'tdRate', edgeType: 'PAYS', sourceStrategy: 'employer', targetStrategy: 'applicant' },
  { fieldPattern: 'pdRate', edgeType: 'PAYS', sourceStrategy: 'employer', targetStrategy: 'applicant' },

  // Lien edges
  { fieldPattern: 'lienAmount', edgeType: 'FILES_LIEN', sourceStrategy: 'field_ref', targetStrategy: 'claim' },
  { fieldPattern: 'settlementAmount', edgeType: 'SETTLES_LIEN', sourceStrategy: 'employer', targetStrategy: 'field_value_node' },
];

// ---------------------------------------------------------------------------
// Document-type-specific patterns
// ---------------------------------------------------------------------------

const TYPE_SPECIFIC_NODE_PATTERNS: Record<string, FieldToNodeMapping[]> = {
  AME_QME_REPORT: [
    { fieldPattern: 'wpiRating', nodeType: 'RATING', nameSource: 'value' },
    { fieldPattern: 'pdRating', nodeType: 'RATING', nameSource: 'value' },
    { fieldPattern: 'apportionmentPercentage', nodeType: 'RATING', nameSource: 'value' },
  ],
  MEDICAL_REPORT: [
    { fieldPattern: 'referral*', nodeType: 'PERSON', personRole: 'TREATING_PHYSICIAN', nameSource: 'value' },
  ],
  UTILIZATION_REVIEW: [
    { fieldPattern: 'reviewOrganization', nodeType: 'ORGANIZATION', orgType: 'MEDICAL_FACILITY', nameSource: 'value' },
  ],
  WCAB_FILING: [
    { fieldPattern: 'judgeName', nodeType: 'PERSON', personRole: 'WCAB_JUDGE', nameSource: 'value' },
    { fieldPattern: 'caseNumber', nodeType: 'PROCEEDING', nameSource: 'value' },
    { fieldPattern: 'legalIssue*', nodeType: 'LEGAL_ISSUE', nameSource: 'value' },
  ],
  SETTLEMENT_DOCUMENT: [
    { fieldPattern: 'settlementType', nodeType: 'SETTLEMENT', nameSource: 'value' },
  ],
  LIEN_CLAIM: [
    { fieldPattern: 'lienClaimant*', nodeType: 'PERSON', personRole: 'LIEN_CLAIMANT', nameSource: 'value' },
    { fieldPattern: 'lienType', nodeType: 'LIEN', nameSource: 'value' },
  ],
  BENEFIT_NOTICE: [
    { fieldPattern: 'benefitType', nodeType: 'BENEFIT', nameSource: 'value' },
  ],
};

const TYPE_SPECIFIC_EDGE_PATTERNS: Record<string, FieldToEdgeMapping[]> = {
  AME_QME_REPORT: [
    { fieldPattern: 'wpiRating', edgeType: 'RATES', sourceStrategy: 'document_author', targetStrategy: 'field_value_node' },
    { fieldPattern: 'apportionment*', edgeType: 'APPORTIONS', sourceStrategy: 'document_author', targetStrategy: 'field_value_node' },
    { fieldPattern: '*', edgeType: 'EVALUATES', sourceStrategy: 'document_author', targetStrategy: 'applicant' },
  ],
  MEDICAL_REPORT: [
    { fieldPattern: '*', edgeType: 'TREATS', sourceStrategy: 'document_author', targetStrategy: 'applicant' },
    { fieldPattern: 'procedureName', edgeType: 'PERFORMED', sourceStrategy: 'document_author', targetStrategy: 'field_value_node' },
  ],
  UTILIZATION_REVIEW: [
    { fieldPattern: 'requestedTreatment', edgeType: 'REVIEWS_UR', sourceStrategy: 'field_ref', targetStrategy: 'field_value_node' },
  ],
  WCAB_FILING: [
    { fieldPattern: 'caseNumber', edgeType: 'FILES', sourceStrategy: 'applicant', targetStrategy: 'field_value_node' },
    { fieldPattern: 'legalIssue*', edgeType: 'PERTAINS_TO', sourceStrategy: 'field_ref', targetStrategy: 'claim' },
  ],
  BILLING_STATEMENT: [
    { fieldPattern: 'totalCharges', edgeType: 'FILES_LIEN', sourceStrategy: 'field_ref', targetStrategy: 'claim' },
  ],
  WAGE_STATEMENT: [
    { fieldPattern: 'averageWeeklyEarnings', edgeType: 'EMPLOYED_BY', sourceStrategy: 'applicant', targetStrategy: 'field_ref', targetFieldPattern: 'employerName' },
  ],
};

// ---------------------------------------------------------------------------
// Template lookup
// ---------------------------------------------------------------------------

/**
 * Get the graph template for a document subtype/type.
 * Type-specific patterns are merged with universal patterns.
 * Falls back to universal-only for unknown types.
 */
export function getTemplateForSubtype(
  subtype: string,
  documentType: string,
): SubtypeGraphTemplate {
  const typeNodes = TYPE_SPECIFIC_NODE_PATTERNS[documentType] ?? [];
  const typeEdges = TYPE_SPECIFIC_EDGE_PATTERNS[documentType] ?? [];

  return {
    subtype,
    documentType,
    nodeMappings: [...UNIVERSAL_NODE_PATTERNS, ...typeNodes],
    edgeMappings: [...UNIVERSAL_EDGE_PATTERNS, ...typeEdges],
  };
}

/**
 * Get all node mappings matching a field name.
 */
export function getNodeMappingsForField(
  fieldName: string,
  template: SubtypeGraphTemplate,
): FieldToNodeMapping[] {
  return template.nodeMappings.filter((m) =>
    matchFieldPattern(fieldName, m.fieldPattern),
  );
}

/**
 * Get all edge mappings matching a field name.
 */
export function getEdgeMappingsForField(
  fieldName: string,
  template: SubtypeGraphTemplate,
): FieldToEdgeMapping[] {
  return template.edgeMappings.filter((m) =>
    matchFieldPattern(fieldName, m.fieldPattern),
  );
}

/**
 * Get all supported document types with type-specific templates.
 */
export function getSupportedDocumentTypes(): string[] {
  return [
    ...new Set([
      ...Object.keys(TYPE_SPECIFIC_NODE_PATTERNS),
      ...Object.keys(TYPE_SPECIFIC_EDGE_PATTERNS),
    ]),
  ].sort();
}
