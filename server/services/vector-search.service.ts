/**
 * Vertex AI Vector Search client for embedding storage and retrieval.
 *
 * Replaces pgvector — embeddings are stored in a managed Vertex AI Vector
 * Search index rather than in-database. Each embedding is keyed by a string
 * ID (e.g., "chunk:{chunkId}" or "node:{nodeId}").
 *
 * When Vertex AI Vector Search is not configured (missing env vars), all
 * operations gracefully degrade: upserts are no-ops, queries return empty.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  /** The datapoint ID stored in the index (e.g., "chunk:clm1abc"). */
  id: string;
  /** Distance score from the query vector (lower = more similar for cosine). */
  distance: number;
}

export interface VectorSearchConfig {
  indexEndpoint: string;
  deployedIndexId: string;
  project: string;
  location: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getConfig(): VectorSearchConfig | null {
  const indexEndpoint = process.env['VECTOR_SEARCH_INDEX_ENDPOINT'];
  const deployedIndexId = process.env['VECTOR_SEARCH_DEPLOYED_INDEX_ID'];
  const project = process.env['VERTEX_AI_PROJECT'];
  if (!indexEndpoint || !deployedIndexId || !project) {
    return null;
  }
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'us-central1';
  return { indexEndpoint, deployedIndexId, project, location };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upsert embeddings into the Vector Search index.
 *
 * @param datapoints - Array of { id, embedding } to upsert.
 * @returns Number of datapoints upserted, or 0 if not configured.
 */
export async function upsertEmbeddings(
  datapoints: Array<{ id: string; embedding: number[] }>,
): Promise<number> {
  const config = getConfig();
  if (!config || datapoints.length === 0) {
    return 0;
  }

  try {
    // Vertex AI Vector Search uses the MatchingEngine API.
    // In production, upserts go through the index's streaming update endpoint.
    // For now, we use the REST API directly via fetch.
    const url = `https://${config.location}-aiplatform.googleapis.com/v1/${config.indexEndpoint}/deployedIndexes/${config.deployedIndexId}:upsertDatapoints`;

    const body = {
      datapoints: datapoints.map((dp) => ({
        datapointId: dp.id,
        featureVector: dp.embedding,
      })),
    };

    // Use Application Default Credentials via Google Auth library.
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vector Search upsert failed (${String(response.status)}): ${errorText}`);
    }

    return datapoints.length;
  } catch (err) {
    // Log but don't crash the pipeline — embeddings can be retried later.
    console.error(
      '[vector-search] Upsert failed:',
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

/**
 * Remove embeddings from the Vector Search index.
 *
 * @param ids - Datapoint IDs to remove.
 */
export async function removeEmbeddings(ids: string[]): Promise<void> {
  const config = getConfig();
  if (!config || ids.length === 0) {
    return;
  }

  try {
    const url = `https://${config.location}-aiplatform.googleapis.com/v1/${config.indexEndpoint}/deployedIndexes/${config.deployedIndexId}:removeDatapoints`;

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ datapointIds: ids }),
    });
  } catch (err) {
    console.error(
      '[vector-search] Remove failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Query the Vector Search index for nearest neighbors.
 *
 * @param queryEmbedding - The query vector.
 * @param topK - Number of results to return.
 * @param filter - Optional filter (e.g., restrict to a claim's chunks).
 * @returns Ranked results by distance, or empty if not configured.
 */
export async function queryEmbeddings(
  queryEmbedding: number[],
  topK: number,
  _filter?: Record<string, string>,
): Promise<VectorSearchResult[]> {
  const config = getConfig();
  if (!config) {
    return [];
  }

  try {
    const url = `https://${config.location}-aiplatform.googleapis.com/v1/${config.indexEndpoint}:findNeighbors`;

    const body = {
      deployedIndexId: config.deployedIndexId,
      queries: [
        {
          datapoint: { featureVector: queryEmbedding },
          neighborCount: topK,
        },
      ],
    };

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      nearestNeighbors?: Array<{
        neighbors?: Array<{ datapoint?: { datapointId?: string }; distance?: number }>;
      }>;
    };

    const neighbors = data.nearestNeighbors?.[0]?.neighbors ?? [];
    return neighbors
      .filter((n): n is typeof n & { datapoint: { datapointId: string } } =>
        typeof n.datapoint?.datapointId === 'string',
      )
      .map((n) => ({
        id: n.datapoint.datapointId,
        distance: n.distance ?? 1.0,
      }));
  } catch (err) {
    console.error(
      '[vector-search] Query failed:',
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
