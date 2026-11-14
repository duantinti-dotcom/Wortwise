import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  ConnectorError, type Category, type Connector, type ConnectorContext, type FeeQuote, type Offer, type ProductDetail,
  type ProductResult, type RankedProduct, type SearchParams, type TrendKeyword,
} from "./types";

/**
 * Conector oficial do Mercado Livre (https://developers.mercadolivre.com.br).
 *
 * Usa apenas a API pública documentada, autenticada com as credenciais do aplicativo
 * (OAuth client_credentials). Não faz scraping e não contorna limites.
 *
 * Estratégia de busca:
 *  1. /sites/MLB/search (anúncios, com preço e vendedor). Desde 2025 o Mercado Livre restringe esse
 *     recurso para parte dos aplicativos; se a API responder 401/403, o conector passa a usar
 *  2. /products/search (catálogo) + /products/{id} para o preço da oferta vencedora (buy box).
 *
 * Vitrine "Em alta": /highlights/MLB/category/{id} devolve o ranking oficial de mais vendidos da categoria
 * (somente ids e posições); fotos, preços e links vêm de /products/{id} (fichas de catálogo) e de
 * /items?ids= (anúncios). /trends/MLB devolve os termos de busca que mais cresceram.
 *
 * O que a API NÃO fornece a terceiros: quantidade vendida de anúncios de outros vendedores,
 * faturamento de concorrentes e histórico de preços. O histórico do Worthwise é construído
 * exclusivamente com observações próprias armazenadas ao longo do tempo.
 */
const API = "https://api.mercadolibre.com";
const SITE = "MLB";
const TIMEOUT_MS = 8000;

const num = z.number().nullish();
const str = z.string().nullish();
const attrSchema = z.object({ id: str, name: str, value_name: str }).loose();
const shippingSchema = z.object({ free_shipping: z.boolean().nullish() }).loose().nullish();

const listingSchema = z.object({
  id: z.string(), title: z.string(), price: num, original_price: num, currency_id: str, thumbnail: str,
  permalink: str, condition: str, available_quantity: num, category_id: str, catalog_product_id: str,
  seller: z.object({ id: z.union([z.number(), z.string()]).nullish(), nickname: str }).loose().nullish(),
  shipping: shippingSchema, attributes: z.array(attrSchema).nullish(), official_store_name: str,
}).loose();

const buyBoxSchema = z.object({
  item_id: str, price: num, original_price: num, currency_id: str,
  seller_id: z.union([z.number(), z.string()]).nullish(), shipping: shippingSchema,
}).loose().nullish();

const catalogProductSchema = z.object({
  id: z.string(), name: z.string(), permalink: str, family_name: str, domain_id: str,
  pictures: z.array(z.object({ url: str }).loose()).nullish(),
  main_features: z.array(z.object({ text: str }).loose()).nullish(),
  attributes: z.array(attrSchema).nullish(),
  short_description: z.object({ content: str }).loose().nullish(),
  buy_box_winner: buyBoxSchema, last_updated: str,
}).loose();

const productItemSchema = z.object({
  item_id: z.string(), price: num, original_price: num, currency_id: str, condition: str,
  seller_id: z.union([z.number(), z.string()]).nullish(), listing_type_id: str,
  official_store_id: z.union([z.number(), z.string()]).nullish(), shipping: shippingSchema,
}).loose();

const itemSchema = listingSchema.extend({
  pictures: z.array(z.object({ url: str, secure_url: str }).loose()).nullish(),
  seller_id: z.union([z.number(), z.string()]).nullish(), last_updated: str, status: str,
});

let token: { value: string; expiresAt: number } | null = null;
let listingSearchForbidden = false;

function configured() {
  const e = serverEnv();
  return Boolean(e.meliClientId && e.meliClientSecret);
}

