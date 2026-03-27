/**
 * Letter template service.
 *
 * Provides template-based letter generation for benefit payment letters
 * and employer notifications. All letters are GREEN zone — factual content
 * only, populated from claim data with {{token}} replacement.
 *
 * Statutory authorities cited per template (see letter-templates.ts):
 *   - LC 4650, LC 4652, LC 4653, LC 4654: TD benefit provisions
 *   - LC 3761: Employer notification
 */

import type { FastifyRequest } from 'fastify';
import type { LetterType } from '@prisma/client';
import { prisma } from '../db.js';
import { logAuditEvent } from '../middleware/audit.js';
import { LETTER_TEMPLATES, type LetterTemplate } from '../data/letter-templates.js';
import { parseJsonStringArray } from '../lib/json-array.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A letter template populated with claim-specific data.
 *
 * All {{token}} placeholders have been replaced with actual claim data.
 * Missing optional fields default to 'N/A' to ensure no raw placeholders
 * appear in the final output. The populatedData map is retained for
 * audit trail — it records exactly what values were substituted.
 */
export interface PopulatedLetter {
  /** The template that was used. */
  templateId: string;
  /** Letter type (matches Prisma LetterType enum). */
  letterType: string;
  /** Human-readable letter title. */
  title: string;
  /** Fully populated letter content (Markdown). */
  content: string;
  /** Map of token names to the values substituted. */
  populatedData: Record<string, string>;
  /** Statutory authority cited by this letter type. */
  statutoryAuthority: string;
}

export interface GeneratedLetterRecord {
  id: string;
  claimId: string;
  userId: string;
  letterType: LetterType;
  content: string;
  templateId: string;
  populatedData: Record<string, string>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date to YYYY-MM-DD string. Returns 'N/A' for null/undefined.
 */
function formatDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d.toISOString().split('T')[0] ?? 'N/A';
}

/**
 * Replace all {{token}} placeholders in a template string.
 * Missing tokens are replaced with 'N/A' to ensure no raw placeholders
 * appear in the final output.
 */
function replaceTokens(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
    return data[token] ?? 'N/A';
  });
}

/**
 * Fetch claim data and the assigned examiner's name for token population.
 */
async function fetchClaimData(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      claimNumber: true,
      claimantName: true,
      dateOfInjury: true,
      bodyParts: true,
      employer: true,
      insurer: true,
      dateReceived: true,
      assignedExaminer: {
        select: { name: true },
      },
    },
  });

  return claim;
}

/**
 * Build the token data map from claim data and optional overrides.
 */
function buildTokenData(
  claim: NonNullable<Awaited<ReturnType<typeof fetchClaimData>>>,
  overrides?: Record<string, string>,
): Record<string, string> {
  const injuryYear = claim.dateOfInjury.getFullYear();

  const data: Record<string, string> = {
    claimNumber: claim.claimNumber,
    claimantName: claim.claimantName,
    dateOfInjury: formatDate(claim.dateOfInjury),
    employer: claim.employer,
    insurer: claim.insurer,
    dateReceived: formatDate(claim.dateReceived),
    bodyParts: parseJsonStringArray(claim.bodyParts).join(', ') || 'N/A',
    examinerName: claim.assignedExaminer.name,
    injuryYear: String(injuryYear),
    currentDate: formatDate(new Date()),
  };

  // Apply overrides (e.g., tdRate, awe, statutoryMin, statutoryMax,
  // paymentStartDate, paymentEndDate)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      data[key] = value;
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * List all available letter templates.
 */
export function getTemplates(): LetterTemplate[] {
  return LETTER_TEMPLATES;
}

/**
 * Get a specific template by ID.
 */
export function getTemplate(templateId: string): LetterTemplate | null {
  return LETTER_TEMPLATES.find((t) => t.id === templateId) ?? null;
}

/**
 * Populate a template with claim data and optional overrides.
 *
 * Fetches the claim from the database, builds the token map, and
 * replaces all {{token}} placeholders. Missing optional fields
 * default to 'N/A'.
 */
export async function populateTemplate(
  templateId: string,
  claimId: string,
  overrides?: Record<string, string>,
): Promise<PopulatedLetter> {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const claim = await fetchClaimData(claimId);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const tokenData = buildTokenData(claim, overrides);
  const content = replaceTokens(template.template, tokenData);

  return {
    templateId: template.id,
    letterType: template.letterType,
    title: template.title,
    content,
    populatedData: tokenData,
    statutoryAuthority: template.statutoryAuthority,
  };
}

/**
 * Generate a letter, persist it to the database, and log an audit event.
 *
 * Returns the persisted GeneratedLetter record.
 */
export async function generateLetter(
  userId: string,
  claimId: string,
  templateId: string,
  request: FastifyRequest,
  overrides?: Record<string, string>,
): Promise<GeneratedLetterRecord> {
  const populated = await populateTemplate(templateId, claimId, overrides);

  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const record = await prisma.generatedLetter.create({
    data: {
      claimId,
      userId,
      letterType: template.letterType as LetterType,
      content: populated.content,
      templateId: template.id,
      populatedData: populated.populatedData,
    },
  });

  void logAuditEvent({
    userId,
    claimId,
    eventType: 'LETTER_GENERATED',
    eventData: {
      letterId: record.id,
      templateId: template.id,
      letterType: template.letterType,
    },
    request,
  });

  return {
    id: record.id,
    claimId: record.claimId,
    userId: record.userId,
    letterType: record.letterType,
    content: record.content,
    templateId: record.templateId,
    populatedData: populated.populatedData,
    createdAt: record.createdAt,
  };
}

/**
 * Get all generated letters for a claim, ordered by creation date descending.
 */
export async function getClaimLetters(claimId: string): Promise<GeneratedLetterRecord[]> {
  const records = await prisma.generatedLetter.findMany({
    where: { claimId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => ({
    id: r.id,
    claimId: r.claimId,
    userId: r.userId,
    letterType: r.letterType,
    content: r.content,
    templateId: r.templateId,
    populatedData: r.populatedData as Record<string, string>,
    createdAt: r.createdAt,
  }));
}

/**
 * Get a specific generated letter by ID.
 */
export async function getLetter(letterId: string): Promise<GeneratedLetterRecord | null> {
  const record = await prisma.generatedLetter.findUnique({
    where: { id: letterId },
  });

  if (!record) return null;

  return {
    id: record.id,
    claimId: record.claimId,
    userId: record.userId,
    letterType: record.letterType,
    content: record.content,
    templateId: record.templateId,
    populatedData: record.populatedData as Record<string, string>,
    createdAt: record.createdAt,
  };
}
