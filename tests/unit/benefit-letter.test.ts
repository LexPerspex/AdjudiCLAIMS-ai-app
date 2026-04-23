import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AJC-16 — Benefit-payment letter + LC 3761 employer-notification
 * service unit tests.
 *
 * Verifies:
 *   1. New templates render fully (no leftover {{}} markers)
 *   2. BENEFIT_PAYMENT_LETTER includes payment + LC 3761 cc
 *   3. EMPLOYER_NOTIFICATION_BENEFIT_AWARD cites LC 3761
 *   4. EMPLOYER_NOTIFICATION_CLAIM_DECISION cites LC 3761 + LC 5402
 *   5. UPL GREEN — no legal-analysis phrases in any new template
 *   6. generateBenefitPaymentLetter hydrates from BenefitPayment row
 *   7. generateEmployerNotification routes both event types correctly
 *   8. Helper formatters (money, date, label maps) behave correctly
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBenefitPaymentFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockGeneratedLetterCreate = vi.fn();
const mockAuditEventCreate = vi.fn();

vi.mock('../../server/db.js', () => ({
  prisma: {
    benefitPayment: {
      findUnique: (...args: unknown[]) => mockBenefitPaymentFindUnique(...args) as unknown,
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    },
    generatedLetter: {
      create: (...args: unknown[]) => mockGeneratedLetterCreate(...args) as unknown,
    },
    auditEvent: {
      create: (...args: unknown[]) => mockAuditEventCreate(...args) as unknown,
    },
  },
}));

// Stub the audit middleware so we don't trigger external calls.
vi.mock('../../server/middleware/audit.js', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks are wired
// ---------------------------------------------------------------------------

const {
  generateBenefitPaymentLetter,
  generateEmployerNotification,
  formatMoney,
  formatIsoDate,
  paymentTypeLabel,
  decisionTypeLabel,
} = await import('../../server/services/benefit-letter.service.js');

const { LETTER_TEMPLATES } = await import('../../server/data/letter-templates.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CLAIM = {
  id: 'claim-1',
  claimNumber: 'WC-2026-00042',
  claimantName: 'Maria Garcia',
  dateOfInjury: new Date('2026-01-10'),
  bodyParts: ['lumbar spine'],
  employer: 'Acme Manufacturing LLC',
  insurer: 'Pacific Workers Insurance',
  dateReceived: new Date('2026-01-15'),
  assignedExaminer: { name: 'Jane Examiner' },
};

const MOCK_PAYMENT = {
  id: 'payment-1',
  claimId: 'claim-1',
  paymentType: 'TD' as const,
  amount: '857.42', // Decimal stored as string; formatMoney handles
  paymentDate: new Date('2026-02-14'),
  periodStart: new Date('2026-02-01'),
  periodEnd: new Date('2026-02-14'),
};

// Minimal Fastify request stub — the audit middleware is mocked so this
// only needs to exist; nothing is read off it.
const MOCK_REQUEST = { headers: {}, ip: '127.0.0.1' } as unknown as Parameters<
  typeof generateBenefitPaymentLetter
>[2];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setHappyPathMocks() {
  mockClaimFindUnique.mockResolvedValue(MOCK_CLAIM);
  mockBenefitPaymentFindUnique.mockResolvedValue(MOCK_PAYMENT);
  mockGeneratedLetterCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'letter-new',
      createdAt: new Date('2026-02-15'),
      ...data,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setHappyPathMocks();
});

// ---------------------------------------------------------------------------
// 1. Helper formatters
// ---------------------------------------------------------------------------

describe('benefit-letter helpers — formatMoney', () => {
  it('formats a number with two decimals and thousands separators', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50');
    expect(formatMoney(0)).toBe('0.00');
    expect(formatMoney(100)).toBe('100.00');
  });

  it('formats a numeric string', () => {
    expect(formatMoney('857.42')).toBe('857.42');
    expect(formatMoney('1000000')).toBe('1,000,000.00');
  });

  it('formats a Decimal-like object', () => {
    const decimalLike = { toString: () => '999.99' };
    expect(formatMoney(decimalLike)).toBe('999.99');
  });

  it('returns 0.00 for non-numeric input', () => {
    expect(formatMoney('not-a-number')).toBe('0.00');
  });
});

