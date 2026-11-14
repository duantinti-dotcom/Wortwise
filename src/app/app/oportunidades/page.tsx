import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import type { ProductResult } from "@/lib/connectors/types";
import { findOpportunities } from "@/lib/market";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDate, formatMoney, SOURCE_LABELS } from "@/lib/utils";

export const metadata: Metadata = { title: "Oportunidades" };

export default async function Page() {
  const supabase = await supabaseServer();
  const { data: list } = await supabase.from("searches").select("id, query, created_at").order("last_opened_at", { ascending: false }).limit(6);
  const searches = (list ?? []) as { id: string; query: string; created_at: string }[];
  const opened = await Promise.all(searches.map(async (s) => {
    const { data } = await supabase.rpc("open_search", { p_id: s.id });
    return { ...s, results: ((data as { results?: ProductResult[] } | null)?.results ?? []) };
  }));
  const groups = opened.map((s) => ({ ...s, opportunities: findOpportunities(s.results) })).filter((s) => s.opportunities.length);

  return (
    <>
      <PageHeader title="Oportunidades" description="Worthwise Opportunities: anúncios com preço bem abaixo da mediana de anúncios comparáveis (mesmo produto e mesma variante) nas suas pesquisas. Cada item mostra as evidências e os riscos." />
      {!searches.length ? (
        <EmptyState icon={TrendingUp} title="Ainda não há dados para identificar oportunidades" action={<Link href="/app/descobrir" className="btn btn-primary">Fazer uma pesquisa</Link>}>
          As oportunidades são calculadas sobre resultados reais das suas pesquisas — nada é sugerido sem evidência.</EmptyState>
      ) : !groups.length ? (
        <EmptyState icon={TrendingUp} title="Nenhuma oportunidade identificada nas suas pesquisas recentes">
          Para apontar uma oportunidade exigimos pelo menos 3 anúncios comparáveis e um preço 12% ou mais abaixo da mediana. Quando os dados não sustentam a conclusão, preferimos não mostrar nada.</EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.id}>
              <h2 className="mb-3 text-sm font-semibold">“{g.query}” <span className="font-normal text-faint">· coletado em {formatDate(g.created_at, true)}</span></h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {g.opportunities.map((o) => (
                  <article key={o.product.externalId} className="card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0"><span className="badge">{SOURCE_LABELS[o.product.source]}</span>
                        <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{o.product.title}</h3></div>
                      <div className="shrink-0 text-right"><div className="tabular text-xl font-semibold tracking-tight">{formatMoney(o.product.price)}</div>
                        <div className="badge badge-pos mt-1">−{o.discountPct.toFixed(0)}% vs. mediana</div></div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div><div className="text-xs font-medium text-muted">Evidências</div><ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">{o.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>
                      <div><div className="text-xs font-medium text-muted">Riscos</div><ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">{o.risks.map((e) => <li key={e}>{e}</li>)}</ul></div>
                    </div>
                    <Link href={`/app/produto/${o.product.source}/${o.product.externalId}`} className="btn btn-secondary btn-sm mt-4">Analisar produto</Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs leading-relaxed text-faint">“Oportunidade” aqui significa diferença de preço observada entre anúncios comparáveis. Não é estimativa de vendas nem garantia de lucro.</p>
        </div>
      )}
    </>
  );
}