async function timed<T>(ctx: ConnectorContext, endpoint: string, run: () => Promise<Response>, parse: (r: Response) => Promise<T>): Promise<T> {
  const started = Date.now();
  let status: number | null = null;
  try {
    const res = await run();
    status = res.status;
    if (!res.ok) {
      const code = status === 401 || status === 403 ? "unauthorized" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : "unavailable";
      throw new ConnectorError("mercadolivre", code, `Mercado Livre respondeu ${status} em ${endpoint}`, status);
    }
    const out = await parse(res);
    ctx.logs.push({ source: "mercadolivre", endpoint, status, ok: true, ms: Date.now() - started, error: null });
    return out;
  } catch (e) {
    const err = e instanceof ConnectorError ? e
      : e instanceof z.ZodError ? new ConnectorError("mercadolivre", "bad_response", `Formato inesperado em ${endpoint}`)
      : (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError"
        ? new ConnectorError("mercadolivre", "timeout", `Tempo esgotado em ${endpoint}`)
        : new ConnectorError("mercadolivre", "unavailable", `Falha de rede em ${endpoint}`);
    ctx.logs.push({ source: "mercadolivre", endpoint, status, ok: false, ms: Date.now() - started, error: err.code });
    throw err;
  }
}

async function getToken(ctx: ConnectorContext): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = serverEnv();
  if (!configured()) throw new ConnectorError("mercadolivre", "not_configured", "Credenciais do Mercado Livre ausentes");
  const data = await timed(ctx, "POST /oauth/token", () => fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: e.meliClientId, client_secret: e.meliClientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }), async (r) => z.object({ access_token: z.string(), expires_in: z.number() }).loose().parse(await r.json()));
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function get<T>(ctx: ConnectorContext, path: string, schema: z.ZodType<T>, label: string): Promise<T> {
  const t = await getToken(ctx);
  return timed(ctx, label, () => fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${t}`, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS),
  }), async (r) => schema.parse(await r.json()));
}

type Attr = z.infer<typeof attrSchema>;
const attr = (attrs: Attr[] | null | undefined, id: string) => attrs?.find((a) => a.id === id)?.value_name ?? null;
const attrList = (attrs: Attr[] | null | undefined) =>
  (attrs ?? []).filter((a) => a.name && a.value_name).slice(0, 30).map((a) => ({ name: a.name!, value: a.value_name! }));
const https = (u: string | null | undefined) => (u ? u.replace(/^http:\/\//, "https://") : null);
/** Miniaturas do Mercado Livre terminam em -I.jpg (90 px); -O.jpg é a mesma foto em tamanho maior. */
const bigImage = (u: string | null | undefined) => (u ? https(u)!.replace(/-I\.(jpe?g|webp|png)$/i, "-O.$1") : null);
const idStr = (v: string | number | null | undefined) => (v == null ? null : String(v));

function fromListing(l: z.infer<typeof listingSchema>, now: string): ProductResult {
  return {
    source: "mercadolivre", externalId: `i-${l.id}`, kind: "listing", title: l.title, imageUrl: bigImage(l.thumbnail),
    permalink: l.permalink ?? null, price: l.price ?? null, originalPrice: l.original_price ?? null,
    currency: l.currency_id ?? null, rating: null, reviewsCount: null, sellerId: idStr(l.seller?.id),
    sellerName: l.official_store_name ?? l.seller?.nickname ?? null,
    available: l.available_quantity == null ? null : l.available_quantity > 0,
    freeShipping: l.shipping?.free_shipping ?? null, condition: l.condition ?? null,
    brand: attr(l.attributes, "BRAND"), model: attr(l.attributes, "MODEL"), gtin: attr(l.attributes, "GTIN"),
    categoryId: l.category_id ?? null, offersCount: null, attributes: attrList(l.attributes), collectedAt: now, sourceUpdatedAt: null,
  };
}

/** `detailed` indica que veio de /products/{id} (onde a ausência de buy box significa "sem oferta ativa"). */
function fromCatalog(p: z.infer<typeof catalogProductSchema>, now: string, detailed: boolean): ProductResult {
  const bb = p.buy_box_winner ?? null;
  return {
    source: "mercadolivre", externalId: `p-${p.id}`, kind: "catalog_product", title: p.name,
    imageUrl: https(p.pictures?.[0]?.url), permalink: p.permalink ?? `https://www.mercadolivre.com.br/p/${p.id}`,
    price: bb?.price ?? null, originalPrice: bb?.original_price ?? null, currency: bb?.currency_id ?? null,
    rating: null, reviewsCount: null, sellerId: idStr(bb?.seller_id), sellerName: null,
    available: detailed ? Boolean(bb) : null, freeShipping: bb?.shipping?.free_shipping ?? null,
    condition: null, brand: attr(p.attributes, "BRAND"), model: attr(p.attributes, "MODEL"), gtin: attr(p.attributes, "GTIN"),
    categoryId: p.domain_id ?? null, offersCount: null, attributes: attrList(p.attributes), collectedAt: now,
    sourceUpdatedAt: p.last_updated ?? null,
  };
}

async function reviews(ctx: ConnectorContext, itemId: string): Promise<{ rating: number | null; count: number | null }> {
  try {
    const r = await get(ctx, `/reviews/item/${itemId}?limit=1`,
      z.object({ rating_average: num, paging: z.object({ total: num }).loose().nullish() }).loose(), "GET /reviews/item/{id}");
    return { rating: r.rating_average ?? null, count: r.paging?.total ?? null };
  } catch {
    return { rating: null, count: null }; // avaliações são opcionais: ausência não é erro
  }
}

