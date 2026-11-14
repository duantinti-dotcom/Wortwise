import { PageHeader, Stat } from "@/components/ui/misc";
import { sourcesOverview } from "@/lib/connectors/registry";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";

interface Overview { users: number; users_7d: number; flagged: number; subs_active: number; subs_past_due: number; subs_canceled: number; subs_by_plan: Record<string, number>; mrr_cents: number;
  searches_total: number; searches_30d: number; ai_messages_30d: number; ai_tokens_30d: number; watches_active: number; alerts_30d: number; api_calls_24h: number; api_errors_24h: number; webhooks_7d: number }

export default async function AdminHome() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_overview");
  const o = data as Overview | null;
  if (error || !o) return <p role="alert" className="card p-5 text-sm text-danger">Não foi possível carregar a visão geral.</p>;
  const connected = sourcesOverview().filter((s) => s.state === "connected").length;
  return (
    <>
      <PageHeader title="Visão geral" description="Métricas operacionais calculadas diretamente do banco de dados." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usuários" value={o.users} hint={`${o.users_7d} nos últimos 7 dias · ${o.flagged} sinalizados`} />
        <Stat label="Assinantes ativos" value={o.subs_active} hint={Object.entries(o.subs_by_plan).map(([k, v]) => `${k}: ${v}`).join(" · ") || "nenhum"} tone="pos" />
        <Stat label="Receita recorrente (MRR)" value={formatMoney(o.mrr_cents / 100)} hint="assinaturas ativas não canceladas" tone="brand" />
        <Stat label="Canceladas / pendentes" value={`${o.subs_canceled} / ${o.subs_past_due}`} hint="canceladas ou expiradas / pagamento pendente" />
        <Stat label="Pesquisas (30 dias)" value={o.searches_30d} hint={`${o.searches_total} no total`} />
        <Stat label="Mensagens de IA (30 dias)" value={o.ai_messages_30d} hint={`${o.ai_tokens_30d.toLocaleString("pt-BR")} tokens — base para o custo de IA`} />
        <Stat label="Monitoramentos ativos" value={o.watches_active} hint={`${o.alerts_30d} alertas em 30 dias`} />
        <Stat label="Chamadas a APIs (24 h)" value={o.api_calls_24h} hint={`${o.api_errors_24h} com erro · ${connected} marketplace(s) configurado(s)`} tone={o.api_errors_24h > 0 ? "neg" : undefined} />
      </div>
      <p className="mt-6 text-xs text-faint">Webhooks recebidos em 7 dias: {o.webhooks_7d}. O custo de IA depende do provedor: multiplique os tokens pelo preço vigente do modelo configurado.</p>
    </>
  );
}
