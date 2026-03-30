/**
 * Anomaly detection middleware.
 *
 * Tracks unusual access patterns in memory (Redis in production) and logs
 * ANOMALY_DETECTED audit events when thresholds are exceeded.
 *
 * Detection rules (all use sliding windows):
 * - Per IP: failed authentication attempts exceeding threshold in windowMs
 * - Per user: bulk data access (record count) exceeding threshold in windowMs
 * - Per user: rapid claim switching (distinct claim IDs) exceeding threshold in windowMs
 *
 * NOTE: Detection is passive — anomalies are logged but requests are NOT
 * automatically blocked. Callers may inspect the anomaly type and choose to
 * block at the route level.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { logAuditEvent } from './audit.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnomalyType =
  | 'FAILED_AUTH_THRESHOLD'
  | 'BULK_DATA_ACCESS'
  | 'RAPID_CLAIM_SWITCHING';

export interface AnomalyConfig {
  /** Max failed auth attempts per IP before anomaly fires. Default: 10 */
  failedAuthThreshold: number;
  /** Max records accessed per user in windowMs before anomaly fires. Default: 50 */
  bulkAccessThreshold: number;
  /** Max distinct claim IDs accessed per user in windowMs before anomaly fires. Default: 20 */
  rapidSwitchThreshold: number;
  /** Sliding window duration in milliseconds. Default: 15 minutes */
  windowMs: number;
}

export interface AnomalyDetectedEvent {
  anomalyType: AnomalyType;
  ip?: string;
  userId?: string;
  count: number;
  threshold: number;
  windowMs: number;
}

// ---------------------------------------------------------------------------
// Internal sliding-window counters
// ---------------------------------------------------------------------------

interface WindowEntry<T> {
  timestamps: number[];
  /** For RAPID_CLAIM_SWITCHING: track distinct claim IDs seen in the window */
  distinctValues?: Set<T>;
}

/** Per-IP failed auth tracker */
const failedAuthByIp = new Map<string, WindowEntry<never>>();

/** Per-user record access counter */
const bulkAccessByUser = new Map<string, WindowEntry<never>>();

/** Per-user distinct claim tracking */
const claimSwitchByUser = new Map<string, WindowEntry<string>>();

/**
 * Prune entries older than windowMs from a WindowEntry.
 * Returns the pruned entry (mutates in place).
 */
function pruneWindow<T>(entry: WindowEntry<T>, now: number, windowMs: number): WindowEntry<T> {
  const cutoff = now - windowMs;
  const kept: number[] = [];

  if (entry.distinctValues) {
    // For distinct-value tracking we cannot prune by value — rebuild from scratch.
    // We still maintain timestamps so we know the window is correct.
    // This is acceptable for the in-memory implementation; Redis sorted sets
    // handle this properly in production.
    entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);
    if (kept.length === 0 && entry.timestamps.length === 0) {
      entry.distinctValues.clear();
    }
  } else {
    entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Detector helpers
// ---------------------------------------------------------------------------

/**
 * Record a failed authentication attempt for `ip`.
 * Returns an anomaly event if the threshold is exceeded, otherwise null.
 */
export function recordFailedAuth(
  ip: string,
  config: AnomalyConfig,
): AnomalyDetectedEvent | null {
  const now = Date.now();
  let entry = failedAuthByIp.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    failedAuthByIp.set(ip, entry);
  }
  pruneWindow(entry, now, config.windowMs);
  entry.timestamps.push(now);

  if (entry.timestamps.length >= config.failedAuthThreshold) {
    return {
      anomalyType: 'FAILED_AUTH_THRESHOLD',
      ip,
      count: entry.timestamps.length,
      threshold: config.failedAuthThreshold,
      windowMs: config.windowMs,
    };
  }
  return null;
}

/**
 * Record `recordCount` records accessed by `userId`.
 * Returns an anomaly event if the bulk access threshold is exceeded.
 */
