import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { signV4 } from "./sigv4";
import { ConnectorError, type Connector, type ConnectorContext, type ProductDetail, type ProductResult, type SearchParams } from "./types";

/**
 * Conector oficial da Amazon Brasil — Product Advertising API 5.0 (programa de Associados).
 *
 * Exige Access Key, Secret Key e Partner Tag de uma conta de Associado com acesso à API liberado.
 * Usa SearchItems (busca com filtros na origem) e GetItems (detalhes). Fotos, título, tópicos de
 * descrição, marca, preço, desconto, frete/Prime, avaliações e posição no ranking de vendas vêm da
 * própria API; o link do produto já inclui a tag de Associado. Sem scraping.
 *
 * A API devolve no máximo 10 itens por página; buscamos até 2 páginas, em sequência, para respeitar
 * o limite inicial de 1 requisição por segundo.
 */
const SERVICE = "ProductAdvertisingAPI";
const REGION = "us-east-1";
const TIMEOUT_MS = 9000;

const RESOURCES_BASE = [
  "Images.Primary.Large", "Images.Variants.Large", "ItemInfo.Title", "ItemInfo.Features", "ItemInfo.ByLineInfo",
  "ItemInfo.ExternalIds", "ItemInfo.ManufactureInfo", "ItemInfo.ProductInfo", "ItemInfo.Classifications",
  "CustomerReviews.Count", "CustomerReviews.StarRating", "BrowseNodeInfo.BrowseNodes", "BrowseNodeInfo.WebsiteSalesRank",
];
const OFFERS_V1 = ["Offers.Listings.Price", "Offers.Listings.SavingBasis", "Offers.Listings.Condition", "Offers.Listings.MerchantInfo",
  "Offers.Listings.DeliveryInfo.IsFreeShippingEligible", "Offers.Listings.DeliveryInfo.IsPrimeEligible", "Offers.Summaries.OfferCount"];
const OFFERS_V2 = ["OffersV2.Listings.Price", "OffersV2.Listings.Condition", "OffersV2.Listings.MerchantInfo", "OffersV2.Listings.Availability"];
let useOffersV2 = false;

const num = z.number().nullish();
const str = z.string().nullish();
const display = z.object({ DisplayValue: z.union([z.string(), z.number()]).nullish() }).loose().nullish();
const money = z.object({ Amount: num, Currency: str, Money: z.object({ Amount: num, Currency: str }).loose().nullish() }).loose().nullish();
const image = z.object({ Large: z.object({ URL: str }).loose().nullish() }).loose().nullish();
const listing = z.object({
  Price: money, SavingBasis: money,
  Condition: z.object({ Value: str }).loose().nullish(),
  MerchantInfo: z.object({ Name: str }).loose().nullish(),
  DeliveryInfo: z.object({ IsFreeShippingEligible: z.boolean().nullish(), IsPrimeEligible: z.boolean().nullish() }).loose().nullish(),
  Availability: z.object({ Type: str, Message: str }).loose().nullish(),
}).loose();
const itemSchema = z.object({
  ASIN: z.string(), DetailPageURL: str,
  Images: z.object({ Primary: image, Variants: z.array(image).nullish() }).loose().nullish(),
  ItemInfo: z.object({
    Title: display, Features: z.object({ DisplayValues: z.array(z.string()).nullish() }).loose().nullish(),
    ByLineInfo: z.object({ Brand: display, Manufacturer: display }).loose().nullish(),
    ExternalIds: z.object({ EANs: z.object({ DisplayValues: z.array(z.string()).nullish() }).loose().nullish() }).loose().nullish(),
    ManufactureInfo: z.object({ Model: display }).loose().nullish(),
    Classifications: z.object({ ProductGroup: display, Binding: display }).loose().nullish(),
    ProductInfo: z.object({ Color: display, Size: display, ItemDimensions: z.unknown().nullish() }).loose().nullish(),
  }).loose().nullish(),
  Offers: z.object({ Listings: z.array(listing).nullish(), Summaries: z.array(z.object({ OfferCount: num }).loose()).nullish() }).loose().nullish(),
  OffersV2: z.object({ Listings: z.array(listing).nullish() }).loose().nullish(),
  CustomerReviews: z.object({ Count: num, StarRating: z.object({ Value: num }).loose().nullish() }).loose().nullish(),
  BrowseNodeInfo: z.object({
    BrowseNodes: z.array(z.object({ Id: str, DisplayName: str, SalesRank: num }).loose()).nullish(),
    WebsiteSalesRank: z.object({ SalesRank: num, DisplayName: str, ContextFreeName: str }).loose().nullish(),
  }).loose().nullish(),
}).loose();
type Item = z.infer<typeof itemSchema>;
const errorsSchema = z.array(z.object({ Code: str, Message: str }).loose()).nullish();

function cfg() {
  const e = serverEnv();
  return { access: e.amazonAccessKey, secret: e.amazonSecretKey, tag: e.amazonPartnerTag, host: e.amazonHost, marketplace: e.amazonMarketplace };
}
const configured = () => { const c = cfg(); return Boolean(c.access && c.secret && c.tag); };

