"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { PERIOD_LABELS, RESOURCE_LABELS } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Plan { id: string; name: string; description: string | null; price_cents: number; features: string[]; active: boolean; provider_checkout_url: string | null }
interface Quota { plan_id: string; resource: string; limit_value: number; period: string }

export function PlansEditor({ plans, quotas }: { plans: Plan[]; quotas: Quota[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function savePlan(p: Plan, form: FormData) {
    const price = Math.round(Number(String(form.get("price")).replace(/\./g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(price) || price < 0 || (p.id !== "free" && price < 500)) { toast("Preço inválido (mínimo de R$ 5,00 para planos pagos).", "error"); return; }
    setBusy(true);
    const supabase = supabaseBrowser();
    const features = String(form.get("features")).split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12);
    const { error } = await supabase.from("plans").update({ name: String(form.get("name")).trim(), description: String(form.get("description")).trim() || null, price_cents: p.id === "free" ? 0 : price, features, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (!error) await supabase.rpc("admin_log", { p_action: "plan.update", p_target: p.id, p_details: { price_cents: price, previous: p.price_cents } });
    setBusy(false);
    toast(error ? "Não foi possível salvar." : `Plano ${p.name} atualizado`, error ? "error" : "success");
    if (!error) router.refresh();
  }
  async function saveQuota(q: Quota, value: string) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0 || n === q.limit_value) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("plan_quotas").update({ limit_value: n }).eq("plan_id", q.plan_id).eq("resource", q.resource);
    if (!error) await supabase.rpc("admin_log", { p_action: "quota.update", p_target: `${q.plan_id}:${q.resource}`, p_details: { limit: n, previous: q.limit_value } });
    toast(error ? "Não foi possível salvar a cota." : "Cota atualizada", error ? "error" : "success");
    if (!error) router.refresh();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {plans.map((p) => (
        <form key={p.id} className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void savePlan(p, new FormData(e.currentTarget)); }}>
          <div className="flex items-center justify-between"><h2 className="font-semibold">{p.id}</h2>{p.id !== "free" ? <span className={p.provider_checkout_url ? "badge badge-pos" : "badge badge-neg"}>{p.provider_checkout_url ? "checkout ativo" : "sem checkout"}</span> : null}</div>
          <label className="block"><span className="label">Nome</span><input name="name" className="input" defaultValue={p.name} required maxLength={40} /></label>
          <label className="block"><span className="label">Descrição</span><input name="description" className="input" defaultValue={p.description ?? ""} maxLength={120} /></label>
          <label className="block"><span className="label">Preço mensal (R$)</span><input name="price" className="input tabular" defaultValue={(p.price_cents / 100).toFixed(2).replace(".", ",")} disabled={p.id === "free"} inputMode="decimal" /></label>
          <label className="block"><span className="label">Benefícios exibidos (um por linha)</span><textarea name="features" className="input" rows={6} defaultValue={p.features.join("\n")} /></label>
          <button className="btn btn-primary w-full" disabled={busy}>Salvar plano</button>
          <div className="border-t border-line pt-4">
            <div className="mb-3 text-xs font-medium text-muted">Cotas</div>
            <div className="space-y-2.5">
              {quotas.filter((q) => q.plan_id === p.id).map((q) => (
                <label key={q.resource} className="flex items-center justify-between gap-3 text-sm"><span className="text-muted">{RESOURCE_LABELS[q.resource] ?? q.resource} <span className="text-faint">({PERIOD_LABELS[q.period]})</span></span>
                  <input className="input tabular !h-9 !w-24 text-right" inputMode="numeric" defaultValue={q.limit_value} onBlur={(e) => saveQuota(q, e.target.value)} aria-label={`Limite de ${RESOURCE_LABELS[q.resource]} no plano ${p.name}`} /></label>
              ))}
            </div>
            <p className="mt-3 text-xs text-faint">As cotas são salvas ao sair do campo.</p>
          </div>
        </form>
      ))}
    </div>
  );
}
