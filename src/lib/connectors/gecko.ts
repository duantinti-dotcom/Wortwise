import { getCloudflareContext } from "@opennextjs/cloudflare";
import { serverEnv } from "@/lib/env";
import { FALLBACK_ML_CATEGORIES } from "./ml-categories";
import { SHOPEE_CATEGORIES } from "./shopee";
import { ConnectorError, type Category, type Connector, type ConnectorContext, type ProductDetail, type ProductResult, type RankedProduct, type SearchParams, type SourceId } from "./types";

/**
 * GeckoAPI (api.geckoapi.com.br/v1/extract): extrai os dados públicos das páginas do Mercado Livre,
 * Shopee e TikTok Shop. A chave (GECKO_API_KEY) fica só no servidor.
 *
 * Tudo o que aparece vem da resposta da Gecko: nome, preço, fotos, nota, vendidos, link e posição.
 * Campo que a Gecko não devolve fica vazio (null) — nada é preenchido por estimativa.
 * As respostas ficam em cache compartilhado (Cache API) para economizar créditos e deixar o site rápido.
 */
const ENDPOINT = "https://api.geckoapi.com.br/v1/extract";
const TIMEOUT_MS = 90_000;
/** Depois deste tempo a resposta é atualizada em segundo plano (quem acessa continua vendo a anterior). */
const FRESH_MS = { ranking: 12 * 3600_000, search: 6 * 3600_000, product: 6 * 3600_000 };
const KEEP_S = 3 * 86400;

export const geckoConfigured = () => Boolean(serverEnv().geckoToken);

type Json = Record<string, unknown>;
type Kind = keyof typeof FRESH_MS;

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

const label = (body: Json) => `POST /v1/extract ${String(body.target)} ${String(body.type)}`;

async function call(source: SourceId, body: Json, ctx: ConnectorContext): Promise<Json> {
  const token = serverEnv().geckoToken;
  if (!token) throw new ConnectorError(source, "not_configured", "GECKO_API_KEY ausente");
  const started = Date.now();
  let status: number | null = null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    const json = (await res.json().catch(() => null)) as { data?: Json; errorCode?: string; message?: string } | null;
    if (!res.ok || !json?.data) {
      const kind = status === 402 ? "no_credits" : status === 429 ? "rate_limited" : status === 401 || status === 403 ? "unauthorized"
        : status === 404 ? "not_found" : status === 400 ? "bad_response" : "unavailable";
      throw new ConnectorError(source, kind, json?.message ?? `GeckoAPI respondeu ${status}`, status ?? undefined);
    }
    ctx.logs.push({ source, endpoint: label(body), status, ok: true, ms: Date.now() - started, error: null });
    return json.data;
  } catch (e) {
    const err = e instanceof ConnectorError ? e
      : (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? new ConnectorError(source, "timeout", "A GeckoAPI demorou demais")
      : new ConnectorError(source, "unavailable", "Falha de rede na GeckoAPI");
    ctx.logs.push({ source, endpoint: label(body), status, ok: false, ms: Date.now() - started, error: err.code });
    throw err;
  }
}

function waitUntil(p: Promise<unknown>) {
  try { getCloudflareContext().ctx.waitUntil(p); } catch { void p.catch(() => {}); }
}

