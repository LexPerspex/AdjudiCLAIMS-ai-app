/**
 * Investigation checklist runtime management service.
 *
 * The investigation-generator creates checklist items when a claim is opened.
 * This service manages them at runtime:
 *   - Auto-completion when a classified document satisfies a checklist item
 *   - Manual completion / undo by examiners and supervisors
 *   - Progress tracking (X of Y complete, percentage)
 *
 * Auto-completion mapping:
 *   DWC1_CLAIM_FORM   → DWC1_ON_FILE
 *   MEDICAL_REPORT    → MEDICAL_RECORDS
 *   EMPLOYER_REPORT   → EMPLOYER_REPORT
 *   WAGE_STATEMENT    → AWE_VERIFIED
 */

import type { InvestigationItemType, DocumentType } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestigationItemWithDetails {
  id: string;
  claimId: string;
  itemType: InvestigationItemType;
  isComplete: boolean;
  completedAt: Date | null;
  completedById: string | null;
  documentId: string | null;
  /** Derived — true when this item was auto-completed by a document upload. */
  isAutoCompleted: boolean;
  /** Human-readable label for the item type. */
  label: string;
  /** Brief description of what this item requires. */
  description: string;
}

export interface InvestigationProgress {
  items: InvestigationItemWithDetails[];
  totalItems: number;
  completedItems: number;
  percentComplete: number;
}

// ---------------------------------------------------------------------------
// Item labels and descriptions
// ---------------------------------------------------------------------------

const ITEM_LABELS: Record<InvestigationItemType, { label: string; description: string }> = {
  THREE_POINT_CONTACT_WORKER: {
    label: 'Three-Point Contact: Injured Worker',
    description: 'Initial contact with the injured worker to gather claim details',
  },
  THREE_POINT_CONTACT_EMPLOYER: {
    label: 'Three-Point Contact: Employer',
    description: 'Contact employer to verify employment and injury circumstances',
  },
  THREE_POINT_CONTACT_PROVIDER: {
    label: 'Three-Point Contact: Medical Provider',
    description: 'Contact treating physician for medical status and work restrictions',
  },
  RECORDED_STATEMENT: {
    label: 'Recorded Statement',
    description: 'Obtain recorded statement from injured worker',
  },
  EMPLOYER_REPORT: {
    label: 'Employer Report Received',
    description: "Employer's report of occupational injury or illness on file",
  },
  MEDICAL_RECORDS: {
    label: 'Medical Records Requested',
    description: 'Request and obtain treating physician medical records',
  },
  DWC1_ON_FILE: {
    label: 'DWC-1 Claim Form on File',
    description: "Workers' compensation claim form (DWC-1) received and filed",
  },
  INDEX_BUREAU_CHECK: {
    label: 'Index Bureau / Prior Claims Search',
    description: "Search for prior workers' compensation claims by this applicant",
  },
  AWE_VERIFIED: {
    label: 'Average Weekly Earnings Verified',
    description: 'Verify AWE from wage statements for benefit calculation',
  },
  INITIAL_RESERVES_SET: {
    label: 'Initial Reserves Established',
    description: 'Set initial indemnity, medical, legal, and lien reserves',
  },
};

// ---------------------------------------------------------------------------
// Document → investigation item auto-completion mapping
// ---------------------------------------------------------------------------

