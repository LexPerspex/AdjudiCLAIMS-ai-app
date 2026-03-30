import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Draft generation service tests.
 *
 * Tests the AI-assisted draft generation and iterative refinement:
 * - generateDraft produces content from template + claim data
 * - AI-generated flag set correctly
 * - UPL validation applied (prohibited content blocked)
 * - Missing fields tracked
 * - Graph context included when available
 * - refineDraft modifies existing draft
 * - Iteration count increments
 * - Refinement instructions passed to LLM
 * - getDraftHistory returns chronological history
 * - Empty claim data handled gracefully
 * - Unknown template ID throws
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_CLAIM = {
  id: 'claim-1',
  claimNumber: 'WC-2025-00123',
  claimantName: 'John Smith',
  dateOfInjury: new Date('2025-06-15'),
  bodyParts: ['lumbar spine', 'left shoulder'],
  employer: 'Acme Corp',
  insurer: 'Pacific Insurance',
  status: 'OPEN',
  dateReceived: new Date('2025-06-20'),
  assignedExaminer: { name: 'Jane Examiner' },
};

const MOCK_EXTRACTED_FIELDS = [
  { fieldName: 'awe', fieldValue: '$1,200.00' },
  { fieldName: 'tdRate', fieldValue: '$800.00' },
];

const MOCK_GENERATED_LETTER = {
  id: 'draft-1',
  claimId: 'claim-1',
  userId: 'user-1',
  letterType: 'TD_BENEFIT_EXPLANATION',
  content: '# Test Draft\n\nClaim WC-2025-00123 for John Smith.',
  templateId: 'td_benefit_explanation',
  populatedData: {
    claimNumber: 'WC-2025-00123',
    aiGenerated: 'true',
    iterationCount: '0',
    revisionHistory: '[]',
  },
  createdAt: new Date('2025-07-01'),
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockClaimFindUnique = vi.fn();
const mockExtractedFieldFindMany = vi.fn();
const mockGeneratedLetterCreate = vi.fn();
const mockGeneratedLetterFindUnique = vi.fn();
const mockGeneratedLetterUpdate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    },
    extractedField: {
      findMany: (...args: unknown[]) => mockExtractedFieldFindMany(...args) as unknown,
    },
    generatedLetter: {
      create: (...args: unknown[]) => mockGeneratedLetterCreate(...args) as unknown,
      findUnique: (...args: unknown[]) => mockGeneratedLetterFindUnique(...args) as unknown,
      update: (...args: unknown[]) => mockGeneratedLetterUpdate(...args) as unknown,
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock LLM adapter
// ---------------------------------------------------------------------------

const mockGenerate = vi.fn();

vi.mock('../../server/lib/llm/index.js', () => ({
  getLLMAdapter: () => ({
    provider: 'gemini',
    modelId: 'gemini-2.0-flash-lite',
    generate: (...args: unknown[]) => mockGenerate(...args) as unknown,
  }),
}));

// ---------------------------------------------------------------------------
// Mock UPL validator
// ---------------------------------------------------------------------------

const mockValidateOutput = vi.fn();

vi.mock('../../server/services/upl-validator.service.js', () => ({
  validateOutput: (...args: unknown[]) => mockValidateOutput(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Mock graph services
// ---------------------------------------------------------------------------

const mockGetClaimGraphSummary = vi.fn();
const mockQueryGraphForExaminer = vi.fn();
const mockFormatGraphContext = vi.fn();

vi.mock('../../server/services/graph/graph-traversal.service.js', () => ({
  getClaimGraphSummary: (...args: unknown[]) => mockGetClaimGraphSummary(...args) as unknown,
}));

vi.mock('../../server/services/graph/examiner-graph-access.service.js', () => ({
  queryGraphForExaminer: (...args: unknown[]) => mockQueryGraphForExaminer(...args) as unknown,
  formatGraphContext: (...args: unknown[]) => mockFormatGraphContext(...args) as unknown,
}));

// ---------------------------------------------------------------------------
// Mock json-array utility
// ---------------------------------------------------------------------------

vi.mock('../../server/lib/json-array.js', () => ({
  parseJsonStringArray: (val: unknown) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return []; }
    }
    return [];
  },
}));

// ---------------------------------------------------------------------------
// Import service under test (AFTER mocks)
// ---------------------------------------------------------------------------

import { generateDraft, refineDraft, getDraftHistory } from '../../server/services/draft-generation.service.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: claim exists
  mockClaimFindUnique.mockResolvedValue(MOCK_CLAIM);
  mockExtractedFieldFindMany.mockResolvedValue(MOCK_EXTRACTED_FIELDS);

  // Default: LLM returns content
  mockGenerate.mockResolvedValue({
    content: '# Generated Draft\n\nClaim WC-2025-00123 for John Smith at Acme Corp.\n\n**Date of Injury:** 2025-06-15\n**Body Parts:** lumbar spine, left shoulder',
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    usage: { inputTokens: 500, outputTokens: 300 },
    finishReason: 'stop',
  });

  // Default: UPL validation passes
  mockValidateOutput.mockReturnValue({ result: 'PASS', violations: [] });

  // Default: graph context
  mockGetClaimGraphSummary.mockResolvedValue({ maturityLabel: 'GROWING' });
  mockQueryGraphForExaminer.mockResolvedValue({
    nodes: [{ id: 'n1', nodeType: 'PERSON', canonicalName: 'John Smith' }],
    edges: [],
    disclaimer: null,
    wasFiltered: false,
    filterStats: { nodesRemoved: 0, edgesRemoved: 0, propertiesStripped: 0 },
  });
  mockFormatGraphContext.mockReturnValue('## CLAIM KNOWLEDGE GRAPH\n### Key Entities\n- PERSON: John Smith');

  // Default: DB create returns record
  mockGeneratedLetterCreate.mockResolvedValue(MOCK_GENERATED_LETTER);
  mockGeneratedLetterFindUnique.mockResolvedValue(MOCK_GENERATED_LETTER);
  mockGeneratedLetterUpdate.mockResolvedValue({ ...MOCK_GENERATED_LETTER, content: 'Updated' });
});