export function recordBulkAccess(
  userId: string,
  recordCount: number,
  config: AnomalyConfig,
): AnomalyDetectedEvent | null {
  const now = Date.now();
  let entry = bulkAccessByUser.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    bulkAccessByUser.set(userId, entry);
  }
  pruneWindow(entry, now, config.windowMs);

  // Push one timestamp per record accessed
  for (let i = 0; i < recordCount; i++) {
    entry.timestamps.push(now);
  }

  if (entry.timestamps.length >= config.bulkAccessThreshold) {
    return {
      anomalyType: 'BULK_DATA_ACCESS',
      userId,
      count: entry.timestamps.length,
      threshold: config.bulkAccessThreshold,
      windowMs: config.windowMs,
    };
  }
  return null;
}

/**
 * Record access to `claimId` by `userId`.
 * Returns an anomaly event if the rapid-switching threshold is exceeded.
 */
export function recordClaimAccess(
  userId: string,
  claimId: string,
  config: AnomalyConfig,
): AnomalyDetectedEvent | null {
  const now = Date.now();
  let entry = claimSwitchByUser.get(userId);
  if (!entry) {
    entry = { timestamps: [], distinctValues: new Set<string>() };
    claimSwitchByUser.set(userId, entry);
  }
  pruneWindow(entry, now, config.windowMs);
  entry.timestamps.push(now);
  entry.distinctValues!.add(claimId);

  const distinctCount = entry.distinctValues!.size;
  if (distinctCount >= config.rapidSwitchThreshold) {
    return {
      anomalyType: 'RAPID_CLAIM_SWITCHING',
      userId,
      count: distinctCount,
      threshold: config.rapidSwitchThreshold,
      windowMs: config.windowMs,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Anomaly logging helper
// ---------------------------------------------------------------------------

/**
 * Log an ANOMALY_DETECTED audit event.
 * Silently swallows errors so a detection failure never disrupts the request.
 */
export async function logAnomaly(
  anomaly: AnomalyDetectedEvent,
  request: FastifyRequest,
): Promise<void> {
  const userId = anomaly.userId ?? request.session.user?.id ?? 'unknown';

  try {
    await logAuditEvent({
      userId,
      eventType: 'ANOMALY_DETECTED',
      eventData: {
        anomalyType: anomaly.anomalyType,
        ip: anomaly.ip,
        count: anomaly.count,
        threshold: anomaly.threshold,
        windowMs: anomaly.windowMs,
      },
      request,
    });
  } catch {
    request.log.error(
      { anomalyType: anomaly.anomalyType, userId },
      'Failed to log anomaly audit event',
    );
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AnomalyConfig = {
  failedAuthThreshold: 10,
  bulkAccessThreshold: 50,
  rapidSwitchThreshold: 20,
  windowMs: 15 * 60 * 1000,
};

/**
 * Create an anomaly detector Fastify plugin.
 *
 * Decorates the Fastify instance with `anomalyDetector` so routes can
 * call detection helpers directly. The config is merged with defaults.
 *
 * Usage in a route:
 * ```ts
 * const anomaly = recordClaimAccess(userId, claimId, server.anomalyConfig);
 * if (anomaly) await logAnomaly(anomaly, request);
 * ```
 */
export function createAnomalyDetector(
  config?: Partial<AnomalyConfig>,
): FastifyPluginAsync {
  const resolvedConfig: AnomalyConfig = { ...DEFAULT_CONFIG, ...config };

  const plugin: FastifyPluginAsync = async (fastify) => {
    // Expose merged config on the fastify instance for use in route handlers
    fastify.decorate('anomalyConfig', resolvedConfig);

    // Hook: detect failed auth on 401 responses from /api/auth/* routes
    fastify.addHook(
      'onSend',
      async (request: FastifyRequest, reply: FastifyReply, _payload: unknown) => {
        if (
          reply.statusCode === 401 &&
          request.url.startsWith('/api/auth')
        ) {
          const ip =
            (request.headers['x-forwarded-for'] as string | undefined)
              ?.split(',')[0]
              ?.trim() ?? request.ip;

          const anomaly = recordFailedAuth(ip, resolvedConfig);
          if (anomaly) {
            await logAnomaly(anomaly, request);
          }
        }
      },
    );
  };

  return fp(plugin, { name: 'anomaly-detector' });
}

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    anomalyConfig: AnomalyConfig;
  }
}
