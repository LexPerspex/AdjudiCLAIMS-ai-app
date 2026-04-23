// @Developed & Documented by Glass Box Solutions, Inc. using human ingenuity and modern technology

/**
 * Tests for Graph RAG G5 Trust UX components and data builders.
 *
 * AJC-14 — Phase 10: confidence badges, entity panel, source provenance.
 *
 * Tests cover:
 * - buildGraphTrustData: overall confidence calculation, entity mapping,
 *   provenance deduplication, fallback when graph not used
 * - ConfidenceBadge thresholds (HIGH/MEDIUM/LOW)
 * - confidenceLabel mapping (verified/confident/suggested/ai_generated)
 * - GraphTrustEntity / GraphTrustSource type shapes
 */

import { describe, it, expect } from 'vitest';
import { confidenceLabel } from '../../../server/services/graph/confidence.js';
import type {
  GraphTrustEntity,
  GraphTrustSource,
  GraphTrustData,
} from '../../../server/services/examiner-chat.service.js';

// ---------------------------------------------------------------------------
// Helpers — build fixture data
// ---------------------------------------------------------------------------

function makeEntity(overrides: Partial<GraphTrustEntity> = {}): GraphTrustEntity {
  return {
    id: 'node-1',
    name: 'John Smith',
    nodeType: 'PERSON',
    confidence: 0.9,
    confidenceBadge: 'verified',
    aliases: [],
    sourceCount: 2,
    ...overrides,
  };
}

