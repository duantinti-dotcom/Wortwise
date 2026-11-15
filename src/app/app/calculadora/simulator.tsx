"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ProfitCalculator } from "@/components/profit-calculator";
import { ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useUpgrade } from "@/components/app/upgrade";
import { dbMessage, useLoad } from "@/lib/hooks";
import { calculateProfit, type ProfitInputs, type ProfitResult } from "@/lib/profit/calc";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate, formatMoney, formatPercent } from "@/lib/utils";

interface Sim { id: string; name: string; inputs: ProfitInputs; results: ProfitResult; created_at: string }

export function Simulator({ preset }: { preset?: string }) {
  const toast = useToast();
  const { openUpgrade } = useUpgrade();
  const [loaded, setLoaded] = useState<Sim | null>(null);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const sims = useLoad<Sim[]>(async () => {
    const { data, error } = await supabaseBrowser().from("simulations").select("id, name, inputs, results, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("Não foi possível carregar as simulações.");
    return (data ?? []) as Sim[];
  });

  async function save(inputs: ProfitInputs) {
    const name = window.prompt("Nome da simulação", loaded?.name ?? "Minha simulação")?.trim();
    if (!name) return;
    setSaving(true);
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("simulations").insert({ user_id: auth.user?.id, name: name.slice(0, 120), inputs, results: calculateProfit(inputs) });
    setSaving(false);
    if (error?.message.includes("quota_exceeded")) { openUpgrade("Você atingiu o limite de simulações salvas do seu plano"); return; }
    toast(error ? dbMessage(error) : "Simulação salva", error ? "error" : "success");
    if (!error) sims.reload();
  }
  async function remove(id: string) {
    const { error } = await supabaseBrowser().from("simulations").delete().eq("id", id);
    if (error) { toast("Não foi possível excluir.", "error"); return; }
    setPicked((p) => p.filter((x) => x !== id));
    sims.reload();
    toast("Simulação excluída");
  }
  const compare = (sims.data ?? []).filter((s) => picked.includes(s.id));

  return (
    <>
      <PageHeader title="Calculadora de lucro" description="Descubra quanto sobra no seu bolso em cada venda, depois de pagar produto, taxas, frete e impostos." help={{ id: "calculadora", steps: ["Responda: quanto paga, quantas unidades e por quanto vai vender", "Escolha onde vai vender — as taxas do marketplace entram sozinhas", "Verde é lucro, vermelho é prejuízo. Arraste o preço para testar"] }} />
      <ProfitCalculator key={loaded?.id ?? "new"} initial={loaded?.inputs} initialPreset={loaded ? undefined : preset} onSave={save} saving={saving} />

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between"><h2 className="text-lg font-semibold tracking-tight">Simulações salvas</h2>
          <span className="text-xs text-faint">Selecione duas ou mais para comparar</span></div>
        {sims.loading ? <Skeleton className="h-28 !rounded-2xl" /> : sims.error ? <ErrorNote onRetry={sims.reload}>{sims.error}</ErrorNote>
          : !sims.data?.length ? <p className="card p-5 text-sm text-muted">Nenhuma simulação salva ainda. Preencha a calculadora e clique em “Salvar simulação”.</p> : (
          <div className="card divide-y divide-line">
            {sims.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <input type="checkbox" aria-label={`Comparar ${s.name}`} checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} className="size-4 accent-[#3B82F6]" />
                <button onClick={() => { setLoaded(s); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="min-w-0 flex-1 truncate text-left font-medium hover:text-brand-hi">{s.name}</button>
                <span className="text-xs text-faint">{formatDate(s.created_at)}</span>
                <span className={cn("tabular w-28 text-right font-medium", s.results.profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(s.results.profit)}</span>
                <span className="tabular w-16 text-right text-muted">{formatPercent(s.results.marginPct)}</span>
                <button onClick={() => remove(s.id)} className="btn btn-ghost btn-sm !px-2" aria-label={`Excluir ${s.name}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
        {compare.length >= 2 ? (
          <div className="card mt-5 overflow-x-auto p-1">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-faint"><th className="px-4 py-3 font-normal">Indicador</th>{compare.map((s) => <th key={s.id} className="px-4 py-3 font-medium text-fg">{s.name}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {([["Preço de venda", (s: Sim) => formatMoney(s.inputs.salePrice)], ["Custo por unidade (com frete)", (s: Sim) => formatMoney(s.results.landedUnitCost)], ["Receita bruta", (s: Sim) => formatMoney(s.results.grossRevenue)],
                  ["Custo total", (s: Sim) => formatMoney(s.results.totalCost)], ["Lucro do lote", (s: Sim) => formatMoney(s.results.profit)], ["Lucro por unidade", (s: Sim) => formatMoney(s.results.profitPerUnit)],
                  ["Margem", (s: Sim) => formatPercent(s.results.marginPct)], ["Preço mínimo", (s: Sim) => formatMoney(s.results.minPrice)]] as [string, (s: Sim) => string][]).map(([label, fn]) => (
                  <tr key={label}><td className="px-4 py-2.5 text-muted">{label}</td>{compare.map((s) => <td key={s.id} className="tabular px-4 py-2.5">{fn(s)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
