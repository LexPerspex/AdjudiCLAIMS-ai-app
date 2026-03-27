/**
 * Counsel referral service.
 *
 * Generates factual claim summaries for defense counsel referral.
 * Triggered when an examiner hits a RED zone query and requests
 * a summary to send to their assigned attorney.
 *
 * The summary contains 6 sections (Claim Overview, Medical Evidence,
 * Benefits Status, Timeline, Legal Issue Identified, Documents Available)
 * and must pass UPL output validation before delivery.
 */

import type { FastifyRequest } from 'fastify';
import type { CounselReferral, ReferralStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { getLLMAdapter } from '../lib/llm/index.js';
import { COUNSEL_REFERRAL_PROMPT } from '../prompts/adjudiclaims-chat.prompts.js';
import { validateOutput, type ValidationResult } from './upl-validator.service.js';
import { logAuditEvent } from '../middleware/audit.js';
import { parseJsonStringArray } from '../lib/json-array.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for generating a counsel referral summary.
 *
 * Triggered when an examiner encounters a RED zone query and requests a
 * factual claim summary to send to their assigned defense attorney. The
 * summary covers 6 sections to give counsel a complete picture without
 * requiring independent claim file review.
 */
export interface CounselReferralRequest {
  /** The claim ID to generate the referral summary for. */
  claimId: string;
  /** The requesting examiner's user ID (for audit logging). */
  userId: string;
  /** Description of the legal issue that triggered the referral. */
  legalIssue: string;
  /** Fastify request for audit logging (IP, user-agent). */
  request: FastifyRequest;
}

/**
 * Response from counsel referral summary generation.
 *
 * The summary contains 6 required sections (Claim Overview, Medical Evidence,
 * Benefits Status, Claim Timeline, Legal Issue Identified, Documents Available).
 * These 6 sections ensure counsel receives a complete factual picture. The count
 * was chosen to match standard defense counsel intake forms.
 *
 * If UPL output validation fails, wasBlocked=true and the summary is replaced
 * with a generic message directing the examiner to contact counsel directly.
 */
export interface CounselReferralResponse {
  /** The generated summary text (or blocked message if validation failed). */
  summary: string;
  /** Names of the 6 required sections found in the generated summary. */
  sections: string[];
  /** UPL output validation result. */
  validation: ValidationResult;
  /** True if the summary was blocked due to UPL output validation failure. */
  wasBlocked: boolean;
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

/**
 * Fetch the claim data needed for the counsel referral summary.
 * Excludes attorney-only and privileged documents from the document list.
 * Never fetches document content -- only metadata (IDs, names, types, dates).
 */
async function gatherClaimData(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      claimNumber: true,
      claimantName: true,
      dateOfInjury: true,
      bodyParts: true,
      employer: true,
      insurer: true,
      status: true,
      dateReceived: true,
      dateAcknowledged: true,
      dateDetermined: true,
      isLitigated: true,
      hasApplicantAttorney: true,
      totalPaidIndemnity: true,
      totalPaidMedical: true,
      currentReserveIndemnity: true,
      currentReserveMedical: true,
      documents: {
        where: {
          accessLevel: { not: 'ATTORNEY_ONLY' },
          containsPrivileged: false,
        },
        select: {
          id: true,
          fileName: true,
          documentType: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      deadlines: {
        select: {
          deadlineType: true,
          dueDate: true,
          status: true,
          statutoryAuthority: true,
        },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  return claim;
}

/**
 * Format the gathered claim data into a context string for the LLM prompt.
 * All data is factual -- no analysis, interpretation, or PII beyond what
 * the claim record already contains.
 */
function formatClaimContext(
  claim: NonNullable<Awaited<ReturnType<typeof gatherClaimData>>>,
  legalIssue: string,
): string {
  const dateStr = (d: Date | null | undefined): string =>
    d ? (d.toISOString().split('T')[0] ?? 'N/A') : 'N/A';

  const lines: string[] = [
    '## CLAIM DATA',
    `Claim Number: ${claim.claimNumber}`,
    `Claimant: ${claim.claimantName}`,
    `Date of Injury: ${dateStr(claim.dateOfInjury)}`,
    `Employer: ${claim.employer}`,
    `Insurer: ${claim.insurer}`,
    `Body Parts: ${parseJsonStringArray(claim.bodyParts).join(', ')}`,
    `Status: ${claim.status}`,
    `Litigated: ${String(claim.isLitigated)}`,
    `Applicant Attorney: ${String(claim.hasApplicantAttorney)}`,
    '',
    '## FINANCIAL',
    `Total Paid Indemnity: $${claim.totalPaidIndemnity.toString()}`,
    `Total Paid Medical: $${claim.totalPaidMedical.toString()}`,
    `Reserve Indemnity: $${claim.currentReserveIndemnity.toString()}`,
    `Reserve Medical: $${claim.currentReserveMedical.toString()}`,
    '',
    '## DEADLINES',
    ...claim.deadlines.map(
      (d) =>
        `- ${d.deadlineType}: ${dateStr(d.dueDate)} (${d.status}) [${d.statutoryAuthority}]`,
    ),
    '',
    '## DOCUMENTS',
    ...claim.documents.map(
      (d) =>
        `- ${d.fileName} (${d.documentType ?? 'unclassified'}, ${dateStr(d.createdAt)})`,
    ),
    '',
    '## LEGAL ISSUE IDENTIFIED',
    legalIssue,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/** The 6 required sections in every counsel referral summary. */
const REQUIRED_SECTIONS = [
  'Claim Overview',
  'Medical Evidence',
  'Benefits Status',
  'Claim Timeline',
  'Legal Issue Identified',
  'Documents Available',
] as const;

/**
 * Generate a factual counsel referral summary.
 *
 * The summary is validated against UPL output patterns before delivery.
 * If validation fails, the summary is blocked and the examiner is
 * directed to contact defense counsel directly.
 *
 * Never logs claim content or PII -- only IDs, section counts, and metadata.
 */
export async function generateCounselReferral(
  referralRequest: CounselReferralRequest,
): Promise<CounselReferralResponse> {
  const { claimId, userId, legalIssue, request } = referralRequest;

  const claim = await gatherClaimData(claimId);

  if (!claim) {
    return {
      summary: 'Claim not found.',
      sections: [],
      validation: { result: 'PASS', violations: [] },
      wasBlocked: false,
    };
  }

  const context = formatClaimContext(claim, legalIssue);

  const adapter = getLLMAdapter('FREE');
  const llmResponse = await adapter.generate({
    systemPrompt: COUNSEL_REFERRAL_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Generate a factual counsel referral summary for this claim.\n\n${context}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });

  let summary = llmResponse.content;

  // Handle stub mode (no API key configured)
  if (llmResponse.finishReason === 'STUB') {
    const dateStr = (d: Date | null | undefined): string =>
      d ? (d.toISOString().split('T')[0] ?? 'N/A') : 'N/A';

    summary = [
      '# Counsel Referral Summary',
      '',
      '## 1. Claim Overview',
      `Claimant: ${claim.claimantName} | Claim #: ${claim.claimNumber}`,
      `Date of Injury: ${dateStr(claim.dateOfInjury)}`,
      `Employer: ${claim.employer} | Insurer: ${claim.insurer}`,
      `Body Parts: ${parseJsonStringArray(claim.bodyParts).join(', ')}`,
      `Status: ${claim.status}`,
      '',
      '## 2. Medical Evidence Summary',
      '[LLM not configured -- medical evidence summary requires AI generation]',
      '',
      '## 3. Benefits Status',
      `Total Paid Indemnity: $${claim.totalPaidIndemnity.toString()}`,
      `Total Paid Medical: $${claim.totalPaidMedical.toString()}`,
      `Reserve Indemnity: $${claim.currentReserveIndemnity.toString()}`,
      `Reserve Medical: $${claim.currentReserveMedical.toString()}`,
      '',
      '## 4. Claim Timeline',
      `Date of Injury: ${dateStr(claim.dateOfInjury)}`,
      `Date Received: ${dateStr(claim.dateReceived)}`,
      `Date Acknowledged: ${dateStr(claim.dateAcknowledged)}`,
      `Date Determined: ${dateStr(claim.dateDetermined)}`,
      '',
      '## 5. Legal Issue Identified',
      legalIssue,
      '',
      '## 6. Documents Available',
      ...claim.documents.map((d) => `- ${d.fileName} (${d.documentType ?? 'unclassified'})`),
      '',
      "This factual summary is provided for defense counsel's review and legal analysis.",
    ].join('\n');
  }

  // Validate the output for UPL compliance
  const validation = validateOutput(summary);

  if (validation.result === 'FAIL') {
    void logAuditEvent({
      userId,
      claimId,
      eventType: 'UPL_OUTPUT_BLOCKED',
      eventData: {
        reason: 'Counsel referral output validation failed',
        violationCount: validation.violations.length,
      },
      request,
    });

    return {
      summary:
        'The generated summary was blocked because it contained language that may ' +
        'constitute legal advice. Please contact defense counsel directly.',
      sections: [],
      validation,
      wasBlocked: true,
    };
  }

  // Identify which of the 6 required sections are present
  const sections = REQUIRED_SECTIONS.filter((section) =>
    summary.includes(section),
  );

  void logAuditEvent({
    userId,
    claimId,
    eventType: 'COUNSEL_REFERRAL_GENERATED',
    eventData: {
      sectionsPresent: sections,
      sectionCount: sections.length,
      provider: llmResponse.provider,
      model: llmResponse.model,
    },
    request,
  });

  return {
    summary,
    sections: [...sections],
    validation,
    wasBlocked: false,
  };
}

// ---------------------------------------------------------------------------
// Tracked referral types
// ---------------------------------------------------------------------------

export type CounselReferralRecord = CounselReferral;

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['SENT', 'CLOSED'],
  SENT: ['RESPONDED', 'CLOSED'],
  RESPONDED: ['CLOSED'],
  CLOSED: [],
};

/**
 * Check whether a status transition is allowed.
 *
 * Valid transitions:
 *   PENDING  → SENT | CLOSED
 *   SENT     → RESPONDED | CLOSED
 *   RESPONDED → CLOSED
 *   CLOSED   → (none)
 */
export function isValidStatusTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

// ---------------------------------------------------------------------------
// Tracked referral CRUD
// ---------------------------------------------------------------------------

/**
 * Create a tracked counsel referral.
 *
 * Generates a factual summary via the existing `generateCounselReferral()`
 * function and persists the referral record with status PENDING.
 *
 * Logs a COUNSEL_REFERRAL_CREATED audit event.
 */
export async function createTrackedReferral(
  userId: string,
  claimId: string,
  legalIssue: string,
  request: FastifyRequest,
): Promise<CounselReferralRecord> {
  // Generate the summary using the existing function
  const referralResponse = await generateCounselReferral({
    claimId,
    userId,
    legalIssue,
    request,
  });

  // Persist the referral
  const referral = await prisma.counselReferral.create({
    data: {
      claimId,
      userId,
      legalIssue,
      summary: referralResponse.summary,
      status: 'PENDING',
    },
  });

  void logAuditEvent({
    userId,
    claimId,
    eventType: 'COUNSEL_REFERRAL_CREATED',
    eventData: {
      referralId: referral.id,
      wasBlocked: referralResponse.wasBlocked,
      sectionCount: referralResponse.sections.length,
    },
    request,
  });

  return referral;
}

/**
 * Get all referrals for a claim, ordered newest-first.
 */
export async function getClaimReferrals(
  claimId: string,
): Promise<CounselReferralRecord[]> {
  return prisma.counselReferral.findMany({
    where: { claimId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a specific referral by ID.
 */
export async function getReferralById(
  referralId: string,
): Promise<CounselReferralRecord | null> {
  return prisma.counselReferral.findUnique({
    where: { id: referralId },
  });
}

/**
 * Update referral status with transition validation.
 *
 * Enforces valid transitions:
 *   PENDING → SENT, SENT → RESPONDED, RESPONDED → CLOSED, any → CLOSED
 *
 * Optionally sets counselResponse and counselEmail.
 * Logs a COUNSEL_REFERRAL_STATUS_CHANGED audit event.
 */
export async function updateReferralStatus(
  referralId: string,
  status: string,
  request: FastifyRequest,
  counselResponse?: string,
  counselEmail?: string,
): Promise<CounselReferralRecord> {
  const existing = await prisma.counselReferral.findUnique({
    where: { id: referralId },
  });

  if (!existing) {
    throw new Error(`Referral not found: ${referralId}`);
  }

  if (!isValidStatusTransition(existing.status, status)) {
    throw new Error(
      `Invalid status transition: ${existing.status} → ${status}`,
    );
  }

  const updateData: {
    status: ReferralStatus;
    counselResponse?: string;
    counselEmail?: string;
    respondedAt?: Date;
  } = {
    status: status as ReferralStatus,
  };

  if (counselResponse !== undefined) {
    updateData.counselResponse = counselResponse;
  }

  if (counselEmail !== undefined) {
    updateData.counselEmail = counselEmail;
  }

  if (status === 'RESPONDED') {
    updateData.respondedAt = new Date();
  }

  const updated = await prisma.counselReferral.update({
    where: { id: referralId },
    data: updateData,
  });

  const user = request.session.user;

  void logAuditEvent({
    userId: user?.id ?? 'unknown',
    claimId: existing.claimId,
    eventType: 'COUNSEL_REFERRAL_STATUS_CHANGED',
    eventData: {
      referralId,
      previousStatus: existing.status,
      newStatus: status,
    },
    request,
  });

  return updated;
}
