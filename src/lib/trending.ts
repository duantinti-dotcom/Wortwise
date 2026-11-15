import "server-only";
import { amazon } from "@/lib/connectors/amazon";
import { mercadoLivre } from "@/lib/connectors/mercadolivre";
import { shopee, SHOPEE_CATEGORIES } from "@/lib/connectors/shopee";
import { ConnectorError, USER_MESSAGES, type Category, type ConnectorContext, type RankedProduct, type TrendKeyword } from "@/lib/connectors/types";
import { flushLogs } from "@/lib/search/service";

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
      cached(`best:${category.id}`, () => mercadoLivre.getBestsellers!(category.id, ctx)),
      cached(`trends:${category.id}`, () => mercadoLivre.getTrends!(category.id, ctx)).catch(() => ({ value: [] as TrendKeyword[], at: Date.now() })),
    ]);
    return { state: { ok: true }, categories: list, category, products: products.value, trends: trends.value, updatedAt: new Date(products.at).toISOString() };
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
    const cat = { id: "amazon", name: "Amazon" };
    return { state: { ok: false, reason: "error", message: "A API da Amazon não oferece um ranking de mais vendidos. Use Pesquisar para ver produtos da Amazon." },
      categories: [], category: cat, products: [], trends: [], updatedAt: null, store, storeState: amazon.state().state === "connected" ? "unsupported" : "not_configured" };
  }
  const categories = SHOPEE_CATEGORIES.map(({ id, name }) => ({ id, name }));
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;
  const base = { categories, category, trends: [] as TrendKeyword[], store, products: [] as RankedProduct[], updatedAt: null };
  if (shopee.state().state !== "connected") return { ...base, state: { ok: false, reason: "not_configured", message: USER_MESSAGES.not_configured }, storeState: "not_configured" };
  const ctx: ConnectorContext = { logs: [] };
  try {
    const r = await cached(`shopee:${category.id}`, () => shopee.getBestsellers!(category.id, ctx));
    return { ...base, state: { ok: true }, products: r.value, updatedAt: new Date(r.at).toISOString(), storeState: "connected" };
  } catch (e) {
    return { ...base, state: failure(e), storeState: "connected" };
  } finally {
    if (ctx.logs.length) await flushLogs(ctx.logs).catch(() => {});
  }
}
