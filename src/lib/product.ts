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
  const { data } = await supabase.from("price_observations").select("price, collected_at, metric_type, offers_count")
    .eq("product_id", row.id).order("collected_at", { ascending: true }).limit(1000);
  return (data ?? []).map((o) => ({ date: o.collected_at as string, price: Number(o.price), metric: o.metric_type as string,
    offersCount: (o.offers_count as number | null) ?? null }));
}
