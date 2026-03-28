import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for document generation service.
 *
 * Tests template lookup, field substitution, missing field detection,
 * and all 5 document templates.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_CLAIM = {
  id: 'claim-gen-1',
  claimNumber: 'WC-2026-0042',
  claimantName: 'Maria Garcia',
  dateOfInjury: new Date('2026-02-10'),
  bodyParts: ['right shoulder', 'cervical spine'],
  employer: 'Pacific Industries',
  insurer: 'Pacific Insurance Co.',
  status: 'OPEN',
  dateReceived: new Date('2026-02-15'),
  assignedExaminer: { name: 'Jane Examiner' },
};

const MOCK_EXTRACTED_FIELDS = [
  { fieldName: 'awe', fieldValue: '$1,200.00' },
  { fieldName: 'tdRate', fieldValue: '$800.00' },
  { fieldName: 'statutoryMin', fieldValue: '$230.95' },
  { fieldName: 'statutoryMax', fieldValue: '$1,619.15' },
];

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockClaimFindUnique = vi.fn();
const mockExtractedFieldFindMany = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args),
    },
    extractedField: {
      findMany: (...args: unknown[]) => mockExtractedFieldFindMany(...args),
    },
  },
}));

// Dynamic import after mocks
const {
  getAvailableTemplates,
  getTemplate,
  generateDocument,
} = await import('../../server/services/document-generation.service.js');

// ---------------------------------------------------------------------------
// Tests: getAvailableTemplates
// ---------------------------------------------------------------------------