// ---------------------------------------------------------------------------
// Tests: generateDraft
// ---------------------------------------------------------------------------

describe('generateDraft', () => {
  it('produces content from template + claim data', async () => {
    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.draftId).toBe('draft-1');
    expect(result.templateId).toBe('td_benefit_explanation');
    expect(result.content).toContain('Generated Draft');
    expect(result.title).toBe('TD Benefit Rate Explanation Letter');
  });

  it('sets aiGenerated to true when LLM generates content', async () => {
    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.aiGenerated).toBe(true);
  });

  it('sets aiGenerated to false in stub mode', async () => {
    mockGenerate.mockResolvedValue({
      content: 'stub content',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'STUB',
    });

    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.aiGenerated).toBe(false);
  });

  it('applies UPL validation and blocks prohibited content', async () => {
    mockValidateOutput.mockReturnValue({
      result: 'FAIL',
      violations: [{ pattern: 'legal advice', severity: 'CRITICAL' }],
    });

    await expect(
      generateDraft({
        claimId: 'claim-1',
        userId: 'user-1',
        templateId: 'td_benefit_explanation',
      }),
    ).rejects.toThrow('prohibited language');
  });

  it('tracks populated and missing fields', async () => {
    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.populatedFields).toContain('claimNumber');
    expect(result.populatedFields).toContain('claimantName');
    expect(result.populatedFields).toContain('awe');
    expect(result.populatedFields).toContain('tdRate');
    // Every field should be populated given our mock data
    expect(Array.isArray(result.missingFields)).toBe(true);
  });

  it('includes graph context when available', async () => {
    await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    // Verify graph services were called
    expect(mockGetClaimGraphSummary).toHaveBeenCalledWith('claim-1');
    expect(mockQueryGraphForExaminer).toHaveBeenCalledWith('claim-1', 'GREEN', {
      maxNodes: 20,
      maxEdges: 30,
    });

    // Verify LLM received graph context in its prompt
    const llmCall = mockGenerate.mock.calls[0]![0];
    expect(llmCall.messages[0].content).toContain('GRAPH CONTEXT');
  });

  it('skips graph context when maturity is NASCENT', async () => {
    mockGetClaimGraphSummary.mockResolvedValue({ maturityLabel: 'NASCENT' });

    await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(mockQueryGraphForExaminer).not.toHaveBeenCalled();
  });

  it('continues without graph context on graph failure', async () => {
    mockGetClaimGraphSummary.mockRejectedValue(new Error('Graph unavailable'));

    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    // Should still succeed
    expect(result.draftId).toBe('draft-1');
  });

  it('throws for unknown template ID', async () => {
    await expect(
      generateDraft({
        claimId: 'claim-1',
        userId: 'user-1',
        templateId: 'nonexistent_template',
      }),
    ).rejects.toThrow('Unknown template: "nonexistent_template"');
  });

  it('throws when claim not found', async () => {
    mockClaimFindUnique.mockResolvedValue(null);

    await expect(
      generateDraft({
        claimId: 'claim-999',
        userId: 'user-1',
        templateId: 'td_benefit_explanation',
      }),
    ).rejects.toThrow('Claim not found');
  });

  it('handles empty claim data gracefully', async () => {
    mockClaimFindUnique.mockResolvedValue({
      ...MOCK_CLAIM,
      bodyParts: [],
      assignedExaminer: null,
    });
    mockExtractedFieldFindMany.mockResolvedValue([]);

    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.missingFields.length).toBeGreaterThan(0);
    expect(result.draftId).toBe('draft-1');
  });

  it('passes user instructions to LLM prompt', async () => {
    await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
      instructions: 'Emphasize the 3-day waiting period',
    });

    const llmCall = mockGenerate.mock.calls[0]![0];
    expect(llmCall.messages[0].content).toContain('Emphasize the 3-day waiting period');
    expect(llmCall.messages[0].content).toContain('ADDITIONAL INSTRUCTIONS');
  });

  it('applies field overrides', async () => {
    await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
      overrides: { statutoryMin: '$242.86', statutoryMax: '$1,619.15' },
    });

    const llmCall = mockGenerate.mock.calls[0]![0];
    expect(llmCall.messages[0].content).toContain('$242.86');
    expect(llmCall.messages[0].content).toContain('$1,619.15');
  });

  it('persists draft to GeneratedLetter table', async () => {
    await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(mockGeneratedLetterCreate).toHaveBeenCalledTimes(1);
    const createArg = mockGeneratedLetterCreate.mock.calls[0]![0];
    expect(createArg.data.claimId).toBe('claim-1');
    expect(createArg.data.userId).toBe('user-1');
    expect(createArg.data.templateId).toBe('td_benefit_explanation');
  });

  it('returns GREEN uplZone', async () => {
    const result = await generateDraft({
      claimId: 'claim-1',
      userId: 'user-1',
      templateId: 'td_benefit_explanation',
    });

    expect(result.uplZone).toBe('GREEN');
  });
});

