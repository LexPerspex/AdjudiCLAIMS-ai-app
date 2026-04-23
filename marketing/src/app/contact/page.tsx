'use client';

import { useState } from 'react';

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

interface FormState {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  numExaminers: string;
  currentSystem: string;
  message: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', company: '', email: '',
  phone: '', numExaminers: '', currentSystem: '', message: '',
};

export default function ContactPage() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setStatus('success');
        setForm(EMPTY);
      } else {
        const data = await res.json().catch(() => ({ error: '' })) as { error?: string };
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setStatus('error');
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all';
  const inputStyle = { border: '1px solid #c4c5d5', color: '#131b2e', background: '#fff' };

  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Contact
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Request a Demo
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Tell us about your claims operation and we'll schedule a live walkthrough — a real claim, your questions, your team.
          </p>
        </div>
      </section>

      <section className="py-16 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <h2 className="text-lg font-extrabold mb-6">What to expect</h2>
            <div className="flex flex-col gap-6">
              {[
                { icon: '🎯', title: 'Live demo on a real claim', desc: 'We\'ll walk through document upload, classification, deadline tracking, and the AI chat — using actual claim documents.' },
                { icon: '❓', title: 'Your questions answered', desc: 'UPL compliance approach, security posture, integration with your current system, pricing. Bring your skepticism.' },
                { icon: '⚡', title: 'Fast turnaround', desc: 'We typically schedule demos within 48 hours. No 6-week sales cycle.' },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 items-start">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div>
                    <div className="font-bold mb-1 text-sm">{item.title}</div>
                    <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t" style={{ borderColor: '#c4c5d5' }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#444653' }}>Other Ways to Reach Us</div>
              <div className="flex flex-col gap-2">
                <a href="mailto:support@adjudica.ai" className="text-sm no-underline font-medium" style={{ color: '#00288e' }}>support@adjudica.ai</a>
                <a href="mailto:security@adjudica.ai" className="text-sm no-underline" style={{ color: '#444653' }}>security@adjudica.ai</a>
                <a href="mailto:legal@adjudica.ai" className="text-sm no-underline" style={{ color: '#444653' }}>legal@adjudica.ai</a>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {status === 'success' ? (
              <div className="rounded-xl p-10 text-center border" style={{ background: '#f0fdf4', border: '1px solid #a7f3d0' }}>
                <div className="text-4xl mb-4">✓</div>
                <h2 className="text-xl font-extrabold mb-2" style={{ color: '#059669' }}>Request received.</h2>
                <p style={{ color: '#444653' }}>
                  We'll be in touch within one business day to schedule your demo. Check your email for a confirmation.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border" style={{ border: '1px solid #c4c5d5', boxShadow: '0 20px 40px rgba(15,23,42,0.06)' }}>
                <h2 className="text-lg font-extrabold mb-6">Demo Request</h2>

                {/* Name row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">First Name <span style={{ color: '#dc2626' }}>*</span></label>
                    <input required value={form.firstName} onChange={set('firstName')} className={inputCls} style={inputStyle} placeholder="Jane" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Last Name <span style={{ color: '#dc2626' }}>*</span></label>
                    <input required value={form.lastName} onChange={set('lastName')} className={inputCls} style={inputStyle} placeholder="Smith" />
                  </div>
                </div>

                {/* Company */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold mb-1.5">Company / Organization <span style={{ color: '#dc2626' }}>*</span></label>
                  <input required value={form.company} onChange={set('company')} className={inputCls} style={inputStyle} placeholder="Pacific Claims Adjusting, Inc." />
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Work Email <span style={{ color: '#dc2626' }}>*</span></label>
                    <input required type="email" value={form.email} onChange={set('email')} className={inputCls} style={inputStyle} placeholder="jane@company.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Phone <span className="text-xs font-normal" style={{ color: '#444653' }}>(optional)</span></label>
                    <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} style={inputStyle} placeholder="(415) 555-0100" />
                  </div>
                </div>

                {/* Examiners + Current system */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Number of Claims Examiners</label>
                    <select value={form.numExaminers} onChange={set('numExaminers')} className={inputCls} style={inputStyle}>
                      <option value="">Select range</option>
                      <option value="1-5">1–5</option>
                      <option value="6-15">6–15</option>
                      <option value="16-50">16–50</option>
                      <option value="51-100">51–100</option>
                      <option value="100+">100+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5">Current Claims System</label>
                    <input value={form.currentSystem} onChange={set('currentSystem')} className={inputCls} style={inputStyle} placeholder="Guidewire, Majesco, custom, etc." />
                  </div>
                </div>

                {/* Message */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-1.5">How can we help? <span className="text-xs font-normal" style={{ color: '#444653' }}>(optional)</span></label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={set('message')}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Tell us about your biggest pain points, what you're looking for, or any questions you have..."
                  />
                </div>

                {status === 'error' && (
                  <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#991b1b' }}>
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full text-white font-bold py-3 rounded-lg text-base transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: GRAD }}
                >
                  {status === 'submitting' ? 'Sending...' : 'Request Demo →'}
                </button>

                <p className="text-xs text-center mt-4" style={{ color: '#444653' }}>
                  By submitting this form you agree to be contacted by Glass Box Solutions about AdjudiCLAIMS.
                  We don't sell your information.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
