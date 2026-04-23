import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Insights on AI, transparency, and California Workers\' Compensation from the Glass Box Solutions team.',
};

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

// When posts are ready, add them here.
const POSTS: {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  readTime: string;
}[] = [];

export default function BlogPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            Blog
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Glass Box Insights
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            AI, transparency, and California workers' compensation — from the people building AdjudiCLAIMS.
          </p>
        </div>
      </section>

      <section className="py-20 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-4xl mx-auto">
          {POSTS.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-5">✍️</div>
              <h2 className="text-xl font-bold mb-3">Posts coming soon.</h2>
              <p className="text-base mb-8" style={{ color: '#444653', maxWidth: 400, margin: '0 auto 2rem' }}>
                We're working on content covering AI in workers' comp, UPL compliance, and the Glass Box philosophy. Check back soon.
              </p>
              <Link href="/contact" className="inline-block text-white font-bold px-6 py-2.5 rounded-lg no-underline hover:opacity-90"
                style={{ background: GRAD }}>
                Get notified when we publish
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {POSTS.map((post) => (
                <Link key={post.slug} href={`/blog/${post.slug}`}
                  className="bg-white rounded-xl p-7 border no-underline block transition-all hover:-translate-y-0.5"
                  style={{ border: '1px solid #c4c5d5', color: 'inherit' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                      style={{ background: '#dde9ff', color: '#1e3a8a' }}>{post.category}</span>
                    <span className="text-xs" style={{ color: '#444653' }}>{post.readTime}</span>
                  </div>
                  <h2 className="text-lg font-bold mb-2">{post.title}</h2>
                  <p className="text-sm mb-4" style={{ color: '#444653' }}>{post.excerpt}</p>
                  <div className="text-xs" style={{ color: '#444653' }}>{post.date}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
