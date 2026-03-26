/**
 * Document field extraction service.
 *
 * Extracts structured fields from document OCR text using a two-pass
 * approach:
 *   1. Regex-based pattern matching for common field types (dates,
 *      dollar amounts, claim numbers, SSN-masked, person names).
 *   2. Claude API intelligent extraction based on document type
 *      (when ANTHROPIC_API_KEY is available).
 *
 * Falls back to regex-only extraction when no API key is configured.
 *
 * Results are persisted to the extracted_fields table via Prisma.
 */

import { getLLMAdapter } from '../lib/llm/index.js';
import type { DocumentType } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * A single structured field extracted from document text.
 *
 * Fields are extracted via a two-pass approach: (1) regex patterns for dates,
 * amounts, claim numbers, SSNs, and names, then (2) Claude API for document-type-
 * specific fields (e.g., diagnoses from medical reports, AWE from wage statements).
 * When both passes find the same field, the higher-confidence result wins.
 *
 * SSN values are always masked (XXX-XX-NNNN) to prevent PII exposure in logs
 * and API responses.
 */
export interface ExtractedField {
  /** Field type identifier (e.g., 'date', 'dollarAmount', 'claimNumber', 'diagnoses'). */
  fieldName: string;
  /** Extracted value as a string (SSNs are always masked). */
  fieldValue: string;
  /** Confidence score (0-1). Regex: fixed per pattern. LLM: model-assessed. */
  confidence: number;
  /** Source page number within the document (null if unknown). */
  sourcePage: number | null;
}

// ---------------------------------------------------------------------------
// Regex patterns for common field types
// ---------------------------------------------------------------------------

interface RegexFieldRule {
  fieldName: string;
  pattern: RegExp;
  confidence: number;
}

const COMMON_REGEX_RULES: RegexFieldRule[] = [
  // Dates in MM/DD/YYYY, MM-DD-YYYY, or YYYY-MM-DD format
  {
    fieldName: 'date',
    pattern: /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
    confidence: 0.85,
  },
  {
    fieldName: 'date',
    pattern: /\b(\d{4}-\d{2}-\d{2})\b/g,
    confidence: 0.85,
  },
  // Claim numbers — common CA WC formats (e.g., "Claim #06349136", "Claim Number: 06349136", "ADJ12345678")
  {
    fieldName: 'claimNumber',
    pattern: /\b(?:Claim\s*(?:No\.?|Number|#)?\s*:?\s*|ADJ)(\d{6,10})\b/gi,
    confidence: 0.9,
  },
  // Dollar amounts
  {
    fieldName: 'dollarAmount',
    pattern: /\$\s?([\d,]+(?:\.\d{2})?)\b/g,
    confidence: 0.9,
  },
  // SSN — masked output only (XXX-XX-1234). Supports hyphenated and dashless formats.
  {
    fieldName: 'ssnMasked',
    pattern: /\b\d{3}-\d{2}-(\d{4})\b/g,
    confidence: 0.95,
  },
  {
    fieldName: 'ssnMasked',
    pattern: /\b(\d{3})(\d{2})(\d{4})\b/g,
    confidence: 0.8,
  },
  // Person names — supports: First Last, First M. Last, First-Last, O'Brien, ALL CAPS
  // Case-insensitive label matching (OCR produces unpredictable casing)
  {
    fieldName: 'personName',
    pattern: /(?:Name|Patient|Claimant|Employee|Applicant|Physician|Dr\.?)\s*:?\s*([A-Z][a-zA-Z'-]+(?:\s[A-Z]\.?)?(?:\s[A-Z][a-zA-Z'-]+){1,3})/gi,
    confidence: 0.7,
  },
];

// ---------------------------------------------------------------------------
// Document-type-specific field definitions for Claude extraction
// ---------------------------------------------------------------------------

const DOCUMENT_TYPE_FIELDS: Partial<Record<DocumentType, string[]>> = {
  DWC1_CLAIM_FORM: [
    'claimantName',
    'dateOfInjury',
    'employer',
    'insurer',
    'bodyParts',
    'claimNumber',
  ],
  MEDICAL_REPORT: [
    'diagnoses',
    'bodyParts',
    'wpiRating',
    'workRestrictions',
    'treatingPhysician',
  ],
  AME_QME_REPORT: [
    'diagnoses',
    'bodyParts',
    'wpiRating',
    'workRestrictions',
    'treatingPhysician',
  ],
  WAGE_STATEMENT: [
    'averageWeeklyEarnings',
    'hourlyRate',
    'weeklyHours',
    'employerName',
  ],
  BILLING_STATEMENT: [
    'totalCharges',
    'providerName',
    'dateOfService',
  ],
};

// ---------------------------------------------------------------------------
// Regex extraction pass
// ---------------------------------------------------------------------------

function extractWithRegex(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];

  for (const rule of COMMON_REGEX_RULES) {
    // Reset lastIndex for global regexes used across calls
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null = rule.pattern.exec(text);
    while (match !== null) {
      const rawValue = match[1] ?? match[0];

      // For SSN matches, emit only the masked version.
      // Hyphenated SSN: group 1 = last 4 digits.
      // Dashless SSN: groups 1,2,3 = first 3, middle 2, last 4 digits.
      let value: string;
      if (rule.fieldName === 'ssnMasked') {
        const lastFour = match[3] ?? rawValue;
        value = `XXX-XX-${lastFour}`;
      } else {
        value = rawValue.trim();
      }

      fields.push({
        fieldName: rule.fieldName,
        fieldValue: value,
        confidence: rule.confidence,
        sourcePage: null,
      });

      match = rule.pattern.exec(text);
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Claude API extraction pass
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  text: string,
  documentType: DocumentType | null,
): string {
  const targetFields = documentType
    ? DOCUMENT_TYPE_FIELDS[documentType]
    : undefined;

  const fieldList =
    targetFields && targetFields.length > 0
      ? targetFields.join(', ')
      : 'dates, dollarAmounts, personNames';

  return [
    'You are a document field extraction system for California Workers\' Compensation claims.',
    '',
    `Extract the following fields from the document text: ${fieldList}`,
    '',
    'Return ONLY a JSON array of objects with this exact shape:',
    '  { "fieldName": string, "fieldValue": string, "confidence": number (0-1), "sourcePage": number | null }',
    '',
    'Rules:',
    '- confidence should reflect how certain you are the value is correct.',
    '- If a field is not found, omit it entirely — do NOT return null values.',
    '- For bodyParts and diagnoses, return one entry per item (not a combined string).',
    '- Never include SSN digits — if you detect an SSN, mask it as XXX-XX-NNNN.',
    '- Return raw JSON with no markdown fencing or explanation.',
    '',
    '--- DOCUMENT TEXT ---',
    text,
  ].join('\n');
}

interface ClaudeFieldResult {
  fieldName: string;
  fieldValue: string;
  confidence: number;
  sourcePage: number | null;
}

function isClaudeFieldResult(value: unknown): value is ClaudeFieldResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fieldName' in value &&
    typeof (value as ClaudeFieldResult).fieldName === 'string' &&
    'fieldValue' in value &&
    typeof (value as ClaudeFieldResult).fieldValue === 'string' &&
    'confidence' in value &&
    typeof (value as ClaudeFieldResult).confidence === 'number'
  );
}

