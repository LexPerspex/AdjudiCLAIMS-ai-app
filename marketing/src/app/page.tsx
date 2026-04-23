import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AdjudiCLAIMS — From Black Box to Glass Box',
  description:
    "AI-powered claims management for California Workers' Compensation examiners. Save time, stay compliant, train continuously.",
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section style={{ background: GRAD }} className="text-white py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.07) 0%, transparent 60%)' }} />
        <div className="max-w-3xl mx-auto relative">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            ⚖ Glass Box Solutions · California Workers' Comp
          </div>
          <h1 className="font-extrabold leading-tight tracking-tight mb-5" style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>
            From <span style={{ color: '#b8c4ff' }}>Black Box</span><br />to Glass Box.
          </h1>
          <p className="text-lg mb-9 mx-auto" style={{ color: 'rgba(255,255,255,0.85)', maxWidth: 560 }}>
            AI-powered claims management for California Workers' Compensation examiners. Save time,
            stay compliant, and train continuously — without ever crossing into legal advice.
          </p>
          <div className="flex gap-3 justify-center flex-wrap mb-12">
            <Link href="/contact" className="bg-white font-bold px-7 py-3 rounded-lg text-base no-underline hover:opacity-90 transition-opacity"
              style={{ color: '#00288e' }}>
              Request Demo
            </Link>
            <Link href="/how-it-works" className="font-semibold px-7 py-3 rounded-lg text-base no-underline transition-all"
              style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)' }}>
              See How It Works →
            </Link>
          </div>
          <div className="flex gap-2.5 justify-center flex-wrap">
            {[
              { cls: 'rgba(5,150,105,0.25)', border: 'rgba(5,150,105,0.5)', color: '#6ee7b7', label: 'GREEN · Factual data & calculations' },
              { cls: 'rgba(217,119,6,0.25)', border: 'rgba(217,119,6,0.5)', color: '#fcd34d', label: 'YELLOW · Statistical context' },
              { cls: 'rgba(220,38,38,0.25)', border: 'rgba(220,38,38,0.5)', color: '#fca5a5', label: 'RED · Attorney referral only' },
            ].map((z) => (
              <span key={z.label} className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: z.cls, border: `1px solid ${z.border}`, color: z.color }}>
                ● {z.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM STRIP ── */}
      <div style={{ background: '#0f172a' }} className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest mb-9" style={{ color: '#94a3b8' }}>
            The industry problem we solve
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            {[
              {
                stat: '25–40%', label: 'Annual Examiner Turnover',
                desc: 'New examiners need 60–90 days to reach competency. Training disconnected from daily work doesn\'t stick.',
              },
              {
                stat: '3+ hrs', label: 'Per Claim — Manual Document Review',
                desc: '125–175 open claims per examiner. Hundreds of pages per file. No AI assistance for factual extraction.',
              },
              {
                stat: '$$$', label: 'Cascading Deadline Penalties',
                desc: 'Miss the 40-day determination and the claim is presumed compensable (LC 5402(b)). Miss a TD payment and a 10%→15% self-imposed penalty triggers automatically (SB 1234).',
              },
            ].map((item) => (
              <div key={item.stat} className="p-7" style={{ background: '#1e293b' }}>
                <div className="text-4xl font-extrabold mb-1.5" style={{ color: '#dc2626' }}>{item.stat}</div>
                <div className="font-semibold mb-2" style={{ color: '#e2e8f0' }}>{item.label}</div>
                <div className="text-sm" style={{ color: '#94a3b8' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── VALUE PILLARS ── */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Why AdjudiCLAIMS</div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-4">Three value streams. One platform.</h2>
            <p className="text-base mx-auto" style={{ color: '#444653', maxWidth: 520 }}>
              AdjudiCLAIMS addresses your productivity problem, your compliance problem, and your training problem simultaneously.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '⚡', bg: '#dde9ff', title: 'Productivity', metric: '1.5–2 hrs', desc: 'Saved per examiner per week through AI-assisted document review, auto-populated claim fields, and instant benefit calculations.' },
              { icon: '✓', bg: '#d1fae5', title: 'Compliance', metric: '>98%', desc: 'Regulatory deadline compliance. Color-coded urgency tracking for every statutory deadline across your entire portfolio.' },
              { icon: '🎓', bg: '#ede9fe', title: 'Training', metric: 'Embedded', desc: 'The product IS the training program. Every statutory deadline cited. Every regulation explained. Every decision point teaches the why.' },
            ].map((p) => (
              <div key={p.title} className="bg-white rounded-xl p-8 border" style={{ border: '1px solid #c4c5d5', boxShadow: '0 20px 40px rgba(15,23,42,0.06)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-5" style={{ background: p.bg }}>{p.icon}</div>
                <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                <div className="text-3xl font-extrabold mb-2" style={{ color: '#00288e' }}>{p.metric}</div>
                <p className="text-sm" style={{ color: '#444653' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Core Features</div>
            <h2 className="text-3xl font-extrabold tracking-tight">Everything a claims examiner needs.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: '📄', title: 'Document Pipeline', desc: 'Upload claim files — PDF, DOCX, images. AI automatically runs OCR, classifies by type (12 categories, 150+ subtypes), extracts key fields, and indexes for search.', tag: 'Google Document AI + Claude', tagColor: '#dde9ff', tagText: '#1e3a8a' },
              { icon: '⏰', title: 'Regulatory Deadline Dashboard', desc: 'Every claim auto-generates its full statutory deadline set with the consequence of each miss — 1-day, 14-day, 15-day, 20-day, and 40-day milestones tracked in real time.', tag: 'GREEN Zone · Factual tracking', tagColor: '#d1fae5', tagText: '#065f46' },
              { icon: '🧮', title: 'Benefit Calculator', desc: 'Statutory TD rate (LC 4653: 2/3 AWE), TD payment schedules with 14-day cycles (LC 4650), automatic late-payment penalty detection, death benefits (LC 4700–4706).', tag: 'GREEN Zone · Arithmetic only', tagColor: '#d1fae5', tagText: '#065f46' },
              { icon: '💬', title: 'AI Chat — UPL-Filtered', desc: '"What WPI did the QME assign?" Factual answers over claim documents with citations. Legal questions are blocked and redirected to defense counsel automatically.', tag: '3-Stage UPL Enforcement', tagColor: '#dde9ff', tagText: '#1e3a8a' },
              { icon: '🔍', title: 'Investigation Checklist', desc: '10-item checklist auto-generated per claim: three-point contact, recorded statement, employer report, medical records, DWC-1, index bureau check, AWE verification.', tag: 'CCR § 10109 Compliant', tagColor: '#dde9ff', tagText: '#1e3a8a' },
              { icon: '🎓', title: 'Education System', desc: '86 foundational terms, 57 always-present regulatory education entries, 4 mandatory training modules, 20 step-by-step decision workflows. Quarterly refreshers.', tag: '10 CCR § 2695.6 Aligned', tagColor: '#d1fae5', tagText: '#065f46' },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 border transition-all hover:-translate-y-0.5"
                style={{ border: '1px solid #c4c5d5', boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}>
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm mb-3" style={{ color: '#444653' }}>{f.desc}</p>
                <span className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: f.tagColor, color: f.tagText }}>{f.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GLASS BOX PHILOSOPHY ── */}
      <section style={{ background: '#0f172a' }} className="py-20 px-6 text-white text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-extrabold tracking-tight mb-5" style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }}>
            The product <em style={{ color: '#b8c4ff', fontStyle: 'normal' }}>is</em> the training program.
          </h2>
          <p className="text-lg mb-4" style={{ color: '#94a3b8' }}>
            Most claims software automates tasks and leaves examiners in the dark about why. AdjudiCLAIMS does
            the opposite. Every deadline is cited. Every regulation is explained. Every AI output shows its work.
          </p>
          <p className="text-lg mb-10" style={{ color: '#94a3b8' }}>
            The Glass Box philosophy: the AI shows you what it found, where it found it, and what the law says
            about it. No black boxes. No unexplained outputs. No guessing.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {['Every deadline cites statute', 'Every calculation shows its formula', 'Every AI output links to source', 'Every regulation explains consequences'].map((t) => (
              <span key={t} className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── UPL CALLOUT ── */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>UPL Compliance</div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-4">AI that knows where the line is.</h2>
            <p className="text-base mx-auto" style={{ color: '#444653', maxWidth: 540 }}>
              Under Cal. Bus. &amp; Prof. Code § 6125, only licensed attorneys may practice law. Claims examiners
              are not attorneys. AdjudiCLAIMS enforces this boundary automatically — every query, every response, every time.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {[
              { zone: 'GREEN', bg: '#f0fdf4', border: '#a7f3d0', labelBg: '#d1fae5', labelColor: '#065f46', title: 'Factual Data & Calculations', desc: 'Medical record summaries, WPI extractions, benefit calculations, deadline tracking, document classification, claim chronologies.', example: '"The QME report on page 4 states 12% WPI for the lumbar spine, dated 2025-03-01."' },
              { zone: 'YELLOW', bg: '#fffbeb', border: '#fde68a', labelBg: '#fef3c7', labelColor: '#92400e', title: 'Statistical & Legal-Adjacent', desc: 'Comparable claims data, medical inconsistency flags, litigation indicators — presented as data only, with a mandatory disclaimer.', example: '"⚠ Comparable lumbar claims resolved $45K–$85K (p25–p75). Consult defense counsel before using in reserve discussions."' },
              { zone: 'RED', bg: '#fff1f2', border: '#fecdd3', labelBg: '#fee2e2', labelColor: '#991b1b', title: 'Legal Analysis & Advice', desc: 'Coverage opinions, settlement recommendations, case law interpretation, liability determinations, outcome predictions — blocked immediately.', example: '"🛑 This requires legal analysis by a licensed attorney. Contact defense counsel."' },
            ].map((z) => (
              <div key={z.zone} className="rounded-xl p-7 border" style={{ background: z.bg, borderColor: z.border }}>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
                  style={{ background: z.labelBg, color: z.labelColor }}>● {z.zone}</span>
                <h3 className="font-bold mb-2">{z.title}</h3>
                <p className="text-sm mb-3" style={{ color: '#444653' }}>{z.desc}</p>
                <div className="text-xs rounded-lg px-3 py-2 italic" style={{ background: 'rgba(0,0,0,0.04)', color: '#131b2e' }}>{z.example}</div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link href="/upl-zones" className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold no-underline transition-all hover:bg-primary hover:text-white"
              style={{ background: 'transparent', color: '#00288e', border: '1.5px solid #00288e' }}>
              Explore the UPL Zone System →
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background: '#00288e' }} className="py-8 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-6 text-center text-white">
          {[
            { num: '3,068', label: 'Tests Passing (100%)' },
            { num: '517', label: 'UPL Test Fixtures' },
            { num: '24+', label: 'Prohibited Patterns Blocked' },
            { num: '60+', label: 'Audit Event Types Logged' },
            { num: '7 yrs', label: 'Immutable Audit Retention' },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-extrabold mb-1">{s.num}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center" style={{ background: '#faf8ff' }}>
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl font-extrabold tracking-tight mb-4">Ready to see it in action?</h2>
          <p className="text-base mb-8" style={{ color: '#444653' }}>
            Schedule a demo for your claims team. We'll walk through a live claim — document upload through compliance dashboard.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg text-base no-underline hover:opacity-90 transition-opacity"
              style={{ background: GRAD }}>
              Request Demo
            </Link>
            <Link href="/executive-summary" className="inline-block font-semibold px-7 py-3 rounded-lg text-base no-underline transition-all"
              style={{ background: 'transparent', color: '#00288e', border: '1.5px solid #00288e' }}>
              Executive Summary
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
