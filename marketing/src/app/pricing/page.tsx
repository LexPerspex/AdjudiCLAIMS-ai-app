import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'AdjudiCLAIMS pricing — transparent, based on your team size. Contact us for a custom quote.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Pricing
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Transparent Pricing.<br />Coming Soon.
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            We're finalizing our pricing tiers. When we publish them, they'll be straightforward — no hidden fees,
            no surprise add-ons, no "call us to find out." That's the Glass Box promise.
          </p>
        </div>
      </section>

      {/* Glass Box Pricing Promise */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Our Commitment</div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">What "Transparent Pricing" Means to Us</h2>
          <p className="text-base mb-12" style={{ color: '#444653', maxWidth: 560, margin: '0 auto 3rem' }}>
            The same Glass Box philosophy that applies to our AI applies to our pricing. You'll know exactly what you're
            paying, exactly what you're getting, and exactly what happens as your team grows.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            {[
              { icon: '✓', title: 'Published publicly', desc: 'Pricing will be on this page — no "schedule a call to get pricing." If you can read this, you can see the price.' },
              { icon: '✓', title: 'No hidden fees', desc: 'No implementation fee surprises. No module add-ons for features shown in demos. What you see in the demo is what you pay for.' },
              { icon: '✓', title: 'Based on team size', desc: 'Pricing will be based on the number of claims examiners — the variable that actually correlates to your value received.' },
              { icon: '✓', title: 'Volume discounts built in', desc: 'Larger operations will see lower per-seat costs. Pricing will scale fairly as you grow.' },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0 mt-0.5 font-bold"
                    style={{ background: '#059669' }}>{item.icon}</span>
                  <div>
                    <div className="font-bold mb-1">{item.title}</div>
                    <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* In the meantime */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">In the Meantime</h2>
          <p className="mb-10" style={{ color: '#444653' }}>
            We're in early access with select claims operations. If you want to be first in line when pricing
            launches, get in touch — we'll walk you through the product and give you early-access pricing.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {[
              { icon: '🎯', title: 'Request a demo', desc: 'See the full product with your team\'s specific claims scenarios.' },
              { icon: '📊', title: 'Run your ROI', desc: 'Use our calculator to estimate value for your specific operation size.' },
              { icon: '📋', title: 'Review the docs', desc: 'Read the executive summary and security documentation before your first call.' },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/contact" className="inline-block text-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
              style={{ background: GRAD }}>
              Contact Us for Early Access
            </Link>
            <Link href="/roi-calculator" className="inline-block font-semibold px-7 py-3 rounded-lg no-underline"
              style={{ background: 'transparent', color: '#00288e', border: '1.5px solid #00288e' }}>
              Calculate Your ROI
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold tracking-tight mb-10 text-center">Pricing FAQ</h2>
          <div className="flex flex-col gap-4">
            {[
              { q: 'Will there be a free trial?', a: 'We plan to offer a structured proof-of-concept period for qualified prospects. This will involve onboarding a subset of your actual claims to demonstrate real value before you commit.' },
              { q: 'How is pricing structured?', a: 'Per active claims examiner, billed annually. We\'re finalizing the exact tiers. There will be no per-claim pricing or usage-based AI fees — predictable monthly cost is a core design goal.' },
              { q: 'What\'s included at every tier?', a: 'All core features — document pipeline, deadline tracking, benefit calculator, UPL-filtered AI chat, education system, and audit log — are included at every pricing tier. No feature gating.' },
              { q: 'Do you charge for implementation?', a: 'Our goal is a simple implementation with no expensive professional services engagement. We\'ll work with your team directly during onboarding. Details TBD.' },
              { q: 'Is there a long-term contract requirement?', a: 'We\'re still finalizing contract terms. Our preference is annual commitments with a clear exit process. No multi-year lock-ins.' },
            ].map((item) => (
              <div key={item.q} className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <h3 className="font-bold mb-2">{item.q}</h3>
                <p className="text-sm" style={{ color: '#444653' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
