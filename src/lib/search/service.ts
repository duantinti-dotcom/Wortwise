import "server-only";
import { CONNECTORS, geckoBacked, isSourceId, SOURCE_IDS } from "@/lib/connectors/registry";
import { ConnectorError, USER_MESSAGES, type ApiCallLog, type ConnectorContext, type ProductResult, type SourceId } from "@/lib/connectors/types";
import { analyzeTitle, normalizeQuery } from "@/lib/normalize/title";
import { serverRpcSafe, supabaseAnon, supabaseServer } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/utils";
import { applyFilters, type SearchFilters } from "./filters";

export { applyFilters, type SearchFilters };

export interface SourceReport {
  source: SourceId;
  name: string;
  status: "ok" | "empty" | "not_configured" | "pending_approval" | "error" | "skipped";
  count: number;
  message: string | null;
}

export type SearchOutcome =
  | { status: "ok"; searchId: string | null; cached: boolean; charged: boolean; remaining: number | null; plan: string;
      results: ProductResult[]; lockedCount: number; sources: SourceReport[]; collectedAt: string }
  | { status: "empty"; remaining: number | null; plan: string; sources: SourceReport[] }
  | { status: "no_source"; remaining: number | null; plan: string; sources: SourceReport[] }
  | { status: "quota_exceeded"; plan: string }
  | { status: "invalid" };

interface Precheck { status: "cached" | "proceed" | "quota_exceeded"; search_id?: string; results?: ProductResult[]; locked?: number;
  sources?: SourceReport[]; created_at?: string; remaining: number; plan: string }

export async function flushLogs(logs: ApiCallLog[]) {
  await Promise.all(logs.slice(0, 20).map((l) => serverRpcSafe("server_log_api", {
    p_source: l.source, p_endpoint: l.endpoint, p_status: l.status, p_ok: l.ok, p_ms: l.ms, p_error: l.error,
  })));
}

async function freeVisibleResults(): Promise<number> {
  const { data } = await supabaseAnon().from("app_settings").select("value").eq("key", "trial_policy").maybeSingle();
  const n = (data?.value as { free_visible_results?: number } | null)?.free_visible_results;
  return typeof n === "number" && n > 0 ? n : 6;
}

/** Plano grátis vê apenas os primeiros resultados; o restante nem é enviado ao navegador. */
async function limitForPlan(plan: string, results: ProductResult[]) {
  if (plan !== "free") return { results, lockedCount: 0 };
  const visible = await freeVisibleResults();
  return { results: results.slice(0, visible), lockedCount: Math.max(0, results.length - visible) };
}

/**
 * Executa uma pesquisa de produtos:
 *  1. pré-checagem no banco (pesquisa já feita volta do cache sem custo; sem saldo → bloqueia);
 *  2. consulta os conectores autorizados em paralelo;
 *  3. somente se houver resultado válido, registra e consome 1 crédito de forma atômica.
 * Falhas de rede, fontes indisponíveis e pesquisas vazias nunca consomem crédito.
 */