describe('getAvailableTemplates', () => {
  it('returns all 5 templates', () => {
    const templates = getAvailableTemplates();
    expect(templates).toHaveLength(5);
  });

  it('includes all expected template IDs', () => {
    const templates = getAvailableTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('employer_notification_lc3761');
    expect(ids).toContain('td_benefit_explanation');
    expect(ids).toContain('delay_notice');
    expect(ids).toContain('benefit_payment_schedule');
    expect(ids).toContain('counsel_referral_summary');
  });

  it('all templates have required fields listed', () => {
    const templates = getAvailableTemplates();
    for (const t of templates) {
      expect(t.requiredFields.length).toBeGreaterThan(0);
      expect(t.template.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.statutoryAuthority.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: getTemplate
// ---------------------------------------------------------------------------

describe('getTemplate', () => {
  it('returns template by ID', () => {
    const template = getTemplate('employer_notification_lc3761');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('employer_notification_lc3761');
    expect(template!.title).toBe('Employer Notification of Claim (LC 3761)');
  });

  it('returns null for unknown template ID', () => {
    const template = getTemplate('nonexistent_template');
    expect(template).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: generateDocument
// ---------------------------------------------------------------------------

describe('generateDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaimFindUnique.mockResolvedValue(MOCK_CLAIM);
    mockExtractedFieldFindMany.mockResolvedValue(MOCK_EXTRACTED_FIELDS);
  });

  it('throws for unknown template ID', async () => {
    await expect(generateDocument('nonexistent', 'claim-1')).rejects.toThrow(
      'Unknown template: "nonexistent"',
    );
  });

  it('throws for unknown claim ID', async () => {
    mockClaimFindUnique.mockResolvedValueOnce(null);

    await expect(
      generateDocument('employer_notification_lc3761', 'missing-claim'),
    ).rejects.toThrow('Claim not found: "missing-claim"');
  });

  // --- Employer notification ---

  it('generates employer notification with all fields populated', async () => {
    const result = await generateDocument('employer_notification_lc3761', 'claim-gen-1');

    expect(result.templateId).toBe('employer_notification_lc3761');
    expect(result.title).toBe('Employer Notification of Claim (LC 3761)');
    expect(result.content).toContain('WC-2026-0042');
    expect(result.content).toContain('Maria Garcia');
    expect(result.content).toContain('Pacific Industries');
    expect(result.content).toContain('Pacific Insurance Co.');
    expect(result.content).toContain('2026-02-10');
    expect(result.content).toContain('right shoulder, cervical spine');
    expect(result.content).toContain('Jane Examiner');
    expect(result.content).toContain('Labor Code Section 3761');
    expect(result.missingFields).toEqual([]);
  });

  // --- TD benefit explanation ---

  it('generates TD benefit explanation with extracted field data', async () => {
    const result = await generateDocument('td_benefit_explanation', 'claim-gen-1');

    expect(result.templateId).toBe('td_benefit_explanation');
    expect(result.content).toContain('$1,200.00'); // AWE
    expect(result.content).toContain('$800.00');    // TD rate
    expect(result.content).toContain('$230.95');    // min
    expect(result.content).toContain('$1,619.15');  // max
    expect(result.content).toContain('LC 4653');
    expect(result.missingFields).toEqual([]);
  });

  it('reports missing fields for TD template when extracted fields are absent', async () => {
    mockExtractedFieldFindMany.mockResolvedValueOnce([]);

    const result = await generateDocument('td_benefit_explanation', 'claim-gen-1');

    expect(result.missingFields).toContain('awe');
    expect(result.missingFields).toContain('tdRate');
    expect(result.missingFields).toContain('statutoryMin');
    expect(result.missingFields).toContain('statutoryMax');
    expect(result.content).toContain('[MISSING: awe]');
    expect(result.content).toContain('[MISSING: tdRate]');
  });

  // --- Delay notice ---

  it('generates delay notice with overrides', async () => {
    const result = await generateDocument('delay_notice', 'claim-gen-1', {
      delayReason: 'Awaiting QME evaluation scheduled for 2026-04-15.',
      outstandingItems: '- QME evaluation\n- Updated medical records',
      expectedResolutionDate: '2026-05-01',
    });

    expect(result.templateId).toBe('delay_notice');
    expect(result.content).toContain('Awaiting QME evaluation');
    expect(result.content).toContain('QME evaluation');
    expect(result.content).toContain('2026-05-01');
    expect(result.content).toContain('10 CCR 2695.7(c)');
    expect(result.missingFields).toEqual([]);
  });

  it('reports missing delay-specific fields without overrides', async () => {
    const result = await generateDocument('delay_notice', 'claim-gen-1');

    expect(result.missingFields).toContain('delayReason');
    expect(result.missingFields).toContain('outstandingItems');
    expect(result.missingFields).toContain('expectedResolutionDate');
  });

  // --- Benefit payment schedule ---

  it('generates benefit payment schedule with overrides', async () => {
    const result = await generateDocument('benefit_payment_schedule', 'claim-gen-1', {
      tdRate: '$800.00',
      paymentStartDate: '2026-02-24',
      paymentFrequency: 'Biweekly (every 14 days)',
    });

    expect(result.templateId).toBe('benefit_payment_schedule');
    expect(result.content).toContain('$800.00');
    expect(result.content).toContain('2026-02-24');
    expect(result.content).toContain('Biweekly');
    expect(result.content).toContain('LC 4650(b)');
    expect(result.content).toContain('LC 4650(c)');
    expect(result.missingFields).toEqual([]);
  });

  it('reports missing payment-specific fields without overrides', async () => {
    mockExtractedFieldFindMany.mockResolvedValueOnce([]);

    const result = await generateDocument('benefit_payment_schedule', 'claim-gen-1');

    expect(result.missingFields).toContain('tdRate');
    expect(result.missingFields).toContain('paymentStartDate');
    expect(result.missingFields).toContain('paymentFrequency');
  });

  // --- Counsel referral summary ---

  it('generates counsel referral summary with overrides', async () => {
    const result = await generateDocument('counsel_referral_summary', 'claim-gen-1', {
      referralReason: 'Disputed causation — conflicting medical opinions regarding cervical spine.',
    });

    expect(result.templateId).toBe('counsel_referral_summary');
    expect(result.content).toContain('Disputed causation');
    expect(result.content).toContain('Maria Garcia');
    expect(result.content).toContain('Pacific Industries');
    expect(result.content).toContain('factual information only');
    expect(result.missingFields).toEqual([]);
  });

  it('reports missing referralReason without override', async () => {
    const result = await generateDocument('counsel_referral_summary', 'claim-gen-1');

    expect(result.missingFields).toContain('referralReason');
    expect(result.content).toContain('[MISSING: referralReason]');
  });

  // --- Field substitution edge cases ---

  it('uses overrides over claim data when both exist', async () => {
    const result = await generateDocument('employer_notification_lc3761', 'claim-gen-1', {
      examinerName: 'Override Examiner',
    });

    expect(result.content).toContain('Override Examiner');
    expect(result.content).not.toContain('Jane Examiner');
  });

  it('handles claim with no assigned examiner gracefully', async () => {
    mockClaimFindUnique.mockResolvedValueOnce({
      ...MOCK_CLAIM,
      assignedExaminer: null,
    });

    const result = await generateDocument('employer_notification_lc3761', 'claim-gen-1');

    expect(result.missingFields).toContain('examinerName');
    expect(result.content).toContain('[MISSING: examinerName]');
  });

  it('handles empty body parts array', async () => {
    mockClaimFindUnique.mockResolvedValueOnce({
      ...MOCK_CLAIM,
      bodyParts: [],
    });

    const result = await generateDocument('employer_notification_lc3761', 'claim-gen-1');

    expect(result.missingFields).toContain('bodyParts');
  });

  it('all templates contain UPL disclaimer', () => {
    const templates = getAvailableTemplates();
    for (const t of templates) {
      expect(
        t.template.includes('does not constitute legal advice') ||
        t.template.includes('factual information only') ||
        t.template.includes('factual notification') ||
        t.template.includes('factual explanation') ||
        t.template.includes('factual payment schedule'),
      ).toBe(true);
    }
  });

  it('deduplicates missing fields when same placeholder appears multiple times', async () => {
    // claimNumber appears multiple times in most templates
    mockClaimFindUnique.mockResolvedValueOnce({
      ...MOCK_CLAIM,
      claimNumber: '',
    });

    const result = await generateDocument('employer_notification_lc3761', 'claim-gen-1');

    // claimNumber appears multiple times in the template but should only be listed once
    const claimNumberCount = result.missingFields.filter((f) => f === 'claimNumber').length;
    expect(claimNumberCount).toBeLessThanOrEqual(1);
  });
});
