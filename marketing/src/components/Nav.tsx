'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_LINKS = [
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/upl-zones', label: 'UPL Zones' },
  { href: '/transparency', label: 'Transparency' },
  { href: '/security', label: 'Security' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.adjudiclaims.com';

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'rgba(250,248,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderColor: '#c4c5d5',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 font-bold text-body-text no-underline">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-base"
            style={{ background: 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)' }}
          >
            ⚖
          </div>
          <span style={{ color: '#131b2e' }}>AdjudiCLAIMS</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5 flex-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium px-3 py-1.5 rounded-md transition-all no-underline"
              style={{
                color: pathname === href ? '#00288e' : '#444653',
                fontWeight: pathname === href ? 600 : 500,
                background: pathname === href ? '#f2f3ff' : 'transparent',
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 ml-auto lg:ml-0">
          {/* APP button */}
          <a
            href={APP_URL}
            className="shrink-0 text-white px-4 py-2 rounded-lg text-sm font-bold tracking-wide hover:opacity-90 transition-opacity no-underline"
            style={{ background: 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)' }}
          >
            APP
          </a>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-md"
            style={{ color: '#444653' }}
            onClick={() => { setMobileOpen(!mobileOpen); }}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M4 16L16 4" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h14M3 10h14M3 14h14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t px-6 py-4 flex flex-col gap-1" style={{ borderColor: '#c4c5d5', background: '#faf8ff' }}>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium px-3 py-2 rounded-md no-underline"
              style={{ color: pathname === href ? '#00288e' : '#444653' }}
              onClick={() => { setMobileOpen(false); }}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