const DOCUMENT_AUTO_COMPLETE_MAP: Partial<Record<DocumentType, InvestigationItemType>> = {
  DWC1_CLAIM_FORM: 'DWC1_ON_FILE',
  MEDICAL_REPORT: 'MEDICAL_RECORDS',
  EMPLOYER_REPORT: 'EMPLOYER_REPORT',
  WAGE_STATEMENT: 'AWE_VERIFIED',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enrichItem(item: {
  id: string;
  claimId: string;
  itemType: InvestigationItemType;
  isComplete: boolean;
  completedAt: Date | null;
  completedById: string | null;
  documentId: string | null;
}): InvestigationItemWithDetails {
  const meta = ITEM_LABELS[item.itemType];
  return {
    id: item.id,
    claimId: item.claimId,
    itemType: item.itemType,
    isComplete: item.isComplete,
    completedAt: item.completedAt,
    completedById: item.completedById,
    documentId: item.documentId,
    isAutoCompleted: item.documentId !== null,
    label: meta.label,
    description: meta.description,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the full investigation checklist for a claim with progress summary.
 */
export async function getInvestigationProgress(
  claimId: string,
): Promise<InvestigationProgress> {
  const items = await prisma.investigationItem.findMany({
    where: { claimId },
    select: {
      id: true,
      claimId: true,
      itemType: true,
      isComplete: true,
      completedAt: true,
      completedById: true,
      documentId: true,
    },
    orderBy: { id: 'asc' },
  });

  const enriched = items.map(enrichItem);
  const completedItems = enriched.filter((i) => i.isComplete).length;
  const totalItems = enriched.length;
  const percentComplete = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return {
    items: enriched,
    totalItems,
    completedItems,
    percentComplete,
  };
}

/**
 * Manually mark an investigation item as complete.
 *
 * @param itemId - The investigation item ID
 * @param userId - The user completing the item
 * @param _notes - Optional notes (reserved for future use)
 */
export async function markItemComplete(
  itemId: string,
  userId: string,
  _notes?: string,
): Promise<InvestigationItemWithDetails> {
  const updated = await prisma.investigationItem.update({
    where: { id: itemId },
    data: {
      isComplete: true,
      completedAt: new Date(),
      completedById: userId,
    },
    select: {
      id: true,
      claimId: true,
      itemType: true,
      isComplete: true,
      completedAt: true,
      completedById: true,
      documentId: true,
    },
  });

  return enrichItem(updated);
}

/**
 * Undo completion of an investigation item.
 *
 * Caller must verify the user has SUPERVISOR or ADMIN role before calling.
 */
export async function markItemIncomplete(
  itemId: string,
): Promise<InvestigationItemWithDetails> {
  const updated = await prisma.investigationItem.update({
    where: { id: itemId },
    data: {
      isComplete: false,
      completedAt: null,
      completedById: null,
      documentId: null,
    },
    select: {
      id: true,
      claimId: true,
      itemType: true,
      isComplete: true,
      completedAt: true,
      completedById: true,
      documentId: true,
    },
  });

  return enrichItem(updated);
}

/**
 * Auto-complete an investigation item when a matching document is classified.
 *
 * Checks the DOCUMENT_AUTO_COMPLETE_MAP and, if a match exists and the item
 * is not already complete, marks it as completed with a reference to the
 * triggering document.
 *
 * @returns The item type that was auto-completed, or null if no match / already complete.
 */
export async function autoCompleteFromDocument(
  claimId: string,
  documentType: DocumentType,
  documentId: string,
): Promise<string | null> {
  const targetItemType = DOCUMENT_AUTO_COMPLETE_MAP[documentType];

  if (!targetItemType) {
    return null;
  }

  // Find the matching investigation item for this claim
  const item = await prisma.investigationItem.findFirst({
    where: {
      claimId,
      itemType: targetItemType,
    },
    select: {
      id: true,
      isComplete: true,
    },
  });

  // No item found or already complete — nothing to do
  if (!item || item.isComplete) {
    return null;
  }

  // Auto-complete with document reference
  await prisma.investigationItem.update({
    where: { id: item.id },
    data: {
      isComplete: true,
      completedAt: new Date(),
      documentId,
    },
  });

  return targetItemType;
}

/**
 * Get the human-readable label and description for an investigation item type.
 */
export function getItemLabel(
  itemType: InvestigationItemType,
): { label: string; description: string } {
  return ITEM_LABELS[itemType];
}
