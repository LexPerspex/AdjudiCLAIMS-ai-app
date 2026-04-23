import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security & HIPAA',
  description: 'AdjudiCLAIMS security posture: SOC 2, HIPAA, TLS 1.3, at-rest encryption, immutable audit logs, MFA, and zero-trust access controls.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Security & Compliance
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Security &amp; HIPAA
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Workers' compensation claims contain medical records and personal health information.
            AdjudiCLAIMS is built with HIPAA-grade security from the ground up.
          </p>
        </div>
      </section>

      {/* Stats */}
      <div style={{ background: '#0f172a' }} className="py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-10 text-center text-white">
          {[
            { num: 'TLS 1.3', label: 'In-Transit Encryption' },
            { num: 'AES-256', label: 'At-Rest Encryption' },
            { num: 'SOC 2', label: 'Type II Compliance Path' },
            { num: 'HIPAA', label: 'Covered Entity Ready' },
            { num: '7 yrs', label: 'Immutable Audit Retention' },
            { num: 'MFA', label: 'Required for All Users' },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-extrabold mb-1">{s.num}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HIPAA */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>HIPAA Compliance</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">Built for PHI from Day One</h2>
          <p className="mb-10" style={{ color: '#444653', maxWidth: 600 }}>
            Workers' compensation claims are not automatically subject to HIPAA, but they contain medical records
            that deserve the same level of protection. AdjudiCLAIMS is designed to satisfy HIPAA's technical
            safeguard requirements.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: 'Data Minimization', desc: 'AdjudiCLAIMS collects only what is necessary to process claims. Medical content is processed for extraction but never stored in logs. Document IDs are logged, not content.' },
              { title: 'PHI Never Logged', desc: 'The audit log records user actions and document IDs only. No PHI — no diagnoses, no medical histories, no personal health information — appears in any log entry.' },
              { title: 'Role-Based Access', desc: 'Examiners access only claims assigned to them. Supervisors see their team. Admins see the organization. Cross-tenant access is architecturally impossible.' },
              { title: 'BAA Ready', desc: 'Business Associate Agreements are available for enterprise customers. Our GCP infrastructure (Cloud Run, Cloud SQL, Secret Manager) is covered under Google\'s BAA.' },
              { title: 'Right to Deletion', desc: 'DSAR export and right-to-deletion workflows are built in. Examiners can export their data. Admins can execute deletion requests per CCPA/CPRA.' },
              { title: 'Retention Policy', desc: '7-year retention for claims-related data per California LC § 3762. Automatic expiry enforcement. Data is not kept longer than required.' },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border border-l-4" style={{ borderColor: '#c4c5d5', borderLeftColor: '#00288e' }}>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Infrastructure Security */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Infrastructure</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-10">GCP — Zero-Trust Architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: '🔐', title: 'Secrets Management', desc: 'All credentials in GCP Secret Manager. No API keys in environment variables, code, or configuration files. Secrets are accessed at runtime only, per-service.' },
              { icon: '🌐', title: 'Private Network', desc: 'Cloud SQL on private IP — no public database endpoint. Cloud Run services communicate over VPC only. No direct internet access to the database tier.' },
              { icon: '🔑', title: 'Least Privilege IAM', desc: 'Each service has its own dedicated service account with minimum required permissions. No shared service accounts. No Compute Engine default SA used.' },
              { icon: '🏗', title: 'Immutable Infrastructure', desc: 'Cloud Run deploys are immutable container images. No SSH access to production. All changes go through Cloud Build CI/CD with test gates.' },
              { icon: '📊', title: 'Continuous Monitoring', desc: 'Cloud Logging + Monitoring on every HTTP request and AI call. Anomaly detection for unusual access patterns. Automated alerts for security events.' },
              { icon: '🛡', title: 'Security Headers', desc: 'HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy enforced on all responses. OWASP Top 10 mitigations applied by default.' },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOC 2 */}
      <section style={{ background: '#0f172a' }} className="py-20 px-6 text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">SOC 2 Type II — In Progress</h2>
          <p className="mb-10" style={{ color: '#94a3b8', maxWidth: 580 }}>
            AdjudiCLAIMS is built to the SOC 2 Type II standard from day one. Our controls span CC6 (Logical
            Access), CC7 (System Operations), and CC8 (Change Management).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { control: 'CC6', title: 'Logical & Physical Access', items: ['MFA required for all users', 'TOTP authenticator app', 'Account lockout after 5 failures', 'Session timeout and re-auth', 'Role-based access control'] },
              { control: 'CC7', title: 'System Operations', items: ['Anomaly detection alerts', 'Intrusion detection logging', 'Performance monitoring', 'Incident response procedures', 'Automated backup verification'] },
              { control: 'CC8', title: 'Change Management', items: ['CI/CD with test gates', 'PR review required', 'Automated lint and security scan', 'Immutable container deploys', 'Rollback capability'] },
            ].map((cc) => (
              <div key={cc.control} className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>SOC 2 {cc.control}</div>
                <div className="font-bold mb-4">{cc.title}</div>
                <div className="flex flex-col gap-2">
                  {cc.items.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm" style={{ color: '#cbd5e1' }}>
                      <span style={{ color: '#4ade80' }}>✓</span>{item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Authentication */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Authentication</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-10">Multi-Factor Authentication — Required</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: 'TOTP (Time-Based OTP)', desc: 'All users must configure a TOTP authenticator app (Google Authenticator, Authy, 1Password). TOTP is required on every login — no bypass option.' },
              { title: 'Account Lockout', desc: '5 failed login attempts triggers a lockout. Unlocking requires email verification plus supervisor notification for claims examiner accounts.' },
              { title: 'Password Policy', desc: 'Minimum 12 characters, complexity requirements, bcrypt hashing with cost factor 12, breach detection via HaveIBeenPwned API on registration.' },
              { title: 'Session Security', desc: '30-minute idle timeout. Session tokens in HttpOnly secure cookies. CSRF protection on all state-changing endpoints.' },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 text-center" style={{ background: '#f2f3ff' }}>
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">Request our security documentation</h2>
          <p className="mb-8" style={{ color: '#444653' }}>Security questionnaires, penetration test reports, and SOC 2 documentation available under NDA.</p>
          <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
            style={{ background: GRAD }}>Contact Security Team</Link>
        </div>
      </section>
    </>
  );
}
