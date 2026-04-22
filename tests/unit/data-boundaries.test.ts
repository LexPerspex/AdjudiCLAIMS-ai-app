import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Phase 8 — Data Boundaries & KB Access Control tests.
 *
 * Two sections:
 *   1. Pure service function tests (no Prisma — imported directly)
 *      - document-access.service: getDocumentAccessFilter, isDocumentAccessible, getRagAccessFilter
 *      - kb-access.service: getAllowedSources, getBlockedSources, getAllowedContentTypes,
 *        isSourceAccessible, isContentTypeAccessible, filterKbResults
 *   2. Route integration tests (buildServer + loginAs pattern)
 *      - GET /api/claims/:claimId/documents excludes ATTORNEY_ONLY documents
 *      - GET /api/documents/:id returns 403 for examiner accessing ATTORNEY_ONLY document
 *
 * Specification: docs/product/DATA_BOUNDARY_SPECIFICATION.md §4 and §5
 */

import { UserRole } from '../../server/middleware/rbac.js';

// ---------------------------------------------------------------------------
// Import pure service functions — no Prisma mocking needed for these
// ---------------------------------------------------------------------------

import {
  getDocumentAccessFilter,
  isDocumentAccessible,
  getRagAccessFilter,
} from '../../server/services/document-access.service.js';

import {
  getAllowedSources,
  getBlockedSources,
  getAllowedContentTypes,
  isSourceAccessible,
  isContentTypeAccessible,
  filterKbResults,
} from '../../server/services/kb-access.service.js';

// ---------------------------------------------------------------------------
// Mock data for route integration tests
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-1',
  email: 'examiner@acme-ins.test',
  name: 'Jane Examiner',
  role: UserRole.CLAIMS_EXAMINER as const,
  organizationId: 'org-1',
  isActive: true,
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  deletedAt: null,
  deletedBy: null,
};

const MOCK_SUPERVISOR = {
  id: 'user-2',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: UserRole.CLAIMS_SUPERVISOR as const,
  organizationId: 'org-1',
  isActive: true,
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  deletedAt: null,
  deletedBy: null,
};

const MOCK_ADMIN = {
  id: 'user-3',
  email: 'admin@acme-ins.test',
  name: 'Alice Admin',
  role: UserRole.CLAIMS_ADMIN as const,
  organizationId: 'org-1',
  isActive: true,
  emailVerified: true,
  passwordHash: '$argon2id$mock-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
  mfaEnabled: false,
  mfaSecret: null,
  deletedAt: null,
  deletedBy: null,
};

const MOCK_CLAIM = {
  id: 'claim-1',
  organizationId: 'org-1',
  assignedExaminerId: 'user-1',
  deletedAt: null,
};

const MOCK_DOCUMENT_EXAMINER = {
  id: 'doc-examiner',
  claimId: 'claim-1',
  fileName: 'medical-report.pdf',
  fileUrl: './uploads/org-1/claim-1/doc-examiner/medical-report.pdf',
  fileSize: 12345,
  mimeType: 'application/pdf',
  documentType: 'MEDICAL_REPORT' as const,
  documentSubtype: null,
  classificationConfidence: 0.9,
  accessLevel: 'EXAMINER_ONLY' as const,
  containsLegalAnalysis: false,
  containsWorkProduct: false,
  containsPrivileged: false,
  ocrStatus: 'COMPLETE' as const,
  extractedText: 'Sample extracted text',
  deletedAt: null,
  createdAt: new Date('2026-03-20'),
  updatedAt: new Date('2026-03-20'),
  extractedFields: [],
};

const MOCK_DOCUMENT_ATTORNEY = {
  ...MOCK_DOCUMENT_EXAMINER,
  id: 'doc-attorney',
  fileName: 'legal-analysis.pdf',
  fileUrl: './uploads/org-1/claim-1/doc-attorney/legal-analysis.pdf',
  accessLevel: 'ATTORNEY_ONLY' as const,
  containsLegalAnalysis: true,
  containsWorkProduct: true,
  containsPrivileged: true,
};

const _MOCK_DOCUMENT_SHARED = {
  ...MOCK_DOCUMENT_EXAMINER,
  id: 'doc-shared',
  fileName: 'benefit-notice.pdf',
  fileUrl: './uploads/org-1/claim-1/doc-shared/benefit-notice.pdf',
  accessLevel: 'SHARED' as const,
};

