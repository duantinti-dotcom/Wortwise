import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { DataTable } from "@/components/control/table";
import { Empty, Grid, Kpi, Panel, RankBars, SegmentBar } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { cents, int, pct, planLabel } from "@/lib/control/format";
import { BUCKET_LABEL, parseRange } from "@/lib/control/range";
import { ExportButton, LoadError, RangeMeta, safe, SinceNotice, type SP } from "../shared";

export const metadata: Metadata = { title: "Assinantes" };

interface Subs {
  since: string | null; bucket: string;
  series: { b: string; new: number; canceled: number; renewals: number; refused: number; cumulative: number; active_snapshot: number | null }[];
  distribution: { plan: string; users: number }[];
  revenue_by_plan: { plan: string; amount: number; count: number }[];
  churn: { canceled: number; refunded: number; active_start: number; method: "snapshot" | "estimated_from_payments" };
  conversion: { signups: number; converted: number; median_days: number | null };
  cohorts: { cohort: string; size: number; converted: number; months: { k: number; paying: number }[] }[];
  payment_failures: { reason: string; count: number }[];
  generated_at: string;
}

const PLAN_COLOR: Record<string, string> = { free: "var(--s-prev)", inicial: "var(--s3)", pro: "var(--s1)", business: "var(--s2)" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const session = await requireControl("subscribers");
  const params = await searchParams;
  const range = parseRange(params);
  const res = await safe(controlRpc<Subs>("control_subscribers", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_bucket: range.bucket }));
  if (!res.ok) return <LoadError e={res.error} />;
  const s = res.data;
  const totals = s.series.reduce((a, x) => ({ new: a.new + x.new, canceled: a.canceled + x.canceled, renewals: a.renewals + x.renewals, refused: a.refused + x.refused }), { new: 0, canceled: 0, renewals: 0, refused: 0 });
  const churn = s.churn.active_start > 0 ? (s.churn.canceled / s.churn.active_start) * 100 : null;
  const conv = s.conversion.signups ? (s.conversion.converted / s.conversion.signups) * 100 : null;
  const mode = range.bucket;
  const maxMonths = Math.max(0, ...s.cohorts.map((c) => c.months.length));

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="c-h1">Assinantes</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={s.generated_at} /><span className="c-badge c-badge-neutral">Agrupado por {BUCKET_LABEL[range.bucket].toLowerCase()}</span></div>
        </div>
        <ExportButton base={session.base} dataset="metrics" params={params} label="Exportar métricas" />
      </div>
      <SinceNotice since={s.since} range={range} what="pagamentos" />

      <Grid cols={4} className="mt-4">
        <Kpi label="Novos assinantes" value={int(totals.new)} sub="primeiro pagamento reconhecido" />
        <Kpi label="Cancelamentos" value={int(totals.canceled)} goodWhen="down" sub={`${int(s.churn.refunded)} estornos/chargebacks`} />
        <Kpi label="Churn do período" value={pct(churn)} basis={s.churn.method === "snapshot" ? "real" : "estimated"}
          sub={s.churn.active_start ? `${int(s.churn.canceled)} de ${int(s.churn.active_start)} ativos no início` : "sem assinantes no início"}
          hint={s.churn.method === "snapshot" ? "Base: foto diária de assinantes ativos." : "Base estimada: clientes com pagamento nos 32 dias anteriores ao período (ainda não havia foto diária)."} />
        <Kpi label="Conversão do cadastro" value={pct(conv)} sub={s.conversion.median_days != null ? `mediana de ${s.conversion.median_days.toFixed(1)} dias até pagar` : `${int(s.conversion.converted)} de ${int(s.conversion.signups)}`} />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Novas vs. canceladas" description={`Por ${BUCKET_LABEL[range.bucket].toLowerCase()}.`}>
          <TimeChart title="Assinaturas novas e canceladas" x="b" mode={mode} data={s.series}
            series={[{ key: "new", label: "Novas", color: 1, kind: "bar" }, { key: "canceled", label: "Canceladas", color: 2, kind: "bar" }]} />
        </Panel>
        <Panel title="Total acumulado de assinantes" description="Clientes que já pagaram ao menos uma vez (inclui quem cancelou depois).">
          <TimeChart title="Assinantes acumulados" x="b" mode={mode} data={s.series} series={[{ key: "cumulative", label: "Acumulado", color: 1, kind: "area" }]} />
        </Panel>
        <Panel title="Ativos (foto diária)" description="Assinantes com acesso pago no fim de cada período. A foto começou a ser registrada com o painel; antes disso não há dado.">
          {s.series.some((x) => x.active_snapshot != null)
            ? <TimeChart title="Assinantes ativos" x="b" mode={mode} data={s.series} series={[{ key: "active_snapshot", label: "Ativos", color: 3, kind: "line" }]} />
            : <Empty title="A foto diária começa na primeira execução do monitoramento.">O Cron do painel registra os ativos a cada 30 minutos.</Empty>}
        </Panel>
        <Panel title="Renovações e falhas de pagamento" description="Pagamentos recorrentes confirmados e cartões recusados.">
          <TimeChart title="Renovações e falhas" x="b" mode={mode} data={s.series}
            series={[{ key: "renewals", label: "Renovações", color: 3, kind: "bar" }, { key: "refused", label: "Recusados", color: 2, kind: "bar" }]} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Distribuição por plano" description="Situação atual de todas as contas.">
          <SegmentBar parts={s.distribution.map((d) => ({ label: planLabel(d.plan), value: d.users, color: PLAN_COLOR[d.plan] ?? "var(--s4)" }))} />
        </Panel>
        <Panel title="Receita por plano" description="Pagamentos confirmados no período.">
          <RankBars rows={s.revenue_by_plan.map((r) => ({ label: planLabel(r.plan), value: r.amount, hint: `${r.count} pag.` }))} format={(v) => cents(v)} />
        </Panel>
        <Panel title="Motivos de recusa" description="Mensagens devolvidas pela operadora.">
          <RankBars rows={s.payment_failures.map((f) => ({ label: f.reason, value: f.count }))} color="var(--s2)" empty="Nenhuma recusa no período." />
        </Panel>
      </div>

      <Panel className="mt-4" title="Retenção por coorte de cadastro" description="Percentual de cada coorte mensal com pagamento confirmado no mês M0 (cadastro), M1, M2…">
        {s.cohorts.length ? (
          <div className="c-scroll -mx-4 overflow-x-auto sm:-mx-5">
            <table className="c-table min-w-[560px]">
              <thead><tr><th className="pl-4 sm:pl-5">Coorte</th><th className="r">Contas</th><th className="r">Converteram</th>
                {Array.from({ length: maxMonths }, (_, k) => <th key={k} className="r">M{k}</th>)}</tr></thead>
              <tbody>{s.cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td className="pl-4 sm:pl-5">{c.cohort}</td><td className="r">{int(c.size)}</td><td className="r">{pct(c.size ? (c.converted / c.size) * 100 : null)}</td>
                  {Array.from({ length: maxMonths }, (_, k) => {
                    const m = c.months.find((x) => x.k === k);
                    if (!m) return <td key={k} className="r c-faint">·</td>;
                    const p = c.size ? (m.paying / c.size) * 100 : 0;
                    return <td key={k} className="r" title={`${m.paying} pagantes`} style={{ background: `color-mix(in srgb, var(--s1) ${Math.min(70, p * 1.5)}%, transparent)`, color: p > 30 ? "#000" : undefined }}>{pct(p, 0)}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="Sem cadastros nos últimos 13 meses." />}
      </Panel>

      <Panel className="mt-4" title="Dados por período" description="A mesma série dos gráficos, para conferência e exportação.">
        <DataTable csvName="assinantes" searchable={false} pageSize={15}
          columns={[{ key: "b", label: BUCKET_LABEL[range.bucket] }, { key: "new", label: "Novas", align: "right" }, { key: "canceled", label: "Canceladas", align: "right" },
            { key: "renewals", label: "Renovações", align: "right" }, { key: "refused", label: "Recusados", align: "right" }, { key: "cumulative", label: "Acumulado", align: "right" }]}
          rows={[...s.series].reverse().map((x) => ({ id: x.b, values: { b: x.b, new: x.new, canceled: x.canceled, renewals: x.renewals, refused: x.refused, cumulative: x.cumulative } }))} />
      </Panel>
    </>
  );
}
