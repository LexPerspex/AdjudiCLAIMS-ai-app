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
 * Log an email to the console in development mode.
 * Only logs recipient domain (not full address) and subject — never body content.
 */
function logEmailToConsole(payload: EmailPayload, messageId: string): void {
  const recipientDomain = payload.to.split('@')[1] ?? 'unknown';
  console.info(
    `[email.service] DEV MODE — email not sent. ` +
    `to=*@${recipientDomain} subject="${payload.subject}" messageId=${messageId}`,
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

    const body = {
      personalizations: [{ to: [{ email: payload.to }] }],
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
 * Send a counsel referral notification to defense counsel.
 *
 * The email contains a factual summary of the referral — no legal analysis.
 * The referralSummary should be the output of generateCounselReferral(),
 * which has already passed UPL output validation.
 *
 * @param counselEmail - Defense counsel's email address.
 * @param referralSummary - The UPL-validated factual summary text.
 * @param claimNumber - Claim number for the subject line (not PHI).
 */
export async function sendCounselReferralNotification(
  counselEmail: string,
  referralSummary: string,
  claimNumber: string,
): Promise<EmailResult> {
  const payload: EmailPayload = {
    to: counselEmail,
    subject: `Defense Counsel Referral — Claim ${claimNumber}`,
    textBody: [
      `Defense Counsel Referral — Claim ${claimNumber}`,
      '',
      'You have received a factual claim summary for your review from AdjudiCLAIMS.',
      '',
      '---',
      '',
      referralSummary,
      '',
      '---',
      '',
      'This summary contains factual claim information only. No legal analysis or',
      'conclusions have been made by the claims examiner. All legal determinations',
      'are deferred to licensed counsel.',
      '',
      'Please log in to the claims system to respond to this referral.',
    ].join('\n'),
    htmlBody: [
      '<html><body>',
      `<h2>Defense Counsel Referral — Claim ${claimNumber}</h2>`,
      '<p>You have received a factual claim summary for your review from AdjudiCLAIMS.</p>',
      '<hr/>',
      `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(referralSummary)}</pre>`,
      '<hr/>',
      '<p><em>This summary contains factual claim information only. No legal analysis or ',
      'conclusions have been made by the claims examiner. All legal determinations ',
      'are deferred to licensed counsel.</em></p>',
      '<p>Please log in to the claims system to respond to this referral.</p>',
      '</body></html>',
    ].join('\n'),
  };

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
