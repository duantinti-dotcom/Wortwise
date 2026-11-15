import { loadArchivedHistory } from "@/lib/maintenance";
import "server-only";
import { CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorContext, FeeQuote, ProductDetail, SourceId } from "@/lib/connectors/types";
import { flushLogs, toMarketItem } from "@/lib/search/service";
import { serverRpcSafe, supabaseServer } from "@/lib/supabase/server";

export interface PricePoint { date: string; price: number; metric: string; offersCount: number | null }

export interface ProductAnalysis {
  product: ProductDetail;
  history: PricePoint[];
  bestsellerRank: number | null;
  fees: FeeQuote[];
}

/** Carrega um produto da fonte, registra a observação real de preço e devolve o histórico armazenado. */
export async function loadProduct(source: SourceId, externalId: string): Promise<ProductAnalysis> {
  const connector = CONNECTORS[source];
  const ctx: ConnectorContext = { logs: [] };
  try {
    const product = await connector.getProduct(externalId, ctx);
    const [bestsellerRank, fees] = await Promise.all([
      product.categoryId && connector.getBestsellerRank ? connector.getBestsellerRank(product.categoryId, externalId, ctx) : null,
      product.price != null && connector.getFees ? connector.getFees(product.price, product.categoryId, ctx).catch(() => []) : [],
    ]);
    await serverRpcSafe("server_upsert_market_data", { p_items: [{ ...toMarketItem(product), offers_count: product.offersTotal == null ? "" : String(product.offersTotal) }] });
    return { product, bestsellerRank, fees, history: await loadHistory(source, externalId) };
  } finally {
    await flushLogs(ctx.logs);
  }
}

export async function loadHistory(source: string, externalId: string): Promise<PricePoint[]> {
  const supabase = await supabaseServer();
  const { data: row } = await supabase.from("products").select("id").eq("source", source).eq("external_id", externalId).maybeSingle();
  if (!row) return [];
  const [{ data }, archived] = await Promise.all([
    supabase.from("price_observations").select("price, collected_at, metric_type, offers_count")
      .eq("product_id", row.id).order("collected_at", { ascending: true }).limit(1000),
    loadArchivedHistory(row.id as string),
  ]);
  // Observações arquivadas no R2 (mais antigas) + as que estão no banco, em ordem de data.
  const all = [...archived.map((o) => ({ price: o.price, collected_at: o.collected_at, metric_type: o.metric_type, offers_count: o.offers_count })), ...(data ?? [])]
    .sort((a, b) => String(a.collected_at).localeCompare(String(b.collected_at)));
  return all.map((o) => ({ date: o.collected_at as string, price: Number(o.price), metric: o.metric_type as string,
    offersCount: (o.offers_count as number | null) ?? null }));
}

/** Histórico de preço (últimos 90 dias) de vários produtos de uma vez, para os mini gráficos do ranking. */
export async function loadHistories(items: { source: string; externalId: string }[]): Promise<Record<string, { date: string; price: number }[]>> {
  if (!items.length) return {};
  const supabase = await supabaseServer();
  const { data: rows } = await supabase.from("products").select("id, source, external_id").in("external_id", items.map((i) => i.externalId));
  const byId = new Map((rows ?? []).map((r) => [r.id as string, `${r.source}:${r.external_id}`]));
  if (!byId.size) return {};
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: obs } = await supabase.from("price_observations").select("product_id, price, collected_at")
    .in("product_id", [...byId.keys()]).gte("collected_at", since).order("collected_at", { ascending: true }).limit(3000);
  const out: Record<string, { date: string; price: number }[]> = {};
  for (const o of obs ?? []) {
    const k = byId.get(o.product_id as string);
    if (k) (out[k] ??= []).push({ date: o.collected_at as string, price: Number(o.price) });
  }
  return out;
}
