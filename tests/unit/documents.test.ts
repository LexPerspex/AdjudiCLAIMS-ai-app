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
};

const MOCK_SUPERVISOR = {
  id: 'user-2',
  email: 'supervisor@acme-ins.test',
  name: 'Bob Supervisor',
  role: 'CLAIMS_SUPERVISOR' as const,
  organizationId: 'org-1',
  isActive: true,
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

vi.mock('../../server/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args) as unknown,
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
    payload: { email: user.email },
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
  });
});
