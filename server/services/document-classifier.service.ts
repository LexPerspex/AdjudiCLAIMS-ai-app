/**
 * Document classifier service — classifies uploaded claim documents.
 *
 * Uses the @adjudica/document-classifier shared package for LLM-based
 * classification (two-step type → subtype flow), with a keyword pre-filter
 * as the fast path for obvious document types. Results are mapped from the
 * classifier's 11-type taxonomy to AdjudiCLAIMS's 16-value Prisma
 * DocumentType enum via the taxonomy map.
 *
 * Classification flow:
 *   1. Keyword pre-filter — fast, no API cost, handles obvious docs
 *   2. If keyword match is weak (OTHER or low confidence), invoke the
 *      @adjudica/document-classifier LLM pipeline (Claude Haiku)
 *   3. Map classifier result → Prisma DocumentType + access level flags
 *   4. Persist to Document record
 *
 * Access level auto-detection:
 *   - Scans text for attorney-only, legal analysis, work product,
 *     and privileged communication indicators
 *   - Combined with subtype-based detection (e.g., depositions → ATTORNEY_ONLY)
 */

import type { DocumentType } from '@prisma/client';
import { prisma } from '../db.js';
import { mapClassifierResult } from './classifier-taxonomy-map.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of document classification.
 *
 * Extends the original interface with classifier-specific fields.
 * Backward-compatible: documentType, documentSubtype, and confidence
 * are always present.
 */
export interface ClassificationResult {
  /** Prisma DocumentType enum value (e.g., 'MEDICAL_REPORT', 'DWC1_CLAIM_FORM'). */
  documentType: string;
  /** Classifier subtype (e.g., 'QME_REPORT_INITIAL') or null. */
  documentSubtype: string | null;
  /** Classification confidence score (0-1). */
  confidence: number;
  /** How the classification was determined. */
  classificationMethod: 'keyword' | 'llm' | 'keyword+llm';
  /** AI reasoning from the classifier (only present for LLM classifications). */
  aiReasoning?: string;
  /** Document date detected by the classifier (ISO string or null). */
  documentDate?: string | null;
  /** Detected access level. */
  accessLevel: 'SHARED' | 'ATTORNEY_ONLY' | 'EXAMINER_ONLY';
  /** Whether the document contains legal analysis language. */
  containsLegalAnalysis: boolean;
  /** Whether the document contains work product indicators. */
  containsWorkProduct: boolean;
  /** Whether the document contains privileged communication indicators. */
  containsPrivileged: boolean;
}

// ---------------------------------------------------------------------------
// Keyword rule definitions (fast path)
// ---------------------------------------------------------------------------

interface KeywordRule {
  documentType: DocumentType;
  keywords: string[];
}

/**
 * Keyword rules ordered from most specific to least specific.
 * The first rule whose keywords match wins. Covers all 16 Prisma
 * DocumentType values (except OTHER, which is the fallback).
 */
