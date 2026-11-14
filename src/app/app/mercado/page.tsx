import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import type { ProductResult } from "@/lib/connectors/types";
import { marketStats } from "@/lib/market";
import { supabaseServer } from "@/lib/supabase/server";
import { cn, formatDate, formatMoney, formatNumber, formatPercent, SOURCE_LABELS } from "@/lib/utils";
import { MarketCharts } from "./charts";

export const metadata: Metadata = { title: "Análise de mercado" };

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const supabase = await supabaseServer();
  const { data: list } = await supabase.from("searches").select("id, query, result_count, created_at").order("last_opened_at", { ascending: false }).limit(20);
  const searches = (list ?? []) as { id: string; query: string; result_count: number; created_at: string }[];
  const currentId = searches.find((x) => x.id === s)?.id ?? searches[0]?.id;
  const { data: opened } = currentId ? await supabase.rpc("open_search", { p_id: currentId }) : { data: null };
  const search = opened as { query: string; results: ProductResult[]; locked: number; created_at: string } | null;
  const items = search?.results ?? [];
  const st = marketStats(items);
  const bySource = Object.entries(items.reduce<Record<string, number[]>>((acc, p) => { if (p.price != null) (acc[p.source] ??= []).push(p.price); return acc; }, {}))
    .map(([src, ps]) => ({ name: SOURCE_LABELS[src] ?? src, value: [...ps].sort((a, b) => a - b)[Math.floor(ps.length / 2)]! }));

  return (
    <>
      <PageHeader title="Análise de mercado" description="Panorama de preços e concorrência calculado sobre os resultados reais das suas pesquisas. Sem projeções: apenas o que foi coletado." />
      {!searches.length ? (
        <EmptyState icon={BarChart3} title="Faça uma pesquisa para analisar o mercado" action={<Link href="/app/descobrir" className="btn btn-primary">Descobrir produtos</Link>}>
          A análise usa os anúncios retornados pelas fontes nas suas pesquisas.</EmptyState>
      ) : (
        <>
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
            {searches.map((x) => <Link key={x.id} href={`/app/mercado?s=${x.id}`} scroll={false} className={cn("badge !h-9 shrink-0 !px-4 !text-sm", x.id === currentId && "badge-brand")}>{x.query}</Link>)}
          </div>
          {search ? (
            <>
              <p className="mb-4 text-sm text-muted">“{search.query}” · {st.count} anúncios analisados · coletados em {formatDate(search.created_at, true)}{search.locked ? ` · +${search.locked} resultados disponíveis nos planos pagos` : ""}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Preço mediano" value={formatMoney(st.median)} hint={st.p25 != null ? `metade entre ${formatMoney(st.p25)} e ${formatMoney(st.p75)}` : undefined} tone="brand" />
                <Stat label="Menor e maior preço" value={<>{formatMoney(st.min)} <span className="text-sm font-normal text-faint">a</span> {formatMoney(st.max)}</>} />
                <Stat label="Vendedores distintos" value={formatNumber(st.sellers)} hint="concorrência observável" />
                <Stat label="Com frete grátis" value={st.freeShippingPct == null ? "Não disponível" : formatPercent(st.freeShippingPct, 0)} hint={st.avgRating != null ? `avaliação média ${st.avgRating.toFixed(1).replace(".", ",")} (${st.ratedCount} anúncios)` : "avaliações não informadas pela fonte"} />
              </div>
              <MarketCharts buckets={st.buckets} bySource={bySource} />
              <p className="mt-4 text-xs leading-relaxed text-faint">Limitações: a amostra corresponde aos anúncios retornados pela fonte para esta consulta e pode misturar variantes do produto. Vendas não são divulgadas pelos marketplaces e não são estimadas aqui.</p>
            </>
          ) : <p className="card p-5 text-sm text-muted">Não foi possível abrir esta pesquisa.</p>}
        </>
      )}
    </>
  );
}
