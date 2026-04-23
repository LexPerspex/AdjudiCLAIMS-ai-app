/**
 * Email service abstraction.
 *
 * Provides a configurable email sending layer. When SENDGRID_API_KEY is
 * configured, emails are sent via SendGrid. In development or when the
 * API key is absent, emails are logged to the console instead of being
 * delivered — useful for local development without outbound email setup.
 *
 * All send operations are audit-logged (to console) with message IDs.
 * PHI/PII is never logged — only claim numbers and recipient domains.
 *
 * UPL Note: This service is infrastructure only. Callers are responsible
 * for ensuring email body content complies with UPL zone requirements.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailPayload {
  /** Recipient email address. */
  to: string;
  /**
   * Optional CC recipient(s). Accepts a single address or an array.
   * Used to copy the requesting examiner on outbound counsel referrals
   * so they retain a record of what was sent.
   */
  cc?: string | string[];
  /** Email subject line. */
  subject: string;
  /** Plain-text email body. */
  textBody: string;
  /** Optional HTML email body. Falls back to textBody if absent. */
  htmlBody?: string;
  /** Optional reply-to address. */
  replyTo?: string;
}

export interface EmailResult {
  /** Whether the email was accepted for delivery (or logged in dev mode). */
  sent: boolean;
  /** Provider message ID (present when sent via SendGrid). */
  messageId?: string;
  /** Error message if send failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

/**
 * Check whether outbound email is configured.
 *
 * Returns true only when SENDGRID_API_KEY is set in the environment.
 * Used by callers to show appropriate UI state (e.g., "email not configured").
 */
export function isEmailConfigured(): boolean {
  return typeof process.env['SENDGRID_API_KEY'] === 'string' &&
    process.env['SENDGRID_API_KEY'].length > 0;
}

// ---------------------------------------------------------------------------
// Dev-mode log helper
// ---------------------------------------------------------------------------

/**
 * Normalize an optional CC field to an array of addresses.
 * Drops empty strings and undefined entries so downstream code can
 * treat the result uniformly.
 */
function normalizeCc(cc: string | string[] | undefined): string[] {
  if (cc === undefined) return [];
  const list = Array.isArray(cc) ? cc : [cc];
  return list.filter((addr): addr is string => typeof addr === 'string' && addr.length > 0);
}

/**
 * Log an email to the console in development mode.
 * Only logs recipient domain (not full address) and subject — never body content.
 */
function logEmailToConsole(payload: EmailPayload, messageId: string): void {
  const recipientDomain = payload.to.split('@')[1] ?? 'unknown';
  const ccDomains = normalizeCc(payload.cc)
    .map((addr) => addr.split('@')[1] ?? 'unknown')
    .map((domain) => `*@${domain}`)
    .join(',');
  const ccSegment = ccDomains.length > 0 ? ` cc=${ccDomains}` : '';
  console.info(
    `[email.service] DEV MODE — email not sent. ` +
    `to=*@${recipientDomain}${ccSegment} subject="${payload.subject}" messageId=${messageId}`,
  );
  console.info(`[email.service] Text body preview: ${payload.textBody.slice(0, 120)}...`);
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

/**
 * Send an email via SendGrid, or log it to the console in dev/unconfigured mode.
 *
 * When SendGrid is not configured, returns { sent: true, messageId } with a
 * synthetic message ID so callers can treat the result uniformly.
 *
 * Audit trail: logs recipient domain, subject, and message ID.
 * Never logs body content, full email addresses, or PHI.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (!isEmailConfigured()) {
    logEmailToConsole(payload, messageId);
    return { sent: true, messageId };
  }

  // SendGrid send path
  try {
    const apiKey = process.env['SENDGRID_API_KEY']!;

    const ccList = normalizeCc(payload.cc);
    const personalization: {
      to: { email: string }[];
      cc?: { email: string }[];
    } = { to: [{ email: payload.to }] };

    if (ccList.length > 0) {
      personalization.cc = ccList.map((email) => ({ email }));
    }

    const body = {
      personalizations: [personalization],
      from: { email: process.env['SENDGRID_FROM_EMAIL'] ?? 'noreply@adjudiclaims.com' },
      reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
      subject: payload.subject,
      content: [
        { type: 'text/plain', value: payload.textBody },
        ...(payload.htmlBody
          ? [{ type: 'text/html', value: payload.htmlBody }]
          : []),
      ],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const recipientDomain = payload.to.split('@')[1] ?? 'unknown';
      console.error(
        `[email.service] SendGrid error: status=${response.status} ` +
        `to=*@${recipientDomain} subject="${payload.subject}"`,
      );
      return {
        sent: false,
        error: `SendGrid responded with ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    // SendGrid returns 202 Accepted — message-id is in the X-Message-Id header
    const sendgridMessageId = response.headers.get('X-Message-Id') ?? messageId;

    const recipientDomain = payload.to.split('@')[1] ?? 'unknown';
    console.info(
      `[email.service] Email sent via SendGrid. ` +
      `to=*@${recipientDomain} subject="${payload.subject}" messageId=${sendgridMessageId}`,
    );

    return { sent: true, messageId: sendgridMessageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[email.service] Unexpected error sending email: ${errorMessage}`);
    return { sent: false, error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Convenience: counsel referral notification
// ---------------------------------------------------------------------------

/**
 * Options for sending a counsel referral notification email.
 *
 * The email body is built deterministically from these fields — there is no
 * LLM call at the email layer. The caller is responsible for ensuring
 * `referralSummary` has already passed UPL output validation, and for passing
 * the verbatim `legalIssue` text the examiner submitted (no characterization).
 */
export interface CounselReferralEmailOptions {
  /** Defense counsel's email address (primary recipient). */
  counselEmail: string;
  /** Optional CC recipient — typically the requesting examiner's email. */
  cc?: string | string[];
  /** Claim number for the subject line (not PHI). */
  claimNumber: string;
  /**
   * The legal issue text the examiner submitted, included verbatim.
   * Optional for backwards compatibility with callers that only have
   * the generated summary.
   */
  legalIssue?: string;
  /** The UPL-validated factual summary text from generateCounselReferral(). */
  referralSummary: string;
  /** Optional examiner display name (rendered as "Submitted by ..."). */
  examinerName?: string;
}

/**
 * Build the plain-text body for a counsel referral notification.
 *
 * Pure function — exported only for unit testing of UPL safety. Callers
 * should use {@link sendCounselReferralNotification} which builds the
 * payload, sends, and audits.
 */
export function buildCounselReferralTextBody(opts: CounselReferralEmailOptions): string {
  const lines: string[] = [
    `Defense Counsel Referral — Claim ${opts.claimNumber}`,
    '',
    'You have received a factual claim summary for your review from AdjudiCLAIMS.',
    '',
  ];

  if (opts.examinerName) {
    lines.push(`Submitted by: ${opts.examinerName}`);
    lines.push('');
  }

  if (opts.legalIssue) {
    lines.push('Legal issue identified by the examiner (verbatim):');
    lines.push(opts.legalIssue);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    opts.referralSummary,
    '',
    '---',
    '',
    'This summary contains factual claim information only. No legal analysis or',
    'conclusions have been made by the claims examiner. All legal determinations',
    'are deferred to licensed counsel.',
    '',
    'Please log in to the claims system to respond to this referral.',
  );

  return lines.join('\n');
}

/**
 * Build the HTML body for a counsel referral notification.
 *
 * All caller-supplied text is HTML-escaped to prevent injection.
 */
export function buildCounselReferralHtmlBody(opts: CounselReferralEmailOptions): string {
  const lines: string[] = [
    '<html><body>',
    `<h2>Defense Counsel Referral — Claim ${escapeHtml(opts.claimNumber)}</h2>`,
    '<p>You have received a factual claim summary for your review from AdjudiCLAIMS.</p>',
  ];

  if (opts.examinerName) {
    lines.push(`<p><strong>Submitted by:</strong> ${escapeHtml(opts.examinerName)}</p>`);
  }

  if (opts.legalIssue) {
    lines.push('<p><strong>Legal issue identified by the examiner (verbatim):</strong></p>');
    lines.push(
      `<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; margin: 8px 0;">` +
      `${escapeHtml(opts.legalIssue)}</blockquote>`,
    );
  }

  lines.push(
    '<hr/>',
    `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(opts.referralSummary)}</pre>`,
    '<hr/>',
    '<p><em>This summary contains factual claim information only. No legal analysis or ',
    'conclusions have been made by the claims examiner. All legal determinations ',
    'are deferred to licensed counsel.</em></p>',
    '<p>Please log in to the claims system to respond to this referral.</p>',
    '</body></html>',
  );

  return lines.join('\n');
}

/**
 * Send a counsel referral notification to defense counsel.
 *
 * The email contains a factual summary of the referral — no legal analysis.
 * The `referralSummary` should be the output of generateCounselReferral(),
 * which has already passed UPL output validation.
 *
 * Supports two call shapes for backwards compatibility:
 *   1. Positional: `(counselEmail, referralSummary, claimNumber)`
 *   2. Options object: `{ counselEmail, referralSummary, claimNumber, legalIssue?, cc?, examinerName? }`
 *
 * The options form is preferred for new callers — it supports CC'ing the
 * requesting examiner and including the verbatim legal issue.
 */
export async function sendCounselReferralNotification(
  counselEmailOrOptions: string | CounselReferralEmailOptions,
  referralSummary?: string,
  claimNumber?: string,
): Promise<EmailResult> {
  const opts: CounselReferralEmailOptions =
    typeof counselEmailOrOptions === 'string'
      ? {
          counselEmail: counselEmailOrOptions,
          referralSummary: referralSummary ?? '',
          claimNumber: claimNumber ?? '',
        }
      : counselEmailOrOptions;

  const payload: EmailPayload = {
    to: opts.counselEmail,
    subject: `Defense Counsel Referral — Claim ${opts.claimNumber}`,
    textBody: buildCounselReferralTextBody(opts),
    htmlBody: buildCounselReferralHtmlBody(opts),
  };

  if (opts.cc !== undefined) {
    payload.cc = opts.cc;
  }

  return sendEmail(payload);
}

// ---------------------------------------------------------------------------
// HTML escape helper
// ---------------------------------------------------------------------------

/**
 * Minimal HTML escaping for safe insertion into htmlBody.
 * Escapes &, <, >, ", and ' characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