export async function runSearch(rawQuery: string, filters: SearchFilters): Promise<SearchOutcome> {
  const query = normalizeQuery(rawQuery);
  if (query.length < 2 || query.length > 120) return { status: "invalid" };
  const sources = (filters.sources?.filter(isSourceId) ?? []).sort();
  // Economia de créditos da GeckoAPI: em "Todas as lojas" a Shopee e o TikTok Shop só entram quando escolhidos.
  const selected: SourceId[] = sources.length ? sources : SOURCE_IDS.filter((id) => !(geckoBacked(id) && (id === "shopee" || id === "tiktokshop")));
  // O fingerprint identifica a consulta à fonte; filtros e ordenação são aplicados sobre o resultado salvo.
  const fingerprint = await sha256Hex(JSON.stringify({ q: query, s: selected }));

  const supabase = await supabaseServer();
  const { data: pre, error: preErr } = await supabase.rpc("search_precheck", { p_fingerprint: fingerprint });
  if (preErr) throw new Error(preErr.message);
  const precheck = pre as Precheck;

  if (precheck.status === "cached") {
    // O banco já devolve apenas os resultados visíveis para o plano.
    return { status: "ok", searchId: precheck.search_id ?? null, cached: true, charged: false, remaining: precheck.remaining,
      plan: precheck.plan, results: applyFilters(precheck.results ?? [], filters), lockedCount: precheck.locked ?? 0, sources: precheck.sources ?? [], collectedAt: precheck.created_at ?? new Date().toISOString() };
  }
  if (precheck.status === "quota_exceeded") return { status: "quota_exceeded", plan: precheck.plan };

  const ctx: ConnectorContext = { logs: [] };
  const reports: SourceReport[] = [];
  const all: ProductResult[] = [];
  await Promise.all(selected.map(async (id) => {
    const c = CONNECTORS[id];
    const st = c.state();
    if (st.state !== "connected") {
      reports.push({ source: id, name: c.name, status: st.state === "pending_approval" ? "pending_approval" : "not_configured", count: 0, message: st.detail });
      return;
    }
    try {
      const items = await c.search({ query, limit: 40, offset: 0 }, ctx);
      all.push(...items);
      reports.push({ source: id, name: c.name, status: items.length ? "ok" : "empty", count: items.length, message: null });
      await serverRpcSafe("server_set_source_status", { p_source: id, p_status: "connected", p_detail: "Respondendo normalmente." });
    } catch (e) {
      const code = e instanceof ConnectorError ? e.code : "unavailable";
      reports.push({ source: id, name: c.name, status: "error", count: 0, message: USER_MESSAGES[code] });
      await serverRpcSafe("server_set_source_status", { p_source: id, p_status: "error", p_detail: USER_MESSAGES[code] });
    }
  }));
  reports.sort((a, b) => selected.indexOf(a.source) - selected.indexOf(b.source));
  await flushLogs(ctx.logs);

  if (!reports.some((r) => r.status === "ok" || r.status === "empty")) {
    return { status: "no_source", remaining: precheck.remaining, plan: precheck.plan, sources: reports };
  }
  if (all.length === 0) return { status: "empty", remaining: precheck.remaining, plan: precheck.plan, sources: reports };

  const { data: rec, error: recErr } = await supabase.rpc("record_search", {
    p_fingerprint: fingerprint, p_query: query, p_filters: {}, p_results: all.map(({ attributes: _a, ...rest }) => rest), p_sources: reports,
  });
  if (recErr) throw new Error(recErr.message);
  const recorded = rec as { status: "charged" | "cached" | "quota_exceeded" | "empty"; search_id?: string; remaining: number };
  if (recorded.status === "quota_exceeded") return { status: "quota_exceeded", plan: precheck.plan };

  // Observações reais de preço alimentam o histórico (melhor esforço; não bloqueia a resposta).
  await serverRpcSafe("server_upsert_market_data", { p_items: all.map(toMarketItem) });

  const limited = await limitForPlan(precheck.plan, all);
  return { status: "ok", searchId: recorded.search_id ?? null, cached: false, charged: recorded.status === "charged",
    remaining: recorded.remaining, plan: precheck.plan, results: applyFilters(limited.results, filters),
    lockedCount: limited.lockedCount, sources: reports, collectedAt: new Date().toISOString() };
}

export function toMarketItem(p: ProductResult) {
  return {
    source: p.source, external_id: p.externalId, title: p.title, normalized_title: analyzeTitle(p.title).normalized,
    brand: p.brand, model: p.model, gtin: p.gtin, category_id: p.categoryId, image_url: p.imageUrl, permalink: p.permalink,
    price: p.price == null ? "" : String(p.price), currency: p.currency ?? "BRL",
    metric_type: p.kind === "catalog_product" ? "buy_box" : "listing",
    offers_count: p.offersCount == null ? "" : String(p.offersCount), available: p.available == null ? "" : String(p.available),
    observed_at: p.collectedAt, provenance: { collected_by: "worthwise", method: p.provider ?? "official_api", kind: p.kind },
  };
}
