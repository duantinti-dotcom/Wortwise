import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/marketing/faq";
import { PageShell } from "@/components/marketing/page-shell";
import { Pricing } from "@/components/marketing/pricing";
import { isSupabaseConfigured } from "@/lib/env";
import { DEFAULT_PLANS, PERIOD_LABELS, RESOURCE_LABELS, type PlanInfo } from "@/lib/plans";
import { supabaseAnon } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Planos e preços do Worthwise",
  description: "Primeiro mês por R$ 9,90. Depois, Essencial por R$ 19,90/mês ou Profissional por R$ 39,90/mês: mais vendidos de cada loja, assistente de IA, histórico de preços e calculadora de lucro.",
  alternates: { canonical: "/precos" },
};
export const dynamic = "force-dynamic"; // preços e cotas vêm do banco (editáveis no painel)

interface Quota { plan_id: string; resource: string; limit_value: number; period: string }

export default async function PricingPage() {
  let plans: PlanInfo[] = DEFAULT_PLANS;
  let quotas: Quota[] = [];
  if (isSupabaseConfigured()) {
    try {
      const db = supabaseAnon();
      const [p, q] = await Promise.all([
        db.from("plans").select("id, name, description, price_cents, features, sort_order").eq("active", true).order("sort_order"),
        db.from("plan_quotas").select("plan_id, resource, limit_value, period"),
      ]);
      if (p.data?.length) plans = p.data as PlanInfo[];
      quotas = (q.data ?? []) as Quota[];
    } catch {
      // mantém os valores padrão
    }
  }
  const resources = Object.keys(RESOURCE_LABELS).filter((r) => quotas.some((q) => q.resource === r));
  return (
    <PageShell eyebrow="Planos" title="Preço simples, limites claros" lead="Comece pelo primeiro mês por R$ 9,90 com tudo do Essencial. Depois, continue no plano que combina com o seu volume de vendas.">
      <Pricing initial={plans} />
      {resources.length ? (
        <div className="card mt-14 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Limites por plano</caption>
            <thead><tr className="border-b border-line text-left"><th className="px-5 py-4 font-medium text-muted">Limites</th>{plans.map((p) => <th key={p.id} className="px-5 py-4 font-semibold">{p.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {resources.map((r) => (
                <tr key={r}><th scope="row" className="px-5 py-3.5 text-left font-normal text-muted">{RESOURCE_LABELS[r]}</th>
                  {plans.map((p) => {
                    const q = quotas.find((x) => x.plan_id === p.id && x.resource === r);
                    return <td key={p.id} className="tabular px-5 py-3.5">{q ? q.limit_value === 0 ? <span className="text-faint">Não incluído</span> : <>{q.limit_value.toLocaleString("pt-BR")} <span className="text-faint">{q.period === "month" ? "por mês" : PERIOD_LABELS[q.period]}</span></> : "—"}</td>;
                  })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-6 text-center text-sm text-faint">Não prometemos uso “ilimitado”: todos os planos têm limites técnicos explícitos. Pagamento via HeroPay (Pix, cartão ou boleto). Primeiro mês em pagamento único, sem renovação; Essencial e Profissional com renovação mensal e cancelamento a qualquer momento.</p>
      <section className="mx-auto mt-24 max-w-3xl"><h2 className="mb-8 text-center text-3xl font-semibold">Perguntas frequentes</h2><Faq /></section>
      <p className="mt-10 text-center text-sm text-muted">Dúvidas sobre os dados? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link>.</p>
    </PageShell>
  );
}