/** Busca na Gecko com cache: resposta nova é guardada; resposta antiga é devolvida e atualizada em segundo plano. */
async function extract(source: SourceId, kind: Kind, body: Json, ctx: ConnectorContext): Promise<{ data: Json; at: string }> {
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://cache.worthwise.site/gecko/v1/${await sha(JSON.stringify(body))}`);
  const save = async () => {
    const data = await call(source, body, ctx);
    const out = { data, at: new Date().toISOString() };
    await edge?.put(key, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${KEEP_S}` } })).catch(() => {});
    return out;
  };
  const hit = await edge?.match(key).catch(() => undefined);
  if (hit) {
    const prev = (await hit.json()) as { data: Json; at: string };
    if (Date.now() - Date.parse(prev.at) > FRESH_MS[kind]) waitUntil(save());
    return prev;
  }
  return save();
}

/* ───────────── Normalização (só copia o que a Gecko devolveu) ───────────── */
const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const pos = (v: unknown) => { const n = num(v); return n != null && n > 0 ? n : null; };
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
const rating = (v: unknown) => { const r = num(v); return r != null && r > 0 && r <= 5 ? Math.round(r * 100) / 100 : null; };
const imgUrl = (v: unknown) => str(v) ?? str(obj(v).url);
const original = (price: number | null, regular: number | null) => (price != null && regular != null && regular > price ? regular : null);

function base(source: SourceId, now: string): Omit<ProductResult, "externalId" | "title" | "kind"> {
  return {
    source, imageUrl: null, permalink: null, price: null, originalPrice: null, currency: null, rating: null, reviewsCount: null,
    sellerId: null, sellerName: null, available: null, freeShipping: null, condition: null, brand: null, model: null, gtin: null,
    categoryId: null, offersCount: null, attributes: [], collectedAt: now, sourceUpdatedAt: null, provider: "geckoapi",
  };
}

/* Mercado Livre */
const ML_ID = /^MLB\d{5,15}$/;
export function mlItem(i: Json, now: string): ProductResult | null {
  const productId = str(i.productId), itemId = str(i.itemId) ?? str(i.sku);
  const id = productId && ML_ID.test(productId) ? `p-${productId}` : itemId && ML_ID.test(itemId) ? `i-${itemId}` : null;
  const title = str(i.name);
  if (!id || !title) return null;
  const price = num(i.price), r = obj(i.aggregateRating), sold = pos(i.soldCountReported) ?? pos(i.soldCountLowerBound);
  return {
    ...base("mercadolivre", now), externalId: id, kind: id.startsWith("p-") ? "catalog_product" : "listing", title,
    imageUrl: str(i.imageUrl), permalink: str(i.url) ?? str(i.offerUrl), price, originalPrice: original(price, num(i.regularPrice)),
    currency: price != null ? str(i.currency) ?? "BRL" : null, rating: rating(r.rating), reviewsCount: pos(r.reviewCount),
    sellerId: str(i.sellerId), sellerName: str(i.sellerName), freeShipping: typeof i.freeShipping === "boolean" ? i.freeShipping : null,
    condition: str(i.condition), categoryId: str(i.categoryId),
    soldQuantity: sold, soldLabel: str(i.soldCountText), fastDelivery: i.isFullDelivery === true ? true : null,
    attributes: sold ? [{ name: "Vendidos (segundo o Mercado Livre)", value: `+${sold.toLocaleString("pt-BR")}` }] : [],
  };
}

/* Shopee */
export function shopeeItem(i: Json, now: string): ProductResult | null {
  const shop = str(i.shopId) ?? str(i.sellerId), item = str(i.itemId);
  const title = str(i.name);
  if (!shop || !item || !/^\d+$/.test(shop) || !/^\d+$/.test(item) || !title) return null;
  const price = num(i.priceMin) ?? num(i.price), r = obj(i.aggregateRating), sold = pos(i.soldCount);
  const images = arr(i.images).map(imgUrl).filter((u): u is string => Boolean(u));
  return {
    ...base("shopee", now), externalId: `s-${shop}x${item}`, kind: "listing", title,
    imageUrl: str(i.thumbnail) ?? images[0] ?? null, permalink: str(i.url) ?? `https://shopee.com.br/product/${shop}/${item}`,
    price, originalPrice: original(price, num(i.regularPriceMin) ?? num(i.regularPrice)), currency: price != null ? "BRL" : null,
    rating: rating(r.rating), reviewsCount: pos(r.reviewCount), sellerId: shop, sellerName: str(i.sellerName),
    brand: str(i.brand), categoryId: str(i.categoryId), soldQuantity: sold,
    attributes: [
      ...(sold ? [{ name: "Vendidos (segundo a Shopee)", value: sold.toLocaleString("pt-BR") }] : []),
      ...(pos(i.likedCount) ? [{ name: "Curtidas na Shopee", value: pos(i.likedCount)!.toLocaleString("pt-BR") }] : []),
    ],
  };
}

/* TikTok Shop */
export const tiktokLink = (id: string) => `https://www.tiktok.com/shop/pdp/${id}`;
export function tiktokItem(i: Json, now: string): ProductResult | null {
  const id = str(i.productId), title = str(i.name);
  if (!id || !/^\d{6,25}$/.test(id) || !title || i.isAd === true) return null;
  const price = num(i.price), sold = pos(i.soldCount);
  return {
    ...base("tiktokshop", now), externalId: `t-${id}`, kind: "listing", title,
    imageUrl: imgUrl(i.image), permalink: str(i.url) ?? tiktokLink(id), price, originalPrice: original(price, num(i.regularPrice)),
    currency: price != null ? str(i.currency) ?? "BRL" : null, rating: rating(i.rating), sellerId: str(i.shopId), sellerName: str(i.sellerName),
    freeShipping: typeof i.freeShipping === "boolean" ? i.freeShipping : null, soldQuantity: sold,
    attributes: sold ? [{ name: "Vendidos (segundo o TikTok Shop)", value: sold.toLocaleString("pt-BR") }] : [],
  };
}

/** Página de produto (pdp): mesmos campos, mais descrição, fotos e características, quando a Gecko devolve. */
function detail(p: ProductResult, d: Json): ProductDetail {
  const images = [...new Set([imgUrl(d.mainImage), ...arr(d.images).map(imgUrl)].filter((u): u is string => Boolean(u)))];
  const r = obj(d.aggregateRating);
  const price = num(d.price) ?? p.price;
  const props = arr(d.additionalProperties).map(obj).map((a) => ({ name: str(a.name)?.replace(/:$/, "") ?? "", value: str(a.value) ?? "" })).filter((a) => a.name && a.value);
  const seen = new Set<string>();
  const attributes = [...p.attributes, ...props.filter((a) => (seen.has(a.name.toLowerCase()) ? false : (seen.add(a.name.toLowerCase()), true)))].slice(0, 40);
  const stock = num(d.stockQuantity);
  return {
    ...p, title: str(d.name) ?? p.title, price, originalPrice: original(price, num(d.regularPrice)) ?? p.originalPrice,
    currency: price != null ? str(d.currency) ?? p.currency ?? "BRL" : null,
    imageUrl: images[0] ?? p.imageUrl, permalink: str(d.canonicalUrl) ?? str(d.url) ?? p.permalink,
    rating: rating(r.rating ?? d.rating) ?? p.rating, reviewsCount: pos(r.reviewCount) ?? p.reviewsCount,
    sellerId: str(d.sellerId) ?? p.sellerId, sellerName: str(d.sellerName) ?? p.sellerName,
    available: d.availability === "InStock" ? true : d.availability === "OutOfStock" ? false : stock != null ? stock > 0 : p.available,
    freeShipping: typeof d.freeShipping === "boolean" ? d.freeShipping : p.freeShipping, condition: str(d.itemCondition) ?? p.condition,
    brand: str(obj(d.brand).name) ?? str(d.brand) ?? p.brand, soldQuantity: pos(d.soldCount) ?? p.soldQuantity,
    attributes, description: str(d.description), features: [], images, offers: [], offersTotal: null,
  };
}

const ranked = (items: ProductResult[]): RankedProduct[] => items.map((p, i) => ({ ...p, rank: i + 1 }));

/* ───────────── Conectores ───────────── */
const caps = { search: true, details: true, offers: false, fees: false, bestsellers: true };
const stateOf = (name: string) => () => geckoConfigured()
  ? { state: "connected" as const, detail: `${name}: dados públicos via GeckoAPI.` }
  : { state: "not_configured" as const, detail: "Defina GECKO_API_KEY no servidor." };

export const geckoMercadoLivre: Connector = {
  id: "mercadolivre", name: "Mercado Livre", capabilities: caps, state: stateOf("Mercado Livre"),
  async search(params: SearchParams, ctx) {
    const slug = params.query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, at } = await extract("mercadolivre", "search", { target: "mercadolivre.com.br", type: "plp", region: "BR", url: `https://lista.mercadolivre.com.br/${slug}`, page: 1 }, ctx);
    return arr(data.items).map(obj).filter((i) => i.isSponsored !== true).map((i) => mlItem(i, at)).filter((p): p is ProductResult => Boolean(p)).slice(0, params.limit);
  },
  async getProduct(externalId, ctx) {
    const [k, id] = [externalId.slice(0, 1), externalId.slice(2)];
    if (!ML_ID.test(id) || (k !== "p" && k !== "i")) throw new ConnectorError("mercadolivre", "not_found", "Identificador inválido");
    const url = k === "p" ? `https://www.mercadolivre.com.br/p/${id}` : `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}`;
    const { data, at } = await extract("mercadolivre", "product", { target: "mercadolivre.com.br", type: "pdp", region: "BR", url }, ctx);
    const p = mlItem({ ...data, productId: k === "p" ? id : null, itemId: k === "i" ? id : str(data.itemId), soldCountReported: data.soldCount, imageUrl: imgUrl(data.mainImage) }, at);
    if (!p) throw new ConnectorError("mercadolivre", "not_found", "Produto não encontrado no Mercado Livre");
    return detail({ ...p, externalId }, data);
  },
  async getCategories() { return FALLBACK_ML_CATEGORIES; },
  async getTrends() { return []; },
  /** Página oficial "Mais vendidos" da categoria: a posição é a do próprio Mercado Livre. */
  async getBestsellers(categoryId, ctx) {
    const { data, at } = await extract("mercadolivre", "ranking", { target: "mercadolivre.com.br", type: "plp", region: "BR", url: `https://www.mercadolivre.com.br/mais-vendidos/${categoryId}`, page: 1 }, ctx);
    const items = arr(data.items).map(obj).map((i) => ({ i, p: mlItem(i, at) })).filter((x): x is { i: Json; p: ProductResult } => Boolean(x.p));
    return items.sort((a, b) => (num(a.i.resultPosition) ?? 999) - (num(b.i.resultPosition) ?? 999)).map(({ p }, i) => ({ ...p, rank: i + 1, salesRank: { rank: i + 1, category: categoryId } }));
  },
};

