/**
 * Stub document classifier service.
 *
 * Classifies uploaded claim documents by running keyword matching against
 * the document's OCR-extracted text. Each document is assigned a
 * {@link DocumentType} enum value and a confidence score.
 *
 * This is intentionally a lightweight keyword-based implementation.
 * The production classifier will use an LLM-backed pipeline from the
 * shared @adjudica/document-classifier package.
 */

// TODO: Replace with @adjudica/document-classifier when shared package is available

import type { DocumentType } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of document type classification.
 *
 * The stub classifier uses keyword matching with a fixed confidence of 0.7
 * for matched types and 0.3 for the fallback 'OTHER' type. The production
 * LLM-backed classifier will provide calibrated confidence scores. Subtype
 * is reserved for future use (e.g., distinguishing PR-2 from PR-4 within
 * MEDICAL_REPORT).
 */
export interface ClassificationResult {
  /** Prisma DocumentType enum value (e.g., 'MEDICAL_REPORT', 'DWC1_CLAIM_FORM'). */
  documentType: string;
  /** Document subtype (currently null; reserved for future granular classification). */
  documentSubtype: string | null;
  /** Classification confidence score (0-1). */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Keyword rule definitions
// ---------------------------------------------------------------------------

interface KeywordRule {
  documentType: DocumentType;
  keywords: string[];
}

/**
 * Ordered list of keyword rules. The first rule whose keywords match wins,
 * so more specific types (e.g. AME_QME_REPORT) should appear before
 * broader ones (e.g. MEDICAL_REPORT).
 */
/**
 * Keyword rules ordered from most specific to least specific.
 * The first rule whose keywords match wins, so more specific
 * document types MUST appear before broader ones.
 *
 * Key ordering rationale:
 *   - DWC-1 is highly specific (unique form identifier)
 *   - AME/QME is specific (unique medical-legal terminology)
 *   - UTILIZATION_REVIEW is specific (unique regulatory term)
 *   - DEPOSITION_TRANSCRIPT is specific (legal proceeding type)
 *   - MEDICAL_REPORT must be BEFORE PHARMACY/BILLING because
 *     medical reports frequently reference medications, CPT codes,
 *     and billing — those keywords are NOT unique to pharmacy/billing
 *   - PHARMACY_RECORD, WAGE_STATEMENT, BILLING_STATEMENT use
 *     multi-word or distinct keywords to reduce false positives
 */
const KEYWORD_RULES: KeywordRule[] = [
  {
    documentType: 'DWC1_CLAIM_FORM',
    keywords: ['DWC-1', 'claim form', "workers' compensation claim"],
  },
  {
    documentType: 'AME_QME_REPORT',
    keywords: ['QME', 'AME', 'qualified medical evaluator', 'agreed medical'],
  },
  {
    documentType: 'UTILIZATION_REVIEW',
    keywords: ['utilization review', 'MTUS', 'treatment guideline'],
  },
  {
    documentType: 'DEPOSITION_TRANSCRIPT',
    keywords: ['deposition transcript', 'sworn testimony', 'deposition of'],
  },
  {
    documentType: 'IMAGING_REPORT',
    keywords: ['imaging report', 'MRI report', 'X-ray report', 'CT scan report', 'radiology report'],
  },
  // MEDICAL_REPORT before PHARMACY/BILLING — medical reports mention meds and CPT codes
  {
    documentType: 'MEDICAL_REPORT',
    keywords: ['diagnosis', 'treatment plan', 'medical report', 'physical examination', 'chief complaint'],
  },
  {
    documentType: 'PHARMACY_RECORD',
    keywords: ['pharmacy record', 'prescription history', 'medication list', 'dispensing record'],
  },
  {
    documentType: 'WAGE_STATEMENT',
    keywords: ['wage statement', 'earnings record', 'payroll record', 'W-2'],
  },
  {
    documentType: 'BILLING_STATEMENT',
    keywords: ['billing statement', 'invoice total', 'itemized charges', 'billing summary'],
  },
];

const DEFAULT_CONFIDENCE = 0.7;
const FALLBACK_CONFIDENCE = 0.3;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Match extracted text against keyword rules.
 *
 * Performs case-insensitive substring matching. Returns the first rule
 * whose keywords appear in the text, or falls back to OTHER.
 */
function matchKeywords(text: string): { documentType: DocumentType; confidence: number } {
  const lower = text.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.some((kw) => {
      const kwLower = kw.toLowerCase();
      // Use word-boundary matching for short keywords (≤4 chars) to avoid
      // false positives like "AME" matching "amet" in Latin text.
      if (kwLower.length <= 4) {
        const pattern = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        return pattern.test(lower);
      }
      return lower.includes(kwLower);
    });
    if (matched) {
      return { documentType: rule.documentType, confidence: DEFAULT_CONFIDENCE };
    }
  }

  return { documentType: 'OTHER', confidence: FALLBACK_CONFIDENCE };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a document by its OCR-extracted text.
 *
 * 1. Fetches the Document record from Prisma to obtain `extractedText`.
 * 2. Runs keyword matching to determine the document type.
 * 3. Updates the Document record with the classification result.
 * 4. Returns the classification.
 *
 * @param documentId - The CUID of the Document to classify.
 * @returns The classification result with type, subtype, and confidence.
 * @throws {Error} If the document does not exist or has no extracted text.
 */
export async function classifyDocument(documentId: string): Promise<ClassificationResult> {
  // Step 1: Fetch the document record
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, extractedText: true },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    throw new Error(`Document has no extracted text: ${documentId}`);
  }

  // Step 2: Run keyword matching
  const { documentType, confidence } = matchKeywords(document.extractedText);

  // Subtype is not determined by the stub classifier
  const documentSubtype: string | null = null;

  // Step 3: Persist classification to the document record
  await prisma.document.update({
    where: { id: documentId },
    data: {
      documentType,
      documentSubtype,
      classificationConfidence: confidence,
    },
  });

  // Step 4: Return result
  return {
    documentType,
    documentSubtype,
    confidence,
  };
}
