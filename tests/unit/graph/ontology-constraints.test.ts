import { describe, it, expect } from 'vitest';
import {
  EDGE_CONSTRAINTS,
  isValidEdge,
  getValidEdgeTypes,
  getValidTargetTypes,
  getValidSourceTypes,
} from '../../../server/services/graph/ontology-constraints.js';
import type { GraphNodeType, GraphEdgeType } from '../../../server/services/graph/ontology-constraints.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_NODE_TYPES: GraphNodeType[] = [
  'PERSON', 'ORGANIZATION', 'BODY_PART', 'CLAIM', 'DOCUMENT',
  'PROCEEDING', 'LEGAL_ISSUE', 'LIEN', 'SETTLEMENT', 'TREATMENT',
  'MEDICATION', 'RATING', 'BENEFIT',
];

const ALL_EDGE_TYPES: GraphEdgeType[] = [
  'ESTABLISHES', 'MENTIONS', 'AMENDS', 'SUPERSEDES', 'RESPONDS_TO',
  'REPRESENTS', 'EMPLOYED_BY', 'AFFILIATED_WITH', 'DEPENDENT_OF',
  'TREATS', 'EVALUATES', 'DIAGNOSES', 'INJURED', 'PRESCRIBED',
  'PERFORMED', 'REVIEWS_UR', 'REVIEWS_IMR', 'REFERS',
  'FILES', 'ADJUDICATES', 'DECIDES', 'ORDERS', 'AWARDS',
  'PERTAINS_TO', 'APPEALS', 'CITES_STATUTE',
  'PAYS', 'FILES_LIEN', 'SETTLES_LIEN', 'DENIES', 'INSURES',
  'RATES', 'APPORTIONS', 'OFFERS_WORK',
  'SENDS',
];

// ---------------------------------------------------------------------------
// Structural completeness
// ---------------------------------------------------------------------------

