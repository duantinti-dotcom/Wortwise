import { serverEnv } from "@/lib/env";
import { serverRpc, serverRpcSafe } from "@/lib/supabase/server";
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
// Para economizar créditos: cada lista/produto só é buscado de novo na Gecko a cada 3 dias.
const DAY = 86400_000;
const FRESH_MS = { ranking: 3 * DAY, search: 3 * DAY, product: 3 * DAY };

export const geckoConfigured = () => Boolean(serverEnv().geckoToken);

type Json = Record<string, unknown>;
type Kind = keyof typeof FRESH_MS;

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** O último termo indica a funcionalidade (painel administrativo: créditos por funcionalidade). */
const label = (body: Json, feature?: string) => `POST /v1/extract ${String(body.target)} ${String(body.type)}${feature ? ` [${feature}]` : ""}`;

async function call(source: SourceId, body: Json, ctx: ConnectorContext, feature?: string): Promise<Json> {
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
    ctx.logs.push({ source, endpoint: label(body, feature), status, ok: true, ms: Date.now() - started, error: null });
    return json.data;
  } catch (e) {
    const err = e instanceof ConnectorError ? e
      : (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? new ConnectorError(source, "timeout", "A GeckoAPI demorou demais")
      : new ConnectorError(source, "unavailable", "Falha de rede na GeckoAPI");
    ctx.logs.push({ source, endpoint: label(body, feature), status, ok: false, ms: Date.now() - started, error: err.code });
    throw err;
  }
}

/** Busca na Gecko com cache: resposta nova é guardada; resposta antiga é devolvida e atualizada em segundo plano. */
/** Máximo de consultas pagas por dia (protege os créditos). Ajustável por GECKO_DAILY_MAX. */
const dailyMax = () => Math.max(0, Number(process.env.GECKO_DAILY_MAX ?? 5) || 0);
const keyOf = async (body: Json) => `v1:${String(body.target)}:${String(body.type)}:${await sha(JSON.stringify(body))}`;
type Stored = { data: Json; at: string };

async function dbGet(key: string): Promise<Stored | null> {
  try { return (await serverRpc<Stored | null>("server_gecko_get", { p_key: key })) ?? null; } catch { return null; }
}
async function dbPut(key: string, data: Json, req: Json | null) { await serverRpcSafe("server_gecko_put", { p_key: key, p_body: data, p_req: req }); }
async function claim(key: string) {
  try { return await serverRpc<boolean>("server_gecko_claim", { p_key: key, p_max_per_day: dailyMax() }); } catch { return false; }
}

/** Várias respostas guardadas numa chamada só (o Worker tem limite de chamadas externas por pedido). */
async function peekMany(bodies: Json[]): Promise<Stored[]> {
  const keys = await Promise.all(bodies.map(keyOf));
  const map = await serverRpc<Record<string, Stored>>("server_gecko_get_many", { p_keys: keys }).catch(() => ({} as Record<string, Stored>));
  return keys.map((k) => map[k]).filter((x): x is Stored => Boolean(x));
}

/** Só lê o que já está guardado (não gasta crédito). */
async function peek(body: Json): Promise<Stored | null> { return dbGet(await keyOf(body)); }

/**
 * Consulta com cache permanente no banco:
 *  - rankings já guardados → sempre o guardado (0 crédito); quem atualiza é o servidor, sozinho, a cada 3 dias (refreshStaleGecko);
 *  - busca/produto guardados há menos de 3 dias → o guardado (0 crédito);
 *  - nunca guardado → consulta a Gecko (1 crédito), se o limite do dia permitir.
 */
async function extract(source: SourceId, kind: Kind, body: Json, ctx: ConnectorContext): Promise<Stored> {
  if (!geckoConfigured()) throw new ConnectorError(source, "not_configured", "GECKO_API_KEY ausente");
  const key = await keyOf(body);
  const prev = await dbGet(key);
  if (prev && (kind === "ranking" || Date.now() - Date.parse(prev.at) <= FRESH_MS[kind])) return prev;
  if (!(await claim(key))) {
    if (prev) return prev;
    throw new ConnectorError(source, "daily_limit", "Limite diário de consultas à GeckoAPI atingido");
  }
  const data = await call(source, body, ctx, kind);
  await dbPut(key, data, kind === "ranking" ? body : null);
  return { data, at: new Date().toISOString() };
}

