import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Document routes test suite.
 *
 * Tests document upload, listing, detail, deletion, and timeline endpoints.
 * Uses server.inject() with mocked Prisma and storage service.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-1',
  email: 'examiner@acme-ins.test',
  name: 'Jane Examiner',
  role: 'CLAIMS_EXAMINER' as const,
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
  role: 'CLAIMS_SUPERVISOR' as const,
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
};

const MOCK_DOCUMENT = {
  id: 'doc-1',
  claimId: 'claim-1',
  fileName: 'medical-report.pdf',
  fileUrl: './uploads/org-1/claim-1/doc-1/medical-report.pdf',
  fileSize: 12345,
  mimeType: 'application/pdf',
  documentType: 'MEDICAL_REPORT' as const,
  documentSubtype: null,
  classificationConfidence: 0.7,
  accessLevel: 'EXAMINER_ONLY' as const,
  ocrStatus: 'COMPLETE' as const,
  extractedText: 'Sample extracted text for testing',
  createdAt: new Date('2026-03-20'),
  updatedAt: new Date('2026-03-20'),
  extractedFields: [
    { id: 'ef-1', fieldName: 'diagnosis', fieldValue: 'lumbar strain', confidence: 0.85, sourcePage: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();
const mockClaimFindUnique = vi.fn();
const mockDocumentCreate = vi.fn();
const mockDocumentFindMany = vi.fn();
const mockDocumentCount = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockDocumentDelete = vi.fn();
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
      upsert: vi.fn().mockResolvedValue({ id: 'ep-1', userId: 'user-1', dismissedTerms: [], trainingModulesCompleted: null, isTrainingComplete: true, learningModeExpiry: null }),
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

// Dynamic import after mocks
const { buildServer } = await import('../../server/index.js');

// ---------------------------------------------------------------------------
// Helper: login and get session cookie
// ---------------------------------------------------------------------------

async function loginAs(
  server: Awaited<ReturnType<typeof buildServer>>,
  user: { id: string; email: string; name: string; role: string; organizationId: string; isActive: boolean },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Document routes', () => {
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
  // POST /api/claims/:claimId/documents (upload)
  // =========================================================================
  describe('POST /api/claims/:claimId/documents', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/documents',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const form = new FormData();
      form.append('file', new Blob(['test-content'], { type: 'application/pdf' }), 'test.pdf');

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/nonexistent/documents',
        headers: { cookie },
        payload: form,
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 when no file is uploaded', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/documents',
        headers: {
          cookie,
          'content-type': 'multipart/form-data; boundary=----formdata',
        },
        payload: '------formdata--',
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for unsupported MIME type', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const boundary = '----vitest-boundary';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.txt"',
        'Content-Type: text/plain',
        '',
        'hello world',
        `--${boundary}--`,
      ].join('\r\n');

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/documents',
        headers: {
          cookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(400);
      const respBody = response.json<{ error: string }>();
      expect(respBody.error).toBe('Unsupported file type');
    });

    it('returns 201 and creates document for valid PDF upload', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentCreate.mockResolvedValueOnce({
        id: 'doc-new',
        claimId: 'claim-1',
        fileName: 'report.pdf',
        fileUrl: './uploads/org-1/claim-1/doc-new/report.pdf',
        fileSize: 11,
        mimeType: 'application/pdf',
        documentType: null,
        ocrStatus: 'PENDING',
        createdAt: new Date('2026-03-27'),
      });

      const boundary = '----vitest-boundary-upload';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="report.pdf"',
        'Content-Type: application/pdf',
        '',
        'PDF-content',
        `--${boundary}--`,
      ].join('\r\n');

      const response = await server.inject({
        method: 'POST',
        url: '/api/claims/claim-1/documents',
        headers: {
          cookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(201);
      const respBody = response.json<{ id: string; ocrStatus: string }>();
      expect(respBody.ocrStatus).toBe('PENDING');
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/documents
  // =========================================================================
  describe('GET /api/claims/:claimId/documents', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when claim not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/nonexistent/documents',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns documents for authorized user', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentFindMany.mockResolvedValueOnce([MOCK_DOCUMENT]);
      mockDocumentCount.mockResolvedValueOnce(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ documents: unknown[]; total: number }>();
      expect(body.documents).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('supports take and skip pagination parameters', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentFindMany.mockResolvedValueOnce([MOCK_DOCUMENT]);
      mockDocumentCount.mockResolvedValueOnce(5);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents?take=1&skip=2',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ documents: unknown[]; total: number; take: number; skip: number }>();
      expect(body.take).toBe(1);
      expect(body.skip).toBe(2);
    });

    it('clamps take to 200 maximum', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentFindMany.mockResolvedValueOnce([]);
      mockDocumentCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents?take=500',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ take: number }>();
      expect(body.take).toBe(200);
    });

    it('defaults take to 50 for invalid value', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentFindMany.mockResolvedValueOnce([]);
      mockDocumentCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents?take=abc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ take: number }>();
      expect(body.take).toBe(50);
    });

    it('defaults skip to 0 for negative value', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentFindMany.mockResolvedValueOnce([]);
      mockDocumentCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/documents?skip=-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ skip: number }>();
      expect(body.skip).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/documents/:id
  // =========================================================================
  describe('GET /api/documents/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for non-existent document', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockDocumentFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/nonexistent',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns document with extracted fields', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ id: string; extractedFields: unknown[] }>();
      expect(body.id).toBe('doc-1');
      expect(body.extractedFields).toHaveLength(1);
    });

    it('returns 404 when claim access is denied', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockDocumentFindUnique.mockResolvedValueOnce(MOCK_DOCUMENT);
      // Claim belongs to different org
      mockClaimFindUnique.mockResolvedValueOnce({
        ...MOCK_CLAIM,
        organizationId: 'other-org',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 for attorney-only document (UPL data boundary)', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const restrictedDoc = {
        ...MOCK_DOCUMENT,
        accessLevel: 'ATTORNEY_ONLY',
        containsLegalAnalysis: false,
        containsWorkProduct: false,
        containsPrivileged: false,
      };
      mockDocumentFindUnique.mockResolvedValueOnce(restrictedDoc);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      const body = response.json<{ error: string }>();
      expect(body.error).toContain('restricted');
    });

    it('returns 403 for document containing legal analysis', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const restrictedDoc = {
        ...MOCK_DOCUMENT,
        accessLevel: 'EXAMINER_ONLY',
        containsLegalAnalysis: true,
        containsWorkProduct: false,
        containsPrivileged: false,
      };
      mockDocumentFindUnique.mockResolvedValueOnce(restrictedDoc);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for document containing work product', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const restrictedDoc = {
        ...MOCK_DOCUMENT,
        accessLevel: 'EXAMINER_ONLY',
        containsLegalAnalysis: false,
        containsWorkProduct: true,
        containsPrivileged: false,
      };
      mockDocumentFindUnique.mockResolvedValueOnce(restrictedDoc);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for document containing privileged content', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      const restrictedDoc = {
        ...MOCK_DOCUMENT,
        accessLevel: 'EXAMINER_ONLY',
        containsLegalAnalysis: false,
        containsWorkProduct: false,
        containsPrivileged: true,
      };
      mockDocumentFindUnique.mockResolvedValueOnce(restrictedDoc);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // DELETE /api/documents/:id
  // =========================================================================
  describe('DELETE /api/documents/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for examiner (only supervisors/admins can delete)', async () => {
      const cookie = await loginAs(server, MOCK_USER);

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('allows supervisor to delete a document', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockDocumentFindUnique.mockResolvedValueOnce({
        id: 'doc-1',
        claimId: 'claim-1',
        fileUrl: './uploads/org-1/claim-1/doc-1/file.pdf',
        fileName: 'file.pdf',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentDelete.mockResolvedValueOnce({});

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(204);
    });

    it('returns 404 for non-existent document', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockDocumentFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/nonexistent',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when supervisor has no access to the claim', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockDocumentFindUnique.mockResolvedValueOnce({
        id: 'doc-1',
        claimId: 'claim-1',
        fileUrl: './uploads/org-1/claim-1/doc-1/file.pdf',
        fileName: 'file.pdf',
      });
      // Claim belongs to different org
      mockClaimFindUnique.mockResolvedValueOnce({
        ...MOCK_CLAIM,
        organizationId: 'other-org',
      });

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('allows admin to delete a document', async () => {
      const MOCK_ADMIN = {
        id: 'user-3',
        email: 'admin@acme-ins.test',
        name: 'Admin User',
        role: 'CLAIMS_ADMIN' as const,
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
      const cookie = await loginAs(server, MOCK_ADMIN);
      mockDocumentFindUnique.mockResolvedValueOnce({
        id: 'doc-1',
        claimId: 'claim-1',
        fileUrl: './uploads/org-1/claim-1/doc-1/file.pdf',
        fileName: 'file.pdf',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentDelete.mockResolvedValueOnce({});

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(204);
    });

    it('still deletes DB record if storage delete fails', async () => {
      const cookie = await loginAs(server, MOCK_SUPERVISOR);
      mockDocumentFindUnique.mockResolvedValueOnce({
        id: 'doc-1',
        claimId: 'claim-1',
        fileUrl: './uploads/org-1/claim-1/doc-1/file.pdf',
        fileName: 'file.pdf',
      });
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockDocumentDelete.mockResolvedValueOnce({});

      // Make storage delete throw
      const { storageService } = await import('../../server/services/storage.service.js');
      vi.mocked(storageService.delete).mockRejectedValueOnce(new Error('Storage unavailable'));

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/documents/doc-1',
        headers: { cookie },
      });
      // Should still succeed — storage failure is logged, not rethrown
      expect(response.statusCode).toBe(204);
    });
  });

  // =========================================================================
  // GET /api/claims/:claimId/timeline
  // =========================================================================
  describe('GET /api/claims/:claimId/timeline', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/timeline',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns timeline events for a claim', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockTimelineEventFindMany.mockResolvedValueOnce([
        {
          id: 'ev-1',
          claimId: 'claim-1',
          documentId: 'doc-1',
          eventDate: new Date('2026-01-15'),
          eventType: 'DATE_OF_INJURY',
          description: 'Date of injury reported on 01/15/2026',
          source: 'medical-report.pdf',
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ events: unknown[]; total: number }>();
      expect(body.events).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('returns 404 when claim not found', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/nonexistent/timeline',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns empty events array for claim with no timeline events', async () => {
      const cookie = await loginAs(server, MOCK_USER);
      mockClaimFindUnique.mockResolvedValueOnce(MOCK_CLAIM);
      mockTimelineEventFindMany.mockResolvedValueOnce([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/claims/claim-1/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ events: unknown[]; total: number }>();
      expect(body.events).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });
});
