import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'AdjudiCLAIMS — From Black Box to Glass Box',
    template: '%s | AdjudiCLAIMS',
  },
  description:
    "AI-powered claims management for California Workers' Compensation examiners. Productivity, compliance, and training in one platform.",
  metadataBase: new URL('https://www.adjudiclaims.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.adjudiclaims.com',
    siteName: 'AdjudiCLAIMS',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