const KEYWORD_RULES: KeywordRule[] = [
  // Highly specific forms
  {
    documentType: 'DWC1_CLAIM_FORM',
    keywords: ['DWC-1', 'claim form', "workers' compensation claim", 'DWC 1'],
  },
  // Medical-legal evaluations (before general medical)
  {
    documentType: 'AME_QME_REPORT',
    keywords: [
      'QME',
      'AME',
      'qualified medical evaluator',
      'agreed medical evaluator',
      'independent medical evaluation',
      'IME report',
    ],
  },
  // Utilization review (before general medical)
  {
    documentType: 'UTILIZATION_REVIEW',
    keywords: [
      'utilization review',
      'MTUS',
      'treatment guideline',
      'request for authorization',
      'RFA',
      'independent medical review',
      'IMR determination',
    ],
  },
  // WCAB filings (before general legal — court orders, petitions, applications)
  {
    documentType: 'WCAB_FILING',
    keywords: [
      'application for adjudication',
      'declaration of readiness',
      'petition for reconsideration',
      'petition for removal',
      'petition to reopen',
      'WCAB order',
      'findings and award',
      'minutes of hearing',
      'order appointing QME',
      'order on sanctions',
    ],
  },
  // Lien claims (before billing — distinct workflow)
  {
    documentType: 'LIEN_CLAIM',
    keywords: [
      'lien claim',
      'lien claimant',
      'notice of lien',
      'lien resolution',
      'lien filing',
      'lien dismissal',
      'medical provider lien',
      'EDD overpayment lien',
    ],
  },
  // Discovery requests (before general legal — subpoenas, depo notices)
  {
    documentType: 'DISCOVERY_REQUEST',
    keywords: [
      'subpoena duces tecum',
      'SDT',
      'deposition notice',
      'notice of deposition',
      'records subpoena',
      'subpoenaed records',
    ],
  },
  // Deposition transcript (after discovery requests — transcripts only)
  {
    documentType: 'DEPOSITION_TRANSCRIPT',
    keywords: [
      'deposition transcript',
      'sworn testimony',
      'deposition of',
    ],
  },
  // Return to work (before employer — offers, SJDB, vocational)
  {
    documentType: 'RETURN_TO_WORK',
    keywords: [
      'offer of modified work',
      'offer of regular work',
      'SJDB voucher',
      'supplemental job displacement',
      'vocational rehabilitation',
      'vocational evaluation',
      'AD 10133',
      'AD 10118',
    ],
  },
  // Work product (before investigation — attorney strategy docs)
  {
    documentType: 'WORK_PRODUCT',
    keywords: [
      'trial brief',
      'case analysis memo',
      'settlement valuation',
      'litigation plan',
      'pretrial conference statement',
    ],
  },
  // Medical chronology (before investigation — analytical summaries)
  {
    documentType: 'MEDICAL_CHRONOLOGY',
    keywords: [
      'medical chronology',
      'medical timeline',
      'QME summary',
      'vocational expert report',
      'economist report',
      'life care plan',
    ],
  },
  // Imaging/diagnostics (before general medical)
  {
    documentType: 'IMAGING_REPORT',
    keywords: [
      'imaging report',
      'MRI report',
      'X-ray report',
      'CT scan report',
      'radiology report',
      'diagnostic imaging',
    ],
  },
  // Settlement documents (before general legal)
  {
    documentType: 'SETTLEMENT_DOCUMENT',
    keywords: [
      'settlement agreement',
      'compromise and release',
      'C&R',
      'stipulations with request for award',
      'settlement demand',
    ],
  },
  // DWC official forms (before general correspondence — regulated forms)
  {
    documentType: 'DWC_OFFICIAL_FORM',
    keywords: [
      'QME panel request',
      'Form 105',
      'Form 106',
      'DEU rating request',
      'MPN authorization',
      'first fill pharmacy',
    ],
  },
  // Payment records (before benefit notice — accounting docs)
  {
    documentType: 'PAYMENT_RECORD',
    keywords: [
      'payment record',
      'TD payment log',
      'PD payment record',
      'payment history',
      'indemnity payment record',
      'PD rating worksheet',
      'expense reimbursement',
    ],
  },
  // General medical report (broad — after specific medical types)
  {
    documentType: 'MEDICAL_REPORT',
    keywords: [
      'diagnosis',
      'treatment plan',
      'medical report',
      'physical examination',
      'chief complaint',
      'treating physician',
      'PR-2',
      'PR-4',
    ],
  },
  // Pharmacy
  {
    documentType: 'PHARMACY_RECORD',
    keywords: [
      'pharmacy record',
      'prescription history',
      'medication list',
      'dispensing record',
    ],
  },
  // Wage statements
  {
    documentType: 'WAGE_STATEMENT',
    keywords: [
      'wage statement',
      'earnings record',
      'payroll record',
      'W-2',
      'pay stub',
      'earning records',
    ],
  },
  // Billing
  {
    documentType: 'BILLING_STATEMENT',
    keywords: [
      'billing statement',
      'invoice total',
      'itemized charges',
      'billing summary',
      'UB-04',
      'CMS-1500',
      'explanation of review',
    ],
  },
  // Legal correspondence (before general correspondence)
  {
    documentType: 'LEGAL_CORRESPONDENCE',
    keywords: [
      'notice of representation',
      'legal representation',
      'defense counsel',
      'law firm',
      'attorney at law',
      'demand letter',
    ],
  },
  // Employer report
  {
    documentType: 'EMPLOYER_REPORT',
    keywords: [
      'employer report',
      'supervisor report',
      'incident report',
      'employer statement',
      'job description',
      'Form 5020',
    ],
  },
  // Investigation report
  {
    documentType: 'INVESTIGATION_REPORT',
    keywords: [
      'investigation report',
      'surveillance report',
      'sub rosa',
      'investigator report',
      'witness statement',
    ],
  },
  // Benefit notice
  {
    documentType: 'BENEFIT_NOTICE',
    keywords: [
      'benefit notice',
      'notice of benefits',
      'claim acceptance',
      'claim denial',
      'delay notice',
      'benefit explanation',
    ],
  },
  // Claim administration (internal docs)
  {
    documentType: 'CLAIM_ADMINISTRATION',
    keywords: [
      'claim notes',
      'reserve worksheet',
      'compliance certification',
      'three-point contact',
      'investigation checklist',
      'claim file inventory',
    ],
  },
  // General correspondence (catch-all for letters)
  {
    documentType: 'CORRESPONDENCE',
    keywords: [
      'dear',
      're:',
      'sincerely',
      'to whom it may concern',
      'status update',
      'courtesy copy',
    ],
  },
];

