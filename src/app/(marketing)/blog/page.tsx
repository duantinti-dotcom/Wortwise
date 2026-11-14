import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { isSupabaseConfigured } from "@/lib/env";
import { supabaseAnon } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Blog", description: "Guias práticos de e-commerce: como escolher produtos para revender, encontrar fornecedores, precificar e calcular lucro em marketplaces.", alternates: { canonical: "/blog" } };
export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  let posts: { slug: string; title: string; excerpt: string; category: string; published_at: string }[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    const { data, error } = await supabaseAnon().from("blog_posts").select("slug, title, excerpt, category, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(60);
    posts = (data ?? []) as typeof posts;
    failed = Boolean(error);
  }
  return (
    <PageShell eyebrow="Blog" title="Guias para vender melhor" lead="Conteúdo prático sobre escolha de produtos, fornecedores, precificação e rentabilidade.">
      {posts.length ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover flex flex-col p-6">
              <span className="eyebrow capitalize">{p.category}</span>
              <h2 className="mt-3 text-xl font-semibold leading-snug">{p.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.excerpt}</p>
              <time dateTime={p.published_at} className="mt-5 text-xs text-faint">{formatDate(p.published_at)}</time>
            </Link>
          ))}
        </div>
      ) : <p className="card mx-auto max-w-xl p-8 text-center text-muted">{failed ? "Não foi possível carregar os artigos agora. Tente novamente em instantes." : "Os primeiros artigos estão sendo preparados."}</p>}
    </PageShell>
  );
}
