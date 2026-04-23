/**
 * @Developed & Documented by Glass Box Solutions, Inc. using human ingenuity and modern technology
 *
 * MTUS guideline knowledge-base data integrity tests.
 *
 * Verifies that the bundled MTUS knowledge base meets the AJC-15 contract:
 *   - Exactly 41 distinct guideline entries
 *   - Coverage of every required topical category (body parts + cross-cutting)
 *   - Real DWC MTUS citations matching `8 CCR 9792.\d+` format
 *   - GREEN-zone language compliance (no first/second-person directives)
 *   - All required fields populated and non-empty
 *   - No duplicate guideline IDs
 *   - Unique title per category to ease examiner UX
 *
 * UPL zone: GREEN — these are factual data integrity checks.
 */

import { describe, it, expect } from 'vitest';
import {
  MTUS_GUIDELINES,
  BODY_PART_TO_CATEGORY,
  CPT_TO_CATEGORY,
  getAllMtusGuidelines,
  MTUS_GUIDELINE_COUNT,
  type MtusCategory,
} from '../../server/data/mtus-guidelines.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All categories required by AJC-15. */
const REQUIRED_CATEGORIES: MtusCategory[] = [
  'low-back',
  'neck',
  'shoulder',
  'elbow',
  'hand-wrist',
  'knee',
  'ankle-foot',
  'chronic-pain',
  'opioids',
  'acupuncture',
  'formulary',
  'methodology',
];

/** AJC-15 target: 41 distinct MTUS guideline entries. */
const TARGET_ENTRY_COUNT = 41;

/** Minimum entries per category to ensure each topic is meaningfully covered. */
const MIN_ENTRIES_PER_CATEGORY: Record<MtusCategory, number> = {
  'low-back': 4, // Most common WC injury, expect ≥4
  'neck': 2,
  'shoulder': 2,
  'elbow': 2,
  'hand-wrist': 2,
  'knee': 2,
  'ankle-foot': 2,
  'chronic-pain': 3,
  'opioids': 2,
  'acupuncture': 2,
  'formulary': 2,
  'methodology': 2,
};

/** Real DWC MTUS sections live at 8 CCR §9792.20 through §9792.27. */
const VALID_CCR_CITATION = /^8 CCR 9792\.\d+(\.\d+)?( —|$)/;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MTUS Guidelines Data — count and category coverage', () => {
  it('contains exactly 41 distinct guideline entries (AJC-15 target)', () => {
    const entries = getAllMtusGuidelines();
    expect(entries.length).toBe(TARGET_ENTRY_COUNT);
    expect(MTUS_GUIDELINE_COUNT).toBe(TARGET_ENTRY_COUNT);
  });

  it('has at least one entry in every required category', () => {
    for (const cat of REQUIRED_CATEGORIES) {
      const entries = MTUS_GUIDELINES[cat];
      expect(entries).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  it('meets the minimum entry count per category', () => {
    for (const cat of REQUIRED_CATEGORIES) {
      const entries = MTUS_GUIDELINES[cat];
      const min = MIN_ENTRIES_PER_CATEGORY[cat];
      expect(
        entries.length,
        `category ${cat} has ${String(entries.length)} entries, need ≥${String(min)}`,
      ).toBeGreaterThanOrEqual(min);
    }
  });

  it('has no extra categories beyond the required set', () => {
    const declaredCategories = Object.keys(MTUS_GUIDELINES) as MtusCategory[];
    const required = new Set<string>(REQUIRED_CATEGORIES);
    for (const cat of declaredCategories) {
      expect(required.has(cat), `unexpected category ${cat}`).toBe(true);
    }
  });
});

describe('MTUS Guidelines Data — citation format', () => {
  it('every entry has a sourceSection citing 8 CCR 9792.x format', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(
        entry.sourceSection,
        `entry ${entry.guidelineId} has invalid citation: ${entry.sourceSection}`,
      ).toMatch(VALID_CCR_CITATION);
    }
  });

  it('every guidelineText cites at least the chapter (9792.X) of its sourceSection', () => {
    for (const entry of getAllMtusGuidelines()) {
      // Extract the §9792.X chapter (e.g., "8 CCR 9792.23.5 — ..." -> "9792.23")
      const match = entry.sourceSection.match(/9792\.(\d+)/);
      expect(match, `cannot extract chapter from ${entry.sourceSection}`).not.toBeNull();
      const chapterDigits = match ? match[1] : '';
      const chapter = `9792.${chapterDigits ?? ''}`;
      expect(
        entry.guidelineText,
        `entry ${entry.guidelineId} guidelineText does not cite chapter ${chapter}`,
      ).toContain(chapter);
    }
  });
});

describe('MTUS Guidelines Data — required fields populated', () => {
  it('every entry has non-empty guidelineId, title, guidelineText, sourceSection', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(entry.guidelineId, 'guidelineId').toBeTruthy();
      expect(entry.title, `title for ${entry.guidelineId}`).toBeTruthy();
      expect(entry.guidelineText, `guidelineText for ${entry.guidelineId}`).toBeTruthy();
      expect(entry.guidelineText.length, `guidelineText for ${entry.guidelineId}`)
        .toBeGreaterThan(80);
      expect(entry.sourceSection, `sourceSection for ${entry.guidelineId}`).toBeTruthy();
    }
  });

  it('every entry has a relevance score in [0,1]', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(entry.relevance).toBeGreaterThanOrEqual(0);
      expect(entry.relevance).toBeLessThanOrEqual(1);
    }
  });

  it('every entry has an evidenceLevel string', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(entry.evidenceLevel, `evidenceLevel for ${entry.guidelineId}`).toBeTruthy();
    }
  });

  it('every entry has recommendedFrequency and recommendedDuration', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(entry.recommendedFrequency, `frequency for ${entry.guidelineId}`).toBeTruthy();
      expect(entry.recommendedDuration, `duration for ${entry.guidelineId}`).toBeTruthy();
    }
  });
});

