import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'Glass Box Solutions, Inc. — building transparent AI for California Workers\' Compensation. Meet the team behind AdjudiCLAIMS.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

const TEAM = [
  {
    name: 'Alex Brewsaugh',
    role: 'Founder & CEO',
    bio: 'Alex brings deep experience in California workers\' compensation law and claims operations. He founded Glass Box Solutions to solve the training and compliance problems he saw firsthand in the industry — and to prove that AI can be both powerful and fully transparent.',
    initial: 'AB',
  },
  {
    name: 'Matt',
    role: 'Co-Founder & CTO',
    bio: 'Matt leads engineering at Glass Box. His background spans enterprise software, distributed systems, and applied ML. He designed the three-stage UPL enforcement pipeline and the Glass Box explainability architecture.',
    initial: 'M',
  },
  {
    name: 'Sarah',
    role: 'Chief Legal Officer',
    bio: 'Sarah is a licensed California attorney with extensive workers\' compensation experience. She leads UPL compliance strategy, reviews every AI prompt and zone boundary, and serves as the legal authority on what AdjudiCLAIMS can and cannot say.',
    initial: 'S',
  },
  {
    name: 'Brian',
    role: 'VP of Product',
    bio: 'Brian has spent his career building software for regulated industries. At Glass Box he translates the complex world of claims compliance into clear, usable workflows — ensuring the product is the training program, not just a tool.',
    initial: 'B',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            About
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Glass Box Solutions, Inc.
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            "From Black Box to Glass Box." We build transparent AI for professionals whose decisions
            affect real people's financial outcomes.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Our Mission</div>
              <h2 className="text-2xl font-extrabold tracking-tight mb-4">AI that shows its work.</h2>
              <p className="mb-4" style={{ color: '#444653' }}>
                Every AI product in the legal and insurance space faces the same temptation: optimize for impressive
                outputs, hide the reasoning, and hope the user trusts the result. We built Glass Box Solutions to
                reject that approach entirely.
              </p>
              <p className="mb-4" style={{ color: '#444653' }}>
                AdjudiCLAIMS is built on a single design principle: every output must be traceable, citable, and
                understandable. The AI shows you what it found, where it found it, and what the statute says about it.
                Not because we have to — because that's the only kind of AI worth building for professionals whose
                work affects real people's financial outcomes.
              </p>
              <p style={{ color: '#444653' }}>
                We started in California workers' compensation because it's one of the most complex, most
                under-served, and most consequential domains in the country. Examiners make hundreds of decisions
                per week that affect injured workers' medical care and financial security. They deserve better tools.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { icon: '⚖', title: 'Correctness over speed', desc: 'We do not ship features that aren\'t fully tested. 100% passing tests is a requirement, not a goal.' },
                { icon: '🔍', title: 'Explainability over magic', desc: 'Every AI conclusion must show visible, auditable reasoning. Confidence scores alone are not explanations.' },
                { icon: '👤', title: 'Human in the loop, always', desc: 'AdjudiCLAIMS assists — it never decides. The examiner makes every substantive judgment call.' },
                { icon: '⚡', title: 'Compliance by design', desc: 'UPL boundaries are enforced by code, not policy. Security is architecture, not a checklist.' },
              ].map((v) => (
                <div key={v.title} className="flex gap-4 items-start bg-white rounded-xl p-5 border" style={{ border: '1px solid #c4c5d5' }}>
                  <span className="text-2xl shrink-0">{v.icon}</span>
                  <div>
                    <div className="font-bold mb-1">{v.title}</div>
                    <p className="text-sm" style={{ color: '#444653' }}>{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{ background: '#f2f3ff' }} className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#00288e' }}>Team</div>
            <h2 className="text-2xl font-extrabold tracking-tight">The people behind AdjudiCLAIMS.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TEAM.map((member) => (
              <div key={member.name} className="bg-white rounded-xl p-7 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-extrabold shrink-0"
                    style={{ background: GRAD }}>
                    {member.initial}
                  </div>
                  <div>
                    <div className="font-extrabold text-lg">{member.name}</div>
                    <div className="text-sm font-semibold" style={{ color: '#00288e' }}>{member.role}</div>
                  </div>
                </div>
                <p className="text-sm" style={{ color: '#444653' }}>{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why WC */}
      <section style={{ background: '#0f172a' }} className="py-20 px-6 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-extrabold mb-5">Why California Workers' Compensation?</h2>
          <p className="text-lg mb-6" style={{ color: '#94a3b8' }}>
            California workers' compensation is one of the largest, most complex insurance systems in the world.
            It covers 18 million workers. It generates over $20 billion in annual premiums. It operates under a
            regulatory framework of extraordinary complexity — dozens of statutory deadlines, hundreds of regulatory
            requirements, and a litigation environment that punishes every missed step.
          </p>
          <p className="text-lg mb-10" style={{ color: '#94a3b8' }}>
            Yet the software available to claims examiners is largely unchanged from a decade ago. Most systems
            are workflow tools — they track status but don't assist with decisions, don't surface the regulatory
            context that explains why each step matters, and don't teach examiners anything along the way.
            We're fixing that.
          </p>
          <Link href="/contact" className="inline-block bg-white font-bold px-7 py-3 rounded-lg no-underline hover:opacity-90"
            style={{ color: '#00288e' }}>
            Talk to Our Team
          </Link>
        </div>
      </section>
    </>
  );
}
