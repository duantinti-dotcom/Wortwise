import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { supabaseServer } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Logs" };

export default async function Page() {
  const supabase = await supabaseServer();
  const [api, hooks, audit] = await Promise.all([
    supabase.from("api_usage_logs").select("id, source, endpoint, status, ok, duration_ms, error, created_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("webhook_events").select("id, trigger, outcome, error, received_at").order("received_at", { ascending: false }).limit(40),
    supabase.from("admin_audit_logs").select("id, action, target, details, created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  const Table = ({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) => (
    <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
      <thead><tr className="border-b border-line text-left text-xs text-faint">{head.map((h) => <th key={h} className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-2.5 text-muted">{c}</td>)}</tr>) : <tr><td colSpan={head.length} className="px-4 py-6 text-center text-muted">Sem registros.</td></tr>}</tbody>
    </table></div>
  );
  return (
    <>
      <PageHeader title="Logs" description="Registros técnicos (30 dias de retenção), eventos de webhook e auditoria de ações administrativas. Nenhum token ou dado financeiro sensível é gravado." />
      <h2 className="mb-3 text-sm font-semibold">Chamadas a APIs externas</h2>
      <Table head={["Quando", "Fonte", "Endpoint", "Status", "Tempo", "Erro"]} rows={(api.data ?? []).map((l) => [formatDate(l.created_at as string, true), l.source as string, <span key="e" className="font-mono text-xs">{l.endpoint as string}</span>,
        <span key="s" className={cn("badge", l.ok ? "badge-pos" : "badge-neg")}>{(l.status as number | null) ?? "—"}</span>, `${l.duration_ms ?? "—"} ms`, (l.error as string | null) ?? "—"])} />
      <h2 className="mb-3 mt-10 text-sm font-semibold">Webhooks de pagamento</h2>
      <Table head={["Quando", "Gatilho", "Resultado"]} rows={(hooks.data ?? []).map((h) => [formatDate(h.received_at as string, true), <span key="t" className="font-mono text-xs">{h.trigger as string}</span>, (h.outcome as string | null) ?? (h.error as string | null) ?? "—"])} />
      <h2 className="mb-3 mt-10 text-sm font-semibold">Auditoria administrativa</h2>
      <Table head={["Quando", "Ação", "Alvo", "Detalhes"]} rows={(audit.data ?? []).map((a) => [formatDate(a.created_at as string, true), <span key="a" className="font-mono text-xs">{a.action as string}</span>, (a.target as string | null) ?? "—",
        <span key="d" className="font-mono text-xs">{JSON.stringify(a.details).slice(0, 120)}</span>])} />
    </>
  );
}