describe('EDGE_CONSTRAINTS', () => {
  it('covers all 35 edge types', () => {
    expect(Object.keys(EDGE_CONSTRAINTS)).toHaveLength(35);
    for (const et of ALL_EDGE_TYPES) {
      expect(EDGE_CONSTRAINTS).toHaveProperty(et);
    }
  });

  it('every constraint has non-empty source and target arrays', () => {
    for (const [edgeType, constraint] of Object.entries(EDGE_CONSTRAINTS)) {
      expect(constraint.sourceTypes.length, `${edgeType} sourceTypes empty`).toBeGreaterThan(0);
      expect(constraint.targetTypes.length, `${edgeType} targetTypes empty`).toBeGreaterThan(0);
    }
  });

  it('all referenced node types are valid', () => {
    const validSet = new Set(ALL_NODE_TYPES);
    for (const [edgeType, constraint] of Object.entries(EDGE_CONSTRAINTS)) {
      for (const st of constraint.sourceTypes) {
        expect(validSet.has(st), `${edgeType} source ${st} invalid`).toBe(true);
      }
      for (const tt of constraint.targetTypes) {
        expect(validSet.has(tt), `${edgeType} target ${tt} invalid`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isValidEdge — Document-Entity edges
// ---------------------------------------------------------------------------

describe('isValidEdge', () => {
  describe('Document-Entity edges', () => {
    it('ESTABLISHES: DOCUMENT → any node type', () => {
      for (const target of ALL_NODE_TYPES) {
        expect(isValidEdge('ESTABLISHES', 'DOCUMENT', target)).toBe(true);
      }
    });

    it('ESTABLISHES: rejects non-DOCUMENT source', () => {
      expect(isValidEdge('ESTABLISHES', 'PERSON', 'CLAIM')).toBe(false);
      expect(isValidEdge('ESTABLISHES', 'ORGANIZATION', 'BENEFIT')).toBe(false);
    });

    it('MENTIONS: DOCUMENT → any node type', () => {
      for (const target of ALL_NODE_TYPES) {
        expect(isValidEdge('MENTIONS', 'DOCUMENT', target)).toBe(true);
      }
    });

    it('MENTIONS: rejects non-DOCUMENT source', () => {
      expect(isValidEdge('MENTIONS', 'PERSON', 'BODY_PART')).toBe(false);
    });

    it('AMENDS: DOCUMENT → DOCUMENT only', () => {
      expect(isValidEdge('AMENDS', 'DOCUMENT', 'DOCUMENT')).toBe(true);
      expect(isValidEdge('AMENDS', 'DOCUMENT', 'CLAIM')).toBe(false);
      expect(isValidEdge('AMENDS', 'PERSON', 'DOCUMENT')).toBe(false);
    });

    it('SUPERSEDES: DOCUMENT → DOCUMENT only', () => {
      expect(isValidEdge('SUPERSEDES', 'DOCUMENT', 'DOCUMENT')).toBe(true);
      expect(isValidEdge('SUPERSEDES', 'DOCUMENT', 'PERSON')).toBe(false);
    });

    it('RESPONDS_TO: DOCUMENT → DOCUMENT only', () => {
      expect(isValidEdge('RESPONDS_TO', 'DOCUMENT', 'DOCUMENT')).toBe(true);
      expect(isValidEdge('RESPONDS_TO', 'PERSON', 'DOCUMENT')).toBe(false);
      expect(isValidEdge('RESPONDS_TO', 'DOCUMENT', 'TREATMENT')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Person relationship edges
  // -------------------------------------------------------------------------

  describe('Person relationship edges', () => {
    it('REPRESENTS: PERSON → PERSON', () => {
      expect(isValidEdge('REPRESENTS', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('REPRESENTS', 'ORGANIZATION', 'PERSON')).toBe(false);
      expect(isValidEdge('REPRESENTS', 'PERSON', 'ORGANIZATION')).toBe(false);
    });

    it('EMPLOYED_BY: PERSON → ORGANIZATION', () => {
      expect(isValidEdge('EMPLOYED_BY', 'PERSON', 'ORGANIZATION')).toBe(true);
      expect(isValidEdge('EMPLOYED_BY', 'PERSON', 'PERSON')).toBe(false);
      expect(isValidEdge('EMPLOYED_BY', 'ORGANIZATION', 'ORGANIZATION')).toBe(false);
    });

    it('AFFILIATED_WITH: PERSON → ORGANIZATION', () => {
      expect(isValidEdge('AFFILIATED_WITH', 'PERSON', 'ORGANIZATION')).toBe(true);
      expect(isValidEdge('AFFILIATED_WITH', 'ORGANIZATION', 'ORGANIZATION')).toBe(false);
    });

    it('DEPENDENT_OF: PERSON → PERSON', () => {
      expect(isValidEdge('DEPENDENT_OF', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('DEPENDENT_OF', 'PERSON', 'CLAIM')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Medical edges
  // -------------------------------------------------------------------------

  describe('Medical edges', () => {
    it('TREATS: PERSON → PERSON', () => {
      expect(isValidEdge('TREATS', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('TREATS', 'ORGANIZATION', 'PERSON')).toBe(false);
    });

    it('EVALUATES: PERSON → PERSON', () => {
      expect(isValidEdge('EVALUATES', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('EVALUATES', 'PERSON', 'BODY_PART')).toBe(false);
    });

    it('DIAGNOSES: PERSON → BODY_PART', () => {
      expect(isValidEdge('DIAGNOSES', 'PERSON', 'BODY_PART')).toBe(true);
      expect(isValidEdge('DIAGNOSES', 'PERSON', 'PERSON')).toBe(false);
      expect(isValidEdge('DIAGNOSES', 'DOCUMENT', 'BODY_PART')).toBe(false);
    });

    it('INJURED: PERSON → BODY_PART', () => {
      expect(isValidEdge('INJURED', 'PERSON', 'BODY_PART')).toBe(true);
      expect(isValidEdge('INJURED', 'BODY_PART', 'PERSON')).toBe(false);
    });

    it('PRESCRIBED: PERSON → MEDICATION', () => {
      expect(isValidEdge('PRESCRIBED', 'PERSON', 'MEDICATION')).toBe(true);
      expect(isValidEdge('PRESCRIBED', 'ORGANIZATION', 'MEDICATION')).toBe(false);
      expect(isValidEdge('PRESCRIBED', 'PERSON', 'TREATMENT')).toBe(false);
    });

    it('PERFORMED: PERSON → TREATMENT', () => {
      expect(isValidEdge('PERFORMED', 'PERSON', 'TREATMENT')).toBe(true);
      expect(isValidEdge('PERFORMED', 'PERSON', 'MEDICATION')).toBe(false);
    });

    it('REVIEWS_UR: ORGANIZATION → TREATMENT', () => {
      expect(isValidEdge('REVIEWS_UR', 'ORGANIZATION', 'TREATMENT')).toBe(true);
      expect(isValidEdge('REVIEWS_UR', 'PERSON', 'TREATMENT')).toBe(false);
      expect(isValidEdge('REVIEWS_UR', 'ORGANIZATION', 'MEDICATION')).toBe(false);
    });

    it('REVIEWS_IMR: ORGANIZATION → TREATMENT', () => {
      expect(isValidEdge('REVIEWS_IMR', 'ORGANIZATION', 'TREATMENT')).toBe(true);
      expect(isValidEdge('REVIEWS_IMR', 'PERSON', 'TREATMENT')).toBe(false);
    });

    it('REFERS: PERSON → PERSON', () => {
      expect(isValidEdge('REFERS', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('REFERS', 'ORGANIZATION', 'PERSON')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Legal process edges
  // -------------------------------------------------------------------------

  describe('Legal process edges', () => {
    it('FILES: PERSON → PROCEEDING', () => {
      expect(isValidEdge('FILES', 'PERSON', 'PROCEEDING')).toBe(true);
      expect(isValidEdge('FILES', 'ORGANIZATION', 'PROCEEDING')).toBe(false);
      expect(isValidEdge('FILES', 'PERSON', 'CLAIM')).toBe(false);
    });

    it('ADJUDICATES: PERSON → PROCEEDING', () => {
      expect(isValidEdge('ADJUDICATES', 'PERSON', 'PROCEEDING')).toBe(true);
      expect(isValidEdge('ADJUDICATES', 'ORGANIZATION', 'PROCEEDING')).toBe(false);
    });

    it('DECIDES: PERSON → LEGAL_ISSUE', () => {
      expect(isValidEdge('DECIDES', 'PERSON', 'LEGAL_ISSUE')).toBe(true);
      expect(isValidEdge('DECIDES', 'PERSON', 'CLAIM')).toBe(false);
    });

    it('ORDERS: PERSON → CLAIM', () => {
      expect(isValidEdge('ORDERS', 'PERSON', 'CLAIM')).toBe(true);
      expect(isValidEdge('ORDERS', 'PERSON', 'BENEFIT')).toBe(false);
    });

    it('AWARDS: PERSON → BENEFIT', () => {
      expect(isValidEdge('AWARDS', 'PERSON', 'BENEFIT')).toBe(true);
      expect(isValidEdge('AWARDS', 'PERSON', 'CLAIM')).toBe(false);
      expect(isValidEdge('AWARDS', 'ORGANIZATION', 'BENEFIT')).toBe(false);
    });

    it('PERTAINS_TO: LEGAL_ISSUE → CLAIM', () => {
      expect(isValidEdge('PERTAINS_TO', 'LEGAL_ISSUE', 'CLAIM')).toBe(true);
      expect(isValidEdge('PERTAINS_TO', 'CLAIM', 'LEGAL_ISSUE')).toBe(false);
      expect(isValidEdge('PERTAINS_TO', 'LEGAL_ISSUE', 'BENEFIT')).toBe(false);
    });

    it('APPEALS: PERSON → PROCEEDING', () => {
      expect(isValidEdge('APPEALS', 'PERSON', 'PROCEEDING')).toBe(true);
      expect(isValidEdge('APPEALS', 'ORGANIZATION', 'PROCEEDING')).toBe(false);
    });

    it('CITES_STATUTE: DOCUMENT → LEGAL_ISSUE', () => {
      expect(isValidEdge('CITES_STATUTE', 'DOCUMENT', 'LEGAL_ISSUE')).toBe(true);
      expect(isValidEdge('CITES_STATUTE', 'PERSON', 'LEGAL_ISSUE')).toBe(false);
      expect(isValidEdge('CITES_STATUTE', 'DOCUMENT', 'CLAIM')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Financial edges
  // -------------------------------------------------------------------------

  describe('Financial edges', () => {
    it('PAYS: ORGANIZATION → BENEFIT', () => {
      expect(isValidEdge('PAYS', 'ORGANIZATION', 'BENEFIT')).toBe(true);
      expect(isValidEdge('PAYS', 'PERSON', 'BENEFIT')).toBe(false);
      expect(isValidEdge('PAYS', 'ORGANIZATION', 'LIEN')).toBe(false);
    });

    it('FILES_LIEN: ORGANIZATION or PERSON → LIEN', () => {
      expect(isValidEdge('FILES_LIEN', 'ORGANIZATION', 'LIEN')).toBe(true);
      expect(isValidEdge('FILES_LIEN', 'PERSON', 'LIEN')).toBe(true);
      expect(isValidEdge('FILES_LIEN', 'DOCUMENT', 'LIEN')).toBe(false);
      expect(isValidEdge('FILES_LIEN', 'PERSON', 'CLAIM')).toBe(false);
    });

    it('SETTLES_LIEN: ORGANIZATION → LIEN', () => {
      expect(isValidEdge('SETTLES_LIEN', 'ORGANIZATION', 'LIEN')).toBe(true);
      expect(isValidEdge('SETTLES_LIEN', 'PERSON', 'LIEN')).toBe(false);
    });

    it('DENIES: ORGANIZATION → TREATMENT or BENEFIT', () => {
      expect(isValidEdge('DENIES', 'ORGANIZATION', 'TREATMENT')).toBe(true);
      expect(isValidEdge('DENIES', 'ORGANIZATION', 'BENEFIT')).toBe(true);
      expect(isValidEdge('DENIES', 'ORGANIZATION', 'CLAIM')).toBe(false);
      expect(isValidEdge('DENIES', 'PERSON', 'TREATMENT')).toBe(false);
    });

    it('INSURES: ORGANIZATION → ORGANIZATION', () => {
      expect(isValidEdge('INSURES', 'ORGANIZATION', 'ORGANIZATION')).toBe(true);
      expect(isValidEdge('INSURES', 'PERSON', 'ORGANIZATION')).toBe(false);
      expect(isValidEdge('INSURES', 'ORGANIZATION', 'PERSON')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rating / Work edges
  // -------------------------------------------------------------------------

  describe('Rating / Work edges', () => {
    it('RATES: PERSON → RATING', () => {
      expect(isValidEdge('RATES', 'PERSON', 'RATING')).toBe(true);
      expect(isValidEdge('RATES', 'ORGANIZATION', 'RATING')).toBe(false);
      expect(isValidEdge('RATES', 'PERSON', 'BODY_PART')).toBe(false);
    });

    it('APPORTIONS: PERSON → RATING', () => {
      expect(isValidEdge('APPORTIONS', 'PERSON', 'RATING')).toBe(true);
      expect(isValidEdge('APPORTIONS', 'ORGANIZATION', 'RATING')).toBe(false);
    });

    it('OFFERS_WORK: ORGANIZATION → PERSON', () => {
      expect(isValidEdge('OFFERS_WORK', 'ORGANIZATION', 'PERSON')).toBe(true);
      expect(isValidEdge('OFFERS_WORK', 'PERSON', 'PERSON')).toBe(false);
      expect(isValidEdge('OFFERS_WORK', 'ORGANIZATION', 'ORGANIZATION')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Communication edge
  // -------------------------------------------------------------------------

  describe('Communication edge', () => {
    it('SENDS: PERSON or ORGANIZATION → PERSON or ORGANIZATION', () => {
      expect(isValidEdge('SENDS', 'PERSON', 'PERSON')).toBe(true);
      expect(isValidEdge('SENDS', 'PERSON', 'ORGANIZATION')).toBe(true);
      expect(isValidEdge('SENDS', 'ORGANIZATION', 'PERSON')).toBe(true);
      expect(isValidEdge('SENDS', 'ORGANIZATION', 'ORGANIZATION')).toBe(true);
      expect(isValidEdge('SENDS', 'DOCUMENT', 'PERSON')).toBe(false);
      expect(isValidEdge('SENDS', 'PERSON', 'CLAIM')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getValidEdgeTypes
// ---------------------------------------------------------------------------

describe('getValidEdgeTypes', () => {
  it('DOCUMENT → DOCUMENT returns document-to-document edges plus ESTABLISHES/MENTIONS', () => {
    const result = getValidEdgeTypes('DOCUMENT', 'DOCUMENT');
    expect(result).toContain('AMENDS');
    expect(result).toContain('SUPERSEDES');
    expect(result).toContain('RESPONDS_TO');
    expect(result).toContain('ESTABLISHES');
    expect(result).toContain('MENTIONS');
    // Should not include edges that require different types
    expect(result).not.toContain('TREATS');
    expect(result).not.toContain('PAYS');
  });

  it('PERSON → PERSON returns person relationship + medical edges', () => {
    const result = getValidEdgeTypes('PERSON', 'PERSON');
    expect(result).toContain('REPRESENTS');
    expect(result).toContain('DEPENDENT_OF');
    expect(result).toContain('TREATS');
    expect(result).toContain('EVALUATES');
    expect(result).toContain('REFERS');
    expect(result).toContain('SENDS');
    expect(result).not.toContain('EMPLOYED_BY');
  });

  it('PERSON → ORGANIZATION returns EMPLOYED_BY, AFFILIATED_WITH, SENDS', () => {
    const result = getValidEdgeTypes('PERSON', 'ORGANIZATION');
    expect(result).toContain('EMPLOYED_BY');
    expect(result).toContain('AFFILIATED_WITH');
    expect(result).toContain('SENDS');
    expect(result).not.toContain('REPRESENTS');
  });

  it('ORGANIZATION → BENEFIT returns PAYS and DENIES', () => {
    const result = getValidEdgeTypes('ORGANIZATION', 'BENEFIT');
    expect(result).toContain('PAYS');
    expect(result).toContain('DENIES');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for types with no valid edges', () => {
    const result = getValidEdgeTypes('BODY_PART', 'MEDICATION');
    expect(result).toEqual([]);
  });

  it('LEGAL_ISSUE → CLAIM returns only PERTAINS_TO', () => {
    const result = getValidEdgeTypes('LEGAL_ISSUE', 'CLAIM');
    expect(result).toEqual(['PERTAINS_TO']);
  });

  it('DOCUMENT → LEGAL_ISSUE includes ESTABLISHES, MENTIONS, CITES_STATUTE', () => {
    const result = getValidEdgeTypes('DOCUMENT', 'LEGAL_ISSUE');
    expect(result).toContain('ESTABLISHES');
    expect(result).toContain('MENTIONS');
    expect(result).toContain('CITES_STATUTE');
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getValidTargetTypes
// ---------------------------------------------------------------------------

describe('getValidTargetTypes', () => {
  it('ESTABLISHES targets all 13 node types', () => {
    const targets = getValidTargetTypes('ESTABLISHES');
    expect(targets).toHaveLength(13);
  });

  it('AMENDS targets only DOCUMENT', () => {
    expect(getValidTargetTypes('AMENDS')).toEqual(['DOCUMENT']);
  });

  it('DENIES targets TREATMENT and BENEFIT', () => {
    const targets = getValidTargetTypes('DENIES');
    expect(targets).toContain('TREATMENT');
    expect(targets).toContain('BENEFIT');
    expect(targets).toHaveLength(2);
  });

  it('FILES_LIEN targets only LIEN', () => {
    expect(getValidTargetTypes('FILES_LIEN')).toEqual(['LIEN']);
  });

  it('SENDS targets PERSON and ORGANIZATION', () => {
    const targets = getValidTargetTypes('SENDS');
    expect(targets).toContain('PERSON');
    expect(targets).toContain('ORGANIZATION');
    expect(targets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getValidSourceTypes
// ---------------------------------------------------------------------------

describe('getValidSourceTypes', () => {
  it('ESTABLISHES source is only DOCUMENT', () => {
    expect(getValidSourceTypes('ESTABLISHES')).toEqual(['DOCUMENT']);
  });

  it('FILES_LIEN sources are ORGANIZATION and PERSON', () => {
    const sources = getValidSourceTypes('FILES_LIEN');
    expect(sources).toContain('ORGANIZATION');
    expect(sources).toContain('PERSON');
    expect(sources).toHaveLength(2);
  });

  it('SENDS sources are PERSON and ORGANIZATION', () => {
    const sources = getValidSourceTypes('SENDS');
    expect(sources).toContain('PERSON');
    expect(sources).toContain('ORGANIZATION');
    expect(sources).toHaveLength(2);
  });

  it('PERTAINS_TO source is only LEGAL_ISSUE', () => {
    expect(getValidSourceTypes('PERTAINS_TO')).toEqual(['LEGAL_ISSUE']);
  });

  it('REVIEWS_UR source is only ORGANIZATION', () => {
    expect(getValidSourceTypes('REVIEWS_UR')).toEqual(['ORGANIZATION']);
  });

  it('TREATS source is only PERSON', () => {
    expect(getValidSourceTypes('TREATS')).toEqual(['PERSON']);
  });
});