/**
 * Página do produto sem gastar crédito: usa a página do produto se já estiver guardada; senão,
 * o produto como ele aparece nas listas guardadas (ranking/busca). Nunca chama a Gecko.
 */
async function offlineProduct(source: SourceId, target: string, pdpBody: Json, match: Json, toItem: (i: Json, at: string) => ProductResult | null, fix: (p: ProductResult) => ProductResult = (p) => p): Promise<ProductDetail> {
  const pdp = await peek(pdpBody);
  if (pdp) {
    const p = toItem({ ...pdp.data, ...match }, pdp.at);
    if (p) return detail(fix(p), pdp.data);
  }
  const found = await serverRpc<{ item: Json; at: string } | null>("server_gecko_find_item", { p_target: target, p_match: match }).catch(() => null);
  const p = found ? toItem(found.item, found.at) : null;
  if (!p) throw new ConnectorError(source, "not_found", "Este produto ainda não está guardado no Worthwise. Abra direto na loja.");
  return detail(fix(p), {});
}

/**
 * Pesquisa econômica: primeiro nos produtos já guardados (0 crédito). Só consulta a Gecko se achar
 * menos de 8 e ainda houver consulta no dia. Nunca mostra erro de limite: devolve o que tiver.
 */
async function economicSearch(source: SourceId, target: string, query: string, limit: number, toItem: (i: Json, at: string) => ProductResult | null, online: () => Promise<ProductResult[]>): Promise<ProductResult[]> {
  const words = query.trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  const rows = words.length ? await serverRpc<{ item: Json; at: string }[]>("server_gecko_search_items", { p_target: target, p_words: words, p_limit: 40 }).catch(() => []) : [];
  const local = rows.map((r) => toItem(r.item, r.at)).filter((p): p is ProductResult => Boolean(p));
  if (local.length >= 8) return local.slice(0, limit);
  try {
    const remote = await online();
    const seen = new Set(remote.map((p) => p.externalId));
    return [...remote, ...local.filter((p) => !seen.has(p.externalId))].slice(0, limit);
  } catch (e) {
    if (e instanceof ConnectorError && (e.code === "daily_limit" || e.code === "rate_limited" || e.code === "no_credits" || e.code === "timeout" || e.code === "unavailable")) return local.slice(0, limit);
    throw e;
  }
}

const SOURCE_OF: Record<string, SourceId> = { "mercadolivre.com.br": "mercadolivre", "shopee.com.br": "shopee", "tiktok.com": "tiktokshop" };

