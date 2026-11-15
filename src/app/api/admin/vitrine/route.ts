import { NextResponse } from "next/server";
import { getUser, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";

/**
 * Pré-visualização de um link de produto (como o WhatsApp faz ao colar um link): uma única leitura
 * da página que o dono escolheu, para preencher nome, foto, preço e avaliação. Só o dono usa.
 */
const HOSTS = /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|shopee\.com\.br|amazon\.com\.br|amzn\.to|tiktok\.com|shp\.ee|meli\.la)$/i;

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i");
  const m = re.exec(html);
  return m ? (m[1] ?? m[2] ?? "").trim() : null;
}
const decode = (s: string | null) => s?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">") ?? null;
const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };

export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !(await isAdmin())) return apiError("forbidden", "Acesso restrito ao administrador.");
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { return apiError("invalid_input", "Link inválido."); }
  if (url.protocol !== "https:" || !HOSTS.test(url.hostname)) return apiError("invalid_input", "Use um link https do Mercado Livre, Shopee, Amazon ou TikTok Shop.");
  let html = "";
  let finalUrl = url.toString();
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; WorthwiseLinkPreview/1.0; +https://worthwise.site)", accept: "text/html" }, signal: AbortSignal.timeout(10000) });
    finalUrl = r.url || finalUrl;
    if (!HOSTS.test(new URL(finalUrl).hostname)) return apiError("invalid_input", "O link redirecionou para fora da loja.");
    html = (await r.text()).slice(0, 1_500_000);
  } catch {
    return NextResponse.json({ ok: false, link: finalUrl, message: "A loja não deixou ler esse link. Preencha os campos à mão." });
  }
  // Dados estruturados de produto (JSON-LD), quando a página publica.
  let ld: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]!) as unknown;
      const list = (Array.isArray(j) ? j : [j, ...(((j as Record<string, unknown>)?.["@graph"] as unknown[]) ?? [])]) as Record<string, unknown>[];
      ld = list.find((x) => String(x?.["@type"] ?? "").toLowerCase().includes("product")) ?? ld;
    } catch { /* bloco inválido: ignora */ }
    if (ld) break;
  }
  const offers = (Array.isArray(ld?.offers) ? (ld?.offers as unknown[])[0] : ld?.offers) as Record<string, unknown> | undefined;
  const rating = ld?.aggregateRating as Record<string, unknown> | undefined;
  const image = Array.isArray(ld?.image) ? (ld?.image as unknown[])[0] : ld?.image;
  const out = {
    ok: true,
    link: finalUrl,
    title: decode((ld?.name as string | undefined) ?? meta(html, "og:title") ?? null)?.slice(0, 300) ?? null,
    image: (typeof image === "string" ? image : decode(meta(html, "og:image"))) ?? null,
    price: num(offers?.price ?? offers?.lowPrice ?? meta(html, "product:price:amount") ?? meta(html, "og:price:amount")),
    rating: num(rating?.ratingValue),
    reviews: num(rating?.reviewCount ?? rating?.ratingCount),
  };
  return NextResponse.json(out);
}
