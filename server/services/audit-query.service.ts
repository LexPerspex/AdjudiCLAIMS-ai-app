/**
 * Audit query service — READ side of the AuditEvent table.
 *
 * The WRITE side (logAuditEvent) lives in middleware/audit.ts.
 * This service provides paginated queries, UPL event filtering,
 * export, and aggregate counts for compliance dashboards.
 *
 * The AuditEvent table is append-only — no mutations here.
 * All org-scoped queries filter via the user→organization join
 * to enforce tenant isolation.
 */

import type { AuditEventType } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditQueryOptions {
  take?: number;
  skip?: number;
  eventTypes?: AuditEventType[];
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedAuditResult {
  items: AuditEventRecord[];
  total: number;
  take: number;
  skip: number;
}

export interface AuditEventRecord {
  id: string;
  userId: string;
  claimId: string | null;
  eventType: AuditEventType;
  eventData: unknown;
  uplZone: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface ExportRecord {
  id: string;
  userId: string;
  claimId: string | null;
  eventType: string;
  uplZone: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  eventDataJson: string;
}

export interface ExportOptions {
  startDate?: Date;
  endDate?: Date;
  format: 'json' | 'csv';
}

export interface AuditEventCount {
  eventType: string;
  count: number;
}

// UPL event types — the four audit-trail events emitted by the UPL pipeline
const UPL_EVENT_TYPES: AuditEventType[] = [
  'UPL_ZONE_CLASSIFICATION',
  'UPL_OUTPUT_BLOCKED',
  'UPL_DISCLAIMER_INJECTED',
  'UPL_OUTPUT_VALIDATION_FAIL',
];

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampTake(take?: number): number {
  return Math.min(take ?? DEFAULT_TAKE, MAX_TAKE);
}

function dateRangeFilter(startDate?: Date, endDate?: Date) {
  if (!startDate && !endDate) return undefined;
  return {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lte: endDate } : {}),
  };
}

function mapToRecord(event: {
  id: string;
  userId: string;
  claimId: string | null;
  eventType: AuditEventType;
  eventData: unknown;
  uplZone: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}): AuditEventRecord {
  return {
    id: event.id,
    userId: event.userId,
    claimId: event.claimId,
    eventType: event.eventType,
    eventData: event.eventData,
    uplZone: event.uplZone,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: event.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Paginated audit trail for a specific claim.
 *
 * Returns events ordered newest-first. Optionally filter by event type(s)
 * and/or date range.
 */
export async function getClaimAuditTrail(
  claimId: string,
  options?: AuditQueryOptions,
): Promise<PaginatedAuditResult> {
  const take = clampTake(options?.take);
  const skip = options?.skip ?? 0;

  const where = {
    claimId,
    ...(options?.eventTypes?.length ? { eventType: { in: options.eventTypes } } : {}),
    ...(options?.startDate || options?.endDate
      ? { createdAt: dateRangeFilter(options.startDate, options.endDate) }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    items: items.map(mapToRecord),
    total,
    take,
    skip,
  };
}

/**
 * Paginated audit trail for a specific user.
 *
 * Returns events ordered newest-first. Optionally filter by event type(s)
 * and/or date range.
 */
export async function getUserAuditTrail(
  userId: string,
  options?: AuditQueryOptions,
): Promise<PaginatedAuditResult> {
  const take = clampTake(options?.take);
  const skip = options?.skip ?? 0;

  const where = {
    userId,
    ...(options?.eventTypes?.length ? { eventType: { in: options.eventTypes } } : {}),
    ...(options?.startDate || options?.endDate
      ? { createdAt: dateRangeFilter(options.startDate, options.endDate) }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    items: items.map(mapToRecord),
    total,
    take,
    skip,
  };
}

/**
 * Paginated UPL-specific audit events for an org.
 *
 * Filters to the four UPL event types and scopes to the org via
 * user→organization join. Ordered newest-first.
 */
export async function getUplEvents(
  orgId: string,
  options?: Omit<AuditQueryOptions, 'eventTypes'>,
): Promise<PaginatedAuditResult> {
  const take = clampTake(options?.take);
  const skip = options?.skip ?? 0;

  const where = {
    eventType: { in: UPL_EVENT_TYPES },
    user: { organizationId: orgId },
    ...(options?.startDate || options?.endDate
      ? { createdAt: dateRangeFilter(options.startDate, options.endDate) }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    items: items.map(mapToRecord),
    total,
    take,
    skip,
  };
}

/**
 * Export all audit events for an org within an optional date range.
 *
 * Returns a flat array of records. When format is 'csv', eventData is
 * serialised to a JSON string in the eventDataJson field for downstream
 * CSV rendering. No pagination — callers must enforce date range for large
 * orgs.
 */
export async function exportAuditEvents(
  orgId: string,
  options?: ExportOptions,
): Promise<ExportRecord[]> {
  const where = {
    user: { organizationId: orgId },
    ...(options?.startDate || options?.endDate
      ? { createdAt: dateRangeFilter(options.startDate, options.endDate) }
      : {}),
  };

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return events.map((event) => ({
    id: event.id,
    userId: event.userId,
    claimId: event.claimId,
    eventType: event.eventType,
    uplZone: event.uplZone,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: event.createdAt.toISOString(),
    eventDataJson: event.eventData != null ? JSON.stringify(event.eventData) : '',
  }));
}

/**
 * Count audit events by type for an org over an optional date range.
 *
 * Useful for compliance dashboards showing activity volume per event type.
 * Returns an array sorted by count descending.
 */
export async function getAuditEventCounts(
  orgId: string,
  options?: { startDate?: Date; endDate?: Date },
): Promise<AuditEventCount[]> {
  const where = {
    user: { organizationId: orgId },
    ...(options?.startDate || options?.endDate
      ? { createdAt: dateRangeFilter(options.startDate, options.endDate) }
      : {}),
  };

  const grouped = await prisma.auditEvent.groupBy({
    by: ['eventType'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return grouped.map((row) => ({
    eventType: row.eventType,
    count: row._count.id,
  }));
}
