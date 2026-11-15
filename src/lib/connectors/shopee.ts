import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { ConnectorError, type Connector, type ConnectorContext, type ProductDetail, type ProductResult, type RankedProduct, type SearchParams } from "./types";

/**
 * Conector oficial da Shopee Brasil — API de Afiliados (Shopee Affiliate Open API, GraphQL).
 *
 * Exige o App ID e a Secret de uma conta de afiliado aprovada (affiliate.shopee.com.br → Open API).
 * Usa productOfferV2: busca por palavra-chave e ordenação "mais vendidos" (ITEM_SOLD_DESC) feita pela
 * própria Shopee. Nome, foto, preço, nota, loja e quantidade vendida vêm da API; nada é inventado.
 * Sem scraping.
 */
const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
const TIMEOUT_MS = 9000;

const SORT_TYPE: Record<string, number> = { relevance: 1, price_desc: 3, price_asc: 4 };
const SORT_SOLD = 2;

const numStr = z.union([z.string(), z.number()]).nullish();
const nodeSchema = z.object({
  itemId: z.union([z.string(), z.number()]),
  productName: z.string().nullish(),
  imageUrl: z.string().nullish(),
  price: numStr, priceMin: numStr, priceMax: numStr,
  priceDiscountRate: numStr,
  ratingStar: numStr,
  sales: numStr,
  shopName: z.string().nullish(),
  shopId: z.union([z.string(), z.number()]).nullish(),
  productLink: z.string().nullish(),
  offerLink: z.string().nullish(),
  productCatIds: z.array(z.union([z.string(), z.number()])).nullish(),
}).loose();
const responseSchema = z.object({
  data: z.object({ productOfferV2: z.object({ nodes: z.array(nodeSchema).nullish() }).loose().nullish() }).loose().nullish(),
  errors: z.array(z.object({ message: z.string().nullish(), extensions: z.object({ code: numStr }).loose().nullish() }).loose()).nullish(),
}).loose();
type Node = z.infer<typeof nodeSchema>;

