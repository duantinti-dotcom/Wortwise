import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { readingMinutes, renderMarkdown } from "@/lib/markdown";
import { supabaseAnon } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const getPost = cache(async (slug: string) => {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const { data } = await supabaseAnon().from("blog_posts").select("slug, title, excerpt, content_md, category, seo_title, seo_description, author_name, published_at, updated_at")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  return data as { slug: string; title: string; excerpt: string; content_md: string; category: string; seo_title: string | null; seo_description: string | null; author_name: string; published_at: string; updated_at: string } | null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Artigo não encontrado", robots: { index: false } };
  const description = post.seo_description ?? post.excerpt;
  return { title: post.seo_title ?? post.title, description, alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description, url: `/blog/${post.slug}`, publishedTime: post.published_at, modifiedTime: post.updated_at } };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.excerpt, datePublished: post.published_at, dateModified: post.updated_at,
    author: { "@type": "Organization", name: post.author_name }, publisher: { "@type": "Organization", name: "Worthwise", logo: { "@type": "ImageObject", url: `${publicEnv.appUrl}/icon-512.png` } },
    mainEntityOfPage: `${publicEnv.appUrl}/blog/${post.slug}` };
  return (
    <article className="pb-24 pt-32 md:pt-40">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-page !max-w-3xl">
        <Link href="/blog" className="btn btn-ghost btn-sm -ml-3"><ArrowLeft size={15} /> Blog</Link>
        <div className="eyebrow mt-6 capitalize">{post.category}</div>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-[-0.035em] md:text-5xl">{post.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap gap-x-3 text-sm text-faint"><span>{post.author_name}</span>·<time dateTime={post.published_at}>{formatDate(post.published_at)}</time>·<span>{readingMinutes(post.content_md)} min de leitura</span></div>
        <div className="hairline my-10" />
        {/* HTML gerado por renderMarkdown, que escapa todo o texto e só permite links http(s)/internos. */}
        <div className="prose-ww" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content_md) }} />
        <aside className="card mt-14 flex flex-wrap items-center justify-between gap-4 p-6">
          <div><div className="font-semibold">Coloque em prática</div><p className="mt-1 text-sm text-muted">Pesquise produtos reais e simule seu lucro com três pesquisas gratuitas.</p></div>
          <Link href="/cadastro" className="btn btn-primary">Começar por R$ 9,90</Link>
        </aside>
      </div>
    </article>
  );
}
