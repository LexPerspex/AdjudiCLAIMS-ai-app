/**
 * Document-level access control filtering.
 *
 * Enforces attorney/examiner data boundaries at the database query level.
 * All examiner-side roles (CLAIMS_EXAMINER, CLAIMS_SUPERVISOR, CLAIMS_ADMIN)
 * are filtered — none of them are licensed attorneys and none may access
 * attorney-only, privileged, work product, or legal analysis documents.
 *
 * UPL compliance: Cal. Bus. & Prof. Code § 6125 prohibits non-attorneys from
 * accessing content that constitutes the practice of law. These filters enforce
 * that boundary at the data layer before any content reaches the UI or AI.
 */

import type { UserRole } from '../middleware/rbac.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Prisma where-clause fragment for document list queries.
 * Applied to `prisma.document.findMany({ where: { ...filter } })`.
 */
export interface DocumentAccessFilter {
  accessLevel?: { not: 'ATTORNEY_ONLY' };
  containsLegalAnalysis?: boolean;
  containsWorkProduct?: boolean;
  containsPrivileged?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get Prisma where-clause filters for document access based on user role.
 *
 * Examiner roles (CLAIMS_EXAMINER, CLAIMS_SUPERVISOR, CLAIMS_ADMIN): exclude
 * ATTORNEY_ONLY documents, legal analysis, work product, and privileged content.
 *
 * All roles in this system are examiner-side — there are no attorney roles in
 * AdjudiCLAIMS. The role parameter is retained for forward compatibility if
 * attorney roles are ever added.
 */
export function getDocumentAccessFilter(_role: UserRole): DocumentAccessFilter {
  return {
    accessLevel: { not: 'ATTORNEY_ONLY' },
    containsLegalAnalysis: false,
    containsWorkProduct: false,
    containsPrivileged: false,
  };
}

/**
 * Get Prisma where-clause for RAG vector search via DocumentChunk queries.
 *
 * Applied to the nested `document` relation in a DocumentChunk findMany:
 * ```ts
 * prisma.documentChunk.findMany({ where: { ...getRagAccessFilter(role) } })
 * ```
 *
 * Excludes attorney-only, privileged, work product, and legal analysis
 * documents from embedding search results before they reach the LLM context.
 */
export function getRagAccessFilter(_role: UserRole): Record<string, unknown> {
  return {
    document: {
      accessLevel: { not: 'ATTORNEY_ONLY' },
      containsLegalAnalysis: false,
      containsWorkProduct: false,
      containsPrivileged: false,
    },
  };
}

/**
 * Check if a specific document is accessible to a given role.
 *
 * Used for direct document access (GET /api/documents/:id) after the document
 * has already been fetched from the database. Returns false if any restricted
 * flag is set, triggering a 403 response upstream.
 *
 * @param doc - Document with access control fields selected.
 * @param _role - User role (retained for forward compatibility).
 * @returns true if the document may be shown to the user; false otherwise.
 */
export function isDocumentAccessible(
  doc: {
    accessLevel: string;
    containsLegalAnalysis: boolean;
    containsWorkProduct: boolean;
    containsPrivileged: boolean;
  },
  _role: UserRole,
): boolean {
  if (doc.accessLevel === 'ATTORNEY_ONLY') return false;
  if (doc.containsLegalAnalysis) return false;
  if (doc.containsWorkProduct) return false;
  if (doc.containsPrivileged) return false;
  return true;
}