describe('MTUS Guidelines Data — uniqueness', () => {
  it('no duplicate guidelineIds across all entries', () => {
    const ids = getAllMtusGuidelines().map((e) => e.guidelineId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('no duplicate titles within a category', () => {
    for (const [cat, entries] of Object.entries(MTUS_GUIDELINES)) {
      const titles = entries.map((e) => e.title);
      const unique = new Set(titles);
      expect(unique.size, `duplicate title in category ${cat}`).toBe(titles.length);
    }
  });

  it('every guidelineId starts with the "mtus-" prefix', () => {
    for (const entry of getAllMtusGuidelines()) {
      expect(entry.guidelineId.startsWith('mtus-')).toBe(true);
    }
  });
});

describe('MTUS Guidelines Data — GREEN-zone UPL compliance', () => {
  /**
   * Words and phrases that would frame the AI as making clinical recommendations
   * to a specific patient. The MTUS knowledge base is meant to surface guideline
   * criteria (factual), not direct treatment.
   */
  const PROHIBITED_PATTERNS: RegExp[] = [
    /\byou should\b/i,
    /\byou must\b/i,
    /\bwe recommend\b/i,
    /\bI advise\b/i,
    /\bI recommend\b/i,
    /\byou need to\b/i,
    /\bauthorize this\b/i,
    /\bapprove this treatment\b/i,
    /\bdeny this treatment\b/i,
    /\bthe patient should\b/i,
    /\bthe claimant should\b/i,
  ];

  it('no entry contains first/second-person directives or authorization language', () => {
    for (const entry of getAllMtusGuidelines()) {
      for (const pattern of PROHIBITED_PATTERNS) {
        expect(
          entry.guidelineText,
          `entry ${entry.guidelineId} matches prohibited pattern ${pattern.source}`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('body-part entries cite ACOEM (the source the MTUS adopts)', () => {
    const bodyPartCategories: MtusCategory[] = [
      'low-back',
      'neck',
      'shoulder',
      'elbow',
      'hand-wrist',
      'knee',
      'ankle-foot',
    ];
    for (const cat of bodyPartCategories) {
      for (const entry of MTUS_GUIDELINES[cat]) {
        expect(
          entry.guidelineText,
          `body-part entry ${entry.guidelineId} should cite ACOEM`,
        ).toContain('ACOEM');
      }
    }
  });
});

describe('MTUS Guidelines Data — body-part alias map', () => {
  it('every alias maps to a known category', () => {
    for (const [alias, cat] of Object.entries(BODY_PART_TO_CATEGORY)) {
      expect(
        REQUIRED_CATEGORIES.includes(cat),
        `alias ${alias} maps to unknown category ${cat}`,
      ).toBe(true);
    }
  });

  it('every required category has at least one alias mapping to it', () => {
    const reachable = new Set(Object.values(BODY_PART_TO_CATEGORY));
    for (const cat of REQUIRED_CATEGORIES) {
      expect(reachable.has(cat), `category ${cat} is unreachable from any alias`).toBe(true);
    }
  });

  it('common examiner phrasings resolve correctly', () => {
    const expectations: Array<[string, MtusCategory]> = [
      ['lumbar', 'low-back'],
      ['low back pain', 'low-back'],
      ['cervical', 'neck'],
      ['rotator cuff', 'shoulder'],
      ['carpal tunnel', 'hand-wrist'],
      ['CTS', 'hand-wrist'],
      ['meniscus', 'knee'],
      ['plantar fasciitis', 'ankle-foot'],
      ['opioid', 'opioids'],
      ['acupuncture', 'acupuncture'],
    ];
    for (const [alias, expectedCat] of expectations) {
      const cat = BODY_PART_TO_CATEGORY[alias.toLowerCase()];
      expect(cat, `alias "${alias}" should map to ${expectedCat}`).toBe(expectedCat);
    }
  });
});

describe('MTUS Guidelines Data — CPT code mapping', () => {
  it('every CPT code maps to a known category', () => {
    for (const [cpt, cat] of Object.entries(CPT_TO_CATEGORY)) {
      expect(
        REQUIRED_CATEGORIES.includes(cat),
        `CPT ${cpt} maps to unknown category ${cat}`,
      ).toBe(true);
    }
  });

  it('every CPT code is a valid 5-digit string', () => {
    for (const cpt of Object.keys(CPT_TO_CATEGORY)) {
      expect(cpt).toMatch(/^\d{5}$/);
    }
  });

  it('common WC procedure codes resolve correctly', () => {
    const expectations: Array<[string, MtusCategory]> = [
      ['72148', 'low-back'], // MRI lumbar
      ['62322', 'low-back'], // Lumbar epidural
      ['22551', 'neck'], // ACDF
      ['29827', 'shoulder'], // Arthroscopic rotator cuff repair
      ['64721', 'hand-wrist'], // Carpal tunnel release
      ['29881', 'knee'], // Arthroscopic meniscectomy
      ['97810', 'acupuncture'],
    ];
    for (const [cpt, expectedCat] of expectations) {
      expect(CPT_TO_CATEGORY[cpt], `CPT ${cpt} should map to ${expectedCat}`).toBe(expectedCat);
    }
  });
});
