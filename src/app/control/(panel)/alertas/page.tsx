import type { Metadata } from "next";
import { ActionForm } from "@/components/control/forms";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, Notice, Panel, PRIORITY, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { dateTime, int, relative } from "@/lib/control/format";
import { ackAllIncidents, incidentMenu, saveRule } from "../actions";
import { AckAllButton } from "@/components/control/ack-button";
import { LoadError, safe } from "../shared";

export const metadata: Metadata = { title: "Alertas" };

interface Alerts {
  rules: { key: string; label: string; description: string; category: string; enabled: boolean; threshold: number; unit: string; priority: string; cooldown_minutes: number; updated_at: string }[];
  incidents: { id: number; rule_key: string; title: string; priority: string; status: string; confirmed: boolean; value: number | null; occurrences: number; first_seen: string; last_seen: string; notified_at: string | null; resolved_at: string | null; auto_resolved: boolean }[];
  generated_at: string;
}
const CATEGORY: Record<string, string> = { security: "Segurança", finance: "Financeiro", growth: "Crescimento", infra: "Infraestrutura", integrations: "Integrações" };

export default async function Page() {
  await requireControl("alerts");
  const res = await safe(controlRpc<Alerts>("control_alerts"));
  if (!res.ok) return <LoadError e={res.error} />;
  const a = res.data;
  const open = a.incidents.filter((i) => i.status !== "resolved");
  const email = Boolean(process.env.RESEND_API_KEY && process.env.CONTROL_ALERT_EMAIL);

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Alertas automáticos</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">As regras são avaliadas a cada 30 minutos. Um incidente aberto não gera aviso repetido: só um lembrete depois do intervalo da regra, e ele é resolvido sozinho quando a condição deixa de ocorrer.</p>
      </div>
      <Notice tone={email ? "good" : "neutral"} className="mb-4" title={email ? "Avisos por e-mail ativos" : "Avisos no painel e no sino do Worthwise"}>
        {email ? `Novos incidentes são enviados para ${process.env.CONTROL_ALERT_EMAIL}.` : "Para receber por e-mail, defina RESEND_API_KEY e CONTROL_ALERT_EMAIL nos segredos do Worker."}
      </Notice>

      <Grid cols={4}>
        <Kpi label="Não lidos" value={int(open.filter((i) => i.status === "open").length)} goodWhen="down" />
        <Kpi label="Lidos (em aberto)" value={int(open.filter((i) => i.status === "acknowledged").length)} />
        <Kpi label="P1 em aberto" value={int(open.filter((i) => i.priority === "P1").length)} goodWhen="down" />
        <Kpi label="Regras ativas" value={`${a.rules.filter((r) => r.enabled).length} de ${a.rules.length}`} />
      </Grid>

      <Panel className="mt-4" title="Incidentes" description="Não lidos primeiro. Clique com o botão direito (ou ⋯) para marcar como lido, confirmar ou resolver." actions={open.some((i) => i.status === "open") ? <AckAllButton action={ackAllIncidents} /> : undefined}>
        <DataTable csvName="incidentes" pageSize={15} initialSort={{ key: "last_seen", dir: "desc" }}
          filters={[{ key: "status", label: "Status", options: [{ value: "open", label: "Aberto" }, { value: "acknowledged", label: "Lido" }, { value: "resolved", label: "Resolvido" }] },
            { key: "priority", label: "Prioridade", options: ["P1", "P2", "P3", "P4"].map((p) => ({ value: p, label: p })) }]}
          menu={[{ id: "acknowledge", label: "Marcar como lido" }, { id: "confirm", label: "Confirmar como incidente" }, { id: "unconfirm", label: "Remover confirmação" }, { id: "resolve", label: "Resolver" }, { id: "copy-id", label: "Copiar ID" }]}
          onMenu={incidentMenu} empty="Nenhum incidente registrado."
          columns={[{ key: "priority", label: "Prior." }, { key: "title", label: "Incidente" }, { key: "status", label: "Status" }, { key: "first_seen", label: "Início", hideBelow: "md" },
            { key: "last_seen", label: "Último" }, { key: "occurrences", label: "Verif.", align: "right", hideBelow: "sm" }]}
          rows={a.incidents.map((i) => ({
            id: String(i.id), menu: [i.status === "open" ? "acknowledge" : "", i.confirmed ? "unconfirm" : "confirm", i.status !== "resolved" ? "resolve" : ""].filter(Boolean),
            values: { priority: i.priority, title: i.title, status: i.status, first_seen: i.first_seen, last_seen: i.last_seen, occurrences: i.occurrences },
            cells: {
              priority: <Status tone={PRIORITY[i.priority] ?? "warn"}>{i.priority}</Status>,
              title: <span className="c-fg">{i.title}</span>,
              status: <span className="flex flex-wrap gap-1">{i.confirmed && <Status tone="crit">Confirmado</Status>}
                <Status tone={i.status === "resolved" ? "good" : i.status === "acknowledged" ? "info" : "warn"}>{i.status === "resolved" ? (i.auto_resolved ? "Resolvido (auto)" : "Resolvido") : i.status === "acknowledged" ? "Lido" : "Aberto"}</Status></span>,
              first_seen: <span className="whitespace-nowrap">{dateTime(i.first_seen)}</span>, last_seen: <span className="whitespace-nowrap">{relative(i.last_seen)}</span>,
            },
          }))} />
      </Panel>

      <Panel className="mt-4" title="Regras" description="Limite, prioridade e intervalo mínimo entre lembretes de cada regra. Alterações ficam na auditoria.">
        <ul className="c-divide">
          {a.rules.map((r) => (
            <li key={r.key} className="py-4 first:pt-0 last:pb-0">
              <ActionForm action={saveRule} submit="Salvar" className="gap-3" compact>
                <input type="hidden" name="key" value={r.key} />
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="c-fg text-[13.5px] font-medium">{r.label}</span><span className="c-badge c-badge-neutral">{CATEGORY[r.category] ?? r.category}</span></div>
                    <p className="c-muted mt-0.5 text-[12.5px] leading-relaxed">{r.description}</p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 md:w-[460px]">
                    <label className="flex flex-col gap-1 text-[11.5px]"><span className="c-faint">Ativa</span>
                      <select name="enabled" className="c-select h-8" defaultValue={r.enabled ? "on" : "off"}><option value="on">Sim</option><option value="off">Não</option></select></label>
                    <label className="flex flex-col gap-1 text-[11.5px]"><span className="c-faint">Limite ({r.unit})</span>
                      <input name="threshold" inputMode="decimal" className="c-input c-num h-8" defaultValue={r.threshold} required /></label>
                    <label className="flex flex-col gap-1 text-[11.5px]"><span className="c-faint">Prioridade</span>
                      <select name="priority" className="c-select h-8" defaultValue={r.priority}>{["P1", "P2", "P3", "P4"].map((p) => <option key={p}>{p}</option>)}</select></label>
                    <label className="flex flex-col gap-1 text-[11.5px]"><span className="c-faint">Lembrete (min)</span>
                      <input name="cooldown" inputMode="numeric" className="c-input c-num h-8" defaultValue={r.cooldown_minutes} required /></label>
                  </div>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