/** Tarefa diária: atualiza os rankings guardados há mais de 3 dias (dentro do limite diário de consultas). */
export async function refreshStaleGecko(): Promise<{ refreshed: number; skipped: number; errors: string[] }> {
  const out = { refreshed: 0, skipped: 0, errors: [] as string[] };
  if (!geckoConfigured()) return out;
  const stale = await serverRpc<{ key: string; req: Json }[]>("server_gecko_stale", { p_hours: 72, p_limit: dailyMax() }).catch(() => []);
  const ctx: ConnectorContext = { logs: [] };
  for (const { key, req } of stale) {
    const source = SOURCE_OF[String(req.target)];
    if (!source) { out.skipped++; continue; }
    if (!(await claim(key))) { out.skipped++; continue; }
    try {
      await dbPut(key, await call(source, req, ctx, "refresh"), req);
      out.refreshed++;
    } catch (e) {
      out.errors.push(e instanceof ConnectorError ? `${source}: ${e.code}` : String(e).slice(0, 80));
      if (e instanceof ConnectorError && e.code === "no_credits") break;
    }
  }
  if (ctx.logs.length) {
    const { flushLogs } = await import("@/lib/search/service");
    await flushLogs(ctx.logs).catch(() => {});
  }
  return out;
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
const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "produto";
/** Link público do produto no TikTok Shop (formato /shop/pdp/{nome}/{id}). */
export const tiktokLink = (id: string, title?: string | null) => `https://www.tiktok.com/shop/pdp/${slug(title ?? "")}/${id}`;
export function tiktokItem(i: Json, now: string): ProductResult | null {
  const id = str(i.productId), title = str(i.name);
  if (!id || !/^\d{6,25}$/.test(id) || !title || i.isAd === true) return null;
  const price = num(i.price), sold = pos(i.soldCount);
  return {
    ...base("tiktokshop", now), externalId: `t-${id}`, kind: "listing", title,
    imageUrl: imgUrl(i.image), permalink: str(i.url) ?? tiktokLink(id, title), price, originalPrice: original(price, num(i.regularPrice)),
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
    attributes, description: str(d.description), features: [], images: images.length ? images : p.imageUrl ? [p.imageUrl] : [], offers: [], offersTotal: null,
  };
}

const ranked = (items: ProductResult[]): RankedProduct[] => items.map((p, i) => ({ ...p, rank: i + 1 }));

/** Categoria "Geral": o que mais vende em todos os tópicos da loja. */
export const GERAL: Category = { id: "geral", name: "Geral (todos)" };

/**
 * "Geral" sem gastar crédito: junta os rankings das categorias que já estão guardados.
 * Se nenhum estiver guardado ainda, busca só a primeira categoria (1 crédito).
 */
async function mergeCategories(
  bodies: Json[], toItems: (data: Json, at: string) => ProductResult[], order: "rank" | "sold", first: () => Promise<RankedProduct[]>,
): Promise<RankedProduct[]> {
  const lists = (await peekMany(bodies)).map((x) => toItems(x.data, x.at));
  if (!lists.length) return first();
  const seen = new Set<string>();
  let merged: ProductResult[] = [];
  if (order === "sold") merged = lists.flat().filter((p) => p.soldQuantity != null).sort((a, b) => b.soldQuantity! - a.soldQuantity!);
  else for (let i = 0; i < 50; i++) for (const l of lists) if (l[i]) merged.push(l[i]!);
  return ranked(merged.filter((p) => (seen.has(p.externalId) ? false : (seen.add(p.externalId), true))));
}

/**
 * Categorias que dá para mostrar sem travar: as que já estão guardadas e, se ainda houver consulta
 * disponível hoje, as demais. Não gasta crédito.
 */
async function availableCategories(cats: Category[], bodyOf: (id: string) => Json): Promise<Category[]> {
  const keys = await Promise.all(cats.map((c) => keyOf(bodyOf(c.id))));
  let st: { have: string[]; left: number } | null = null;
  try { st = await serverRpc<{ have: string[]; left: number }>("server_gecko_status", { p_keys: keys, p_max_per_day: dailyMax() }); } catch { st = null; }
  if (!st) return [GERAL, ...cats];
  const have = new Set(st.have);
  return [GERAL, ...cats.filter((_c, i) => have.has(keys[i]!) || st!.left > 0)];
}

/* ───────────── Conectores ───────────── */
const caps = { search: true, details: true, offers: false, fees: false, bestsellers: true };
const stateOf = (name: string) => () => geckoConfigured()
  ? { state: "connected" as const, detail: `${name}: dados públicos via GeckoAPI.` }
  : { state: "not_configured" as const, detail: "Defina GECKO_API_KEY no servidor." };

const mlRankBody = (categoryId: string): Json => ({ target: "mercadolivre.com.br", type: "plp", region: "BR", url: `https://www.mercadolivre.com.br/mais-vendidos/${categoryId}`, page: 1 });
const mlRanked = (data: Json, at: string): RankedProduct[] => arr(data.items).map(obj).map((i) => ({ i, p: mlItem(i, at) }))
  .filter((x): x is { i: Json; p: ProductResult } => Boolean(x.p))
  .sort((a, b) => (num(a.i.resultPosition) ?? 999) - (num(b.i.resultPosition) ?? 999)).map(({ p }, n) => ({ ...p, rank: n + 1 }));

export const geckoMercadoLivre: Connector = {
  id: "mercadolivre", name: "Mercado Livre", capabilities: caps, state: stateOf("Mercado Livre"),
  async search(params: SearchParams, ctx) {
    return economicSearch("mercadolivre", "mercadolivre.com.br", params.query, params.limit, (i, at) => mlItem(i, at), async () => {
    const slug = params.query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, at } = await extract("mercadolivre", "search", { target: "mercadolivre.com.br", type: "plp", region: "BR", url: `https://lista.mercadolivre.com.br/${slug}`, page: 1 }, ctx);
    return arr(data.items).map(obj).filter((i) => i.isSponsored !== true).map((i) => mlItem(i, at)).filter((p): p is ProductResult => Boolean(p)).slice(0, params.limit);
    });
  },
  async getProduct(externalId, ctx) {
    const [k, id] = [externalId.slice(0, 1), externalId.slice(2)];
    if (!ML_ID.test(id) || (k !== "p" && k !== "i")) throw new ConnectorError("mercadolivre", "not_found", "Identificador inválido");
    void ctx;
    const url = k === "p" ? `https://www.mercadolivre.com.br/p/${id}` : `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}`;
    return offlineProduct("mercadolivre", "mercadolivre.com.br", { target: "mercadolivre.com.br", type: "pdp", region: "BR", url },
      k === "p" ? { productId: id } : { itemId: id },
      (i, at) => mlItem({ ...i, soldCountReported: i.soldCountReported ?? i.soldCount, imageUrl: i.imageUrl ?? imgUrl(i.mainImage) }, at), (p) => ({ ...p, externalId }));
  },
  async getCategories() { return availableCategories(FALLBACK_ML_CATEGORIES, mlRankBody); },
  async getTrends() { return []; },
  /** Página oficial "Mais vendidos" da categoria: a posição é a do próprio Mercado Livre. "Geral" junta as categorias já guardadas. */
  async getBestsellers(categoryId, ctx) {
    if (categoryId === GERAL.id) return mergeCategories(FALLBACK_ML_CATEGORIES.map((c) => mlRankBody(c.id)), mlRanked, "sold", () => geckoMercadoLivre.getBestsellers!(FALLBACK_ML_CATEGORIES[0]!.id, ctx));
    const { data, at } = await extract("mercadolivre", "ranking", mlRankBody(categoryId), ctx);
    return mlRanked(data, at).map((p) => ({ ...p, salesRank: { rank: p.rank, category: categoryId } }));
  },
};