function cfg() {
  const e = serverEnv();
  return { appId: e.shopeeAppId, secret: e.shopeeSecret };
}
const configured = () => { const c = cfg(); return Boolean(c.appId && c.secret); };

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cabeçalho de autenticação da API de Afiliados: SHA256(AppId + Timestamp + Payload + Secret). */
export async function shopeeAuthHeader(appId: string, secret: string, payload: string, timestamp: number) {
  const signature = await sha256Hex(`${appId}${timestamp}${payload}${secret}`);
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

const FIELDS = "itemId productName imageUrl price priceMin priceMax priceDiscountRate ratingStar sales shopName shopId productLink offerLink productCatIds";

export function buildQuery(args: { keyword?: string; itemId?: string; sortType?: number; limit?: number; page?: number }) {
  const parts: string[] = [];
  if (args.keyword) parts.push(`keyword: ${JSON.stringify(args.keyword)}`);
  if (args.itemId) parts.push(`itemId: ${Number(args.itemId)}`);
  if (args.sortType) parts.push(`sortType: ${args.sortType}`);
  parts.push(`page: ${args.page ?? 1}`, `limit: ${Math.min(50, Math.max(1, args.limit ?? 20))}`);
  return `{ productOfferV2(${parts.join(", ")}) { nodes { ${FIELDS} } } }`;
}

async function call(ctx: ConnectorContext, query: string): Promise<Node[]> {
  if (!configured()) throw new ConnectorError("shopee", "not_configured", "Credenciais da Shopee ausentes");
  const c = cfg();
  const body = JSON.stringify({ query });
  const started = Date.now();
  let status: number | null = null;
  try {
    const auth = await shopeeAuthHeader(c.appId, c.secret, body, Math.floor(Date.now() / 1000));
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = res.status;
    const json = responseSchema.parse(await res.json().catch(() => ({})));
    const err = json.errors?.[0];
    if (!res.ok || err) {
      const code = Number(err?.extensions?.code ?? 0);
      // 10020: assinatura/credencial inválida · 10030: limite de requisições · 10031/10032/10033: acesso negado/conta
      const kind = code === 10030 || status === 429 ? "rate_limited" : code === 10020 || status === 401 || status === 403 ? "unauthorized"
        : code >= 10031 && code <= 10035 ? "pending_approval" : "unavailable";
      throw new ConnectorError("shopee", kind, err?.message ?? `Shopee respondeu ${status}`, status ?? undefined);
    }
    ctx.logs.push({ source: "shopee", endpoint: "POST /graphql productOfferV2", status, ok: true, ms: Date.now() - started, error: null });
    return json.data?.productOfferV2?.nodes ?? [];
  } catch (e) {
    const err = e instanceof ConnectorError ? e
      : e instanceof z.ZodError ? new ConnectorError("shopee", "bad_response", "Formato inesperado da Shopee")
      : (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? new ConnectorError("shopee", "timeout", "Tempo esgotado na Shopee")
      : new ConnectorError("shopee", "unavailable", "Falha de rede na Shopee");
    ctx.logs.push({ source: "shopee", endpoint: "POST /graphql productOfferV2", status, ok: false, ms: Date.now() - started, error: err.code });
    throw err;
  }
}

const toNum = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };

export function toResult(n: Node, now: string): ProductResult {
  const price = toNum(n.priceMin) ?? toNum(n.price);
  const rate = toNum(n.priceDiscountRate);
  const original = price != null && rate != null && rate > 0 && rate < 100 ? Math.round((price / (1 - rate / 100)) * 100) / 100 : null;
  const sold = toNum(n.sales);
  const rating = toNum(n.ratingStar);
  return {
    source: "shopee", externalId: `s-${n.itemId}`, kind: "listing", title: n.productName ?? `Produto ${n.itemId}`,
    imageUrl: n.imageUrl ?? null, permalink: n.offerLink ?? n.productLink ?? null,
    price, originalPrice: original, currency: price != null ? "BRL" : null,
    rating: rating != null && rating > 0 ? rating : null, reviewsCount: null,
    sellerId: n.shopId != null ? String(n.shopId) : null, sellerName: n.shopName ?? null,
    available: null, freeShipping: null, condition: "new", brand: null, model: null, gtin: null,
    categoryId: n.productCatIds?.length ? String(n.productCatIds.at(-1)) : null, offersCount: null,
    attributes: sold != null ? [{ name: "Vendidos (segundo a Shopee)", value: sold.toLocaleString("pt-BR") }] : [],
    collectedAt: now, sourceUpdatedAt: null, soldQuantity: sold != null && sold > 0 ? sold : null,
  };
}

/** Palavras-chave usadas para o ranking "mais vendidos" por categoria (a ordenação é da própria Shopee). */
export const SHOPEE_CATEGORIES = [
  { id: "eletronicos", name: "Eletrônicos", keyword: "eletrônicos" },
  { id: "celulares", name: "Celulares e acessórios", keyword: "acessórios celular" },
  { id: "casa", name: "Casa e decoração", keyword: "casa decoração" },
  { id: "beleza", name: "Beleza", keyword: "beleza maquiagem" },
  { id: "moda", name: "Moda", keyword: "roupa feminina" },
  { id: "esportes", name: "Esportes", keyword: "academia fitness" },
  { id: "brinquedos", name: "Brinquedos", keyword: "brinquedos" },
  { id: "pets", name: "Pets", keyword: "pet cachorro gato" },
];

export const shopee: Connector = {
  id: "shopee",
  name: "Shopee",
  capabilities: { search: true, details: true, offers: false, fees: false, bestsellers: true },

  state() {
    return configured()
      ? { state: "connected", detail: "API de Afiliados da Shopee configurada." }
      : { state: "not_configured", detail: "Defina SHOPEE_AFFILIATE_APP_ID e SHOPEE_AFFILIATE_SECRET (conta de afiliado Shopee com acesso à Open API)." };
  },

  async search(params: SearchParams, ctx: ConnectorContext): Promise<ProductResult[]> {
    const now = new Date().toISOString();
    const sortType = params.sort === "reviews" ? SORT_SOLD : SORT_TYPE[params.sort ?? "relevance"] ?? 1;
    const nodes = await call(ctx, buildQuery({ keyword: params.query, sortType, limit: Math.min(50, params.limit) }));
    return nodes.map((n) => toResult(n, now));
  },

  async getProduct(externalId: string, ctx: ConnectorContext): Promise<ProductDetail> {
    const id = externalId.slice(2);
    if (!externalId.startsWith("s-") || !/^\d{1,20}$/.test(id)) throw new ConnectorError("shopee", "not_found", "Identificador inválido");
    const nodes = await call(ctx, buildQuery({ itemId: id, limit: 1 }));
    const n = nodes[0];
    if (!n) throw new ConnectorError("shopee", "not_found", "Produto não encontrado na Shopee");
    const base = toResult(n, new Date().toISOString());
    return { ...base, description: null, features: [], images: base.imageUrl ? [base.imageUrl] : [], offers: [], offersTotal: null };
  },

  async getBestsellers(categoryId: string, ctx: ConnectorContext): Promise<RankedProduct[]> {
    const cat = SHOPEE_CATEGORIES.find((c) => c.id === categoryId) ?? SHOPEE_CATEGORIES[0]!;
    const now = new Date().toISOString();
    const nodes = await call(ctx, buildQuery({ keyword: cat.keyword, sortType: SORT_SOLD, limit: 20 }));
    return nodes.map((n, i) => ({ ...toResult(n, now), rank: i + 1 }));
  },
};