const shopeeCats = SHOPEE_CATEGORIES.map(({ id, name }) => ({ id, name }));
export const geckoShopee: Connector = {
  id: "shopee", name: "Shopee", capabilities: caps, state: stateOf("Shopee"),
  async search(params, ctx) {
    const sort = params.sort === "reviews" ? "&sortBy=sales" : params.sort === "price_asc" ? "&sortBy=price&order=asc" : params.sort === "price_desc" ? "&sortBy=price&order=desc" : "";
    const { data, at } = await extract("shopee", "search", { target: "shopee.com.br", type: "plp", region: "BR", url: `https://shopee.com.br/search?keyword=${encodeURIComponent(params.query.trim())}${sort}` }, ctx);
    return arr(data.items).map(obj).filter((i) => i.sponsored !== true).map((i) => shopeeItem(i, at)).filter((p): p is ProductResult => Boolean(p)).slice(0, params.limit);
  },
  async getProduct(externalId, ctx) {
    const m = /^s-(\d{1,20})x(\d{1,20})$/.exec(externalId);
    if (!m) throw new ConnectorError("shopee", "not_found", "Identificador inválido");
    const { data, at } = await extract("shopee", "product", { target: "shopee.com.br", type: "pdp", region: "BR", url: `https://shopee.com.br/product/${m[1]}/${m[2]}` }, ctx);
    const p = shopeeItem({ ...data, shopId: m[1], itemId: m[2] }, at);
    if (!p) throw new ConnectorError("shopee", "not_found", "Produto não encontrado na Shopee");
    return detail(p, data);
  },
  async getCategories() { return shopeeCats; },
  /** Busca da categoria na ordenação "Mais vendidos" da própria Shopee: a posição é a da Shopee. */
  async getBestsellers(categoryId, ctx) {
    const cat = SHOPEE_CATEGORIES.find((c) => c.id === categoryId) ?? SHOPEE_CATEGORIES[0]!;
    const { data, at } = await extract("shopee", "ranking", { target: "shopee.com.br", type: "plp", region: "BR", url: `https://shopee.com.br/search?keyword=${encodeURIComponent(cat.keyword)}&sortBy=sales` }, ctx);
    return ranked(arr(data.items).map(obj).filter((i) => i.sponsored !== true).map((i) => shopeeItem(i, at)).filter((p): p is ProductResult => Boolean(p)));
  },
};

