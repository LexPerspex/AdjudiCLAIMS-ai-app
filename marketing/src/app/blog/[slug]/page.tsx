import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Post {
  slug: string;
  title: string;
  date: string;
  category: string;
  author: string;
  readTime: string;
  content: string;
}

// When posts are ready, add them here.
const POSTS: Post[] = [];

function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: 'Post Not Found' };
  return { title: post.title, description: post.content.slice(0, 160) };
}

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) notFound();

  return (
    <>
      <div style={{ background: GRAD }} className="text-white py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-1 text-sm no-underline mb-6 hover:opacity-80"
            style={{ color: 'rgba(255,255,255,0.75)' }}>
            ← Back to Blog
          </Link>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
              {post.category}
            </span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{post.readTime}</span>
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)' }}>
            {post.title}
          </h1>
          <div className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {post.author} · {post.date}
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 py-14 prose prose-lg" style={{ color: '#131b2e' }}>
        <div dangerouslySetInnerHTML={{ __html: post.content }} />
      </article>

      <div className="border-t py-12 px-6 text-center" style={{ borderColor: '#c4c5d5', background: '#f2f3ff' }}>
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm font-semibold no-underline" style={{ color: '#00288e' }}>
          ← All Posts
        </Link>
      </div>
    </>
  );
}
