import type { RankedProduct } from "./types";

/**
 * Mais vendidos da Amazon Brasil lidos da página pública /gp/bestsellers (permitida no robots.txt da Amazon).
 * Uma leitura por categoria a cada 6 horas, identificada como WorthwiseBot. Sem contornar bloqueios:
 * se a página não vier no formato esperado, a categoria fica indisponível.
 */
export const AMAZON_CATEGORIES = [
  { id: "electronics", name: "Eletrônicos" },
  { id: "home", name: "Casa" },
  { id: "kitchen", name: "Cozinha" },
  { id: "beauty", name: "Beleza" },
  { id: "fashion", name: "Moda" },
  { id: "sports", name: "Esportes" },
  { id: "pet-products", name: "Pets" },
  { id: "toys", name: "Brinquedos" },
  { id: "computers", name: "Informática" },
];

const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
const brNumber = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Converte o HTML da página de mais vendidos em produtos. Exportado para testes. */
export function parseAmazonBestsellers(html: string, now = new Date().toISOString()): RankedProduct[] {
  const blocks = html.split('id="gridItemRoot"').slice(1);
  const out: RankedProduct[] = [];
  for (const b of blocks) {
    const asin = /data-asin="([A-Z0-9]{10})"/.exec(b)?.[1];
    const rank = Number(/class="zg-bdg-text">#(\d+)</.exec(b)?.[1]);
    if (!asin || !rank) continue;
    const img = /<img[^>]+alt="([^"]*)"[^>]+src="(https:\/\/[^"]+)"/.exec(b);
    const title = decode(/line-clamp[^"]*">([^<]+)</.exec(b)?.[1] ?? img?.[1] ?? "");
    if (!title) continue;
    // Usa o maior tamanho que a própria página oferece (data-a-dynamic-image); senão, a foto original.
    const sizes = /data-a-dynamic-image="([^"]+)"/.exec(b)?.[1];
    let image = img?.[2] ?? null;
    if (sizes) { try { const urls = Object.keys(JSON.parse(decode(sizes)) as Record<string, unknown>); image = urls.at(-1) ?? image; } catch { /* mantém a original */ } }
    const ratingLabel = /aria-label="([\d,]+) de 5 estrelas, ([\d.]+) classifica/.exec(b);
    const whole = /a-price-whole">([\d.]+)/.exec(b)?.[1];
    const fraction = /a-price-fraction">(\d{2})/.exec(b)?.[1];
    const price = whole ? brNumber(`${whole},${fraction ?? "00"}`) : null;
    const offers = Number(/(\d+) ofertas a partir de/.exec(b)?.[1]) || null;
    out.push({
      source: "amazon", externalId: `a-${asin}`, kind: "listing", title, imageUrl: image,
      permalink: `https://www.amazon.com.br/dp/${asin}`,
      price, originalPrice: null, currency: price != null ? "BRL" : null,
      rating: brNumber(ratingLabel?.[1]), reviewsCount: brNumber(ratingLabel?.[2]),
      sellerId: null, sellerName: null, available: price != null ? true : null, freeShipping: null, condition: "new",
      brand: null, model: null, gtin: null, categoryId: null, offersCount: offers, attributes: [], collectedAt: now, sourceUpdatedAt: null,
      salesRank: { rank, category: null }, rank,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export class AmazonPageError extends Error {}

export async function fetchAmazonBestsellers(categoryId: string): Promise<RankedProduct[]> {
  const cat = AMAZON_CATEGORIES.find((c) => c.id === categoryId) ?? AMAZON_CATEGORIES[0]!;
  let res: Response;
  try {
    res = await fetch(`https://www.amazon.com.br/gp/bestsellers/${cat.id}`, {
      headers: { accept: "text/html", "accept-language": "pt-BR,pt;q=0.9", "user-agent": "Mozilla/5.0 (compatible; WorthwiseBot/1.0; +https://worthwise.site)" },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new AmazonPageError("A Amazon não respondeu agora.");
  }
  if (!res.ok) throw new AmazonPageError(`A Amazon respondeu ${res.status}.`);
  const items = parseAmazonBestsellers(await res.text());
  if (!items.length) throw new AmazonPageError("A página de mais vendidos da Amazon veio sem produtos.");
  return items;
}

/** Com cache compartilhado de 6 horas: no máximo 4 leituras por dia por categoria. */
export async function getAmazonBestsellers(categoryId: string): Promise<{ products: RankedProduct[]; at: string; fresh: boolean }> {
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://cache.worthwise.site/amazon-bs/v3/${encodeURIComponent(categoryId)}`);
  const hit = await edge?.match(key).catch(() => undefined);
  if (hit) return { ...((await hit.json()) as { products: RankedProduct[]; at: string }), fresh: false };
  const products = await fetchAmazonBestsellers(categoryId);
  const out = { products, at: new Date().toISOString() };
  await edge?.put(key, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "public, max-age=21600" } })).catch(() => {});
  return { ...out, fresh: true };
}