async function extractWithClaude(
  text: string,
  documentType: DocumentType | null,
): Promise<ExtractedField[]> {
  const adapter = getLLMAdapter('FREE');
  const prompt = buildExtractionPrompt(text, documentType);

  const response = await adapter.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    maxTokens: 4096,
  });

  // No API key configured -- skip LLM extraction
  if (response.finishReason === 'STUB') {
    return [];
  }

  const responseText = response.content;
  if (!responseText) {
    throw new Error('LLM returned no text content for field extraction');
  }

  const parsed: unknown = JSON.parse(responseText);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM field extraction did not return a JSON array');
  }

  const fields: ExtractedField[] = [];

  for (const item of parsed as unknown[]) {
    if (!isClaudeFieldResult(item)) {
      continue;
    }

    fields.push({
      fieldName: item.fieldName,
      fieldValue: item.fieldValue,
      confidence: item.confidence,
      sourcePage: item.sourcePage ?? null,
    });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Merge regex and Claude results, preferring the higher-confidence
 * extraction when the same fieldName + fieldValue pair appears in both.
 */
function deduplicateFields(fields: ExtractedField[]): ExtractedField[] {
  const seen = new Map<string, ExtractedField>();

  for (const field of fields) {
    const key = `${field.fieldName}::${field.fieldValue}`;
    const existing = seen.get(key);
    if (!existing || field.confidence > existing.confidence) {
      seen.set(key, field);
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistFields(
  documentId: string,
  fields: ExtractedField[],
): Promise<void> {
  if (fields.length === 0) {
    return;
  }

  // Remove any previously extracted fields for this document
  await prisma.extractedField.deleteMany({
    where: { documentId },
  });

  await prisma.extractedField.createMany({
    data: fields.map((f) => ({
      documentId,
      fieldName: f.fieldName,
      fieldValue: f.fieldValue,
      confidence: f.confidence,
      sourcePage: f.sourcePage,
    })),
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract structured fields from a document's OCR text.
 *
 * Combines regex-based pattern matching with optional Claude API
 * intelligent extraction. Results are persisted to the extracted_fields
 * table and returned to the caller.
 *
 * @param documentId - The Prisma Document ID whose extractedText to process.
 * @returns Array of extracted fields with confidence scores.
 * @throws If the document does not exist or has no extracted text.
 */
export async function extractFields(
  documentId: string,
): Promise<ExtractedField[]> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      extractedText: true,
      documentType: true,
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    throw new Error(
      `Document ${documentId} has no extracted text — OCR may not be complete`,
    );
  }

  const text = document.extractedText;
  const documentType = document.documentType;

  // Pass 1: regex-based extraction (always runs)
  const regexFields = extractWithRegex(text);

  // Pass 2: LLM extraction (adapter returns stub when no API key is configured)
  let claudeFields: ExtractedField[] = [];
  try {
    claudeFields = await extractWithClaude(text, documentType);
  } catch {
    // LLM call failed (auth error, rate limit, etc.) — fall back to regex-only.
    // This is non-fatal: regex extraction still provides useful fields.
  }

  // Merge and deduplicate
  const allFields = deduplicateFields([...regexFields, ...claudeFields]);

  // Persist to database
  await persistFields(documentId, allFields);

  return allFields;
}
