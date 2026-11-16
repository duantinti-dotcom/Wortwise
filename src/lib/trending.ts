import "server-only";
import { AMAZON_CATEGORIES, getAmazonBestsellers } from "@/lib/connectors/amazon-bestsellers";
import { FALLBACK_ML_CATEGORIES } from "@/lib/connectors/ml-categories";
import { CONNECTORS } from "@/lib/connectors/registry";
import { SHOPEE_CATEGORIES } from "@/lib/connectors/shopee";
import { TIKTOK_CATEGORIES } from "@/lib/connectors/gecko";
import { ConnectorError, USER_MESSAGES, type Category, type ConnectorContext, type RankedProduct, type TrendKeyword } from "@/lib/connectors/types";
import { flushLogs, toMarketItem } from "@/lib/search/service";
import { serverRpcSafe } from "@/lib/supabase/server";

/**
 * Vitrine "Em alta": ranking oficial de mais vendidos por categoria e buscas em alta do Mercado Livre.
 * Os dados ficam 30 minutos em memória por instância para respeitar os limites da API; nenhuma
 * posição, preço ou foto é inventada — o que a fonte não devolve simplesmente não aparece.
 */
const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<{ value: T; at: number }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { value: hit.value as T, at: hit.at };
  const value = await load();
  const at = Date.now();
  cache.set(key, { at, value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return { value, at };
}

export const FALLBACK_CATEGORIES = FALLBACK_ML_CATEGORIES;
export const DEFAULT_CATEGORY = "MLB1000";
const trendingSource = () => (CONNECTORS.mercadolivre.state().detail.includes("Gecko") ? "gecko" : "api");

/** Quantos produtos mostrar por ranking. */
export const TOP = 20;
/** Quantos produtos no ranking "Geral" de todas as lojas. */
export const TOP_OVERALL = 30;

/** Guarda o preço real de cada produto do ranking: é assim que o gráfico de preço vai se formando. */
async function record<T extends RankedProduct[]>(products: T): Promise<T> {
  const items = products.filter((p) => p.price != null).map(toMarketItem);
  if (items.length) await serverRpcSafe("server_upsert_market_data", { p_items: items });
  return products;
}

export type TrendingState = { ok: true } | { ok: false; reason: "not_configured" | "error"; message: string };

export interface TrendingData {
  state: TrendingState;
  categories: Category[];
  category: Category;
  products: RankedProduct[];
  trends: TrendKeyword[];
  updatedAt: string | null;
}

function failure(e: unknown): TrendingState {
  if (e instanceof ConnectorError) return e.code === "not_configured"
    ? { ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured }
    : { ok: false, reason: "error", message: USER_MESSAGES[e.code] };
  return { ok: false, reason: "error", message: USER_MESSAGES.unavailable };
}

const mercadoLivre = () => CONNECTORS.mercadolivre;
const connected = (s: "mercadolivre" | "shopee" | "tiktokshop") => CONNECTORS[s].state().state === "connected";

export function trendingConfigured() {
  return connected("mercadolivre");
}

export async function loadTrending(categoryId: string | null | undefined): Promise<TrendingData> {
  const ctx: ConnectorContext = { logs: [] };
  const fallbackCat = FALLBACK_CATEGORIES.find((c) => c.id === categoryId) ?? FALLBACK_CATEGORIES[0]!;
  const empty = (state: TrendingState): TrendingData => ({ state, categories: FALLBACK_CATEGORIES, category: fallbackCat, products: [], trends: [], updatedAt: null });
  if (!trendingConfigured()) return empty({ ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured });

  const categories = await (trendingSource() === "gecko" ? mercadoLivre().getCategories!(ctx) : cached("cats", () => mercadoLivre().getCategories!(ctx)).then((r) => r.value)).catch(() => FALLBACK_CATEGORIES);
  const list = categories.length ? categories : FALLBACK_CATEGORIES;
  const category = list.find((c) => c.id === categoryId) ?? (list[0]?.id === "geral" ? list[0] : list.find((c) => c.id === DEFAULT_CATEGORY)) ?? list[0]!;
  try {
    const [products, trends] = await Promise.all([
      cached(`best:${trendingSource()}:${category.id}`, () => mercadoLivre().getBestsellers!(category.id, ctx).then(record)),
      cached(`trends:${category.id}`, () => mercadoLivre().getTrends?.(category.id, ctx) ?? Promise.resolve([] as TrendKeyword[])).catch(() => ({ value: [] as TrendKeyword[], at: Date.now() })),
    ]);
    return { state: { ok: true }, categories: list, category, products: products.value.slice(0, TOP), trends: trends.value, updatedAt: new Date(products.at).toISOString() };
  } catch (e) {
    // Tópico indisponível agora (sem dados guardados): mostra o "Geral" em vez de travar.
    if (category.id !== "geral" && list[0]?.id === "geral") return loadTrending("geral");
    return { ...empty(failure(e)), categories: list, category };
  } finally {
    if (ctx.logs.length) await flushLogs(ctx.logs).catch(() => {});
  }
}

/* ───────────── Outras lojas ───────────── */

export const STORES = ["mercadolivre", "shopee", "amazon", "tiktokshop"] as const;
export type StoreId = (typeof STORES)[number];
export const isStore = (v: string | undefined | null): v is StoreId => !!v && (STORES as readonly string[]).includes(v);

export type StoreTrending = TrendingData & { store: StoreId; storeState: "connected" | "not_configured" | "unsupported" };

/** Ranking de mais vendidos por loja. Lojas sem ranking oficial na API mostram o aviso, nunca dados inventados. */
export async function loadStoreTrending(store: StoreId, categoryId: string | null | undefined): Promise<StoreTrending> {
  if (store === "mercadolivre") {
    const d = await loadTrending(categoryId);
    return { ...d, store, storeState: trendingConfigured() ? "connected" : "not_configured" };
  }
  if (store === "amazon") {
    const categories = AMAZON_CATEGORIES.map(({ id, name }) => ({ id, name }));
    const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;
    const base = { categories, category, trends: [] as TrendKeyword[], store, products: [] as RankedProduct[], updatedAt: null };
    try {
      const r = await getAmazonBestsellers(category.id);
      if (r.fresh) await record(r.products);
      return { ...base, state: { ok: true }, products: r.products.slice(0, TOP), updatedAt: r.at, storeState: "connected" };
    } catch (e) {
      return { ...base, state: { ok: false, reason: "error", message: e instanceof Error ? e.message : USER_MESSAGES.unavailable }, storeState: "connected" };
    }
  }
  // Shopee e TikTok Shop: conector configurado (API oficial ou GeckoAPI).
  const c = CONNECTORS[store];
  const list = store === "shopee" ? SHOPEE_CATEGORIES : TIKTOK_CATEGORIES;
  const categories = (await c.getCategories?.({ logs: [] }).catch(() => null)) ?? list.map(({ id, name }) => ({ id, name }));
  const category = categories.find((x) => x.id === categoryId) ?? categories[0]!;
  const base = { categories, category, trends: [] as TrendKeyword[], store, products: [] as RankedProduct[], updatedAt: null };
  if (!connected(store) || !c.getBestsellers) return { ...base, state: { ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured }, storeState: "not_configured" };
  const ctx: ConnectorContext = { logs: [] };
  try {
    const r = await cached(`${store}:${c.state().detail.slice(0, 12)}:${category.id}`, () => c.getBestsellers!(category.id, ctx).then(record));
    return { ...base, state: { ok: true }, products: r.value.slice(0, TOP), updatedAt: new Date(r.at).toISOString(), storeState: "connected" };
  } catch (e) {
    if (category.id !== "geral" && categories[0]?.id === "geral") return loadStoreTrending(store, "geral");
    return { ...base, state: failure(e), storeState: "connected" };
  } finally {
    if (ctx.logs.length) await flushLogs(ctx.logs).catch(() => {});
  }
}

/** "Geral": os destaques de todas as lojas com dados oficiais, num ranking só. */
export async function loadOverall(): Promise<{ products: RankedProduct[]; stores: string[]; updatedAt: string | null }> {
  const parts = await Promise.all([
    trendingConfigured() ? loadTrending(trendingSource() === "gecko" ? "geral" : DEFAULT_CATEGORY) : null,
    connected("shopee") ? loadStoreTrending("shopee", "geral") : null,
    connected("tiktokshop") ? loadStoreTrending("tiktokshop", "geral") : null,
    loadStoreTrending("amazon", "electronics"),
  ]);
  const lists = parts.filter((p): p is TrendingData => Boolean(p?.state.ok && p.products.length));
  // Intercala por posição (1º de cada loja, depois 2º...); empate: quem informa mais vendas vem antes.
  const merged: RankedProduct[] = [];
  for (let i = 0; i < TOP_OVERALL; i++) {
    const round = lists.map((l) => l.products[i]).filter((p): p is RankedProduct => Boolean(p))
      .sort((a, b) => (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0));
    merged.push(...round);
  }
  const top = merged.slice(0, TOP_OVERALL).map((p, i) => ({ ...p, rank: i + 1 }));
  return { products: top, stores: [...new Set(lists.flatMap((l) => l.products.map((p) => p.source)))], updatedAt: lists[0]?.updatedAt ?? null };
}
