import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'UPL Zone Explorer',
  description: 'Understand the GREEN, YELLOW, and RED UPL compliance zones that govern every AI interaction in AdjudiCLAIMS.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function UplZonesPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            UPL Compliance
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            The UPL Zone System
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Every AI interaction in AdjudiCLAIMS is classified into one of three zones that determine what the
            AI can say, what it must disclaim, and what it must block.
          </p>
        </div>
      </section>

      {/* Legal Context */}
      <section style={{ background: '#f2f3ff' }} className="py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-3">Why This Exists</h2>
          <p className="mb-3" style={{ color: '#444653' }}>
            California Business &amp; Professions Code § 6125 prohibits the unauthorized practice of law. Claims examiners
            are not attorneys. An AI product that provides legal analysis, coverage opinions, or settlement recommendations
            to non-attorneys violates this statute.
          </p>
          <p className="mb-4" style={{ color: '#444653' }}>
            AdjudiCLAIMS enforces UPL boundaries automatically through a three-stage pipeline — not through a policy
            document, but through code. The system cannot give legal advice to examiners. This is a hard technical constraint.
          </p>
          <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: '#dde9ff', border: '1px solid #93c5fd', color: '#00288e' }}>
            ⚖ Cal. Bus. &amp; Prof. Code § 6125
          </span>
        </div>
      </section>

      {/* Three Zones */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-extrabold tracking-tight mb-10 text-center">The Three Zones in Detail</h2>
          <div className="flex flex-col gap-8">
            {/* GREEN */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#a7f3d0' }}>
              <div className="px-7 py-4 flex items-center gap-3" style={{ background: '#d1fae5' }}>
                <div className="w-4 h-4 rounded-full" style={{ background: '#059669' }} />
                <span className="font-extrabold text-lg" style={{ color: '#065f46' }}>GREEN ZONE — Fully Permitted</span>
              </div>
              <div className="p-7" style={{ background: '#f0fdf4' }}>
                <p className="mb-6" style={{ color: '#444653' }}>
                  The GREEN zone covers factual data retrieval, arithmetic calculations, document summarization, and
                  regulatory citation. The AI can answer these questions directly without disclaimer.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {['Medical record summaries and WPI extractions', 'Benefit calculations (TD rate, payment schedules)', 'Statutory deadline tracking with citations', 'Document classification and field extraction', 'AWE calculation from pay stubs', 'Injury chronology and fact patterns', 'Investigation checklist status', 'MTUS guideline matching for UR'].map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm" style={{ color: '#065f46' }}>
                      <span className="mt-0.5 shrink-0">✓</span>{item}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#dcfce7', borderColor: '#86efac' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#059669' }}>Example GREEN response</div>
                  <p className="text-sm italic" style={{ color: '#131b2e' }}>
                    "The QME report dated 2025-03-01 (Dr. Martinez, page 4) states 12% WPI for the lumbar spine under
                    AMA Guides 5th Edition, Table 15-3. Based on the DOI of 2024-06-15 and this WPI, the TD period runs
                    through the date of P&S (LC 4650)."
                  </p>
                </div>
              </div>
            </div>

            {/* YELLOW */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#fde68a' }}>
              <div className="px-7 py-4 flex items-center gap-3" style={{ background: '#fef3c7' }}>
                <div className="w-4 h-4 rounded-full" style={{ background: '#d97706' }} />
                <span className="font-extrabold text-lg" style={{ color: '#92400e' }}>YELLOW ZONE — Disclaimer Required</span>
              </div>
              <div className="p-7" style={{ background: '#fffbeb' }}>
                <p className="mb-6" style={{ color: '#444653' }}>
                  The YELLOW zone covers statistical data and legal-adjacent information. The AI can present this data
                  but must append a mandatory disclaimer directing the examiner to consult defense counsel before acting on it.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {['Comparable claims resolution ranges', 'Medical inconsistency flags (statistical)', 'Litigation indicator patterns', 'Reserve adequacy benchmarks', 'Denial/delay rate comparisons', 'Industry-wide settlement percentiles'].map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm" style={{ color: '#92400e' }}>
                      <span className="mt-0.5 shrink-0">⚠</span>{item}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#fef9c3', borderColor: '#fde047' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#d97706' }}>Example YELLOW response (mandatory disclaimer)</div>
                  <p className="text-sm italic" style={{ color: '#131b2e' }}>
                    "Statistical data: comparable lumbar spine claims with 10–14% WPI in Los Angeles County resolved in the
                    $45,000–$85,000 range (25th–75th percentile, 2023–2025 data).<br /><br />
                    ⚠ Disclaimer: This is statistical data only, not a settlement recommendation. Consult defense counsel
                    before using this information in reserve discussions or negotiations."
                  </p>
                </div>
              </div>
            </div>

            {/* RED */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#fecdd3' }}>
              <div className="px-7 py-4 flex items-center gap-3" style={{ background: '#fee2e2' }}>
                <div className="w-4 h-4 rounded-full" style={{ background: '#dc2626' }} />
                <span className="font-extrabold text-lg" style={{ color: '#991b1b' }}>RED ZONE — Blocked</span>
              </div>
              <div className="p-7" style={{ background: '#fff1f2' }}>
                <p className="mb-6" style={{ color: '#444653' }}>
                  The RED zone covers legal analysis and advice. These queries are blocked before any AI processing
                  occurs. The examiner receives an attorney referral response, not an answer.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {['Coverage opinions and compensability determinations', 'Settlement recommendations or valuations', 'Case law interpretation', 'Liability analysis', 'Outcome predictions ("this claim will settle for...")', 'Legal strategy advice', 'Work product analysis', 'Expert witness selection'].map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm" style={{ color: '#991b1b' }}>
                      <span className="mt-0.5 shrink-0">🛑</span>{item}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#dc2626' }}>Example RED response (blocked)</div>
                  <p className="text-sm italic" style={{ color: '#131b2e' }}>
                    "🛑 This question requires legal analysis by a licensed attorney and cannot be answered by AdjudiCLAIMS.
                    Please contact your defense counsel for guidance on coverage questions, settlement strategy, and
                    compensability determinations. Cal. Bus. &amp; Prof. Code § 6125."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Stage Enforcement */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">Three Independent Enforcement Layers</h2>
          <p className="mb-10" style={{ color: '#444653' }}>
            The zone classification is not a policy — it's three separate technical mechanisms. All three must pass.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { num: '1', title: 'Query Classifier', desc: 'Lightweight pre-chat LLM call classifies the query before any document retrieval. RED queries stop here.' },
              { num: '2', title: 'System Prompt', desc: 'Role-specific system prompt enforces zone boundaries and prohibits legal analysis language patterns.' },
              { num: '3', title: 'Output Validator', desc: '24+ post-generation pattern checks. Even if stages 1 and 2 passed, prohibited output patterns trigger a block.' },
            ].map((s) => (
              <div key={s.num} className="bg-white rounded-xl p-7 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-extrabold mb-4"
                  style={{ background: GRAD }}>
                  {s.num}
                </div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Test Results */}
      <section style={{ background: '#0f172a' }} className="py-16 px-6 text-white text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-extrabold mb-8">Verified Against 517 Test Fixtures</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { num: '126', label: 'RED queries', sub: '100% blocked' },
              { num: '126', label: 'GREEN queries', sub: '0% false positive blocks' },
              { num: '62', label: 'YELLOW queries', sub: '100% include disclaimer' },
              { num: '203', label: 'Output variations', sub: '100% caught by validator' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="text-3xl font-extrabold mb-1">{s.num}</div>
                <div className="text-sm font-semibold mb-1">{s.label}</div>
                <div className="text-xs" style={{ color: '#94a3b8' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 text-center" style={{ background: '#faf8ff' }}>
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">See the full legal review package</h2>
          <p className="mb-8" style={{ color: '#444653' }}>Contact us for the complete UPL review documentation prepared for legal counsel.</p>
          <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
            style={{ background: GRAD }}>Contact Us</Link>
        </div>
      </section>
    </>
  );
}
