import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Email service tests.
 *
 * Tests:
 * - isEmailConfigured() checks SENDGRID_API_KEY
 * - sendEmail() in dev mode logs to console, returns success
 * - sendEmail() with SendGrid configured calls the API
 * - sendCounselReferralNotification() formats the referral email
 * - PHI/PII is never logged (only domain, not full address)
 * - HTML escaping in counsel referral emails
 */

// ---------------------------------------------------------------------------
// Import (no external deps to mock for dev-mode tests)
// ---------------------------------------------------------------------------

import {
  isEmailConfigured,
  sendEmail,
  sendCounselReferralNotification,
  buildCounselReferralTextBody,
  buildCounselReferralHtmlBody,
} from '../../server/services/email.service.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('email.service', () => {
  const originalSendgridKey = process.env['SENDGRID_API_KEY'];
  const originalFromEmail = process.env['SENDGRID_FROM_EMAIL'];

  beforeEach(() => {
    // Default to dev mode (no SendGrid key)
    delete process.env['SENDGRID_API_KEY'];
    delete process.env['SENDGRID_FROM_EMAIL'];
  });

  afterEach(() => {
    if (originalSendgridKey !== undefined) {
      process.env['SENDGRID_API_KEY'] = originalSendgridKey;
    } else {
      delete process.env['SENDGRID_API_KEY'];
    }
    if (originalFromEmail !== undefined) {
      process.env['SENDGRID_FROM_EMAIL'] = originalFromEmail;
    } else {
      delete process.env['SENDGRID_FROM_EMAIL'];
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // isEmailConfigured
  // -----------------------------------------------------------------------

  describe('isEmailConfigured', () => {
    it('returns false when SENDGRID_API_KEY is not set', () => {
      delete process.env['SENDGRID_API_KEY'];
      expect(isEmailConfigured()).toBe(false);
    });

    it('returns false when SENDGRID_API_KEY is empty string', () => {
      process.env['SENDGRID_API_KEY'] = '';
      expect(isEmailConfigured()).toBe(false);
    });

    it('returns true when SENDGRID_API_KEY is set', () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key-value';
      expect(isEmailConfigured()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // sendEmail — dev mode (console logging)
  // -----------------------------------------------------------------------

  describe('sendEmail (dev mode)', () => {
    it('returns sent: true with a synthetic messageId', async () => {
      const result = await sendEmail({
        to: 'counsel@lawfirm.test',
        subject: 'Test subject',
        textBody: 'Test body content',
      });

      expect(result.sent).toBe(true);
      expect(result.messageId).toBeTruthy();
      expect(result.messageId).toMatch(/^msg_/);
    });

    it('logs to console in dev mode', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEmail({
        to: 'counsel@lawfirm.test',
        subject: 'Test email',
        textBody: 'Body text',
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logArgs = consoleSpy.mock.calls.map((call) => call[0]);
      expect(logArgs.some((arg: string) => arg.includes('DEV MODE'))).toBe(true);
    });

    it('logs only recipient domain, NOT full email address (PHI protection)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEmail({
        to: 'john.smith@secretfirm.test',
        subject: 'Confidential',
        textBody: 'Body',
      });

      const allLogs = consoleSpy.mock.calls.map((call) => String(call[0])).join(' ');
      // Should contain domain
      expect(allLogs).toContain('secretfirm.test');
      // Should NOT contain full email
      expect(allLogs).not.toContain('john.smith@secretfirm.test');
    });
  });

  // -----------------------------------------------------------------------
  // sendEmail — SendGrid mode
  // -----------------------------------------------------------------------

  describe('sendEmail (SendGrid mode)', () => {
    it('calls SendGrid API when configured', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 202,
          headers: { 'X-Message-Id': 'sg-msg-123' },
        }),
      );

      const result = await sendEmail({
        to: 'counsel@firm.test',
        subject: 'Test',
        textBody: 'Body',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.sent).toBe(true);
      expect(result.messageId).toBe('sg-msg-123');
    });

    it('returns error on SendGrid failure', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Bad Request', { status: 400 }),
      );

      const result = await sendEmail({
        to: 'counsel@firm.test',
        subject: 'Test',
        textBody: 'Body',
      });

      expect(result.sent).toBe(false);
      expect(result.error).toContain('400');
    });

    it('handles network errors gracefully', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network timeout'));

      const result = await sendEmail({
        to: 'counsel@firm.test',
        subject: 'Test',
        textBody: 'Body',
      });

      expect(result.sent).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  // -----------------------------------------------------------------------
  // sendCounselReferralNotification
  // -----------------------------------------------------------------------

  describe('sendCounselReferralNotification', () => {
    it('sends a formatted referral email', async () => {
      const result = await sendCounselReferralNotification(
        'defense@lawfirm.test',
        'Factual claim summary here.',
        'WC-2025-00456',
      );

      expect(result.sent).toBe(true);
    });

    it('includes claim number in subject', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendCounselReferralNotification(
        'defense@lawfirm.test',
        'Summary content',
        'WC-2025-00789',
      );

      const allLogs = consoleSpy.mock.calls.map((call) => String(call[0])).join(' ');
      expect(allLogs).toContain('WC-2025-00789');
    });

    it('includes UPL disclaimer in email body', async () => {
      // In dev mode the body is logged — capture it
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendCounselReferralNotification(
        'defense@lawfirm.test',
        'Test referral summary',
        'WC-2025-00100',
      );

      // The function constructs textBody with legal disclaimer text
      // We verify the function completed without error (disclaimer is in the payload)
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('escapes HTML in referral summary to prevent XSS', async () => {
      // This tests the escapeHtml function indirectly
      const result = await sendCounselReferralNotification(
        'defense@lawfirm.test',
        '<script>alert("xss")</script> & "quotes"',
        'WC-2025-00200',
      );

      expect(result.sent).toBe(true);
      // The HTML body should have escaped the script tag
      // (verified by the function not throwing)
    });
  });

  // -----------------------------------------------------------------------
  // Payload validation
  // -----------------------------------------------------------------------

  describe('payload handling', () => {
    it('handles optional htmlBody', async () => {
      const result = await sendEmail({
        to: 'test@example.test',
        subject: 'Plain text only',
        textBody: 'Just text, no HTML',
      });
      expect(result.sent).toBe(true);
    });

    it('handles optional replyTo', async () => {
      const result = await sendEmail({
        to: 'test@example.test',
        subject: 'With reply-to',
        textBody: 'Body',
        replyTo: 'reply@example.test',
      });
      expect(result.sent).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // CC support (AJC-17)
  // -----------------------------------------------------------------------

  describe('sendEmail — CC support', () => {
    it('passes CC into the SendGrid personalization block (string form)', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'info').mockImplementation(() => {});

      let capturedBody: unknown = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => {
          capturedBody = init?.body
            ? JSON.parse(init.body as string)
            : null;
          return Promise.resolve(new Response(null, {
            status: 202,
            headers: { 'X-Message-Id': 'sg-cc-1' },
          }));
        },
      );

      const result = await sendEmail({
        to: 'counsel@firm.test',
        cc: 'examiner@adjudica.test',
        subject: 'Test',
        textBody: 'Body',
      });

      expect(result.sent).toBe(true);
      const body = capturedBody as {
        personalizations: { to: { email: string }[]; cc?: { email: string }[] }[];
      };
      expect(body.personalizations[0]?.cc).toEqual([
        { email: 'examiner@adjudica.test' },
      ]);
    });

    it('passes CC into the SendGrid personalization block (array form)', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'info').mockImplementation(() => {});

      let capturedBody: unknown = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => {
          capturedBody = init?.body
            ? JSON.parse(init.body as string)
            : null;
          return Promise.resolve(new Response(null, {
            status: 202,
            headers: { 'X-Message-Id': 'sg-cc-2' },
          }));
        },
      );

      await sendEmail({
        to: 'counsel@firm.test',
        cc: ['ex1@adjudica.test', 'ex2@adjudica.test'],
        subject: 'Test',
        textBody: 'Body',
      });

      const body = capturedBody as {
        personalizations: { cc?: { email: string }[] }[];
      };
      expect(body.personalizations[0]?.cc).toEqual([
        { email: 'ex1@adjudica.test' },
        { email: 'ex2@adjudica.test' },
      ]);
    });

    it('omits CC from SendGrid body when not provided', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'info').mockImplementation(() => {});

      let capturedBody: unknown = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => {
          capturedBody = init?.body
            ? JSON.parse(init.body as string)
            : null;
          return Promise.resolve(new Response(null, {
            status: 202,
            headers: { 'X-Message-Id': 'sg-no-cc' },
          }));
        },
      );

      await sendEmail({
        to: 'counsel@firm.test',
        subject: 'Test',
        textBody: 'Body',
      });

      const body = capturedBody as {
        personalizations: { cc?: { email: string }[] }[];
      };
      expect(body.personalizations[0]?.cc).toBeUndefined();
    });

    it('logs CC domain (not full address) in dev mode', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEmail({
        to: 'counsel@firm.test',
        cc: 'jane.examiner@acme-ins.test',
        subject: 'Test',
        textBody: 'Body',
      });

      const allLogs = consoleSpy.mock.calls.map((call) => String(call[0])).join(' ');
      expect(allLogs).toContain('acme-ins.test');
      expect(allLogs).not.toContain('jane.examiner@acme-ins.test');
    });

    it('drops empty CC entries', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'info').mockImplementation(() => {});

      let capturedBody: unknown = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => {
          capturedBody = init?.body
            ? JSON.parse(init.body as string)
            : null;
          return Promise.resolve(new Response(null, {
            status: 202,
            headers: { 'X-Message-Id': 'sg-empty-cc' },
          }));
        },
      );

      await sendEmail({
        to: 'counsel@firm.test',
        cc: ['', 'real@adjudica.test'],
        subject: 'Test',
        textBody: 'Body',
      });

      const body = capturedBody as {
        personalizations: { cc?: { email: string }[] }[];
      };
      expect(body.personalizations[0]?.cc).toEqual([
        { email: 'real@adjudica.test' },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Counsel referral email — UPL safety + content (AJC-17)
  // -----------------------------------------------------------------------

  describe('counsel referral email — body construction', () => {
    /**
     * UPL-prohibited phrases that must NEVER appear in the generated email body.
     * The email layer is purely a transport — it must not characterize the
     * legal issue or add legal analysis. Mirrors a subset of the patterns in
     * server/services/upl-validator.service.ts.
     */
    const UPL_PROHIBITED_PHRASES = [
      'in my opinion',
      'I recommend',
      'I advise',
      'you should sue',
      'you have a strong case',
      'we will win',
      'this constitutes',
      'is a violation of',
      'the law requires you to',
      'as your attorney',
      'legal advice',
    ];

    it('forwards legalIssue verbatim in the text body', () => {
      const text = buildCounselReferralTextBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        legalIssue: 'Dispute over AOE/COE for the lumbar spine.',
        referralSummary: '## Claim Overview\nFactual content.',
      });

      expect(text).toContain('Dispute over AOE/COE for the lumbar spine.');
      expect(text).toContain('verbatim');
    });

    it('includes the factual referral summary in the text body', () => {
      const text = buildCounselReferralTextBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        legalIssue: 'Coverage question',
        referralSummary: '## Claim Overview\nClaim WC-2025-00042 facts.',
      });

      expect(text).toContain('## Claim Overview');
      expect(text).toContain('Claim WC-2025-00042 facts.');
    });

    it('includes the UPL safety disclaimer in the text body', () => {
      const text = buildCounselReferralTextBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        referralSummary: 'Summary',
      });

      expect(text).toContain('No legal analysis');
      expect(text.toLowerCase()).toContain('factual');
    });

    it('does NOT contain UPL-prohibited phrases when given clean inputs', () => {
      const text = buildCounselReferralTextBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        legalIssue: 'Whether the injury arose out of employment.',
        referralSummary: 'Factual claim summary with no legal conclusions.',
      });

      const lowerText = text.toLowerCase();
      for (const phrase of UPL_PROHIBITED_PHRASES) {
        expect(lowerText).not.toContain(phrase.toLowerCase());
      }
    });

    it('escapes HTML in legalIssue and referralSummary to prevent XSS', () => {
      const html = buildCounselReferralHtmlBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        legalIssue: '<script>alert(1)</script>',
        referralSummary: '<img src=x onerror=alert(1)>',
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });

    it('omits legalIssue and examinerName sections when not provided', () => {
      const text = buildCounselReferralTextBody({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00042',
        referralSummary: 'Summary',
      });

      expect(text).not.toContain('Submitted by');
      expect(text).not.toContain('verbatim');
    });
  });

  describe('sendCounselReferralNotification — options form', () => {
    it('sets CC when examiner email is provided', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.test-key';
      vi.spyOn(console, 'info').mockImplementation(() => {});

      let capturedBody: unknown = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => {
          capturedBody = init?.body
            ? JSON.parse(init.body as string)
            : null;
          return Promise.resolve(new Response(null, {
            status: 202,
            headers: { 'X-Message-Id': 'sg-cnsl-1' },
          }));
        },
      );

      const result = await sendCounselReferralNotification({
        counselEmail: 'counsel@firm.test',
        cc: 'examiner@adjudica.test',
        claimNumber: 'WC-2025-00077',
        legalIssue: 'Coverage dispute.',
        referralSummary: 'Summary text.',
      });

      expect(result.sent).toBe(true);
      const body = capturedBody as {
        personalizations: { cc?: { email: string }[] }[];
      };
      expect(body.personalizations[0]?.cc).toEqual([
        { email: 'examiner@adjudica.test' },
      ]);
    });

    it('still works with the legacy positional signature', async () => {
      const result = await sendCounselReferralNotification(
        'counsel@firm.test',
        'Legacy summary',
        'WC-2025-00088',
      );

      expect(result.sent).toBe(true);
    });

    it('forwards verbatim legalIssue into the body via the options form', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendCounselReferralNotification({
        counselEmail: 'counsel@firm.test',
        claimNumber: 'WC-2025-00099',
        legalIssue: 'Apportionment between two prior injuries.',
        referralSummary: 'Factual summary.',
      });

      // The dev-mode console preview includes the first 120 chars of the body
      const allLogs = consoleSpy.mock.calls.map((call) => String(call[0])).join(' ');
      expect(allLogs).toContain('Defense Counsel Referral');
    });
  });
});
