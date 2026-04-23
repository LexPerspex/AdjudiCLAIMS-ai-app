import Link from 'next/link';

export default function Footer() {
  return (
    <>
      <footer style={{ background: '#0f172a', color: '#64748b' }} className="py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="shrink-0">
              <div className="flex items-center gap-2.5 font-bold mb-2" style={{ color: '#fff' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  ⚖
                </div>
                AdjudiCLAIMS
              </div>
              <p className="text-sm" style={{ color: '#475569' }}>by Glass Box Solutions, Inc.</p>
              <p className="text-sm mt-1 italic" style={{ color: '#475569' }}>"From Black Box to Glass Box."</p>
            </div>

            {/* Link columns */}
            <div className="flex gap-12 flex-wrap">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#e2e8f0' }}>
                  Product
                </h4>
                <div className="flex flex-col gap-2.5">
                  {[
                    { href: '/how-it-works', label: 'How It Works' },
                    { href: '/roi-calculator', label: 'ROI Calculator' },
                    { href: '/executive-summary', label: 'Executive Summary' },
                    { href: '/pricing', label: 'Pricing' },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href} className="text-sm no-underline transition-colors hover:text-white" style={{ color: '#64748b' }}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#e2e8f0' }}>
                  Compliance
                </h4>
                <div className="flex flex-col gap-2.5">
                  {[
                    { href: '/upl-zones', label: 'UPL Zone Explorer' },
                    { href: '/transparency', label: 'Platform Transparency' },
                    { href: '/security', label: 'Security & HIPAA' },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href} className="text-sm no-underline transition-colors hover:text-white" style={{ color: '#64748b' }}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#e2e8f0' }}>
                  Company
                </h4>
                <div className="flex flex-col gap-2.5">
                  {[
                    { href: '/about', label: 'About' },
                    { href: '/blog', label: 'Blog' },
                    { href: '/contact', label: 'Contact' },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href} className="text-sm no-underline transition-colors hover:text-white" style={{ color: '#64748b' }}>
                      {label}
                    </Link>
                  ))}
                  <a href="mailto:security@adjudiclaims.com" className="text-sm no-underline transition-colors hover:text-white" style={{ color: '#64748b' }}>
                    Security Contact
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div
            className="border-t pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span>© 2026 Glass Box Solutions, Inc. All rights reserved.</span>
            <span>California Workers' Compensation · AI Claims Management</span>
          </div>
        </div>
      </footer>

      {/* UPL disclaimer bar */}
      <div
        className="text-white text-center py-2.5 px-6 text-xs font-bold tracking-wide uppercase"
        style={{ background: '#dc2626' }}
      >
        AdjudiCLAIMS provides factual information only — not legal advice. All substantive claim decisions require
        licensed attorney involvement for legal issues. Cal. Bus. &amp; Prof. Code § 6125.
      </div>
    </>
  );
}
