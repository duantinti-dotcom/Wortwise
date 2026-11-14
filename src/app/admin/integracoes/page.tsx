import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { getAiProvider } from "@/lib/ai/provider";
import { heropayConfigured } from "@/lib/billing/heropay";
import { sourcesOverview } from "@/lib/connectors/registry";
import { serverEnv } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { HeroPayActions } from "./heropay-actions";

export const metadata: Metadata = { title: "Integrações" };

const STATE: Record<string, [string, string]> = { connected: ["Configurado", "badge-pos"], not_configured: ["Não configurado", "badge-neg"], pending_approval: ["Aguardando credenciamento", ""], error: ["Com erro", "badge-neg"] };

export default async function Page() {
  const supabase = await supabaseServer();
  const env = serverEnv();
  const [{ data: sources }, { data: plans }, { data: usage }] = await Promise.all([
    supabase.from("data_sources").select("id, status, status_detail, last_ok_at, last_error_at"),
    supabase.from("plans").select("id, name, price_cents, provider_link_id, provider_checkout_url").gt("price_cents", 0).order("sort_order"),
    supabase.from("api_usage_logs").select("source, ok").gte("created_at", new Date(Date.now() - 86400000).toISOString()).limit(5000),
  ]);
  const db = new Map((sources ?? []).map((s) => [s.id as string, s]));
  const calls = (usage ?? []).reduce<Record<string, { total: number; errors: number }>>((a, u) => { const k = u.source as string; a[k] ??= { total: 0, errors: 0 }; a[k].total++; if (!u.ok) a[k].errors++; return a; }, {});
  const ai = getAiProvider();
  const checks: [string, boolean, string][] = [
    ["Segredo do servidor (WW_SERVER_SECRET)", Boolean(env.serverSecret), "Necessário para webhooks, cron, histórico de preços e logs."],
    ["Segredo do cron (CRON_SECRET)", Boolean(env.cronSecret), "Autentica o Cron Trigger nas rotas /api/cron/*."],
    ["HeroPay — token da API", heropayConfigured(), env.heropayUrl.includes("beta") ? "Ambiente: sandbox" : "Ambiente: produção"],
    ["HeroPay — segredo do webhook", Boolean(env.heropayWebhookSecret), "Sem ele, nenhum webhook é aceito."],
    ["Assistente (IA)", Boolean(ai), ai ? `${ai.id} · ${ai.model}` : "Binding AI ausente ou AI_BASE_URL não definido."],
  ];
  return (
    <>
      <PageHeader title="Integrações" description="Estado real de cada integração neste ambiente. Nenhum conector devolve dados enquanto não estiver autorizado." />
      <h2 className="mb-3 text-sm font-semibold">Marketplaces</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {sourcesOverview().map((s) => {
          const row = db.get(s.id);
          const [label, cls] = STATE[s.state] ?? [s.state, ""];
          const c = calls[s.id];
          return (
            <div key={s.id} className="card p-5">
              <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{s.name}</h3><span className={cn("badge", cls)}>{label}</span></div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.detail}</p>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
                <div><dt className="text-faint">Última resposta OK</dt><dd className="mt-0.5">{formatDate(row?.last_ok_at as string | null, true)}</dd></div>
                <div><dt className="text-faint">Último erro</dt><dd className="mt-0.5">{formatDate(row?.last_error_at as string | null, true)}</dd></div>
                <div><dt className="text-faint">Chamadas (24 h)</dt><dd className="tabular mt-0.5">{c ? `${c.total} · ${c.errors} erro(s)` : "0"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-faint">Recursos: {Object.entries(s.capabilities).filter(([, v]) => v).map(([k]) => k).join(", ") || "nenhum disponível"}</p>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold">Configuração do ambiente</h2>
      <ul className="card divide-y divide-line">
        {checks.map(([name, ok, hint]) => (
          <li key={name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm"><div><div className="font-medium">{name}</div><div className="text-xs text-faint">{hint}</div></div>
            <span className={cn("badge", ok ? "badge-pos" : "badge-neg")}>{ok ? "OK" : "Pendente"}</span></li>
        ))}
      </ul>

      <h2 className="mb-3 mt-10 text-sm font-semibold">HeroPay — planos e webhooks</h2>
      <HeroPayActions ready={heropayConfigured()} plans={(plans ?? []) as { id: string; name: string; price_cents: number; provider_link_id: string | null; provider_checkout_url: string | null }[]} />
    </>
  );
}