const KEYWORD_HIGH_CONFIDENCE = 0.9;
const KEYWORD_MEDIUM_CONFIDENCE = 0.7;
const KEYWORD_DEFAULT_CONFIDENCE = 0.55;
const KEYWORD_FALLBACK_CONFIDENCE = 0.3;

/** Confidence threshold below which we invoke the LLM fallback. */
const LLM_FALLBACK_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Match extracted text against keyword rules with graduated confidence.
 * Counts how many keywords from the matching rule appear in the text.
 */
function matchKeywords(text: string): {
  documentType: DocumentType;
  confidence: number;
} {
  const lower = text.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    const matchCount = rule.keywords.filter((kw) => {
      const kwLower = kw.toLowerCase();
      // Word-boundary matching for short keywords (≤4 chars)
      if (kwLower.length <= 4) {
        const pattern = new RegExp(
          `\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        );
        return pattern.test(lower);
      }
      return lower.includes(kwLower);
    }).length;

    if (matchCount >= 3) {
      return { documentType: rule.documentType, confidence: KEYWORD_HIGH_CONFIDENCE };
    }
    if (matchCount >= 2) {
      return { documentType: rule.documentType, confidence: KEYWORD_MEDIUM_CONFIDENCE };
    }
    if (matchCount >= 1) {
      return { documentType: rule.documentType, confidence: KEYWORD_DEFAULT_CONFIDENCE };
    }
  }

  return { documentType: 'OTHER', confidence: KEYWORD_FALLBACK_CONFIDENCE };
}

/**
 * Lazily import and instantiate the classifier from the shared package.
 * Returns null if the package is not available or ANTHROPIC_API_KEY is not set.
 */
async function getClassifierInstance(): Promise<{
  classify: (
    text: string,
    filename?: string,
  ) => Promise<{
    documentType: string | null;
    documentSubtype: string | null;
    confidence: number;
    aiReasoning: string;
    documentDate: string | null;
  }>;
} | null> {
  // No API key → skip LLM classification
  if (!process.env['ANTHROPIC_API_KEY']) {
    return null;
  }

  try {
    const { DocumentClassifier } = await import(
      '@adjudica/document-classifier'
    );
    const { ClassifierLLMAdapter } = await import(
      '../lib/llm/classifier-adapter.js'
    );

    const adapter = new ClassifierLLMAdapter();
    // Cast required: zod v3 (classifier pkg) vs zod v4 (this repo) type mismatch.
    // Structural compatibility is maintained — the adapter implements the
    // same generateStructured() signature at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const classifier = new DocumentClassifier(adapter as any, undefined, {
      useResearchReports: true,
      timeoutMs: 20_000,
      maxRetries: 1,
    });

    return {
      classify: (text: string, filename?: string) =>
        classifier.classify(text, filename),
    };
  } catch {
    // Package not available — fall back to keyword-only
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a document by its OCR-extracted text.
 *
 * 1. Fetches the Document record from Prisma to obtain `extractedText`.
 * 2. Runs keyword pre-filter for fast classification.
 * 3. If keyword result is weak, invokes the @adjudica/document-classifier
 *    LLM pipeline for more accurate classification.
 * 4. Maps the result to Prisma DocumentType + detects access level.
 * 5. Updates the Document record with classification and access flags.
 * 6. Returns the classification result.
 *
 * @param documentId - The CUID of the Document to classify.
 * @returns The classification result.
 * @throws {Error} If the document does not exist or has no extracted text.
 */
export async function classifyDocument(
  documentId: string,
): Promise<ClassificationResult> {
  // Step 1: Fetch the document record
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, extractedText: true, fileName: true },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    throw new Error(`Document has no extracted text: ${documentId}`);
  }

  const text = document.extractedText;

  // Step 2: Keyword pre-filter (fast path)
  const keywordResult = matchKeywords(text);

  let finalType: string = keywordResult.documentType;
  let finalSubtype: string | null = null;
  let finalConfidence: number = keywordResult.confidence;
  let classificationMethod: ClassificationResult['classificationMethod'] =
    'keyword';
  let aiReasoning: string | undefined;
  let documentDate: string | null | undefined;

  // Step 3: LLM fallback for weak keyword matches
  if (
    keywordResult.documentType === 'OTHER' ||
    keywordResult.confidence < LLM_FALLBACK_THRESHOLD
  ) {
    const classifier = await getClassifierInstance();

    if (classifier) {
      try {
        const llmResult = await classifier.classify(
          text,
          document.fileName,
        );

        if (llmResult.documentType) {
          // Map classifier taxonomy → Prisma DocumentType
          const mapped = mapClassifierResult(
            llmResult.documentType,
            llmResult.documentSubtype,
            text,
          );

          finalType = mapped.prismaDocumentType;
          finalSubtype = mapped.classifierSubtype;
          finalConfidence = llmResult.confidence;
          classificationMethod =
            keywordResult.documentType !== 'OTHER'
              ? 'keyword+llm'
              : 'llm';
          aiReasoning = llmResult.aiReasoning;
          documentDate = llmResult.documentDate;
        }
      } catch {
        // LLM failure is non-fatal — keep keyword result
      }
    }
  }

  // Step 4: Access level detection (runs on all paths)
  const taxonomyResult = mapClassifierResult(
    null,
    finalSubtype,
    text,
  );

  const result: ClassificationResult = {
    documentType: finalType,
    documentSubtype: finalSubtype,
    confidence: finalConfidence,
    classificationMethod,
    aiReasoning,
    documentDate,
    accessLevel: taxonomyResult.accessLevel,
    containsLegalAnalysis: taxonomyResult.containsLegalAnalysis,
    containsWorkProduct: taxonomyResult.containsWorkProduct,
    containsPrivileged: taxonomyResult.containsPrivileged,
  };

  // Step 5: Persist classification + access flags to the document record
  await prisma.document.update({
    where: { id: documentId },
    data: {
      documentType: finalType as DocumentType,
      documentSubtype: finalSubtype,
      classificationConfidence: finalConfidence,
      accessLevel: taxonomyResult.accessLevel,
      containsLegalAnalysis: taxonomyResult.containsLegalAnalysis,
      containsWorkProduct: taxonomyResult.containsWorkProduct,
      containsPrivileged: taxonomyResult.containsPrivileged,
    },
  });

  return result;
}
