"use client";
import { FileText, Plus, Scale, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { VerificationBadge } from "@/components/app/supplier-status";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { dbMessage, useLoad } from "@/lib/hooks";
import { landedCost } from "@/lib/profit/calc";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney } from "@/lib/utils";

const CompareBars = dynamic(() => import("@/components/charts").then((m) => m.CompareBars), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });

interface Quote { id: string; comparison_name: string; supplier_id: string | null; supplier_name: string; product_title: string; unit_price: number; quantity: number; min_order: number | null;
  freight: number | null; taxes: number | null; other_costs: number | null; lead_time_days: number | null; offer_url: string | null; cost_origins: Record<string, string>; suppliers: { verification_status: string } | null }
interface Sup { id: string; name: string; verification_status: string }

const ORIGIN: Record<string, string> = { user: "informado por você", estimated: "estimado", source: "informado pela fonte" };
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")) || 0);

export function Compare() {
  const params = useSearchParams();
  const toast = useToast();
  const presetProduct = params.get("produto") ?? "";
  const [selected, setSelected] = useState<string | null>(params.get("c"));
  const [open, setOpen] = useState(Boolean(presetProduct));
  const empty = { comparison: presetProduct.slice(0, 60), supplier_id: "", supplier_name: "", product_title: presetProduct, unit_price: "", quantity: "", min_order: "", freight: "", taxes: "", other: "", lead: "", url: "", freightOrigin: "user", taxesOrigin: "estimated" };
  const [form, setForm] = useState(empty);
  const d = useLoad(async () => {
    const supabase = supabaseBrowser();
    const [q, s] = await Promise.all([
      supabase.from("supplier_quotes").select("*, suppliers(verification_status)").order("created_at", { ascending: false }).limit(300),
      supabase.from("suppliers").select("id, name, verification_status").order("name").limit(300),
    ]);
    if (q.error || s.error) throw new Error("Não foi possível carregar as comparações.");
    return { quotes: (q.data ?? []) as Quote[], suppliers: (s.data ?? []) as Sup[] };
  });
  const names = useMemo(() => [...new Set((d.data?.quotes ?? []).map((q) => q.comparison_name))], [d.data]);
  const current = selected && names.includes(selected) ? selected : names[0] ?? null;
  const rows = useMemo(() => (d.data?.quotes ?? []).filter((q) => q.comparison_name === current)
    .map((q) => ({ q, cost: landedCost({ unitPrice: Number(q.unit_price), quantity: q.quantity, freight: q.freight, taxes: q.taxes, otherCosts: q.other_costs }) }))
    .sort((a, b) => a.cost.perUnit - b.cost.perUnit), [d.data, current]);
  const complete = rows.filter((r) => r.cost.missing.length === 0);
  const best = complete[0]?.q.id ?? null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const sup = d.data?.suppliers.find((s) => s.id === form.supplier_id);
    const name = sup?.name ?? form.supplier_name.trim();
    const price = numOrNull(form.unit_price);
    const qty = Math.floor(numOrNull(form.quantity) ?? 0);
    if (!name || !price || qty < 1) { toast("Informe fornecedor, preço unitário e quantidade.", "error"); return; }
    if (form.url && !/^https?:\/\//i.test(form.url)) { toast("O link deve começar com http:// ou https://", "error"); return; }
    const { error } = await supabase.from("supplier_quotes").insert({
      user_id: auth.user?.id, comparison_name: form.comparison.trim() || "Comparação", supplier_id: sup?.id ?? null, supplier_name: name.slice(0, 160),
      product_title: (form.product_title.trim() || form.comparison.trim() || "Produto").slice(0, 300), product_source: params.get("fonte"), product_external_id: params.get("id"),
      unit_price: price, quantity: qty, min_order: numOrNull(form.min_order), freight: numOrNull(form.freight), taxes: numOrNull(form.taxes), other_costs: numOrNull(form.other),
      lead_time_days: numOrNull(form.lead), offer_url: form.url.trim() || null, cost_origins: { unit_price: "user", freight: form.freightOrigin, taxes: form.taxesOrigin },
    });
    if (error) { toast(dbMessage(error), "error"); return; }
    setSelected(form.comparison.trim() || "Comparação");
    setForm({ ...empty, comparison: form.comparison, product_title: form.product_title });
    setOpen(false);
    toast("Cotação adicionada");
    d.reload();
  }
  async function remove(id: string) {
    const { error } = await supabaseBrowser().from("supplier_quotes").delete().eq("id", id);
    if (!error) d.reload(); else toast("Não foi possível excluir.", "error");
  }
  async function saveReport() {
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({ user_id: auth.user?.id, title: `Comparação: ${current}`, kind: "supplier_comparison",
      content: { comparison: current, rows: rows.map((r) => ({ supplier: r.q.supplier_name, product: r.q.product_title, unitPrice: r.q.unit_price, quantity: r.q.quantity, freight: r.q.freight, taxes: r.q.taxes, other: r.q.other_costs,
        leadTimeDays: r.q.lead_time_days, perUnit: r.cost.perUnit, total: r.cost.total, missing: r.cost.missing, origins: r.q.cost_origins, verification: r.q.suppliers?.verification_status ?? "unverified" })) } });
    toast(error ? dbMessage(error) : "Relatório salvo em Relatórios", error ? "error" : "success");
  }
  const set = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <>
      <PageHeader title="Comparar fornecedores" description="Worthwise Compare: custo final por unidade = (preço × quantidade + frete + impostos + outras despesas) ÷ quantidade. Cada custo indica se foi informado ou estimado."
        action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Adicionar cotação</button>} />
      {d.loading ? <Skeleton className="h-64 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : !names.length ? (
        <EmptyState icon={Scale} title="Nenhuma cotação cadastrada" action={<button className="btn btn-primary" onClick={() => setOpen(true)}>Adicionar a primeira cotação</button>}>
          Cadastre duas ou mais cotações do mesmo produto para ver quem oferece o menor custo total — não apenas o menor preço anunciado.</EmptyState>
      ) : (
        <>
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{names.map((n) => <button key={n} onClick={() => setSelected(n)} className={cn("badge !h-9 shrink-0 cursor-pointer !px-4 !text-sm", n === current && "badge-brand")}>{n}</button>)}</div>
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-faint">
                  {["Fornecedor", "Preço un.", "Qtd.", "Frete", "Impostos", "Prazo", "Custo final / un.", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ q, cost }) => (
                    <tr key={q.id} className={cn(q.id === best && "bg-brand/5")}>
                      <td className="px-4 py-3"><div className="font-medium">{q.supplier_name}</div><div className="mt-1"><VerificationBadge status={q.suppliers?.verification_status ?? "unverified"} /></div></td>
                      <td className="tabular px-4 py-3">{formatMoney(Number(q.unit_price))}</td>
                      <td className="tabular px-4 py-3">{q.quantity}{q.min_order ? <div className="text-[11px] text-faint">mín. {q.min_order}</div> : null}</td>
                      <td className="tabular px-4 py-3">{q.freight == null ? <span className="text-faint">Não informado</span> : <>{formatMoney(Number(q.freight))}<div className="text-[11px] text-faint">{ORIGIN[q.cost_origins.freight ?? "user"]}</div></>}</td>
                      <td className="tabular px-4 py-3">{q.taxes == null ? <span className="text-faint">Não informado</span> : <>{formatMoney(Number(q.taxes))}<div className="text-[11px] text-faint">{ORIGIN[q.cost_origins.taxes ?? "estimated"]}</div></>}</td>
                      <td className="px-4 py-3 text-muted">{q.lead_time_days != null ? `${q.lead_time_days} dias` : "—"}</td>
                      <td className="px-4 py-3"><div className={cn("tabular text-base font-semibold", q.id === best && "text-brand-hi")}>{formatMoney(cost.perUnit)}</div>
                        {cost.missing.length ? <div className="text-[11px] text-danger">parcial: falta {cost.missing.join(" e ")}</div> : q.id === best ? <div className="text-[11px] text-brand-hi">menor custo total</div> : null}</td>
                      <td className="px-2 py-3"><button onClick={() => remove(q.id)} className="btn btn-ghost btn-sm !px-2" aria-label="Excluir cotação"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Custo final por unidade</h2><button className="btn btn-ghost btn-sm" onClick={saveReport}><FileText size={14} /> Salvar relatório</button></div>
              <div className="mt-3"><CompareBars data={rows.map((r) => ({ name: r.q.supplier_name.slice(0, 22), value: r.cost.perUnit, highlight: r.q.id === best }))} /></div>
              <p className="mt-3 text-xs leading-relaxed text-faint">{complete.length < rows.length ? "Cotações sem frete ou impostos aparecem como parciais e não concorrem ao destaque de menor custo. " : ""}
                O destaque considera apenas custo; avalie também prazo, pedido mínimo e o status de verificação de cada fornecedor.</p>
            </div>
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title="Adicionar cotação" description="Deixe em branco o que você ainda não sabe: o custo aparecerá como parcial, nunca como zero.">
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Nome da comparação</span><input className="input" list="ww-comparisons" maxLength={80} placeholder="Ex.: Fone bluetooth TWS" required {...set("comparison")} />
              <datalist id="ww-comparisons">{names.map((n) => <option key={n} value={n} />)}</datalist></label>
            <label><span className="label">Fornecedor cadastrado</span><select className="input" {...set("supplier_id")}><option value="">Outro (digitar nome)</option>{d.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label><span className="label">Nome do fornecedor</span><input className="input" maxLength={160} disabled={Boolean(form.supplier_id)} {...set("supplier_name")} /></label>
            <label><span className="label">Preço unitário (R$) *</span><input className="input tabular" inputMode="decimal" required {...set("unit_price")} /></label>
            <label><span className="label">Quantidade *</span><input className="input tabular" inputMode="numeric" required {...set("quantity")} /></label>
            <label><span className="label">Frete total (R$)</span><input className="input tabular" inputMode="decimal" {...set("freight")} /></label>
            <label><span className="label">Origem do frete</span><select className="input" {...set("freightOrigin")}><option value="user">Informado pelo fornecedor</option><option value="estimated">Estimativa minha</option></select></label>
            <label><span className="label">Impostos totais (R$)</span><input className="input tabular" inputMode="decimal" {...set("taxes")} /></label>
            <label><span className="label">Origem dos impostos</span><select className="input" {...set("taxesOrigin")}><option value="estimated">Estimativa minha</option><option value="user">Valor confirmado</option></select></label>
            <label><span className="label">Outras despesas (R$)</span><input className="input tabular" inputMode="decimal" {...set("other")} /></label>
            <label><span className="label">Prazo de envio (dias)</span><input className="input tabular" inputMode="numeric" {...set("lead")} /></label>
            <label><span className="label">Pedido mínimo</span><input className="input tabular" inputMode="numeric" {...set("min_order")} /></label>
            <label><span className="label">Link da oferta</span><input className="input" type="url" placeholder="https://" {...set("url")} /></label>
            <button className="btn btn-primary sm:col-span-2">Salvar cotação</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