// ---------------------------------------------------------------------------
// Mocks for route integration tests
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockDocumentFindMany = vi.fn();
const mockDocumentCount = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockDocumentDelete = vi.fn();
const mockDocumentCreate = vi.fn();
const mockTimelineEventFindMany = vi.fn();

vi.mock('argon2', () => ({
  default: { verify: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'), argon2id: 2 },
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
  argon2id: 2,
}));
vi.mock('@otplib/preset-default', () => ({
  authenticator: {
    generateSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    keyuri: vi.fn().mockReturnValue('otpauth://totp/AdjudiCLAIMS:test@test.com?secret=JBSWY3DPEHPK3PXP'),
    verify: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    claim: {
      findUnique: (...args: unknown[]) => mockClaimFindUnique(...args) as unknown,
    },
    document: {
      create: (...args: unknown[]) => mockDocumentCreate(...args) as unknown,
      findMany: (...args: unknown[]) => mockDocumentFindMany(...args) as unknown,
      count: (...args: unknown[]) => mockDocumentCount(...args) as unknown,
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args) as unknown,
      delete: (...args: unknown[]) => mockDocumentDelete(...args) as unknown,
    },
    timelineEvent: {
      findMany: (...args: unknown[]) => mockTimelineEventFindMany(...args) as unknown,
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    regulatoryDeadline: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    investigationItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    educationProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'ep-1',
        userId: 'user-1',
        dismissedTerms: [],
        trainingModulesCompleted: null,
        isTrainingComplete: true,
        learningModeExpiry: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../server/services/storage.service.js', () => ({
  storageService: {
    upload: vi.fn().mockResolvedValue('./uploads/org-1/claim-1/doc-1/test.pdf'),
    download: vi.fn().mockResolvedValue(Buffer.from('fake-content')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/services/document-pipeline.service.js', () => ({
  processDocumentPipeline: vi.fn().mockResolvedValue({
    documentId: 'doc-1',
    ocrSuccess: true,
    classificationSuccess: true,
    extractionSuccess: true,
    embeddingSuccess: true,
    timelineSuccess: true,
    chunksCreated: 5,
    fieldsExtracted: 3,
    timelineEventsCreated: 2,
    errors: [],
  }),
}));

// Dynamic import after mocks are registered
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
    isActive: boolean;
  },
): Promise<string> {
  mockUserFindUnique.mockResolvedValueOnce(user);

  const loginResponse = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: 'TestPassword1!' },
  });

  const setCookie = loginResponse.headers['set-cookie'];
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie) && setCookie[0]) return setCookie[0];
  throw new Error('No session cookie returned from login');
}

// ===========================================================================
// 1. Document Access Control — pure service function tests
// ===========================================================================

describe('getDocumentAccessFilter', () => {
  it('returns correct filter for CLAIMS_EXAMINER', () => {
    const filter = getDocumentAccessFilter(UserRole.CLAIMS_EXAMINER);
    expect(filter.accessLevel).toEqual({ not: 'ATTORNEY_ONLY' });
    expect(filter.containsLegalAnalysis).toBe(false);
    expect(filter.containsWorkProduct).toBe(false);
    expect(filter.containsPrivileged).toBe(false);
  });

  it('returns correct filter for CLAIMS_SUPERVISOR', () => {
    const filter = getDocumentAccessFilter(UserRole.CLAIMS_SUPERVISOR);
    expect(filter.accessLevel).toEqual({ not: 'ATTORNEY_ONLY' });
    expect(filter.containsLegalAnalysis).toBe(false);
    expect(filter.containsWorkProduct).toBe(false);
    expect(filter.containsPrivileged).toBe(false);
  });

  it('returns correct filter for CLAIMS_ADMIN', () => {
    const filter = getDocumentAccessFilter(UserRole.CLAIMS_ADMIN);
    expect(filter.accessLevel).toEqual({ not: 'ATTORNEY_ONLY' });
    expect(filter.containsLegalAnalysis).toBe(false);
    expect(filter.containsWorkProduct).toBe(false);
    expect(filter.containsPrivileged).toBe(false);
  });
});

