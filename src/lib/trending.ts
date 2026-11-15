import "server-only";
import { AMAZON_CATEGORIES, getAmazonBestsellers } from "@/lib/connectors/amazon-bestsellers";
import { mercadoLivre } from "@/lib/connectors/mercadolivre";
import { shopee, SHOPEE_CATEGORIES } from "@/lib/connectors/shopee";
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

/** Categorias principais do Mercado Livre Brasil (usadas se a lista da API não puder ser carregada). */
export const FALLBACK_CATEGORIES: Category[] = [
  { id: "MLB1000", name: "Eletrônicos, Áudio e Vídeo" }, { id: "MLB1051", name: "Celulares e Telefones" },
  { id: "MLB1648", name: "Informática" }, { id: "MLB1574", name: "Casa, Móveis e Decoração" },
  { id: "MLB5726", name: "Eletrodomésticos" }, { id: "MLB1246", name: "Beleza e Cuidado Pessoal" },
  { id: "MLB1276", name: "Esportes e Fitness" }, { id: "MLB1430", name: "Calçados, Roupas e Bolsas" },
  { id: "MLB1132", name: "Brinquedos e Hobbies" }, { id: "MLB1384", name: "Bebês" },
  { id: "MLB1071", name: "Animais" }, { id: "MLB263532", name: "Ferramentas" },
  { id: "MLB1144", name: "Games" }, { id: "MLB5672", name: "Acessórios para Veículos" },
  { id: "MLB3937", name: "Joias e Relógios" }, { id: "MLB264586", name: "Saúde" },
];
export const DEFAULT_CATEGORY = "MLB1000";

/** Quantos produtos mostrar por ranking. */
export const TOP = 10;

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

export function trendingConfigured() {
  return mercadoLivre.state().state === "connected";
}

export async function loadTrending(categoryId: string | null | undefined): Promise<TrendingData> {
  const ctx: ConnectorContext = { logs: [] };
  const fallbackCat = FALLBACK_CATEGORIES.find((c) => c.id === categoryId) ?? FALLBACK_CATEGORIES[0]!;
  const empty = (state: TrendingState): TrendingData => ({ state, categories: FALLBACK_CATEGORIES, category: fallbackCat, products: [], trends: [], updatedAt: null });
  if (!trendingConfigured()) return empty({ ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured });

  const categories = await cached("cats", () => mercadoLivre.getCategories!(ctx)).then((r) => r.value).catch(() => FALLBACK_CATEGORIES);
  const list = categories.length ? categories : FALLBACK_CATEGORIES;
  const category = list.find((c) => c.id === categoryId) ?? list.find((c) => c.id === DEFAULT_CATEGORY) ?? list[0]!;
  try {
    const [products, trends] = await Promise.all([
      cached(`best:${category.id}`, () => mercadoLivre.getBestsellers!(category.id, ctx).then(record)),
      cached(`trends:${category.id}`, () => mercadoLivre.getTrends!(category.id, ctx)).catch(() => ({ value: [] as TrendKeyword[], at: Date.now() })),
    ]);
    return { state: { ok: true }, categories: list, category, products: products.value.slice(0, TOP), trends: trends.value, updatedAt: new Date(products.at).toISOString() };
  } catch (e) {
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
  if (store === "tiktokshop") {
    return { state: { ok: false, reason: "not_configured", message: USER_MESSAGES.pending_approval },
      categories: [], category: { id: "tiktokshop", name: "TikTok Shop" }, products: [], trends: [], updatedAt: null, store, storeState: "not_configured" };
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
  const categories = SHOPEE_CATEGORIES.map(({ id, name }) => ({ id, name }));
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;
  const base = { categories, category, trends: [] as TrendKeyword[], store, products: [] as RankedProduct[], updatedAt: null };
  if (shopee.state().state !== "connected") return { ...base, state: { ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured }, storeState: "not_configured" };
  const ctx: ConnectorContext = { logs: [] };
  try {
    const r = await cached(`shopee:${category.id}`, () => shopee.getBestsellers!(category.id, ctx).then(record));
    return { ...base, state: { ok: true }, products: r.value.slice(0, TOP), updatedAt: new Date(r.at).toISOString(), storeState: "connected" };
  } catch (e) {
    return { ...base, state: failure(e), storeState: "connected" };
  } finally {
    if (ctx.logs.length) await flushLogs(ctx.logs).catch(() => {});
  }
}

/** "Geral": os destaques de todas as lojas com dados oficiais, num ranking só. */
export async function loadOverall(): Promise<{ products: RankedProduct[]; stores: string[]; updatedAt: string | null }> {
  const parts = await Promise.all([
    trendingConfigured() ? loadTrending(DEFAULT_CATEGORY) : null,
    shopee.state().state === "connected" ? loadStoreTrending("shopee", SHOPEE_CATEGORIES[0]!.id) : null,
    loadStoreTrending("amazon", "electronics"),
  ]);
  const lists = parts.filter((p): p is TrendingData => Boolean(p?.state.ok && p.products.length));
  // Intercala por posição (1º de cada loja, depois 2º...); empate: quem informa mais vendas vem antes.
  const merged: RankedProduct[] = [];
  for (let i = 0; i < TOP; i++) {
    const round = lists.map((l) => l.products[i]).filter((p): p is RankedProduct => Boolean(p))
      .sort((a, b) => (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0));
    merged.push(...round);
  }
  const top = merged.slice(0, TOP).map((p, i) => ({ ...p, rank: i + 1 }));
  return { products: top, stores: [...new Set(lists.flatMap((l) => l.products.map((p) => p.source)))], updatedAt: lists[0]?.updatedAt ?? null };
}