describe('benefit-letter helpers — formatIsoDate', () => {
  it('returns YYYY-MM-DD for a valid Date', () => {
    expect(formatIsoDate(new Date('2026-04-15T12:34:56Z'))).toBe('2026-04-15');
  });

  it('returns N/A for null', () => {
    expect(formatIsoDate(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatIsoDate(undefined)).toBe('N/A');
  });
});

describe('benefit-letter helpers — paymentTypeLabel', () => {
  it.each([
    ['TD', 'Temporary Disability (TD)'],
    ['PD', 'Permanent Disability (PD)'],
    ['DEATH_BENEFIT', 'Death Benefit'],
    ['SJDB_VOUCHER', 'Supplemental Job Displacement Benefit (SJDB)'],
  ] as const)('maps %s to a human-readable label', (input, expected) => {
    expect(paymentTypeLabel(input)).toBe(expected);
  });
});

describe('benefit-letter helpers — decisionTypeLabel', () => {
  it.each([
    ['ACCEPTED', 'Accepted'],
    ['DENIED', 'Denied'],
    ['DELAYED', 'Delayed (under investigation)'],
  ] as const)('maps %s to a human-readable label', (input, expected) => {
    expect(decisionTypeLabel(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 2. Template structure — new AJC-16 templates
// ---------------------------------------------------------------------------

describe('AJC-16 templates — registered in LETTER_TEMPLATES', () => {
  it('LETTER_TEMPLATES contains all 3 new templates', () => {
    const ids = LETTER_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('benefit-payment-letter');
    expect(ids).toContain('employer-notification-benefit-award');
    expect(ids).toContain('employer-notification-claim-decision');
  });

  it('benefit-payment-letter has the correct LetterType enum value', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'benefit-payment-letter');
    expect(t?.letterType).toBe('BENEFIT_PAYMENT_LETTER');
  });

  it('employer-notification-benefit-award has the correct LetterType', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'employer-notification-benefit-award');
    expect(t?.letterType).toBe('EMPLOYER_NOTIFICATION_BENEFIT_AWARD');
  });

  it('employer-notification-claim-decision has the correct LetterType', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'employer-notification-claim-decision');
    expect(t?.letterType).toBe('EMPLOYER_NOTIFICATION_CLAIM_DECISION');
  });
});

describe('AJC-16 templates — statutory authority and content', () => {
  it('benefit-payment-letter cites payment authorities + LC 3761 cc', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'benefit-payment-letter');
    expect(t?.statutoryAuthority).toContain('LC 4650');
    expect(t?.statutoryAuthority).toContain('LC 4658');
    expect(t?.statutoryAuthority).toContain('LC 4700');
    expect(t?.statutoryAuthority).toContain('LC 3761');
    expect(t?.template).toContain('LC 4650');
    expect(t?.template).toContain('LC 3761');
  });

  it('benefit-payment-letter includes payment-specific tokens', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'benefit-payment-letter');
    expect(t?.template).toContain('{{paymentType}}');
    expect(t?.template).toContain('{{paymentAmount}}');
    expect(t?.template).toContain('{{periodStart}}');
    expect(t?.template).toContain('{{periodEnd}}');
    expect(t?.template).toContain('{{paymentDate}}');
    expect(t?.template).toContain('{{employer}}'); // cc line
  });

  it('employer-notification-benefit-award cites LC 3761 in body', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'employer-notification-benefit-award');
    expect(t?.statutoryAuthority).toContain('LC 3761');
    expect(t?.template).toContain('LC 3761');
    expect(t?.template).toContain('{{benefitType}}');
    expect(t?.template).toContain('{{benefitAmount}}');
    expect(t?.template).toContain('{{effectiveDate}}');
    expect(t?.template).toContain('{{employer}}');
  });

  it('employer-notification-claim-decision cites LC 3761 + LC 5402', () => {
    const t = LETTER_TEMPLATES.find((x) => x.id === 'employer-notification-claim-decision');
    expect(t?.statutoryAuthority).toContain('LC 3761');
    expect(t?.statutoryAuthority).toContain('LC 5402');
    expect(t?.template).toContain('LC 3761');
    expect(t?.template).toContain('LC 5402');
    expect(t?.template).toContain('{{decisionType}}');
    expect(t?.template).toContain('{{decisionDate}}');
    expect(t?.template).toContain('{{decisionBasis}}');
  });
});

