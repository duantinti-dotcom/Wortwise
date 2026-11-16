import type { MetadataRoute } from "next";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { supabaseAnon } from "@/lib/supabase/server";

export const dynamic = "force-dynamic"; // inclui automaticamente os posts publicados

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.appUrl;
  const pages = ["", "/precos", "/mais-vendidos/mercado-livre", "/mais-vendidos/shopee", "/mais-vendidos/tiktok-shop", "/mais-vendidos/amazon", "/calculadora-de-lucro", "/metodologia", "/fontes-de-dados", "/blog", "/privacidade", "/termos"];
  const out: MetadataRoute.Sitemap = pages.map((p) => ({ url: `${base}${p}`, changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : 0.7 }));
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabaseAnon().from("blog_posts").select("slug, updated_at").eq("status", "published").order("published_at", { ascending: false }).limit(500);
      for (const p of data ?? []) out.push({ url: `${base}/blog/${p.slug}`, lastModified: p.updated_at as string, changeFrequency: "monthly", priority: 0.6 });
    } catch {
      // sitemap continua válido sem os posts
    }
  }
  return out;
}
