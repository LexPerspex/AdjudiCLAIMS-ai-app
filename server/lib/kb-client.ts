/**
 * Knowledge Base API client for wc-knowledge-base.
 *
 * Provides typed access to the external wc-knowledge-base NestJS service.
 * All requests include timeouts. Callers must handle errors — this module
 * does not swallow them except in isKbAvailable() which is a probe.
 *
 * Base URL is configurable via KB_API_BASE env var. Defaults to the
 * production Cloud Run URL.
 *
 * No auth required — internal service on GCP private network.
 */

const KB_API_BASE =
  process.env['KB_API_BASE'] ?? 'https://wc-kb-backend-rs3cfj56xa-uc.a.run.app';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KbRegulatoryResult {
  id: string;
  sourceType: string;
  sectionNumber: string;
  title: string | null;
  fullText: string;
  effectiveDate: string | null;
  tags: string[];
  similarity?: number;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Probe the KB health endpoint. Returns true if the service is reachable.
 * Times out after 3 seconds. Never throws.
 */
export async function isKbAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${KB_API_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Search the regulatory knowledge base using semantic similarity.
 *
 * @param query - Natural language search query.
 * @param sourceTypes - Filter to specific source types, e.g. ['mtus'], ['omfs'], ['ccr_title_8'].
 * @param limit - Maximum number of results to return (default 20).
 * @returns Array of matching regulatory sections, ranked by similarity.
 * @throws On HTTP error or network failure.
 */
export async function searchRegulatory(
  query: string,
  sourceTypes: string[],
  limit = 20,
): Promise<KbRegulatoryResult[]> {
  const res = await fetch(`${KB_API_BASE}/api/knowledge/search/regulatory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source_types: sourceTypes, limit }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`KB API error: ${res.status}`);
  return res.json() as Promise<KbRegulatoryResult[]>;
}

/**
 * Look up a single regulatory section by its section number.
 *
 * @param sectionNumber - The section identifier, e.g. "LC 4650" or "8 CCR 9789.10".
 * @returns The regulatory section, or null if not found or on error.
 */
export async function lookupRegulatorySection(
  sectionNumber: string,
): Promise<KbRegulatoryResult | null> {
  try {
    const res = await fetch(
      `${KB_API_BASE}/api/knowledge/regulatory/${encodeURIComponent(sectionNumber)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<KbRegulatoryResult>;
  } catch {
    return null;
  }
}