describe('AJC-16 templates — UPL GREEN-zone compliance', () => {
  // Phrases that imply legal opinion or analysis — banned in any template body.
  const PROHIBITED = [
    'you should',
    'we recommend',
    'in our opinion',
    'we advise',
    'legal analysis',
    'legal conclusion',
    'we believe',
    'it is our position',
    'you are entitled to',
    'your rights include',
    'we determine that',
  ];

  const NEW_IDS = [
    'benefit-payment-letter',
    'employer-notification-benefit-award',
    'employer-notification-claim-decision',
  ];

  it.each(NEW_IDS)('%s contains no prohibited legal language', (id) => {
    const t = LETTER_TEMPLATES.find((x) => x.id === id);
    expect(t).toBeDefined();
    const lower = (t?.template ?? '').toLowerCase();
    for (const phrase of PROHIBITED) {
      expect(lower).not.toContain(phrase);
    }
  });

  it.each(NEW_IDS)('%s includes the "not legal advice" disclaimer', (id) => {
    const t = LETTER_TEMPLATES.find((x) => x.id === id);
    expect(t).toBeDefined();
    expect((t?.template ?? '').toLowerCase()).toContain('does not constitute legal advice');
  });
});

// ---------------------------------------------------------------------------
// 3. generateBenefitPaymentLetter — service flow
// ---------------------------------------------------------------------------

describe('generateBenefitPaymentLetter', () => {
  it('hydrates from BenefitPayment + Claim and persists via prisma.generatedLetter.create', async () => {
    const result = await generateBenefitPaymentLetter('user-1', 'payment-1', MOCK_REQUEST);

    expect(mockBenefitPaymentFindUnique).toHaveBeenCalledOnce();
    expect(mockClaimFindUnique).toHaveBeenCalledOnce();
    expect(mockGeneratedLetterCreate).toHaveBeenCalledOnce();

    const createArgs = mockGeneratedLetterCreate.mock.calls[0]?.[0] as {
      data: {
        templateId: string;
        letterType: string;
        content: string;
        populatedData: Record<string, string>;
      };
    };

    expect(createArgs.data.templateId).toBe('benefit-payment-letter');
    expect(createArgs.data.letterType).toBe('BENEFIT_PAYMENT_LETTER');
    // Hydrated overrides
    expect(createArgs.data.populatedData.paymentType).toBe('Temporary Disability (TD)');
    expect(createArgs.data.populatedData.paymentAmount).toBe('857.42');
    expect(createArgs.data.populatedData.periodStart).toBe('2026-02-01');
    expect(createArgs.data.populatedData.periodEnd).toBe('2026-02-14');
    expect(createArgs.data.populatedData.paymentDate).toBe('2026-02-14');
    expect(createArgs.data.populatedData.paymentId).toBe('payment-1');
    // Claim-level overrides flow through
    expect(createArgs.data.populatedData.claimNumber).toBe('WC-2026-00042');
    expect(createArgs.data.populatedData.claimantName).toBe('Maria Garcia');
    expect(createArgs.data.populatedData.employer).toBe('Acme Manufacturing LLC');

    // Content is fully rendered — no leftover {{}} placeholders
    expect(createArgs.data.content).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    expect(createArgs.data.content).toContain('857.42');
    expect(createArgs.data.content).toContain('Temporary Disability');
    expect(createArgs.data.content).toContain('Maria Garcia');
    expect(createArgs.data.content).toContain('Acme Manufacturing LLC');

    // Result shape
    expect(result.id).toBe('letter-new');
    expect(result.letterType).toBe('BENEFIT_PAYMENT_LETTER');
  });

  it('throws when payment is not found', async () => {
    mockBenefitPaymentFindUnique.mockResolvedValueOnce(null);
    await expect(
      generateBenefitPaymentLetter('user-1', 'missing-payment', MOCK_REQUEST),
    ).rejects.toThrow(/Benefit payment not found/);
    expect(mockGeneratedLetterCreate).not.toHaveBeenCalled();
  });

  it('formats PD payment correctly', async () => {
    mockBenefitPaymentFindUnique.mockResolvedValueOnce({
      ...MOCK_PAYMENT,
      paymentType: 'PD',
      amount: '15000.00',
    });

    await generateBenefitPaymentLetter('user-1', 'payment-1', MOCK_REQUEST);
    const createArgs = mockGeneratedLetterCreate.mock.calls[0]?.[0] as {
      data: { populatedData: Record<string, string>; content: string };
    };
    expect(createArgs.data.populatedData.paymentType).toBe('Permanent Disability (PD)');
    expect(createArgs.data.populatedData.paymentAmount).toBe('15,000.00');
    expect(createArgs.data.content).toContain('15,000.00');
  });
});

