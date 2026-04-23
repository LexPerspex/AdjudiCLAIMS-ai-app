import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Platform Transparency',
  description: 'Every AI output in AdjudiCLAIMS shows its source, its reasoning, and its statutory basis. No black boxes.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function TransparencyPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Glass Box Philosophy
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Platform Transparency
          </h1>
          <p className="text-lg mb-6" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Every conclusion is citable. Every calculation is auditable. Every AI output shows where it came from.
          </p>
          <blockquote className="rounded-xl p-5 text-base italic" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.9)' }}>
            "We don't ask you to trust the AI. We show you exactly what the AI found, where it found it,
            and what the statute says about it. Trust follows from transparency."
          </blockquote>
        </div>
      </section>

      {/* Five Transparency Principles */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Core Principles</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-10">The Glass Box Standard</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '📎', title: 'Every Output Cites Its Source', desc: 'AI responses include document name, page number, and extracted text. Examiners always know where a fact came from — not just what the AI said.' },
              { icon: '🧮', title: 'Every Calculation Shows Its Formula', desc: 'TD rate: (AWE × 2/3) per LC 4653. Penalty: 10% of overdue payment per LC 4650(c). The formula, the inputs, and the statutory basis are always visible.' },
              { icon: '⚖', title: 'Every Deadline Cites Its Statute', desc: 'Not "14-day deadline" — "LC 4650 requires first TD payment within 14 days of the date of temporary disability. Failure triggers an automatic 10% penalty."' },
              { icon: '🔍', title: 'Every AI Decision Is Auditable', desc: '60+ audit event types. Every document upload, AI response, deadline trigger, and user action is logged with timestamp, user ID, and action type. Retained for 7 years.' },
              { icon: '🏷', title: 'Every Classification Shows Confidence', desc: 'Document AI classifications include confidence scores. Low-confidence classifications surface for human review — never silently auto-accepted.' },
              { icon: '🎓', title: 'Every Regulatory Rule Is Explained', desc: '57 always-present education entries explain why each rule exists and what happens when it\'s violated. The law is not a black box to users of AdjudiCLAIMS.' },
            ].map((p) => (
              <div key={p.title} className="bg-white rounded-xl p-7 border border-l-4" style={{ border: '1px solid #c4c5d5', borderLeft: '4px solid #00288e' }}>
                <div className="text-3xl mb-4">{p.icon}</div>
                <h3 className="font-bold mb-2">{p.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit Log */}
      <section style={{ background: '#0f172a' }} className="py-20 px-6 text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">The Immutable Audit Log</h2>
          <p className="mb-10" style={{ color: '#94a3b8', maxWidth: 560 }}>
            Every action in AdjudiCLAIMS is recorded. Every record is immutable. Nothing can be deleted or modified.
            Retained for 7 years per California workers' compensation statute.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { cat: 'Document Events', color: '#6366f1', items: ['document_uploaded', 'document_classified', 'document_extraction_complete', 'document_access_denied'] },
              { cat: 'AI Chat Events', color: '#059669', items: ['upl_zone_classification', 'upl_output_blocked', 'upl_disclaimer_injected', 'upl_adversarial_detected'] },
              { cat: 'Claims Events', color: '#d97706', items: ['claim_created', 'deadline_triggered', 'deadline_missed', 'benefit_calculated'] },
              { cat: 'Auth & Access', color: '#dc2626', items: ['user_login', 'mfa_verified', 'session_expired', 'permission_denied'] },
            ].map((cat) => (
              <div key={cat.cat} className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="font-bold mb-3" style={{ color: cat.color }}>{cat.cat}</div>
                <div className="flex flex-col gap-2">
                  {cat.items.map((item) => (
                    <div key={item} className="text-xs font-mono px-3 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>{item}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs" style={{ color: '#475569' }}>Plus 44+ additional audit event types. All events include: timestamp, user ID, session ID, IP, action, resource ID, before/after state, and result.</p>
        </div>
      </section>

      {/* What We Don't Do */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">What We Explicitly Do Not Do</h2>
          <p className="mb-10" style={{ color: '#444653' }}>
            Transparency is also about being clear about the boundaries of the system.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'We do not give legal advice', desc: 'AdjudiCLAIMS cannot and does not provide legal advice, legal analysis, or legal conclusions to non-attorney users.' },
              { label: 'We do not make claims decisions', desc: 'The AI surfaces information. The examiner makes all substantive decisions. The system is designed to support — not replace — human judgment.' },
              { label: 'We do not hide confidence scores', desc: 'All AI outputs include confidence indicators. Low-confidence outputs are flagged for human review rather than presented as certain facts.' },
              { label: 'We do not log PHI content', desc: 'PHI is never logged. The audit log records document IDs and action types — not medical content, diagnoses, or personal health information.' },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0 mt-0.5" style={{ background: '#dc2626' }}>✕</div>
                  <div>
                    <div className="font-bold mb-1">{item.label}</div>
                    <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 text-center" style={{ background: '#faf8ff' }}>
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">Request the full AI Explainability documentation</h2>
          <p className="mb-8" style={{ color: '#444653' }}>We publish our AI explainability standard and audit methodology to prospective customers.</p>
          <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
            style={{ background: GRAD }}>Contact Us</Link>
        </div>
      </section>
    </>
  );
}
