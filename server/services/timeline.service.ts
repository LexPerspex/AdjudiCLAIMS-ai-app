/**
 * Timeline event extraction service.
 *
 * Parses date references from document extracted text and creates
 * structured timeline events for a claim. Each event is categorized
 * by type (injury, filing, payment, medical evaluation, etc.) based
 * on contextual keywords surrounding the date reference.
 *
 * Two public entry points:
 *   - generateTimelineEvents(documentId) — extract events from one document
 *   - getClaimTimeline(claimId) — retrieve all events for a claim, sorted by date
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * A single timeline event extracted from document text.
 *
 * Events are created by parsing date references from OCR text and classifying
 * them based on surrounding context keywords. The event extraction approach
 * is deliberately simple (regex + keyword matching) rather than LLM-based,
 * because: (1) date formats in WC documents are standardized, (2) context
 * classification needs only a few categories, and (3) regex runs in ~0ms
 * vs ~1s for an LLM call per document.
 */
export interface TimelineEvent {
  /** Unique event record ID. */
  id: string;
  /** The claim this event belongs to. */
  claimId: string;
  /** The document this event was extracted from (null for manually added events). */
  documentId: string | null;
  /** The date of the event as parsed from the document text. */
  eventDate: Date;
  /** Event type classification (e.g., 'DATE_OF_INJURY', 'BENEFIT_PAYMENT'). */
  eventType: string;
  /** Context text surrounding the date reference (up to 200 chars). */
  description: string;
  /** Source document file name for attribution. */
  source: string;
}

// ---------------------------------------------------------------------------
// Event type classification
// ---------------------------------------------------------------------------

/**
 * Keyword-to-event-type mapping. Order matters: earlier entries take priority
 * when multiple keywords match the same context string.
 */
const EVENT_TYPE_RULES: ReadonlyArray<{
  keywords: ReadonlyArray<string>;
  eventType: string;
}> = [
  { keywords: ['date of injury', 'injured on'], eventType: 'DATE_OF_INJURY' },
  { keywords: ['filed', 'claim form', 'dwc-1'], eventType: 'CLAIM_FILED' },
  { keywords: ['payment', 'paid', 'benefit check'], eventType: 'BENEFIT_PAYMENT' },
  { keywords: ['appointment', 'evaluation', 'examination', 'medical exam'], eventType: 'MEDICAL_EVALUATION' },
  { keywords: ['deposition', 'hearing', 'trial'], eventType: 'LEGAL_PROCEEDING' },
  { keywords: ['surgery', 'operation', 'surgical procedure'], eventType: 'SURGERY' },
  { keywords: ['return to work', 'returned to work', 'released to work'], eventType: 'RETURN_TO_WORK' },
  { keywords: ['maximum medical improvement', 'reached mmi', 'at mmi'], eventType: 'MMI_REACHED' },
];

const DEFAULT_EVENT_TYPE = 'DOCUMENT_EVENT';

/**
 * Classify a context string into an event type by scanning for known keywords.
 * Uses word-boundary matching for short keywords (≤4 chars) to avoid false
 * positives like "doi" matching "doing" or "exam" matching "example".
 */
function classifyEventType(context: string): string {
  const lower = context.toLowerCase();

  for (const rule of EVENT_TYPE_RULES) {
    for (const keyword of rule.keywords) {
      if (keyword.length <= 4) {
        const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (pattern.test(lower)) return rule.eventType;
      } else {
        if (lower.includes(keyword)) return rule.eventType;
      }
    }
  }

  return DEFAULT_EVENT_TYPE;
}

// ---------------------------------------------------------------------------
// Date extraction
// ---------------------------------------------------------------------------

/**
 * Combined regex matching common US date formats:
 *   - MM/DD/YYYY or MM-DD-YYYY
 *   - YYYY-MM-DD (ISO 8601)
 *   - Month DD, YYYY or Month DD YYYY (e.g., "January 15, 2024")
 *
 * Uses named groups for clarity.
 */
const DATE_PATTERNS: RegExp = new RegExp(
  [
    // MM/DD/YYYY or MM-DD-YYYY
    String.raw`(?<us>\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b)`,
    // YYYY-MM-DD
    String.raw`(?<iso>\b(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b)`,
    // Month DD[th/st/nd/rd], YYYY or Month DD YYYY — full and abbreviated month names
    String.raw`(?<long>\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b)`,
  ].join('|'),
  'gi',
);

