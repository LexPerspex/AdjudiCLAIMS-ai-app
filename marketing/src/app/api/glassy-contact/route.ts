import { type NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const DEST_EMAIL = process.env.GLASSY_CONTACT_EMAIL ?? 'support@adjudica.ai';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders(origin) });
  }

  const { firstName, lastName, firm, email, phone, practiceSize, message } = body;

  if (!firstName || !lastName || !firm || !email) {
    return NextResponse.json(
      { error: 'First name, last name, firm, and email are required.' },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400, headers: corsHeaders(origin) });
  }

  const html = `
    <div style="font-family: Inter, ui-sans-serif, system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #c4c5d5;">
      <div style="background: linear-gradient(135deg, #00288e 0%, #1e40af 100%); padding: 24px 32px; color: white;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; margin-bottom: 4px;">
          Glassy User — Demo Request
        </div>
        <div style="font-size: 20px; font-weight: 800;">
          ${escapeHtml(firstName)} ${escapeHtml(lastName)} — ${escapeHtml(firm)}
        </div>
      </div>

      <div style="padding: 32px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            ${[
              ['Name', `${escapeHtml(firstName)} ${escapeHtml(lastName)}`],
              ['Firm', escapeHtml(firm)],
              ['Email', `<a href="mailto:${escapeHtml(email)}" style="color: #00288e;">${escapeHtml(email)}</a>`],
              phone ? ['Phone', escapeHtml(phone)] : null,
              practiceSize ? ['Practice Size', escapeHtml(practiceSize)] : null,
            ]
              .filter((row): row is [string, string] => row !== null)
              .map(
                (row) => `
              <tr style="border-bottom: 1px solid #f2f3ff;">
                <td style="padding: 10px 0; font-weight: 600; color: #444653; width: 40%;">${row[0]}</td>
                <td style="padding: 10px 0; color: #131b2e;">${row[1]}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>

        ${
          message
            ? `
          <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 3px solid #00288e;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #444653; margin-bottom: 8px;">Message</div>
            <p style="margin: 0; font-size: 14px; color: #131b2e; line-height: 1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
        `
            : ''
        }

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #c4c5d5; font-size: 11px; color: #94a3b8;">
          Submitted from glassy.adjudica.ai · ${new Date().toISOString()}
        </div>
      </div>
    </div>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: 'Glassy User <noreply@adjudiclaims.com>',
      to: DEST_EMAIL,
      replyTo: email,
      subject: `Demo Request: ${firstName} ${lastName} — ${firm}`,
      html,
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders(origin) });
  } catch (err) {
    console.error('[glassy-contact] resend error', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Failed to send your request. Please email support@adjudica.ai directly.' },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