// ---------------------------------------------------------------------------
// Tests: refineDraft
// ---------------------------------------------------------------------------

describe('refineDraft', () => {
  it('modifies existing draft with instruction', async () => {
    mockGenerate.mockResolvedValue({
      content: '# Updated Draft\n\nRevised content.\n\nCHANGES: Added WPI rating section.',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 600, outputTokens: 400 },
      finishReason: 'stop',
    });

    const result = await refineDraft({
      draftId: 'draft-1',
      instruction: 'Add the physician WPI rating',
      userId: 'user-1',
    });

    expect(result.draftId).toBe('draft-1');
    expect(result.content).toContain('Updated Draft');
    expect(result.changesSummary).toContain('WPI rating');
  });

  it('increments iteration count', async () => {
    mockGenerate.mockResolvedValue({
      content: '# Updated\n\nCHANGES: Minor edit.',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 100, outputTokens: 100 },
      finishReason: 'stop',
    });

    const result = await refineDraft({
      draftId: 'draft-1',
      instruction: 'Fix typo',
      userId: 'user-1',
    });

    expect(result.iterationCount).toBe(1);

    // Verify update was called with incremented count
    expect(mockGeneratedLetterUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mockGeneratedLetterUpdate.mock.calls[0]![0];
    expect(updateArg.data.populatedData.iterationCount).toBe('1');
  });

  it('passes refinement instruction to LLM', async () => {
    mockGenerate.mockResolvedValue({
      content: '# Refined\n\nCHANGES: Added section.',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 100, outputTokens: 100 },
      finishReason: 'stop',
    });

    await refineDraft({
      draftId: 'draft-1',
      instruction: 'Add the physician WPI rating to the medical section',
      userId: 'user-1',
    });

    const llmCall = mockGenerate.mock.calls[0]![0];
    expect(llmCall.messages[0].content).toContain('Add the physician WPI rating');
    expect(llmCall.messages[0].content).toContain('CURRENT DRAFT');
    expect(llmCall.messages[0].content).toContain('REFINEMENT INSTRUCTION');
  });

  it('throws for nonexistent draft', async () => {
    mockGeneratedLetterFindUnique.mockResolvedValue(null);

    await expect(
      refineDraft({
        draftId: 'nonexistent',
        instruction: 'Fix it',
        userId: 'user-1',
      }),
    ).rejects.toThrow('Draft not found');
  });

  it('blocks refinement that produces prohibited content', async () => {
    mockGenerate.mockResolvedValue({
      content: 'I recommend you settle this claim for $50,000.',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 100, outputTokens: 100 },
      finishReason: 'stop',
    });
    mockValidateOutput.mockReturnValue({
      result: 'FAIL',
      violations: [{ pattern: 'legal advice', severity: 'CRITICAL' }],
    });

    await expect(
      refineDraft({
        draftId: 'draft-1',
        instruction: 'Add settlement recommendation',
        userId: 'user-1',
      }),
    ).rejects.toThrow('prohibited language');
  });

  it('saves revision history to metadata', async () => {
    mockGenerate.mockResolvedValue({
      content: '# Updated\n\nCHANGES: Fixed formatting.',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 100, outputTokens: 100 },
      finishReason: 'stop',
    });

    await refineDraft({
      draftId: 'draft-1',
      instruction: 'Fix formatting',
      userId: 'user-1',
    });

    const updateArg = mockGeneratedLetterUpdate.mock.calls[0]![0];
    const revisionHistory = JSON.parse(updateArg.data.populatedData.revisionHistory);
    expect(revisionHistory).toHaveLength(1);
    expect(revisionHistory[0].iteration).toBe(0);
    expect(revisionHistory[0].content).toBe(MOCK_GENERATED_LETTER.content);
  });
});