// ---------------------------------------------------------------------------
// 4. generateEmployerNotification — service flow
// ---------------------------------------------------------------------------

describe('generateEmployerNotification — BENEFIT_AWARD', () => {
  it('routes to employer-notification-benefit-award template with formatted overrides', async () => {
    const result = await generateEmployerNotification(
      'user-1',
      'claim-1',
      {
        type: 'BENEFIT_AWARD',
        benefitType: 'TD',
        benefitAmount: 1234.5,
        effectiveDate: '2026-03-01',
      },
      MOCK_REQUEST,
    );

    expect(mockGeneratedLetterCreate).toHaveBeenCalledOnce();
    const createArgs = mockGeneratedLetterCreate.mock.calls[0]?.[0] as {
      data: {
        templateId: string;
        letterType: string;
        content: string;
        populatedData: Record<string, string>;
      };
    };

    expect(createArgs.data.templateId).toBe('employer-notification-benefit-award');
    expect(createArgs.data.letterType).toBe('EMPLOYER_NOTIFICATION_BENEFIT_AWARD');
    expect(createArgs.data.populatedData.benefitType).toBe('Temporary Disability (TD)');
    expect(createArgs.data.populatedData.benefitAmount).toBe('1,234.50');
    expect(createArgs.data.populatedData.effectiveDate).toBe('2026-03-01');
    // Claim data flows through
    expect(createArgs.data.populatedData.employer).toBe('Acme Manufacturing LLC');
    expect(createArgs.data.populatedData.claimantName).toBe('Maria Garcia');
    // LC 3761 cited in body
    expect(createArgs.data.content).toContain('LC 3761');
    expect(createArgs.data.content).toContain('1,234.50');
    expect(createArgs.data.content).toContain('Acme Manufacturing LLC');

    expect(result.letterType).toBe('EMPLOYER_NOTIFICATION_BENEFIT_AWARD');
  });
});

describe('generateEmployerNotification — CLAIM_DECISION', () => {
  it('routes to employer-notification-claim-decision template with formatted overrides', async () => {
    const result = await generateEmployerNotification(
      'user-1',
      'claim-1',
      {
        type: 'CLAIM_DECISION',
        decisionType: 'ACCEPTED',
        decisionDate: '2026-03-15',
        decisionBasis:
          'Investigation complete. AOE/COE established for lumbar spine per QME report dated 2026-03-10.',
      },
      MOCK_REQUEST,
    );

    expect(mockGeneratedLetterCreate).toHaveBeenCalledOnce();
    const createArgs = mockGeneratedLetterCreate.mock.calls[0]?.[0] as {
      data: {
        templateId: string;
        letterType: string;
        content: string;
        populatedData: Record<string, string>;
      };
    };

    expect(createArgs.data.templateId).toBe('employer-notification-claim-decision');
    expect(createArgs.data.letterType).toBe('EMPLOYER_NOTIFICATION_CLAIM_DECISION');
    expect(createArgs.data.populatedData.decisionType).toBe('Accepted');
    expect(createArgs.data.populatedData.decisionDate).toBe('2026-03-15');
    expect(createArgs.data.populatedData.decisionBasis).toContain('AOE/COE established');
    // LC 3761 + LC 5402 cited in body
    expect(createArgs.data.content).toContain('LC 3761');
    expect(createArgs.data.content).toContain('LC 5402');
    expect(createArgs.data.content).toContain('Accepted');
    expect(createArgs.data.content).toContain('AOE/COE established');

    expect(result.letterType).toBe('EMPLOYER_NOTIFICATION_CLAIM_DECISION');
  });

  it.each([
    ['ACCEPTED', 'Accepted'],
    ['DENIED', 'Denied'],
    ['DELAYED', 'Delayed (under investigation)'],
  ] as const)('renders decisionType %s as label "%s"', async (decisionType, expectedLabel) => {
    await generateEmployerNotification(
      'user-1',
      'claim-1',
      {
        type: 'CLAIM_DECISION',
        decisionType,
        decisionDate: '2026-03-15',
        decisionBasis: 'Factual basis text.',
      },
      MOCK_REQUEST,
    );
    const createArgs = mockGeneratedLetterCreate.mock.calls[0]?.[0] as {
      data: { populatedData: Record<string, string>; content: string };
    };
    expect(createArgs.data.populatedData.decisionType).toBe(expectedLabel);
    expect(createArgs.data.content).toContain(expectedLabel);
  });
});
