import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Executive Summary',
  description: 'AdjudiCLAIMS executive summary — the bottom line for decision-makers evaluating AI-powered claims management.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function ExecutiveSummaryPage() {
  return (
    <>
      {/* Document header */}
      <div style={{ background: GRAD }} className="text-white py-12 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between gap-6 items-start">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>⚖</div>
            <div>
              <h1 className="text-xl font-extrabold">AdjudiCLAIMS by Glass Box</h1>
              <p style={{ color: 'rgba(255,255,255,0.75)' }} className="text-sm">Executive Summary — Bottom Line Up Front</p>
            </div>
          </div>
          <div className="text-right text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <strong className="block text-white text-base font-bold">For Decision-Makers</strong>
            <span>California Workers' Compensation</span>
            <span className="inline-block mt-2 px-3 py-1 rounded text-xs font-bold uppercase tracking-widest"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
              CONFIDENTIAL
            </span>
          </div>
        </div>
      </div>

      {/* Document body */}
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* BLUF box */}
        <div className="rounded-xl p-8 mb-12" style={{ background: '#0f172a' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#b8c4ff' }}>Bottom Line Up Front</h2>
          <ul className="space-y-4">
            {[
              { bullet: '1', color: '#b8c4ff', text: 'AdjudiCLAIMS eliminates the three biggest drains on a CA workers\' comp claims operation: manual document review time, regulatory deadline penalties, and the 60-90 day competency gap for new examiners — simultaneously, in one platform.' },
              { bullet: '2', color: '#6ee7b7', text: 'The UPL compliance boundary is enforced by three independent technical mechanisms, not by policy. The system cannot give legal advice to examiners. This is verified by 517 automated test fixtures run on every release.' },
              { bullet: '3', color: '#fca5a5', text: 'For a 10-examiner operation, projected annual value is $200K–$400K from time savings plus penalty avoidance — before accounting for reduced E&O exposure, faster onboarding, and improved file quality.' },
            ].map((item) => (
              <li key={item.bullet} className="flex gap-4 items-start text-white border-b pb-4 last:border-0 last:pb-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5"
                  style={{ background: item.color, color: '#0f172a' }}>{item.bullet}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Problem */}
        <div className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 pb-1.5 mb-5" style={{ color: '#00288e', borderColor: '#00288e' }}>
            THE PROBLEM
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { num: '25–40%', label: 'Annual examiner turnover', red: true },
              { num: '3+ hrs', label: 'Per claim document review', red: true },
              { num: '60–90', label: 'Days to examiner competency', red: true },
              { num: '10→15%', label: 'Statutory TD penalty (SB 1234)', red: true },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-5 text-center border" style={{ background: '#f2f3ff', border: '1px solid #c4c5d5' }}>
                <div className="text-2xl font-extrabold mb-1" style={{ color: s.red ? '#dc2626' : '#00288e' }}>{s.num}</div>
                <div className="text-xs" style={{ color: '#444653' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ color: '#444653' }}>
            California workers' compensation claims operations face three structural problems that conventional
            claims software doesn't solve: the document review bottleneck, the regulatory compliance burden, and
            the examiner training gap. These three problems compound each other — undertrained examiners miss
            deadlines, which trigger penalties, which create additional documentation and review work.
          </p>
        </div>

        {/* Solution */}
        <div className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 pb-1.5 mb-5" style={{ color: '#00288e', borderColor: '#00288e' }}>
            THE SOLUTION
          </h2>
          <div className="overflow-x-auto rounded-xl border" style={{ border: '1px solid #c4c5d5' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f2f3ff' }}>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest" style={{ color: '#444653' }}>Problem</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest" style={{ color: '#444653' }}>AdjudiCLAIMS Solution</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest" style={{ color: '#444653' }}>Measured Outcome</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { problem: 'Document review bottleneck', solution: 'AI pipeline: OCR → classify → extract → index in seconds', outcome: '1.5–2 hrs/examiner/week saved' },
                  { problem: 'Deadline penalties', solution: 'Automated statutory deadline tracking with consequence alerts', outcome: '>98% compliance target' },
                  { problem: 'Examiner training gap', solution: 'Embedded regulatory education at every decision point', outcome: 'Training is inseparable from work' },
                  { problem: 'UPL liability exposure', solution: '3-stage technical enforcement — classifier, prompt, output validator', outcome: '517 UPL tests, 100% pass rate' },
                  { problem: 'Audit & compliance risk', solution: '60+ immutable audit event types, 7-year retention', outcome: 'SOC 2 CC6/CC7/CC8 controls' },
                ].map((row) => (
                  <tr key={row.problem} className="border-t" style={{ borderColor: '#c4c5d5' }}>
                    <td className="px-4 py-3 font-semibold">{row.problem}</td>
                    <td className="px-4 py-3" style={{ color: '#444653' }}>{row.solution}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#059669' }}>{row.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ROI */}
        <div className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 pb-1.5 mb-5" style={{ color: '#00288e', borderColor: '#00288e' }}>
            FINANCIAL IMPACT (10-EXAMINER ILLUSTRATION)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'Annual time savings', value: '$81,900', sub: '910 hrs × $45/hr (fully loaded)' },
              { label: 'Annual penalty avoidance', value: '$72,800+', sub: 'Based on 8% miss rate, 85% improvement' },
              { label: 'Total annual value', value: '$154,700+', sub: 'Before E&O reduction, faster onboarding' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-5 border" style={{ background: '#f0fdf4', border: '1px solid #a7f3d0' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#059669' }}>{s.label}</div>
                <div className="text-2xl font-extrabold mb-1" style={{ color: '#059669' }}>{s.value}</div>
                <div className="text-xs" style={{ color: '#444653' }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <p className="text-sm" style={{ color: '#444653' }}>
            Use the <Link href="/roi-calculator" className="font-semibold" style={{ color: '#00288e' }}>interactive ROI calculator</Link> to adjust these inputs for your specific operation.
          </p>
        </div>

        {/* Tech Stack */}
        <div className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 pb-1.5 mb-5" style={{ color: '#00288e', borderColor: '#00288e' }}>
            TECHNOLOGY
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'Anthropic Claude (chat/classification)', 'Google Vertex AI (embeddings)', 'Google Document AI (OCR/extraction)',
              'PostgreSQL 15 + pgvector (RAG)', 'GCP Cloud Run (infrastructure)', 'SOC 2 CC6/CC7/CC8 controls',
            ].map((tech) => (
              <div key={tech} className="rounded-lg px-4 py-3 text-sm font-medium text-center border"
                style={{ background: '#f2f3ff', border: '1px solid #c4c5d5', color: '#131b2e' }}>
                {tech}
              </div>
            ))}
          </div>
        </div>

        {/* Next steps */}
        <div className="rounded-xl p-8" style={{ background: '#f2f3ff', border: '1px solid #c4c5d5' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#00288e' }}>NEXT STEPS</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { step: '1', label: 'Request Demo', desc: 'Live walkthrough with a real claim — document upload through compliance dashboard.' },
              { step: '2', label: 'Security Review', desc: 'SOC 2 documentation, HIPAA posture, penetration test reports available under NDA.' },
              { step: '3', label: 'Pricing Discussion', desc: 'Transparent pricing based on your team size and claims volume. No hidden fees.' },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-extrabold mx-auto mb-3"
                  style={{ background: GRAD }}>{s.step}</div>
                <div className="font-bold mb-1">{s.label}</div>
                <p className="text-sm" style={{ color: '#444653' }}>{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
              style={{ background: GRAD }}>Request Demo</Link>
            <Link href="/roi-calculator" className="inline-block font-semibold px-7 py-3 rounded-lg no-underline transition-all"
              style={{ background: 'transparent', color: '#00288e', border: '1.5px solid #00288e' }}>
              ROI Calculator
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