export const mercadoLivre: Connector = {
  id: "mercadolivre",
  name: "Mercado Livre",
  capabilities: { search: true, details: true, offers: true, fees: true, bestsellers: true },

  state() {
    return configured()
      ? { state: "connected", detail: "Credenciais configuradas." }
      : { state: "not_configured", detail: "Defina MELI_CLIENT_ID e MELI_CLIENT_SECRET (aplicativo criado no DevCenter do Mercado Livre)." };
  },

  async search(params: SearchParams, ctx: ConnectorContext): Promise<ProductResult[]> {
    const now = new Date().toISOString();
    const q = encodeURIComponent(params.query);
    const cat = params.categoryId ? `&category=${encodeURIComponent(params.categoryId)}` : "";
    if (!listingSearchForbidden) {
      try {
        const data = await get(ctx, `/sites/${SITE}/search?q=${q}${cat}&limit=${params.limit}&offset=${params.offset}`,
          z.object({ results: z.array(listingSchema) }).loose(), "GET /sites/MLB/search");
        return data.results.map((l) => fromListing(l, now));
      } catch (e) {
        if (!(e instanceof ConnectorError) || e.code !== "unauthorized") throw e;
        listingSearchForbidden = true; // aplicativo sem acesso à busca de anúncios: usar catálogo
      }
    }
    const data = await get(ctx, `/products/search?status=active&site_id=${SITE}&q=${q}&limit=${Math.min(params.limit, 20)}&offset=${params.offset}`,
      z.object({ results: z.array(catalogProductSchema) }).loose(), "GET /products/search");
    // Preço da oferta vencedora de cada ficha (em paralelo, com teto para respeitar limites).
    const top = data.results.slice(0, 12);
    const details = await Promise.allSettled(top.map((p) => get(ctx, `/products/${p.id}`, catalogProductSchema, "GET /products/{id}")));
    return data.results.map((p, i) => {
      const d = details[i];
      return d && d.status === "fulfilled" ? fromCatalog(d.value, now, true) : fromCatalog(p, now, false);
    });
  },

  async getProduct(externalId: string, ctx: ConnectorContext): Promise<ProductDetail> {
    const now = new Date().toISOString();
    const [kind, id] = [externalId.slice(0, 1), externalId.slice(2)];
    if (!/^MLB[A-Z]?\d+$/.test(id)) throw new ConnectorError("mercadolivre", "not_found", "Identificador inválido");

    if (kind === "p") {
      const [p, items] = await Promise.all([
        get(ctx, `/products/${id}`, catalogProductSchema, "GET /products/{id}"),
        get(ctx, `/products/${id}/items?limit=50`,
          z.object({ results: z.array(productItemSchema), paging: z.object({ total: num }).loose().nullish() }).loose(),
          "GET /products/{id}/items").catch((e) => {
            if (e instanceof ConnectorError && e.code === "not_found") return { results: [], paging: { total: 0 } };
            throw e;
          }),
      ]);
      const offers: Offer[] = items.results.map((o) => ({
        externalId: o.item_id, sellerId: idStr(o.seller_id), sellerName: null, price: o.price ?? null,
        originalPrice: o.original_price ?? null, currency: o.currency_id ?? null, condition: o.condition ?? null,
        freeShipping: o.shipping?.free_shipping ?? null, listingType: o.listing_type_id ?? null,
        officialStore: o.official_store_id == null ? null : true, permalink: null,
      }));
      const rv = p.buy_box_winner?.item_id ? await reviews(ctx, p.buy_box_winner.item_id) : { rating: null, count: null };
      const base = fromCatalog(p, now, true);
      return {
        ...base, rating: rv.rating, reviewsCount: rv.count, offersCount: items.paging?.total ?? offers.length,
        description: p.short_description?.content ?? null,
        features: (p.main_features ?? []).map((f) => f.text).filter((t): t is string => Boolean(t)),
        images: (p.pictures ?? []).map((x) => https(x.url)).filter((u): u is string => Boolean(u)),
        offers, offersTotal: items.paging?.total ?? null,
      };
    }

    const item = await get(ctx, `/items/${id}`, itemSchema, "GET /items/{id}");
    const rv = await reviews(ctx, id);
    const base = fromListing(item, now);
    return {
      ...base, sellerId: idStr(item.seller_id) ?? base.sellerId, rating: rv.rating, reviewsCount: rv.count,
      sourceUpdatedAt: item.last_updated ?? null, description: null, features: [],
      images: (item.pictures ?? []).map((x) => https(x.secure_url ?? x.url)).filter((u): u is string => Boolean(u)),
      offers: [], offersTotal: null,
    };
  },

  async getFees(price: number, categoryId: string | null, ctx: ConnectorContext): Promise<FeeQuote[]> {
    const cat = categoryId && /^MLB\d+$/.test(categoryId) ? `&category_id=${categoryId}` : "";
    const data = await get(ctx, `/sites/${SITE}/listing_prices?price=${price}${cat}`, z.array(z.object({
      listing_type_id: z.string(), listing_type_name: str, sale_fee_amount: num,
      sale_fee_details: z.object({ percentage_fee: num, fixed_fee: num }).loose().nullish(),
    }).loose()), "GET /sites/MLB/listing_prices");
    return data.map((f) => ({
      listingType: f.listing_type_id, listingTypeName: f.listing_type_name ?? f.listing_type_id,
      saleFeeAmount: f.sale_fee_amount ?? null, percentageFee: f.sale_fee_details?.percentage_fee ?? null,
      fixedFee: f.sale_fee_details?.fixed_fee ?? null,
    }));
  },

  async getBestsellerRank(categoryId: string, externalId: string, ctx: ConnectorContext): Promise<number | null> {
    if (!/^MLB\d+$/.test(categoryId)) return null;
    try {
      const data = await get(ctx, `/highlights/${SITE}/category/${categoryId}`,
        z.object({ content: z.array(z.object({ id: z.string(), position: num }).loose()) }).loose(), "GET /highlights/MLB/category/{id}");
      const id = externalId.slice(2);
      return data.content.find((c) => c.id === id)?.position ?? null;
    } catch {
      return null;
    }
  },

  async getCategories(ctx: ConnectorContext): Promise<Category[]> {
    const data = await get(ctx, `/sites/${SITE}/categories`, z.array(z.object({ id: z.string(), name: z.string() }).loose()), "GET /sites/MLB/categories");
    return data.map((c) => ({ id: c.id, name: c.name }));
  },

  async getTrends(categoryId: string | null, ctx: ConnectorContext): Promise<TrendKeyword[]> {
    const path = categoryId && /^MLB\d+$/.test(categoryId) ? `/trends/${SITE}/${categoryId}` : `/trends/${SITE}`;
    const data = await get(ctx, path, z.array(z.object({ keyword: z.string(), url: str }).loose()), "GET /trends/MLB");
    return data.filter((t) => t.keyword.trim()).slice(0, 30).map((t) => ({ keyword: t.keyword.trim(), url: https(t.url) }));
  },

  async getBestsellers(categoryId: string, ctx: ConnectorContext): Promise<RankedProduct[]> {
    if (!/^MLB\d+$/.test(categoryId)) throw new ConnectorError("mercadolivre", "not_found", "Categoria inválida");
    const now = new Date().toISOString();
    const data = await get(ctx, `/highlights/${SITE}/category/${categoryId}`,
      z.object({ content: z.array(z.object({ id: z.string(), position: num, type: str }).loose()) }).loose(), "GET /highlights/MLB/category/{id}");
    const ranked = data.content.filter((c) => /^MLB[A-Z]?\d+$/.test(c.id)).slice(0, 20)
      .map((c, i) => ({ id: c.id, rank: c.position ?? i + 1, type: (c.type ?? "").toUpperCase() }));
    const productIds = ranked.filter((r) => r.type === "PRODUCT");
    const itemIds = ranked.filter((r) => r.type === "ITEM");

    const byId = new Map<string, ProductResult>();
    const products = await Promise.allSettled(productIds.map((r) => get(ctx, `/products/${r.id}`, catalogProductSchema, "GET /products/{id}")));
    products.forEach((res, i) => { if (res.status === "fulfilled") byId.set(productIds[i]!.id, fromCatalog(res.value, now, true)); });
    for (let i = 0; i < itemIds.length; i += 20) {
      const chunk = itemIds.slice(i, i + 20).map((r) => r.id).join(",");
      try {
        const items = await get(ctx, `/items?ids=${chunk}`, z.array(z.object({ code: num, body: itemSchema.nullish() }).loose()), "GET /items?ids=");
        for (const it of items) {
          if (it.code !== 200 || !it.body) continue;
          const pic = it.body.pictures?.[0];
          byId.set(it.body.id, { ...fromListing(it.body, now), imageUrl: https(pic?.secure_url ?? pic?.url) ?? bigImage(it.body.thumbnail) });
        }
      } catch { /* lote indisponível: os demais seguem */ }
    }
    return ranked.flatMap((r) => { const p = byId.get(r.id); return p ? [{ ...p, rank: r.rank }] : []; }).sort((a, b) => a.rank - b.rank);
  },
};

/** Apenas para testes. */
export function __resetMercadoLivre() {
  token = null;
  listingSearchForbidden = false;
}
