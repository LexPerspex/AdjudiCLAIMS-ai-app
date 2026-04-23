import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'See how AdjudiCLAIMS processes documents, enforces UPL compliance, and delivers transparent AI-assisted claims management.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Platform Overview
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            How AdjudiCLAIMS Works
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)', maxWidth: 560, margin: '0 auto' }}>
            From document upload to compliant AI response — every step observable, every output traceable.
          </p>
        </div>
      </section>

      {/* Document Pipeline */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#00288e' }}>Step 1</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-3">Document Ingestion Pipeline</h2>
          <p className="mb-10" style={{ color: '#444653', maxWidth: 600 }}>
            Every uploaded file is processed through a four-stage AI pipeline before it's available in the claim workspace.
          </p>
          <div className="bg-white rounded-xl p-8 border" style={{ border: '1px solid #c4c5d5', boxShadow: '0 20px 40px rgba(15,23,42,0.06)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
              {[
                { num: '1', title: 'Upload & OCR', tech: 'Google Document AI', desc: 'PDF, DOCX, images — all extracted to searchable text via Document AI with layout-aware OCR.' },
                { num: '2', title: 'Classification', tech: 'Gemini Flash', desc: '12 document categories, 150+ subtypes. Medical reports, legal filings, employer records, DWC forms — automatically labeled.' },
                { num: '3', title: 'Field Extraction', tech: 'Claude Sonnet', desc: 'Key fields pulled: diagnosis codes, WPI percentages, AWE values, dates, body parts, physician names.' },
                { num: '4', title: 'Embedding & Index', tech: 'Voyage Large 4', desc: 'Full-text and semantic vectors stored in pgvector. Documents instantly searchable by content and meaning.' },
              ].map((step) => (
                <div key={step.num} className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full text-white flex items-center justify-center text-xl font-extrabold mb-4 shrink-0"
                    style={{ background: GRAD, boxShadow: '0 0 0 4px white, 0 0 0 6px #00288e' }}>
                    {step.num}
                  </div>
                  <div className="font-bold text-sm mb-1">{step.title}</div>
                  <div className="text-xs font-semibold mb-2 px-2 py-0.5 rounded-full"
                    style={{ background: '#dde9ff', color: '#1e3a8a' }}>{step.tech}</div>
                  <p className="text-xs" style={{ color: '#444653' }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Claim Workspace */}
      <section style={{ background: '#0f172a' }} className="py-20 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>Step 2</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-3">The 12-Tab Claim Workspace</h2>
          <p className="mb-10" style={{ color: '#94a3b8', maxWidth: 600 }}>
            Every claim opens into a structured workspace. Each tab surfaces a different lens on the claim — all driven by the documents uploaded.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { num: '01', name: 'Overview', desc: 'Claim summary, key dates, parties, injury description, status.' },
              { num: '02', name: 'Documents', desc: 'All uploaded files, classified and searchable. AI-extracted fields surfaced inline.' },
              { num: '03', name: 'Deadlines', desc: 'Full statutory deadline calendar — every missed deadline shows its legal consequence.' },
              { num: '04', name: 'Benefits', desc: 'TD rate calculator, payment schedule, late-payment penalty tracker.' },
              { num: '05', name: 'Medical', desc: 'Medical billing overview, WPI summary, MTUS guideline matching.' },
              { num: '06', name: 'Coverage', desc: 'AOE/COE determination tracking per body part — factual, GREEN zone only.' },
              { num: '07', name: 'Investigation', desc: '10-item investigation checklist, timestamp tracking, completion status.' },
              { num: '08', name: 'Liens', desc: 'Lien register, payment status, lien resolution tracking.' },
              { num: '09', name: 'Chat', desc: 'UPL-filtered AI assistant. Factual answers, GREEN/YELLOW responses, RED blocked.' },
              { num: '10', name: 'Education', desc: 'Contextual regulatory education. 57 always-present entries. 86 dismissable terms.' },
              { num: '11', name: 'Audit Log', desc: 'Every action logged with timestamp, user, and reason. Immutable for 7 years.' },
              { num: '12', name: 'Compliance', desc: 'Claim-level compliance score, outstanding items, supervisor review queue.' },
            ].map((tab) => (
              <div key={tab.num} className="rounded-lg p-5 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Tab {tab.num}</div>
                <div className="font-bold mb-1">{tab.name}</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{tab.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Chat Pipeline */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#00288e' }}>Step 3</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-3">The 3-Stage UPL Enforcement Pipeline</h2>
          <p className="mb-10" style={{ color: '#444653', maxWidth: 600 }}>
            Every AI chat interaction passes through three independent enforcement layers before a response is shown.
          </p>
          <div className="flex flex-col lg:flex-row gap-0 rounded-xl overflow-hidden border" style={{ border: '1px solid #c4c5d5' }}>
            {[
              { color: '#00288e', icon: '🔬', title: 'Stage 1: Query Classifier', subtitle: 'Pre-chat gate', desc: 'Lightweight LLM call classifies the query as GREEN, YELLOW, or RED before any document retrieval begins. RED queries are blocked immediately.' },
              { color: '#059669', icon: '📋', title: 'Stage 2: System Prompt', subtitle: 'Role-specific guardrails', desc: 'UPL-filtered system prompt enforces zone boundaries. Claims examiners receive examiner-specific prompts that prohibit legal analysis, case outcomes, and settlement recommendations.' },
              { color: '#1e40af', icon: '🛡', title: 'Stage 3: Output Validator', subtitle: 'Post-generation scan', desc: '24+ prohibited language patterns checked against every response. "Should settle for," "you should," "coverage is," and similar legal-adjacent phrases trigger a block even if the classifier passed.' },
            ].map((stage, i) => (
              <div key={stage.title} className="flex-1 p-7 bg-white" style={{ borderTop: `4px solid ${stage.color}`, borderRight: i < 2 ? '1px solid #c4c5d5' : 'none' }}>
                <div className="text-3xl mb-4">{stage.icon}</div>
                <div className="font-extrabold mb-0.5">{stage.title}</div>
                <div className="text-xs font-semibold mb-3" style={{ color: '#444653' }}>{stage.subtitle}</div>
                <p className="text-sm" style={{ color: '#444653' }}>{stage.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Education Layer */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#00288e' }}>Step 4</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-3">Contextual Education — Always Present</h2>
          <p className="mb-10" style={{ color: '#444653', maxWidth: 600 }}>
            Every decision point in the workflow surfaces regulatory context automatically.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { tier: 'Tier 1', color: '#6366f1', bg: '#eef2ff', title: 'Dismissable Basics', desc: '86 foundational terms — AWE, WPI, QME, UR, IMR. New examiners see these by default and dismiss permanently once learned. Shown contextually next to each relevant field.' },
              { tier: 'Tier 2', color: '#059669', bg: '#f0fdf4', title: 'Always-Present Regulatory Core', desc: '57 regulatory education entries covering every legally mandated duty. These are NEVER hidden. "LC 4650 requires TD payment within 14 days because failure triggers an automatic 10% penalty." Glass Box foundation.' },
              { tier: 'Workflows', color: '#d97706', bg: '#fffbeb', title: '20 Decision Workflows', desc: 'Step-by-step guides for every major claims decision — from initial three-point contact through QME dispute resolution. Triggered automatically when the examiner reaches that decision point.' },
              { tier: 'Training', color: '#0f172a', bg: '#f1f5f9', title: '4 Mandatory Training Modules', desc: 'Onboarding → Foundation → Compliance → Advanced. Quarterly refreshers. Monthly compliance reviews. Training completion gated by assessment scores. All tracked in the audit log.' },
            ].map((item) => (
              <div key={item.tier} className="rounded-xl p-7 border-l-4" style={{ background: item.bg, borderColor: item.color }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: item.color }}>{item.tier}</div>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: GRAD }} className="py-20 px-6 text-white text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold mb-4">See it with a real claim.</h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Request a demo and we'll walk your team through a live claim — upload through compliance dashboard.
          </p>
          <Link href="/contact" className="inline-block bg-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ color: '#00288e' }}>
            Request Demo
          </Link>
        </div>
      </section>
    </>
  );
}