describe('isDocumentAccessible', () => {
  it('returns false for ATTORNEY_ONLY documents', () => {
    const doc = {
      accessLevel: 'ATTORNEY_ONLY',
      containsLegalAnalysis: false,
      containsWorkProduct: false,
      containsPrivileged: false,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false when containsLegalAnalysis is true', () => {
    const doc = {
      accessLevel: 'SHARED',
      containsLegalAnalysis: true,
      containsWorkProduct: false,
      containsPrivileged: false,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false when containsWorkProduct is true', () => {
    const doc = {
      accessLevel: 'SHARED',
      containsLegalAnalysis: false,
      containsWorkProduct: true,
      containsPrivileged: false,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false when containsPrivileged is true', () => {
    const doc = {
      accessLevel: 'SHARED',
      containsLegalAnalysis: false,
      containsWorkProduct: false,
      containsPrivileged: true,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns true for EXAMINER_ONLY documents with no restriction flags', () => {
    const doc = {
      accessLevel: 'EXAMINER_ONLY',
      containsLegalAnalysis: false,
      containsWorkProduct: false,
      containsPrivileged: false,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(true);
  });

  it('returns true for SHARED documents with no restriction flags', () => {
    const doc = {
      accessLevel: 'SHARED',
      containsLegalAnalysis: false,
      containsWorkProduct: false,
      containsPrivileged: false,
    };
    expect(isDocumentAccessible(doc, UserRole.CLAIMS_EXAMINER)).toBe(true);
  });
});

describe('getRagAccessFilter', () => {
  it('returns correct nested filter with document key for examiner', () => {
    const filter = getRagAccessFilter(UserRole.CLAIMS_EXAMINER);
    expect(filter).toHaveProperty('document');
    const docFilter = (filter as { document: Record<string, unknown> }).document;
    expect(docFilter.accessLevel).toEqual({ not: 'ATTORNEY_ONLY' });
    expect(docFilter.containsLegalAnalysis).toBe(false);
    expect(docFilter.containsWorkProduct).toBe(false);
    expect(docFilter.containsPrivileged).toBe(false);
  });
});

// ===========================================================================
// 2. KB Access Control — pure service function tests
// ===========================================================================

describe('getAllowedSources', () => {
  it('returns 7 allowed sources for examiner', () => {
    const sources = getAllowedSources(UserRole.CLAIMS_EXAMINER);
    expect(sources).toHaveLength(7);
    expect(sources).toContain('labor_code');
    expect(sources).toContain('ccr_title_8');
    expect(sources).toContain('insurance_code');
    expect(sources).toContain('ccr_title_10');
    expect(sources).toContain('mtus');
    expect(sources).toContain('omfs');
    expect(sources).toContain('ama_guides_5th');
  });
});

describe('getBlockedSources', () => {
  it('returns pdrs_2005 and crpc as blocked sources', () => {
    const blocked = getBlockedSources(UserRole.CLAIMS_EXAMINER);
    expect(blocked).toContain('pdrs_2005');
    expect(blocked).toContain('crpc');
    expect(blocked).toHaveLength(2);
  });
});

describe('getAllowedContentTypes', () => {
  it('returns regulatory_section and statistical_outcome for examiner', () => {
    const contentTypes = getAllowedContentTypes(UserRole.CLAIMS_EXAMINER);
    expect(contentTypes).toContain('regulatory_section');
    expect(contentTypes).toContain('statistical_outcome');
    expect(contentTypes).toHaveLength(2);
  });
});

describe('isSourceAccessible', () => {
  it('returns true for labor_code', () => {
    expect(isSourceAccessible('labor_code', UserRole.CLAIMS_EXAMINER)).toBe(true);
  });

  it('returns false for pdrs_2005', () => {
    expect(isSourceAccessible('pdrs_2005', UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false for crpc', () => {
    expect(isSourceAccessible('crpc', UserRole.CLAIMS_EXAMINER)).toBe(false);
  });
});

describe('isContentTypeAccessible', () => {
  it('returns true for regulatory_section', () => {
    expect(isContentTypeAccessible('regulatory_section', UserRole.CLAIMS_EXAMINER)).toBe(true);
  });

  it('returns true for statistical_outcome', () => {
    expect(isContentTypeAccessible('statistical_outcome', UserRole.CLAIMS_EXAMINER)).toBe(true);
  });

  it('returns false for legal_principle', () => {
    expect(isContentTypeAccessible('legal_principle', UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false for case_summary', () => {
    expect(isContentTypeAccessible('case_summary', UserRole.CLAIMS_EXAMINER)).toBe(false);
  });

  it('returns false for irac_brief', () => {
    expect(isContentTypeAccessible('irac_brief', UserRole.CLAIMS_EXAMINER)).toBe(false);
  });
});

describe('filterKbResults', () => {
  it('filters out blocked source types (pdrs_2005)', () => {
    const results = [
      { id: '1', sourceType: 'labor_code', contentType: 'regulatory_section' },
      { id: '2', sourceType: 'pdrs_2005', contentType: 'regulatory_section' },
    ];
    const { allowed, blocked } = filterKbResults(results, UserRole.CLAIMS_EXAMINER);
    expect(allowed).toHaveLength(1);
    expect(allowed[0]?.id).toBe('1');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.id).toBe('2');
  });

  it('filters out blocked content types (legal_principle)', () => {
    const results = [
      { id: '1', sourceType: 'labor_code', contentType: 'regulatory_section' },
      { id: '2', sourceType: 'labor_code', contentType: 'legal_principle' },
    ];
    const { allowed, blocked } = filterKbResults(results, UserRole.CLAIMS_EXAMINER);
    expect(allowed).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.id).toBe('2');
  });

  it('marks statistical_outcome entries as requiresDisclaimer', () => {
    const results = [
      { id: '1', sourceType: 'labor_code', contentType: 'regulatory_section' },
      { id: '2', sourceType: 'omfs', contentType: 'statistical_outcome' },
    ];
    const { allowed, requiresDisclaimer } = filterKbResults(results, UserRole.CLAIMS_EXAMINER);
    expect(allowed).toHaveLength(2);
    expect(requiresDisclaimer).toHaveLength(1);
    expect(requiresDisclaimer[0]?.id).toBe('2');
  });

  it('allows regulatory_section entries through without disclaimer', () => {
    const results = [
      { id: '1', sourceType: 'labor_code', contentType: 'regulatory_section' },
    ];
    const { allowed, blocked, requiresDisclaimer } = filterKbResults(results, UserRole.CLAIMS_EXAMINER);
    expect(allowed).toHaveLength(1);
    expect(blocked).toHaveLength(0);
    expect(requiresDisclaimer).toHaveLength(0);
  });

  it('returns empty arrays for empty input', () => {
    const { allowed, blocked, requiresDisclaimer } = filterKbResults([], UserRole.CLAIMS_EXAMINER);
    expect(allowed).toHaveLength(0);
    expect(blocked).toHaveLength(0);
    expect(requiresDisclaimer).toHaveLength(0);
  });
});

// ===========================================================================
// 3. Route integration tests — data boundary enforcement
// ===========================================================================

describe('Document routes — data boundary enforcement', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/claims/:claimId/documents — list endpoint excludes ATTORNEY_ONLY
  // =========================================================================
  describe('GET /api/claims/:claimId/documents', () => {
    it('excludes ATTORNEY_ONLY documents from list for examiner', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      // Only the EXAMINER_ONLY doc should be returned — the route applies
      // getDocumentAccessFilter which excludes ATTORNEY_ONLY from the where clause.
      mockDocumentFindMany.mockResolvedValueOnce([MOCK_DOCUMENT_EXAMINER]);
      mockDocumentCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ documents: Array<{ id: string; accessLevel?: string }> }>();
      expect(body.documents).toHaveLength(1);
      // Verify no ATTORNEY_ONLY doc slipped through
      const hasAttorneyOnly = body.documents.some((d) => d.accessLevel === 'ATTORNEY_ONLY');
      expect(hasAttorneyOnly).toBe(false);
    });
  });

  // =========================================================================
  // GET /api/documents/:id — returns 403 for examiner accessing ATTORNEY_ONLY
  // =========================================================================
  describe('GET /api/documents/:id', () => {
    it('returns 403 for examiner accessing ATTORNEY_ONLY document', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      // Route fetches document first, then calls isDocumentAccessible
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT_ATTORNEY);
      // verifyClaimAccess will call claim.findUnique — provide MOCK_CLAIM
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-attorney',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 for examiner accessing EXAMINER_ONLY document', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT_EXAMINER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-examiner',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ id: string }>();
      expect(body.id).toBe('doc-examiner');
    });

    it('supervisor also receives 403 for ATTORNEY_ONLY document', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT_ATTORNEY);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-attorney',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });

    it('admin also receives 403 for ATTORNEY_ONLY document', async () => {
      const cookie = await loginAs(server, MOCK_ADMIN);
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT_ATTORNEY);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-attorney',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