const ACCOUNT_CODES = new Set(["AccessDeniedAssociate", "AccessDenied", "AssociateNotEligible"]);

async function call<T>(ctx: ConnectorContext, op: "SearchItems" | "GetItems", payload: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  if (!configured()) throw new ConnectorError("amazon", "not_configured", "Credenciais da Amazon ausentes");
  const c = cfg();
  const path = `/paapi5/${op.toLowerCase()}`;
  const body = JSON.stringify({ ...payload, PartnerTag: c.tag, PartnerType: "Associates", Marketplace: c.marketplace });
  const started = Date.now();
  let status: number | null = null;
  try {
    const headers = await signV4({
      method: "POST", host: c.host, path, region: REGION, service: SERVICE, body, accessKey: c.access, secretKey: c.secret,
      headers: { "content-encoding": "amz-1.0", "content-type": "application/json; charset=utf-8", "x-amz-target": `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${op}` },
    });
    delete headers.host; // o fetch define o host
    const res = await fetch(`https://${c.host}${path}`, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = res.status;
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    const errs = errorsSchema.safeParse(json.Errors).data ?? [];
    if (!res.ok) {
      const code = errs[0]?.Code ?? "";
      const message = errs[0]?.Message ?? "";
      if (status === 400 && !useOffersV2 && /Offers/i.test(message)) { useOffersV2 = true; throw new RetryWithOffersV2(); }
      const kind = ACCOUNT_CODES.has(code) ? "pending_approval" : status === 401 || status === 403 ? "unauthorized"
        : status === 429 ? "rate_limited" : status === 404 ? "not_found" : "unavailable";
      throw new ConnectorError("amazon", kind, kind === "pending_approval"
        ? "A conta de Associado ainda não tem acesso liberado à API (a Amazon exige vendas qualificadas)." : `Amazon respondeu ${status} (${code || "erro"})`, status);
    }
    const out = schema.parse(json);
    ctx.logs.push({ source: "amazon", endpoint: `POST ${path}`, status, ok: true, ms: Date.now() - started, error: null });
    return out;
  } catch (e) {
    if (e instanceof RetryWithOffersV2) throw e;
    const err = e instanceof ConnectorError ? e
      : e instanceof z.ZodError ? new ConnectorError("amazon", "bad_response", `Formato inesperado em ${op}`)
      : (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? new ConnectorError("amazon", "timeout", `Tempo esgotado em ${op}`)
      : new ConnectorError("amazon", "unavailable", `Falha de rede em ${op}`);
    ctx.logs.push({ source: "amazon", endpoint: `POST ${path}`, status, ok: false, ms: Date.now() - started, error: err.code });
    throw err;
  }
}
class RetryWithOffersV2 extends Error {}

async function withOffers<T>(run: (resources: string[]) => Promise<T>): Promise<T> {
  const resources = () => [...RESOURCES_BASE, ...(useOffersV2 ? OFFERS_V2 : OFFERS_V1)];
  try { return await run(resources()); } catch (e) {
    if (e instanceof RetryWithOffersV2) return run(resources());
    throw e;
  }
}

const amount = (m: z.infer<typeof money>) => m?.Amount ?? m?.Money?.Amount ?? null;
const currency = (m: z.infer<typeof money>) => m?.Currency ?? m?.Money?.Currency ?? null;
const text = (d: z.infer<typeof display>) => (d?.DisplayValue == null ? null : String(d.DisplayValue));

function toResult(it: Item, now: string): ProductResult {
  const l = it.Offers?.Listings?.[0] ?? it.OffersV2?.Listings?.[0] ?? null;
  const price = amount(l?.Price);
  const basis = amount(l?.SavingBasis);
  const rank = it.BrowseNodeInfo?.WebsiteSalesRank;
  const node = it.BrowseNodeInfo?.BrowseNodes?.[0];
  const info = it.ItemInfo;
  const attrs = [
    ["Marca", text(info?.ByLineInfo?.Brand)], ["Fabricante", text(info?.ByLineInfo?.Manufacturer)], ["Modelo", text(info?.ManufactureInfo?.Model)],
    ["Cor", text(info?.ProductInfo?.Color)], ["Tamanho", text(info?.ProductInfo?.Size)], ["Grupo", text(info?.Classifications?.ProductGroup)],
  ].filter((a): a is [string, string] => Boolean(a[1])).map(([name, value]) => ({ name, value }));
  const cond = l?.Condition?.Value?.toLowerCase() ?? null;
  return {
    source: "amazon", externalId: `a-${it.ASIN}`, kind: "listing", title: text(info?.Title) ?? it.ASIN,
    imageUrl: it.Images?.Primary?.Large?.URL ?? null, permalink: it.DetailPageURL ?? null,
    price, originalPrice: basis != null && price != null && basis > price ? basis : null, currency: currency(l?.Price),
    rating: it.CustomerReviews?.StarRating?.Value ?? null, reviewsCount: it.CustomerReviews?.Count ?? null,
    sellerId: null, sellerName: l?.MerchantInfo?.Name ?? null,
    available: l ? (l.Availability?.Type ? l.Availability.Type !== "OutOfStock" : true) : null,
    freeShipping: l?.DeliveryInfo?.IsFreeShippingEligible ?? null, fastDelivery: l?.DeliveryInfo?.IsPrimeEligible ?? null,
    condition: cond === "new" ? "new" : cond === "used" ? "used" : cond,
    brand: text(info?.ByLineInfo?.Brand), model: text(info?.ManufactureInfo?.Model), gtin: info?.ExternalIds?.EANs?.DisplayValues?.[0] ?? null,
    categoryId: node?.Id ?? null, offersCount: it.Offers?.Summaries?.[0]?.OfferCount ?? null, attributes: attrs, collectedAt: now, sourceUpdatedAt: null,
    salesRank: rank?.SalesRank ? { rank: rank.SalesRank, category: rank.DisplayName ?? rank.ContextFreeName ?? null }
      : node?.SalesRank ? { rank: node.SalesRank, category: node.DisplayName ?? null } : null,
  };
}

const SORT: Record<string, string | undefined> = { price_asc: "Price:LowToHigh", price_desc: "Price:HighToLow", rating: "AvgCustomerReviews", relevance: "Relevance" };
const cents = (v: number | null | undefined) => (v != null && v > 0 ? Math.round(v * 100) : undefined);

export function buildSearchPayload(p: SearchParams, page: number, resources: string[]) {
  const payload: Record<string, unknown> = { Keywords: p.query, SearchIndex: "All", ItemCount: 10, ItemPage: page, Resources: resources, LanguagesOfPreference: ["pt_BR"], CurrencyOfPreference: "BRL" };
  if (cents(p.priceMin)) payload.MinPrice = cents(p.priceMin);
  if (cents(p.priceMax)) payload.MaxPrice = cents(p.priceMax);
  if (p.minRating && p.minRating >= 1) payload.MinReviewsRating = Math.min(4, Math.floor(p.minRating));
  if (p.freeShipping) payload.DeliveryFlags = ["FreeShipping"];
  if (p.condition === "new") payload.Condition = "New";
  if (p.condition === "used") payload.Condition = "Used";
  const sort = p.sort ? SORT[p.sort] : undefined;
  if (sort && sort !== "Relevance") payload.SortBy = sort;
  return payload;
}

const searchSchema = z.object({ SearchResult: z.object({ Items: z.array(itemSchema).nullish(), TotalResultCount: num }).loose().nullish() }).loose();
const getSchema = z.object({ ItemsResult: z.object({ Items: z.array(itemSchema).nullish() }).loose().nullish() }).loose();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const amazon: Connector = {
  id: "amazon",
  name: "Amazon",
  capabilities: { search: true, details: true, offers: false, fees: false, bestsellers: false },

  state() {
    return configured()
      ? { state: "connected", detail: "Product Advertising API configurada." }
      : { state: "not_configured", detail: "Defina AMAZON_PAAPI_ACCESS_KEY, AMAZON_PAAPI_SECRET_KEY e AMAZON_PARTNER_TAG (conta de Associado Amazon com acesso à API)." };
  },

  async search(params: SearchParams, ctx: ConnectorContext): Promise<ProductResult[]> {
    const now = new Date().toISOString();
    const pages = Math.min(2, Math.max(1, Math.ceil(params.limit / 10)));
    const out: ProductResult[] = [];
    for (let page = 1; page <= pages; page++) {
      if (page > 1) await sleep(1100); // limite inicial: 1 requisição por segundo
      let data: z.infer<typeof searchSchema>;
      try {
        data = await withOffers((r) => call(ctx, "SearchItems", buildSearchPayload(params, page, r), searchSchema));
      } catch (e) {
        if (page > 1) break; // a primeira página já foi obtida
        throw e;
      }
      const items = data.SearchResult?.Items ?? [];
      out.push(...items.map((it) => toResult(it, now)));
      if (items.length < 10 || (data.SearchResult?.TotalResultCount ?? 0) <= page * 10) break;
    }
    return out;
  },

  async getProduct(externalId: string, ctx: ConnectorContext): Promise<ProductDetail> {
    const asin = externalId.slice(2);
    if (!externalId.startsWith("a-") || !/^[A-Z0-9]{10}$/.test(asin)) throw new ConnectorError("amazon", "not_found", "Identificador inválido");
    const now = new Date().toISOString();
    const data = await withOffers((r) => call(ctx, "GetItems", { ItemIds: [asin], Resources: r, LanguagesOfPreference: ["pt_BR"], CurrencyOfPreference: "BRL" }, getSchema));
    const it = data.ItemsResult?.Items?.[0];
    if (!it) throw new ConnectorError("amazon", "not_found", "Produto não encontrado na Amazon");
    const base = toResult(it, now);
    const images = [it.Images?.Primary?.Large?.URL, ...(it.Images?.Variants ?? []).map((v) => v?.Large?.URL)].filter((u): u is string => Boolean(u));
    const features = it.ItemInfo?.Features?.DisplayValues ?? [];
    return { ...base, description: null, features, images: [...new Set(images)], offers: [], offersTotal: base.offersCount };
  },
};

/** Apenas para testes. */
export function __resetAmazon() { useOffersV2 = false; }