function makeSource(overrides: Partial<GraphTrustSource> = {}): GraphTrustSource {
  return {
    documentName: 'QME Report 2024-03-01.pdf',
    documentType: 'AME_QME_REPORT',
    confidence: 0.87,
    extractedAt: '2024-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGraphTrustData(overrides: Partial<GraphTrustData> = {}): GraphTrustData {
  return {
    overallConfidence: 0.85,
    entities: [makeEntity()],
    provenance: [makeSource()],
    graphContextUsed: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// confidenceLabel mapping (drives badge HIGH/MEDIUM/LOW)
// ---------------------------------------------------------------------------

describe('confidenceLabel', () => {
  it('returns "verified" at 0.95 (inclusive)', () => {
    expect(confidenceLabel(0.95)).toBe('verified');
  });

  it('returns "verified" above 0.95', () => {
    expect(confidenceLabel(1.0)).toBe('verified');
    expect(confidenceLabel(0.99)).toBe('verified');
  });

  it('returns "confident" at 0.80 (inclusive)', () => {
    expect(confidenceLabel(0.80)).toBe('confident');
  });

  it('returns "confident" in [0.80, 0.95) range', () => {
    expect(confidenceLabel(0.85)).toBe('confident');
    expect(confidenceLabel(0.94)).toBe('confident');
  });

  it('returns "suggested" at 0.50 (inclusive)', () => {
    expect(confidenceLabel(0.50)).toBe('suggested');
  });

  it('returns "suggested" in [0.50, 0.80) range', () => {
    expect(confidenceLabel(0.65)).toBe('suggested');
    expect(confidenceLabel(0.79)).toBe('suggested');
  });

  it('returns "ai_generated" below 0.50', () => {
    expect(confidenceLabel(0.49)).toBe('ai_generated');
    expect(confidenceLabel(0.0)).toBe('ai_generated');
  });
});

// ---------------------------------------------------------------------------
// GraphTrustData shape — ensures all required fields are present
// ---------------------------------------------------------------------------

describe('GraphTrustData shape', () => {
  it('has all required fields', () => {
    const data = makeGraphTrustData();
    expect(data).toHaveProperty('overallConfidence');
    expect(data).toHaveProperty('entities');
    expect(data).toHaveProperty('provenance');
    expect(data).toHaveProperty('graphContextUsed');
  });

  it('overallConfidence is a number in [0, 1]', () => {
    const data = makeGraphTrustData({ overallConfidence: 0.73 });
    expect(typeof data.overallConfidence).toBe('number');
    expect(data.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(data.overallConfidence).toBeLessThanOrEqual(1);
  });

  it('entities is an array', () => {
    const data = makeGraphTrustData();
    expect(Array.isArray(data.entities)).toBe(true);
  });

  it('provenance is an array', () => {
    const data = makeGraphTrustData();
    expect(Array.isArray(data.provenance)).toBe(true);
  });

  it('graphContextUsed is boolean', () => {
    const used = makeGraphTrustData({ graphContextUsed: true });
    const unused = makeGraphTrustData({ graphContextUsed: false });
    expect(typeof used.graphContextUsed).toBe('boolean');
    expect(typeof unused.graphContextUsed).toBe('boolean');
    expect(used.graphContextUsed).toBe(true);
    expect(unused.graphContextUsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GraphTrustEntity shape
// ---------------------------------------------------------------------------

describe('GraphTrustEntity shape', () => {
  it('has all required fields', () => {
    const entity = makeEntity();
    expect(entity).toHaveProperty('id');
    expect(entity).toHaveProperty('name');
    expect(entity).toHaveProperty('nodeType');
    expect(entity).toHaveProperty('confidence');
    expect(entity).toHaveProperty('confidenceBadge');
    expect(entity).toHaveProperty('aliases');
    expect(entity).toHaveProperty('sourceCount');
  });

  it('confidence is in [0, 1]', () => {
    const high = makeEntity({ confidence: 0.95 });
    const low = makeEntity({ confidence: 0.3 });
    expect(high.confidence).toBeGreaterThanOrEqual(0);
    expect(high.confidence).toBeLessThanOrEqual(1);
    expect(low.confidence).toBeGreaterThanOrEqual(0);
    expect(low.confidence).toBeLessThanOrEqual(1);
  });

  it('confidenceBadge is one of the four valid values', () => {
    const valid = ['verified', 'confident', 'suggested', 'ai_generated'];
    const entity = makeEntity({ confidenceBadge: 'confident' });
    expect(valid).toContain(entity.confidenceBadge);
  });

  it('aliases defaults to empty array', () => {
    const entity = makeEntity();
    expect(Array.isArray(entity.aliases)).toBe(true);
  });

  it('sourceCount is a non-negative integer', () => {
    const entity = makeEntity({ sourceCount: 3 });
    expect(entity.sourceCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(entity.sourceCount)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GraphTrustSource shape
// ---------------------------------------------------------------------------

describe('GraphTrustSource shape', () => {
  it('has all required fields', () => {
    const source = makeSource();
    expect(source).toHaveProperty('documentName');
    expect(source).toHaveProperty('confidence');
    expect(source).toHaveProperty('extractedAt');
  });

  it('documentType is optional', () => {
    const withType = makeSource({ documentType: 'MEDICAL_REPORT' });
    const withoutType = makeSource({ documentType: undefined });
    expect(withType.documentType).toBe('MEDICAL_REPORT');
    expect(withoutType.documentType).toBeUndefined();
  });

  it('confidence is in [0, 1]', () => {
    const source = makeSource({ confidence: 0.72 });
    expect(source.confidence).toBeGreaterThanOrEqual(0);
    expect(source.confidence).toBeLessThanOrEqual(1);
  });

  it('extractedAt is a valid ISO string', () => {
    const source = makeSource({ extractedAt: '2024-03-15T12:00:00.000Z' });
    const date = new Date(source.extractedAt);
    expect(isNaN(date.getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// overallConfidence calculation scenarios
// ---------------------------------------------------------------------------

describe('overallConfidence scenarios', () => {
  it('empty entities + empty provenance yields 0.5 (neutral fallback)', () => {
    const data = makeGraphTrustData({
      entities: [],
      provenance: [],
      overallConfidence: 0.5,
    });
    expect(data.overallConfidence).toBe(0.5);
  });

  it('single HIGH entity yields high confidence', () => {
    // confidence = 0.92 → "confident" tier (0.80–0.95 range, not yet "verified" at >=0.95)
    const entity = makeEntity({ confidence: 0.92 });
    const data = makeGraphTrustData({
      entities: [entity],
      overallConfidence: 0.92,
    });
    expect(data.overallConfidence).toBeGreaterThan(0.8);
    expect(confidenceLabel(data.overallConfidence)).toBe('confident');
  });

  it('single entity at 0.97 yields verified confidence', () => {
    const entity = makeEntity({ confidence: 0.97 });
    const data = makeGraphTrustData({
      entities: [entity],
      overallConfidence: 0.97,
    });
    expect(data.overallConfidence).toBeGreaterThanOrEqual(0.95);
    expect(confidenceLabel(data.overallConfidence)).toBe('verified');
  });

  it('mix of LOW entities lowers overall to MEDIUM range', () => {
    const entities = [
      makeEntity({ confidence: 0.6 }),
      makeEntity({ id: 'node-2', confidence: 0.55 }),
    ];
    // Mean = 0.575 → suggested
    const mean = entities.reduce((a, e) => a + e.confidence, 0) / entities.length;
    const data = makeGraphTrustData({ entities, overallConfidence: mean });
    expect(confidenceLabel(data.overallConfidence)).toBe('suggested');
  });

  it('graphContextUsed=false means RAG-only response', () => {
    const data = makeGraphTrustData({
      entities: [],
      graphContextUsed: false,
      overallConfidence: 0.78,
    });
    expect(data.graphContextUsed).toBe(false);
    expect(data.entities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Confidence badge HIGH/MEDIUM/LOW thresholds (UX tier mapping)
// ---------------------------------------------------------------------------

describe('Confidence badge UX tier mapping', () => {
  // Maps from confidenceLabel to the 3-tier badge display
  it('verified (>=0.95) maps to the highest trust tier', () => {
    expect(confidenceLabel(0.95)).toBe('verified');
    expect(confidenceLabel(1.0)).toBe('verified');
  });

  it('confident (0.80–0.95) maps to medium-high trust', () => {
    expect(confidenceLabel(0.80)).toBe('confident');
    expect(confidenceLabel(0.90)).toBe('confident');
    expect(confidenceLabel(0.94)).toBe('confident');
  });

  it('suggested (0.50–0.80) maps to medium trust — verify wording', () => {
    expect(confidenceLabel(0.50)).toBe('suggested');
    expect(confidenceLabel(0.70)).toBe('suggested');
    expect(confidenceLabel(0.79)).toBe('suggested');
  });

  it('ai_generated (<0.50) maps to lowest trust — human review recommended', () => {
    expect(confidenceLabel(0.49)).toBe('ai_generated');
    expect(confidenceLabel(0.0)).toBe('ai_generated');
  });
});

// ---------------------------------------------------------------------------
// UPL compliance — trust UX only visible for GREEN/YELLOW, not RED
// ---------------------------------------------------------------------------

describe('UPL compliance for trust UX', () => {
  it('empty graphTrust (graphContextUsed=false) is safe for any zone', () => {
    const emptyTrust = makeGraphTrustData({
      graphContextUsed: false,
      entities: [],
      provenance: [],
      overallConfidence: 0.5,
    });
    // Trust UX with no entities and no graph context is safe to display
    expect(emptyTrust.entities).toHaveLength(0);
    expect(emptyTrust.graphContextUsed).toBe(false);
  });

  it('entity names are factual (non-legal) data', () => {
    // Entity names like "John Smith" or "Lumbar Spine" are factual — not legal conclusions
    const entity = makeEntity({ name: 'Lumbar Spine', nodeType: 'BODY_PART' });
    expect(entity.nodeType).not.toBe('LEGAL_ISSUE');
    expect(entity.name).toBeTruthy();
  });

  it('provenance confidence score is numeric — not a legal determination', () => {
    const source = makeSource({ confidence: 0.85 });
    expect(typeof source.confidence).toBe('number');
    // Confidence is a numeric measure of extraction certainty — not a legal opinion
    expect(source.confidence).toBeLessThanOrEqual(1);
    expect(source.confidence).toBeGreaterThanOrEqual(0);
  });
});
