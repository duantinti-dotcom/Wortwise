"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

const CompareBars = dynamic(() => import("@/components/charts").then((m) => m.CompareBars), { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> });
const CountBars = dynamic(() => import("@/components/charts").then((m) => m.CountBars), { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> });

export function MarketCharts({ buckets, bySource }: { buckets: { name: string; value: number }[]; bySource: { name: string; value: number }[] }) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="card p-5"><h2 className="text-sm font-semibold">Distribuição de preços</h2><p className="mt-1 text-xs text-muted">Quantidade de anúncios por faixa de preço</p>
        <div className="mt-4">{buckets.length ? <CountBars data={buckets} /> : <p className="rounded-lg bg-tint/3 px-3.5 py-3 text-sm text-muted">São necessários ao menos 4 anúncios com preço.</p>}</div></div>
      <div className="card p-5"><h2 className="text-sm font-semibold">Preço mediano por marketplace</h2><p className="mt-1 text-xs text-muted">Somente fontes que responderam a esta pesquisa</p>
        <div className="mt-4">{bySource.length ? <CompareBars data={bySource.map((b, i) => ({ ...b, highlight: i === 0 }))} /> : <p className="rounded-lg bg-tint/3 px-3.5 py-3 text-sm text-muted">Sem preços para comparar.</p>}</div></div>
    </div>
  );
}