// ---------------------------------------------------------------------------
// Tests: getDraftHistory
// ---------------------------------------------------------------------------

describe('getDraftHistory', () => {
  it('returns chronological history', async () => {
    const historyData = [
      {
        iteration: 0,
        content: 'Initial draft',
        instruction: 'Initial generation',
        timestamp: '2025-07-01T00:00:00.000Z',
      },
      {
        iteration: 1,
        content: 'First revision',
        instruction: 'Add WPI rating',
        timestamp: '2025-07-01T01:00:00.000Z',
      },
    ];

    mockGeneratedLetterFindUnique.mockResolvedValue({
      ...MOCK_GENERATED_LETTER,
      populatedData: {
        ...MOCK_GENERATED_LETTER.populatedData,
        iterationCount: '2',
        revisionHistory: JSON.stringify(historyData),
      },
    });

    const history = await getDraftHistory('draft-1');

    expect(history).toHaveLength(2);
    expect(history[0]!.iteration).toBe(0);
    expect(history[0]!.content).toBe('Initial draft');
    expect(history[0]!.instruction).toBe('Initial generation');
    expect(history[0]!.timestamp).toBeInstanceOf(Date);
    expect(history[1]!.iteration).toBe(1);
    expect(history[1]!.instruction).toBe('Add WPI rating');
  });

  it('returns empty array for draft with no revisions', async () => {
    const history = await getDraftHistory('draft-1');

    expect(history).toHaveLength(0);
  });

  it('throws for nonexistent draft', async () => {
    mockGeneratedLetterFindUnique.mockResolvedValue(null);

    await expect(getDraftHistory('nonexistent')).rejects.toThrow('Draft not found');
  });

  it('handles malformed revision history gracefully', async () => {
    mockGeneratedLetterFindUnique.mockResolvedValue({
      ...MOCK_GENERATED_LETTER,
      populatedData: {
        ...MOCK_GENERATED_LETTER.populatedData,
        revisionHistory: 'not valid json',
      },
    });

    const history = await getDraftHistory('draft-1');
    expect(history).toHaveLength(0);
  });
});