const shopeeCats = SHOPEE_CATEGORIES.map(({ id, name }) => ({ id, name }));
const shopeeRankBody = (cat: { keyword: string }): Json => ({ target: "shopee.com.br", type: "plp", region: "BR", url: `https://shopee.com.br/search?keyword=${encodeURIComponent(cat.keyword)}&sortBy=sales` });
const shopeeList = (data: Json, at: string) => arr(data.items).map(obj).filter((i) => i.sponsored !== true).map((i) => shopeeItem(i, at)).filter((p): p is ProductResult => Boolean(p));
export const geckoShopee: Connector = {
  id: "shopee", name: "Shopee", capabilities: caps, state: stateOf("Shopee"),
  async search(params, ctx) {
    return economicSearch("shopee", "shopee.com.br", params.query, params.limit, (i, at) => shopeeItem(i, at), async () => {
    const sort = params.sort === "reviews" ? "&sortBy=sales" : params.sort === "price_asc" ? "&sortBy=price&order=asc" : params.sort === "price_desc" ? "&sortBy=price&order=desc" : "";
    const { data, at } = await extract("shopee", "search", { target: "shopee.com.br", type: "plp", region: "BR", url: `https://shopee.com.br/search?keyword=${encodeURIComponent(params.query.trim())}${sort}` }, ctx);
    return arr(data.items).map(obj).filter((i) => i.sponsored !== true).map((i) => shopeeItem(i, at)).filter((p): p is ProductResult => Boolean(p)).slice(0, params.limit);
    });
  },
  async getProduct(externalId, ctx) {
    const m = /^s-(\d{1,20})x(\d{1,20})$/.exec(externalId);
    if (!m) throw new ConnectorError("shopee", "not_found", "Identificador inválido");
    void ctx;
    return offlineProduct("shopee", "shopee.com.br", { target: "shopee.com.br", type: "pdp", region: "BR", url: `https://shopee.com.br/product/${m[1]}/${m[2]}` },
      { itemId: m[2] }, (i, at) => shopeeItem({ ...i, shopId: i.shopId ?? m[1] }, at));
  },
  async getCategories() { return availableCategories(shopeeCats, (id) => shopeeRankBody(SHOPEE_CATEGORIES.find((c) => c.id === id)!)); },
  /** Busca da categoria na ordenação "Mais vendidos" da própria Shopee: a posição é a da Shopee. */
  async getBestsellers(categoryId, ctx) {
    if (categoryId === GERAL.id) return mergeCategories(SHOPEE_CATEGORIES.map(shopeeRankBody), shopeeList, "rank", () => geckoShopee.getBestsellers!(SHOPEE_CATEGORIES[0]!.id, ctx));
    const cat = SHOPEE_CATEGORIES.find((c) => c.id === categoryId) ?? SHOPEE_CATEGORIES[0]!;
    const { data, at } = await extract("shopee", "ranking", shopeeRankBody(cat), ctx);
    return ranked(shopeeList(data, at));
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

const tiktokBody = (keyword: string): Json => ({ target: "tiktok.com", type: "plp", region: "BR", keyword: keyword.trim().slice(0, 200) });
const tiktokList = (data: Json, at: string) => arr(data.items).map(obj).map((i) => tiktokItem(i, at)).filter((p): p is ProductResult => Boolean(p));
async function tiktokSearch(keyword: string, kind: Kind, ctx: ConnectorContext) {
  const { data, at } = await extract("tiktokshop", kind, tiktokBody(keyword), ctx);
  return tiktokList(data, at);
}
const bySold = (items: ProductResult[]) => ranked(items.filter((p) => p.soldQuantity != null).sort((a, b) => b.soldQuantity! - a.soldQuantity!));

export const geckoTikTok: Connector = {
  id: "tiktokshop", name: "TikTok Shop", capabilities: caps, state: stateOf("TikTok Shop"),
  async search(params, ctx) {
    return economicSearch("tiktokshop", "tiktok.com", params.query, params.limit, (i, at) => tiktokItem(i, at), async () => (await tiktokSearch(params.query, "search", ctx)).slice(0, params.limit));
  },
  async getProduct(externalId, ctx) {
    const id = externalId.slice(2);
    if (!externalId.startsWith("t-") || !/^\d{6,25}$/.test(id)) throw new ConnectorError("tiktokshop", "not_found", "Identificador inválido");
    void ctx;
    return offlineProduct("tiktokshop", "tiktok.com", { target: "tiktok.com", type: "pdp", region: "BR", url: tiktokLink(id, null) },
      { productId: id }, (i, at) => tiktokItem({ ...i, image: i.image ?? i.mainImage ?? arr(i.images)[0] }, at));
  },
  async getCategories() { return availableCategories(tiktokCats, (id) => tiktokBody(TIKTOK_CATEGORIES.find((c) => c.id === id)!.keyword)); },
  /** O TikTok Shop não tem página pública de ranking: mostramos a busca da categoria ordenada pela quantidade vendida que o próprio TikTok informa. */
  async getBestsellers(categoryId, ctx) {
    if (categoryId === GERAL.id) return mergeCategories(TIKTOK_CATEGORIES.map((c) => tiktokBody(c.keyword)), tiktokList, "sold", () => geckoTikTok.getBestsellers!(TIKTOK_CATEGORIES[0]!.id, ctx));
    const cat = TIKTOK_CATEGORIES.find((c) => c.id === categoryId) ?? TIKTOK_CATEGORIES[0]!;
    return bySold(await tiktokSearch(cat.keyword, "ranking", ctx));
  },
};