interface ExtractedDate {
  dateString: string;
  parsed: Date;
  index: number;
}

/**
 * Parse a matched date string into a Date object.
 * Returns undefined if the string cannot be parsed into a valid date.
 */
function parseDate(dateString: string): Date | undefined {
  // Normalise separators for the US format: MM/DD/YYYY or MM-DD-YYYY
  const usMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(dateString);
  if (usMatch) {
    const month = usMatch[1];
    const day = usMatch[2];
    const year = usMatch[3];
    if (!month || !day || !year) return undefined;
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
    return isNaN(d.getTime()) ? undefined : d;
  }

  // ISO format: YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateString);
  if (isoMatch) {
    const d = new Date(`${dateString}T00:00:00`);
    return isNaN(d.getTime()) ? undefined : d;
  }

  // Long format: Month DD, YYYY or Month DD YYYY
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Find all date references in a block of text.
 */
function extractDates(text: string): ExtractedDate[] {
  const results: ExtractedDate[] = [];

  // Reset lastIndex in case the regex was used previously
  DATE_PATTERNS.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = DATE_PATTERNS.exec(text)) !== null) {
    const dateString = match[0];
    const parsed = parseDate(dateString);
    if (parsed) {
      results.push({ dateString, parsed, index: match.index });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Context extraction
// ---------------------------------------------------------------------------

/**
 * Extract the sentence or line surrounding a character index.
 *
 * Strategy:
 *   1. Find the line containing the index.
 *   2. If the line is very short (<20 chars), expand to include adjacent lines.
 *   3. Trim to a maximum of 200 characters, centred on the date.
 */
function extractContext(text: string, index: number): string {
  // Split into lines, find which line the index falls on.
  const lines = text.split(/\r?\n/);
  let charCount = 0;
  let targetLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const lineEnd = charCount + line.length + 1; // +1 for the newline char
    if (index < lineEnd) {
      targetLineIndex = i;
      break;
    }
    charCount = lineEnd;
  }

  const targetLine = lines[targetLineIndex] ?? '';
  let context = targetLine.trim();

  // If the line is very short, try to include neighbouring lines.
  if (context.length < 20) {
    const prevLine = targetLineIndex > 0 ? (lines[targetLineIndex - 1] ?? '') : '';
    const nextLine = targetLineIndex < lines.length - 1 ? (lines[targetLineIndex + 1] ?? '') : '';
    context = [prevLine.trim(), context, nextLine.trim()].filter(Boolean).join(' ');
  }

  // Cap at 200 characters.
  if (context.length > 200) {
    context = context.slice(0, 200).trimEnd() + '...';
  }

  return context;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract timeline events from a single document's text and persist them.
 *
 * @param documentId - Prisma Document record ID.
 * @returns The number of timeline events created.
 * @throws If the document does not exist or has no extracted text.
 */
export async function generateTimelineEvents(documentId: string): Promise<number> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      claimId: true,
      fileName: true,
      extractedText: true,
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.extractedText) {
    throw new Error(
      `Document ${documentId} has no extracted text. Run OCR before generating timeline events.`,
    );
  }

  const dates = extractDates(document.extractedText);

  if (dates.length === 0) {
    return 0;
  }

  const records = dates.map((entry) => {
    const text = document.extractedText ?? '';
    const context = extractContext(text, entry.index);
    const eventType = classifyEventType(context);

    return {
      claimId: document.claimId,
      documentId: document.id,
      eventDate: entry.parsed,
      eventType,
      description: context,
      source: document.fileName,
    };
  });

  const result = await prisma.timelineEvent.createMany({ data: records });

  return result.count;
}

/**
 * Retrieve all timeline events for a claim, sorted chronologically.
 *
 * @param claimId - Prisma Claim record ID.
 * @returns Array of timeline events ordered by eventDate ascending.
 */
export async function getClaimTimeline(claimId: string): Promise<TimelineEvent[]> {
  const events = await prisma.timelineEvent.findMany({
    where: { claimId },
    orderBy: { eventDate: 'asc' },
    select: {
      id: true,
      claimId: true,
      documentId: true,
      eventDate: true,
      eventType: true,
      description: true,
      source: true,
    },
  });

  return events;
}
