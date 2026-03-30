import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock google-auth-library before importing the module under test.
// The source uses dynamic `await import('google-auth-library')` so the mock
// must provide a class constructor for GoogleAuth.
// ---------------------------------------------------------------------------

const mockGetRequestHeaders = vi.fn().mockResolvedValue({
  Authorization: 'Bearer mock-token',
});
const mockGetClient = vi.fn().mockResolvedValue({
  getRequestHeaders: mockGetRequestHeaders,
});

vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: class MockGoogleAuth {
      scopes: string[];
      constructor(opts: { scopes: string[] }) {
        this.scopes = opts.scopes;
        // delegate to the vi.fn() spy so tests can override / inspect
        mockGetClientSpy(opts);
      }
      getClient() {
        return mockGetClient();
      }
    },
  };
});

// Spy on constructor calls
const mockGetClientSpy = vi.fn();

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  upsertEmbeddings,
  removeEmbeddings,
  queryEmbeddings,
} from '../../server/services/vector-search.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ENV = {
  VECTOR_SEARCH_INDEX_ENDPOINT: 'projects/test-proj/locations/us-central1/indexEndpoints/123',
  VECTOR_SEARCH_DEPLOYED_INDEX_ID: 'deployed-idx-1',
  VERTEX_AI_PROJECT: 'test-proj',
  VERTEX_AI_LOCATION: 'us-central1',
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const env = { ...VALID_ENV, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv() {
  for (const key of Object.keys(VALID_ENV)) {
    delete process.env[key];
  }
}

function okResponse(body: unknown = {}) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  };
}

function errorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(text),
    json: vi.fn().mockRejectedValue(new Error('not json')),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vector-search.service', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearEnv();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset default resolved values after clearAllMocks
    mockGetRequestHeaders.mockResolvedValue({ Authorization: 'Bearer mock-token' });
    mockGetClient.mockResolvedValue({ getRequestHeaders: mockGetRequestHeaders });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    clearEnv();
  });

  // =========================================================================
  // upsertEmbeddings
  // =========================================================================

  describe('upsertEmbeddings', () => {
    it('returns 0 when env vars are missing (graceful degradation)', async () => {
      const result = await upsertEmbeddings([
        { id: 'chunk:1', embedding: [0.1, 0.2] },
      ]);
      expect(result).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 0 when VECTOR_SEARCH_INDEX_ENDPOINT is missing', async () => {
      setEnv({ VECTOR_SEARCH_INDEX_ENDPOINT: undefined });
      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);
      expect(result).toBe(0);
    });

    it('returns 0 when VECTOR_SEARCH_DEPLOYED_INDEX_ID is missing', async () => {
      setEnv({ VECTOR_SEARCH_DEPLOYED_INDEX_ID: undefined });
      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);
      expect(result).toBe(0);
    });

    it('returns 0 when VERTEX_AI_PROJECT is missing', async () => {
      setEnv({ VERTEX_AI_PROJECT: undefined });
      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);
      expect(result).toBe(0);
    });

    it('returns 0 for empty datapoints array', async () => {
      setEnv();
      const result = await upsertEmbeddings([]);
      expect(result).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('upserts datapoints successfully and returns count', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse());

      const datapoints = [
        { id: 'chunk:1', embedding: [0.1, 0.2, 0.3] },
        { id: 'chunk:2', embedding: [0.4, 0.5, 0.6] },
      ];
      const result = await upsertEmbeddings(datapoints);

      expect(result).toBe(2);
      expect(mockFetch).toHaveBeenCalledOnce();

      // Verify URL
      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain('us-central1-aiplatform.googleapis.com');
      expect(callUrl).toContain(':upsertDatapoints');
      expect(callUrl).toContain(VALID_ENV.VECTOR_SEARCH_INDEX_ENDPOINT);
      expect(callUrl).toContain(VALID_ENV.VECTOR_SEARCH_DEPLOYED_INDEX_ID);

      // Verify body
      const callOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(callOptions.body as string);
      expect(body.datapoints).toHaveLength(2);
      expect(body.datapoints[0]).toEqual({
        datapointId: 'chunk:1',
        featureVector: [0.1, 0.2, 0.3],
      });
      expect(body.datapoints[1]).toEqual({
        datapointId: 'chunk:2',
        featureVector: [0.4, 0.5, 0.6],
      });

      // Verify auth headers
      const headers = callOptions.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer mock-token');
    });

    it('uses default location us-central1 when VERTEX_AI_LOCATION is not set', async () => {
      setEnv({ VERTEX_AI_LOCATION: undefined });
      mockFetch.mockResolvedValueOnce(okResponse());

      await upsertEmbeddings([{ id: 'x', embedding: [1] }]);

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain('us-central1-aiplatform.googleapis.com');
    });

    it('returns 0 and logs error on non-ok HTTP response', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(errorResponse(400, 'Bad Request: invalid vector'));

      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Upsert failed:',
        expect.stringContaining('400'),
      );
    });

    it('returns 0 and logs error when fetch throws', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Upsert failed:',
        'Network error',
      );
    });

    it('returns 0 and logs stringified error when error is not an Error instance', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce('string-error');

      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Upsert failed:',
        'string-error',
      );
    });

    it('returns 0 and logs error when auth getClient fails', async () => {
      setEnv();
      mockGetClient.mockRejectedValueOnce(new Error('Auth credentials not found'));

      const result = await upsertEmbeddings([{ id: 'a', embedding: [1] }]);

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Upsert failed:',
        'Auth credentials not found',
      );
    });
  });

  // =========================================================================
  // removeEmbeddings
  // =========================================================================

  describe('removeEmbeddings', () => {
    it('returns immediately when env vars are missing', async () => {
      await removeEmbeddings(['chunk:1']);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns immediately for empty ids array', async () => {
      setEnv();
      await removeEmbeddings([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends remove request successfully', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse());

      await removeEmbeddings(['chunk:1', 'chunk:2']);

      expect(mockFetch).toHaveBeenCalledOnce();

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain(':removeDatapoints');
      expect(callUrl).toContain(VALID_ENV.VECTOR_SEARCH_DEPLOYED_INDEX_ID);

      const callOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(callOptions.body as string);
      expect(body.datapointIds).toEqual(['chunk:1', 'chunk:2']);
    });

    it('logs error when fetch throws but does not rethrow', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      // Should not throw
      await removeEmbeddings(['chunk:1']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Remove failed:',
        'Connection refused',
      );
    });

    it('logs stringified error for non-Error thrown values', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce(42);

      await removeEmbeddings(['chunk:1']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Remove failed:',
        '42',
      );
    });

    it('logs error when auth getClient fails', async () => {
      setEnv();
      mockGetClient.mockRejectedValueOnce(new Error('Auth failed'));

      await removeEmbeddings(['chunk:1']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Remove failed:',
        'Auth failed',
      );
    });
  });

  // =========================================================================
  // queryEmbeddings
  // =========================================================================

  describe('queryEmbeddings', () => {
    it('returns empty array when env vars are missing', async () => {
      const result = await queryEmbeddings([0.1, 0.2], 5);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends query and parses results correctly', async () => {
      setEnv();
      const apiResponse = {
        nearestNeighbors: [
          {
            neighbors: [
              { datapoint: { datapointId: 'chunk:a' }, distance: 0.12 },
              { datapoint: { datapointId: 'chunk:b' }, distance: 0.34 },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(okResponse(apiResponse));

      const result = await queryEmbeddings([0.1, 0.2, 0.3], 10);

      expect(result).toEqual([
        { id: 'chunk:a', distance: 0.12 },
        { id: 'chunk:b', distance: 0.34 },
      ]);

      // Verify URL
      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain(':findNeighbors');

      // Verify body structure
      const callOptions = mockFetch.mock.calls[0]![1] as RequestInit;
      const body = JSON.parse(callOptions.body as string);
      expect(body.deployedIndexId).toBe(VALID_ENV.VECTOR_SEARCH_DEPLOYED_INDEX_ID);
      expect(body.queries[0].datapoint.featureVector).toEqual([0.1, 0.2, 0.3]);
      expect(body.queries[0].neighborCount).toBe(10);
    });

    it('accepts optional filter parameter', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(
        okResponse({ nearestNeighbors: [{ neighbors: [] }] }),
      );

      const result = await queryEmbeddings([1], 5, { claimId: 'clm123' });
      expect(result).toEqual([]);
    });

    it('returns empty array on non-ok HTTP response', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

      const result = await queryEmbeddings([0.1], 5);
      expect(result).toEqual([]);
    });

    it('defaults distance to 1.0 when not provided', async () => {
      setEnv();
      const apiResponse = {
        nearestNeighbors: [
          {
            neighbors: [
              { datapoint: { datapointId: 'chunk:x' } },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(okResponse(apiResponse));

      const result = await queryEmbeddings([0.1], 5);
      expect(result).toEqual([{ id: 'chunk:x', distance: 1.0 }]);
    });

    it('filters out neighbors with missing datapointId', async () => {
      setEnv();
      const apiResponse = {
        nearestNeighbors: [
          {
            neighbors: [
              { datapoint: { datapointId: 'chunk:valid' }, distance: 0.1 },
              { datapoint: {}, distance: 0.2 },
              { distance: 0.3 },
              { datapoint: { datapointId: null }, distance: 0.4 },
              { datapoint: { datapointId: 'chunk:also-valid' }, distance: 0.5 },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(okResponse(apiResponse));

      const result = await queryEmbeddings([0.1], 10);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('chunk:valid');
      expect(result[1]!.id).toBe('chunk:also-valid');
    });

    it('handles empty nearestNeighbors array', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse({ nearestNeighbors: [] }));

      const result = await queryEmbeddings([0.1], 5);
      expect(result).toEqual([]);
    });

    it('handles missing nearestNeighbors key', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse({}));

      const result = await queryEmbeddings([0.1], 5);
      expect(result).toEqual([]);
    });

    it('handles missing neighbors array inside nearestNeighbors', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse({ nearestNeighbors: [{}] }));

      const result = await queryEmbeddings([0.1], 5);
      expect(result).toEqual([]);
    });

    it('returns empty array and logs error when fetch throws', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await queryEmbeddings([0.1], 5);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Query failed:',
        'Timeout',
      );
    });

    it('logs stringified error for non-Error thrown values', async () => {
      setEnv();
      mockFetch.mockRejectedValueOnce('connection-reset');

      const result = await queryEmbeddings([0.1], 5);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Query failed:',
        'connection-reset',
      );
    });

    it('returns empty array and logs error when auth getClient fails', async () => {
      setEnv();
      mockGetClient.mockRejectedValueOnce(new Error('Token expired'));

      const result = await queryEmbeddings([0.1], 5);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[vector-search] Query failed:',
        'Token expired',
      );
    });
  });

  // =========================================================================
  // GoogleAuth configuration
  // =========================================================================

  describe('GoogleAuth configuration', () => {
    it('creates GoogleAuth with cloud-platform scope', async () => {
      setEnv();
      mockFetch.mockResolvedValueOnce(okResponse());

      await upsertEmbeddings([{ id: 'a', embedding: [1] }]);

      expect(mockGetClientSpy).toHaveBeenCalledWith({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    });
  });
});
