/**
 * Knowledge Base query filtering by user role.
 *
 * Enforces the examiner/attorney content boundary for KB sources and content
 * types. Examiner-side roles may access factual regulatory sources (statutes,
 * regulations, MTUS, OMFS, AMA Guides) but are blocked from legal research
 * sources (PDRS, CRPC) and attorney-style content types (legal principles,
 * case summaries, IRAC briefs).
 *
 * UPL compliance:
 * - GREEN zone: regulatory_section → factual citation, no disclaimer required
 * - YELLOW zone: statistical_outcome → YELLOW disclaimer required
 * - BLOCKED: legal_principle, case_summary, irac_brief → attorney referral
 *
 * Full specification: docs/product/ADJUDICLAIMS_CHAT_SYSTEM_PROMPTS.md
 */

import type { UserRole } from '../middleware/rbac.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * KB document source identifiers.
 * Matches the sourceType field stored on KbEntry records.
 */
export type KbSourceType =
  | 'labor_code'
  | 'ccr_title_8'
  | 'insurance_code'
  | 'ccr_title_10'
  | 'mtus'
  | 'omfs'
  | 'ama_guides_5th'
  | 'pdrs_2005'
  | 'crpc';

/**
 * KB content type classifiers.
 * Matches the contentType field stored on KbEntry records.
 */
export type KbContentType =
  | 'regulatory_section'
  | 'statistical_outcome'
  | 'legal_principle'
  | 'case_summary'
  | 'irac_brief';

// ---------------------------------------------------------------------------
// Access control tables
// ---------------------------------------------------------------------------

/**
 * Sources accessible to all examiner-side roles.
 * These are factual regulatory sources — statutes, regulations, medical guidelines.
 */
const EXAMINER_ALLOWED_SOURCES: KbSourceType[] = [
  'labor_code',      // CA Labor Code
  'ccr_title_8',     // CA Code of Regulations, Title 8 (Workers' Comp)
  'insurance_code',  // CA Insurance Code
  'ccr_title_10',    // CA Code of Regulations, Title 10 (Insurance Dept)
  'mtus',            // Medical Treatment Utilization Schedule
  'omfs',            // Official Medical Fee Schedule
  'ama_guides_5th',  // AMA Guides to Evaluation of Permanent Impairment, 5th Ed.
];

/**
 * Sources blocked for all examiner-side roles.
 *
 * Why these specific sources are blocked:
 * - pdrs_2005 (Permanent Disability Rating Schedule): PD rating is a legal
 *   calculation that determines the monetary value of permanent impairment.
 *   Applying the PDRS to a specific claim's medical findings constitutes
 *   legal analysis under Cal. Bus. & Prof. Code section 6125. Only attorneys
 *   and WCAB judges may apply the PDRS to specific claims.
 * - crpc (California Rules of Professional Conduct): These are attorney
 *   ethics rules governing attorney conduct. Exposing them to examiners
 *   serves no claims-handling purpose and could create confusion about
 *   the examiner's role.
 */
const EXAMINER_BLOCKED_SOURCES: KbSourceType[] = [
  'pdrs_2005',  // Permanent Disability Rating Schedule — legal calculation requiring attorney
  'crpc',       // California Rules of Professional Conduct — attorney ethics rules
];

/**
 * Content types accessible to examiner-side roles.
 * regulatory_section: GREEN zone — factual citation.
 * statistical_outcome: YELLOW zone — requires disclaimer.
 */
const EXAMINER_ALLOWED_CONTENT: KbContentType[] = [
  'regulatory_section',
  'statistical_outcome',
];

/**
 * Content types blocked for examiner-side roles.
 *
 * Why each content type is blocked:
 * - legal_principle: Contains legal conclusions derived from case law. Presenting
 *   these to examiners would effectively provide legal analysis, violating UPL.
 * - case_summary: Case law research is the exclusive domain of attorneys. Examiners
 *   have no need for case summaries in their regulatory compliance work.
 * - irac_brief: Issue/Rule/Analysis/Conclusion format is attorney legal writing.
 *   The "Analysis" and "Conclusion" sections inherently contain legal reasoning.
 */
const EXAMINER_BLOCKED_CONTENT: KbContentType[] = [
  'legal_principle',  // Legal conclusions — UPL boundary
  'case_summary',     // Case law — legal research
  'irac_brief',       // Issue/Rule/Analysis/Conclusion — legal writing
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the list of allowed KB source types for a role.
 *
 * @param _role - User role (retained for forward compatibility).
 */
export function getAllowedSources(_role: UserRole): KbSourceType[] {
  return EXAMINER_ALLOWED_SOURCES;
}

/**
 * Get the list of blocked KB source types for a role.
 *
 * @param _role - User role (retained for forward compatibility).
 */
export function getBlockedSources(_role: UserRole): KbSourceType[] {
  return EXAMINER_BLOCKED_SOURCES;
}

/**
 * Get the list of allowed KB content types for a role.
 *
 * @param _role - User role (retained for forward compatibility).
 */
export function getAllowedContentTypes(_role: UserRole): KbContentType[] {
  return EXAMINER_ALLOWED_CONTENT;
}

/**
 * Check if a KB source type is accessible to a role.
 *
 * @param source - The sourceType string from a KB entry.
 * @param _role - User role.
 * @returns true if the source may be returned in search results.
 */
export function isSourceAccessible(source: string, _role: UserRole): boolean {
  return !EXAMINER_BLOCKED_SOURCES.includes(source as KbSourceType);
}

/**
 * Check if a KB content type is accessible to a role.
 *
 * @param contentType - The contentType string from a KB entry.
 * @param _role - User role.
 * @returns true if the content type may be returned in search results.
 */
export function isContentTypeAccessible(contentType: string, _role: UserRole): boolean {
  return !EXAMINER_BLOCKED_CONTENT.includes(contentType as KbContentType);
}

/**
 * Filter KB search results based on role.
 *
 * Partitions results into three buckets:
 * - `allowed`: safe to return to the user as-is
 * - `blocked`: must not be shown; triggers attorney referral if the user
 *   explicitly requested content from these sources
 * - `requiresDisclaimer`: subset of `allowed` that are `statistical_outcome`
 *   entries — the caller must attach a YELLOW zone disclaimer to any response
 *   that draws on these results
 *
 * @param results - Raw KB search results, each optionally carrying sourceType
 *   and contentType fields.
 * @param role - User role to evaluate access for.
 */
export function filterKbResults<T extends { sourceType?: string; contentType?: string }>(
  results: T[],
  role: UserRole,
): { allowed: T[]; blocked: T[]; requiresDisclaimer: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];
  const requiresDisclaimer: T[] = [];

  for (const result of results) {
    const sourceBlocked =
      result.sourceType !== undefined && !isSourceAccessible(result.sourceType, role);
    const contentBlocked =
      result.contentType !== undefined && !isContentTypeAccessible(result.contentType, role);

    if (sourceBlocked || contentBlocked) {
      blocked.push(result);
    } else {
      allowed.push(result);
      // statistical_outcome entries are YELLOW zone — require disclaimer
      if (result.contentType === 'statistical_outcome') {
        requiresDisclaimer.push(result);
      }
    }
  }

  return { allowed, blocked, requiresDisclaimer };
}