export const TIKTOK_CATEGORIES = [
  { id: "casa", name: "Casa e cozinha", keyword: "casa cozinha" },
  { id: "beleza", name: "Beleza", keyword: "maquiagem skincare" },
  { id: "moda", name: "Moda", keyword: "roupa feminina" },
  { id: "eletronicos", name: "Eletrônicos", keyword: "fone bluetooth" },
  { id: "celular", name: "Celular", keyword: "acessórios celular" },
  { id: "esportes", name: "Esportes", keyword: "academia fitness" },
  { id: "pets", name: "Pets", keyword: "pet cachorro gato" },
  { id: "infantil", name: "Bebês e brinquedos", keyword: "brinquedos infantil" },
];
const tiktokCats: Category[] = TIKTOK_CATEGORIES.map(({ id, name }) => ({ id, name }));

async function tiktokSearch(keyword: string, kind: Kind, ctx: ConnectorContext) {
  const { data, at } = await extract("tiktokshop", kind, { target: "tiktok.com", type: "plp", region: "BR", keyword: keyword.trim().slice(0, 200) }, ctx);
  return arr(data.items).map(obj).map((i) => tiktokItem(i, at)).filter((p): p is ProductResult => Boolean(p));
}

export const geckoTikTok: Connector = {
  id: "tiktokshop", name: "TikTok Shop", capabilities: caps, state: stateOf("TikTok Shop"),
  async search(params, ctx) { return (await tiktokSearch(params.query, "search", ctx)).slice(0, params.limit); },
  async getProduct(externalId, ctx) {
    const id = externalId.slice(2);
    if (!externalId.startsWith("t-") || !/^\d{6,25}$/.test(id)) throw new ConnectorError("tiktokshop", "not_found", "Identificador inválido");
    const { data, at } = await extract("tiktokshop", "product", { target: "tiktok.com", type: "pdp", region: "BR", url: tiktokLink(id) }, ctx);
    const p = tiktokItem({ ...data, productId: id, image: data.mainImage ?? arr(data.images)[0] }, at);
    if (!p) throw new ConnectorError("tiktokshop", "not_found", "Produto não encontrado no TikTok Shop");
    return detail(p, data);
  },
  async getCategories() { return tiktokCats; },
  /** O TikTok Shop não tem página pública de ranking: mostramos a busca da categoria ordenada pela quantidade vendida que o próprio TikTok informa. */
  async getBestsellers(categoryId, ctx) {
    const cat = TIKTOK_CATEGORIES.find((c) => c.id === categoryId) ?? TIKTOK_CATEGORIES[0]!;
    const items = await tiktokSearch(cat.keyword, "ranking", ctx);
    return ranked(items.filter((p) => p.soldQuantity != null).sort((a, b) => b.soldQuantity! - a.soldQuantity!));
  },
};
