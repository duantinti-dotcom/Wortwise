import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { ActionForm, Field } from "@/components/control/forms";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, KV, Notice, Panel, RankBars, Status, type Tone } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { cac, computeCosts, ltv, type CostSettings } from "@/lib/control/finance";
import { cents, dateTime, dayLabel, int, methodLabel, planLabel, relative } from "@/lib/control/format";
import { BUCKET_LABEL, parseRange, spDay } from "@/lib/control/range";
import { addExpense, expenseMenu, paymentMenu } from "../actions";
import { ExportButton, LoadError, RangeMeta, safe, SinceNotice, type SP } from "../shared";

export const metadata: Metadata = { title: "Financeiro" };

interface Finance {
  bucket: string; since: string | null;
  series: { b: string; gross: number; paid: number; net: number; refunds: number }[];
  prev_series: { b: string; paid: number; net: number }[];
  totals: { paid: number; paid_n: number; net: number; net_estimated: number; refunded: number; refunded_n: number; chargeback: number; chargeback_n: number;
    refused: number; refused_n: number; fees: number; invalid_paid: number; invalid_paid_n: number };
  prev_totals: { paid: number; net: number };
  pending: { count: number; amount: number }; pending_all: { count: number; amount: number };
  cancellations: number;
  methods: { method: string; amount: number; count: number }[];
  test: { count: number; amount: number };
  forecast_30d: { count: number; amount: number }; at_risk: { count: number; amount: number };
  payments: { id: string; at: string; plan: string | null; method: string | null; status: string; amount: number | null; net: number | null; net_estimated: boolean; valid: boolean; is_test: boolean; customer: string | null; refused: string | null }[];
  expenses: { id: string; day: string; category: string; description: string; amount: number; created_at: string }[];
  unit: { paying_customers: number; new_customers: number; ads: number; history_days: number | null; paid_90d: number; paying_90d: number; canceled_90d: number };
  heropay_webhooks_last: string | null;
  generated_at: string;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: "good", label: "Pago" }, pending: { tone: "warn", label: "Pendente" }, refused: { tone: "crit", label: "Recusado" },
  refunded: { tone: "serious", label: "Estornado" }, chargeback: { tone: "crit", label: "Chargeback" },
};
const CATEGORY: Record<string, string> = { ads: "Anúncios", tools: "Ferramentas", hosting: "Hospedagem", api: "APIs", ai: "IA", services: "Serviços", taxes: "Impostos", other: "Outros" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const session = await requireControl("finance");
  const params = await searchParams;
  const range = parseRange(params);
  const [res, settings] = await Promise.all([
    safe(controlRpc<Finance>("control_finance", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_bucket: range.bucket })),
    safe(controlRpc<{ costs: CostSettings }>("control_get_settings")),
  ]);
  if (!res.ok) return <LoadError e={res.error} />;
  const f = res.data;
  const t = f.totals;
  const expenses = f.expenses.reduce((a, e) => a + e.amount, 0);
  const costs = computeCosts(settings.ok ? settings.data.costs ?? {} : {}, { days: range.days, feesCents: t.fees, feesEstimated: t.net_estimated > 0, geckoCalls: 0, aiTokens: {}, expensesCents: expenses });
  const fixed = costs.lines.filter((l) => l.key.startsWith("fixed:"));
  const fixedCents = fixed.reduce((a, l) => a + (l.cents ?? 0), 0);
  const result = t.net - fixedCents - expenses;
  const cacM = cac({ ...f.unit, adsCents: f.unit.ads, newCustomers: f.unit.new_customers, historyDays: f.unit.history_days, paid90dCents: f.unit.paid_90d, paying90d: f.unit.paying_90d, canceled90d: f.unit.canceled_90d });
  const ltvM = ltv({ adsCents: f.unit.ads, newCustomers: f.unit.new_customers, historyDays: f.unit.history_days, paid90dCents: f.unit.paid_90d, paying90d: f.unit.paying_90d, canceled90d: f.unit.canceled_90d });
  const series = f.series.map((x, i) => ({ ...x, prev_paid: range.compare ? f.prev_series[i]?.paid ?? null : null }));
  const cmp = range.compare;
  const today = spDay(new Date());

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="c-h1">Financeiro</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={f.generated_at} /><span className="c-badge c-badge-neutral">Somente leitura</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton base={session.base} dataset="payments" params={params} label="Pagamentos (CSV)" />
          <ExportButton base={session.base} dataset="expenses" params={params} label="Despesas (CSV)" />
        </div>
      </div>

      <Notice tone="info" className="mb-4" title="Fonte dos dados: webhooks da HeroPay">
        A API v1 documentada da HeroPay não oferece relatório de vendas ou extrato para consulta; os valores vêm dos webhooks assinados recebidos pelo Worthwise
        (último {relative(f.heropay_webhooks_last)}). Quando a HeroPay liberar relatórios para a sua conta, eles podem ser conciliados aqui.
      </Notice>
      <SinceNotice since={f.since} range={range} what="pagamentos" />

      <Grid cols={4} className="mt-4">
        <Kpi label="Recebido (pago)" value={cents(t.paid, { compact: true })} cur={cmp ? t.paid : null} prev={f.prev_totals.paid} sub={`${int(t.paid_n)} pagamentos`} />
        <Kpi label="Receita líquida" value={cents(t.net, { compact: true })} cur={cmp ? t.net : null} prev={f.prev_totals.net} basis={t.net_estimated ? "estimated" : "real"}
          sub={t.net_estimated ? `${cents(t.net_estimated)} com tarifa estimada` : `tarifas ${cents(t.fees)}`} />
        <Kpi label="Previsto (30 dias)" value={cents(f.forecast_30d.amount)} basis="estimated" sub={`${int(f.forecast_30d.count)} renovações esperadas`}
          hint="Assinaturas mensais ativas, sem cancelamento agendado, com renovação nos próximos 30 dias. Não é dinheiro recebido." />
        <Kpi label="Resultado do período" value={cents(result)} basis={fixed.some((l) => l.cents == null) ? "partial" : "estimated"} sub="líquido − hospedagem − despesas"
          hint="Custos variáveis de APIs e IA estão na Visão executiva; aqui entram os custos fixos e as despesas registradas." />
      </Grid>
      <Grid cols={6} className="mt-3">
        <MiniStat tone="warn" label="Pendentes" value={cents(f.pending.amount)} sub={`${f.pending.count} Pix/boleto gerados`} />
        <MiniStat tone="crit" label="Recusados" value={cents(t.refused)} sub={`${t.refused_n} tentativas`} />
        <MiniStat tone="serious" label="Estornados" value={cents(t.refunded)} sub={`${t.refunded_n} pagamentos`} />
        <MiniStat tone="crit" label="Chargebacks" value={cents(t.chargeback)} sub={`${t.chargeback_n} contestações`} />
        <MiniStat tone="neutral" label="Cancelamentos" value={int(f.cancellations)} sub="assinaturas" />
        <MiniStat tone="warn" label="Em risco" value={cents(f.at_risk.amount)} sub={`${f.at_risk.count} com pagamento pendente`} />
      </Grid>

      {(t.invalid_paid_n > 0 || f.test.count > 0) && (
        <Notice tone="warn" className="mt-4" title="Pagamentos que não ativaram assinatura">
          {t.invalid_paid_n > 0 && <>{int(t.invalid_paid_n)} pagamento(s) somando {cents(t.invalid_paid)} foram pagos sem plano reconhecido ou com valor menor que o preço do plano (ex.: testes de R$ 1,00). </>}
          {f.test.count > 0 && <>{int(f.test.count)} pagamento(s) ({cents(f.test.amount)}) estão classificados como teste e não entram nos totais. </>}
          Use o menu de cada pagamento na tabela para classificar ou desfazer.
        </Notice>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Faturamento e receita líquida" description={`Por ${BUCKET_LABEL[range.bucket].toLowerCase()}${cmp ? ", com o período anterior em cinza" : ""}.`}>
          <TimeChart title="Faturamento e receita líquida" x="b" unit="cents" mode={range.bucket} data={series}
            series={[{ key: "paid", label: "Pago", color: 1, kind: "area" }, { key: "net", label: "Líquido", color: 3, kind: "line" },
              ...(cmp ? [{ key: "prev_paid", label: "Pago (período anterior)", color: "prev" as const, kind: "line" as const }] : [])]} />
        </Panel>
        <Panel title="Métodos de pagamento" description="Pagos no período.">
          <RankBars rows={f.methods.map((m) => ({ label: methodLabel(m.method), value: m.amount, hint: `${m.count}` }))} format={(v) => cents(v)} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Resultado (DRE simplificada)" description="Valores efetivamente pagos separados dos estimados.">
          <KV rows={[
            ["Recebido (pago)", cents(t.paid)],
            ["(−) Tarifas HeroPay", <span key="f" className="c-neg">−{cents(t.fees)}</span>],
            ["= Receita líquida", <strong key="n">{cents(t.net)}</strong>],
            ...fixed.map((l): [string, React.ReactNode] => [`(−) ${l.label}`, l.cents == null ? <span className="c-faint">sem cotação</span> : <span className="c-neg">−{cents(l.cents)}</span>]),
            ["(−) Despesas registradas", <span key="e" className="c-neg">−{cents(expenses)}</span>],
            ["= Resultado estimado", <strong key="r" className={result >= 0 ? "c-pos" : "c-neg"}>{cents(result)}</strong>],
            ["Estornos no período (já fora do pago)", cents(t.refunded + t.chargeback)],
          ]} />
        </Panel>
        <Panel title="CAC" description="Custo de aquisição por cliente pagante.">
          <UnitMetric m={cacM} />
        </Panel>
        <Panel title="LTV" description="Valor estimado de um cliente ao longo da assinatura.">
          <UnitMetric m={ltvM} />
          {ltvM.value != null && cacM.value != null && <p className="c-muted mt-2 text-[12.5px]">LTV/CAC: {(ltvM.value / cacM.value).toFixed(1)}×</p>}
        </Panel>
      </div>

      <Panel className="mt-4" title="Pagamentos" description="Últimos 1.000 do período. Clique com o botão direito (ou em ⋯) para classificar um pagamento como teste.">
        <DataTable csvName="pagamentos" pageSize={20} menu={[{ id: "flag-test", label: "Classificar como teste" }, { id: "unflag-test", label: "Remover classificação de teste" }, { id: "copy-id", label: "Copiar ID" }]}
          onMenu={paymentMenu}
          filters={[{ key: "status", label: "Status", options: Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
            { key: "method", label: "Método", options: [["pix", "Pix"], ["credit_card", "Cartão"], ["bank_slip", "Boleto"]].map(([value, label]) => ({ value: value!, label: label! })) }]}
          columns={[{ key: "at", label: "Data" }, { key: "customer", label: "Cliente", hideBelow: "md" }, { key: "plan", label: "Plano" }, { key: "method", label: "Método", hideBelow: "sm" },
            { key: "status", label: "Status" }, { key: "amount", label: "Valor", align: "right" }, { key: "net", label: "Líquido", align: "right", hideBelow: "sm" }]}
          rows={f.payments.map((p) => ({
            id: p.id, menu: [p.is_test ? "unflag-test" : "flag-test"],
            values: { at: p.at, customer: p.customer, plan: p.plan, method: p.method, status: p.status, amount: p.amount, net: p.net },
            cells: {
              at: <span className="c-num whitespace-nowrap">{dateTime(p.at)}</span>,
              plan: <span className="whitespace-nowrap">{planLabel(p.plan ?? "sem_plano")}{!p.valid && p.status === "paid" && <span className="c-badge c-badge-warn ml-1.5">não ativou</span>}{p.is_test && <span className="c-badge c-badge-neutral ml-1.5">teste</span>}</span>,
              method: methodLabel(p.method),
              status: <span title={p.refused ?? undefined}><Status tone={STATUS[p.status]?.tone ?? "neutral"}>{STATUS[p.status]?.label ?? p.status}</Status></span>,
              amount: <span className="c-fg">{cents(p.amount)}</span>,
              net: <span>{cents(p.net)}{p.net_estimated && <span className="c-faint" title="Estimado pela tarifa publicada"> *</span>}</span>,
            },
          }))} />
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Registrar despesa externa" description="Anúncios, ferramentas, serviços. Fica na auditoria.">
          <ActionForm action={addExpense} submit="Registrar">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><input name="day" type="date" className="c-input" defaultValue={today} max={today} required /></Field>
              <Field label="Valor (R$)"><input name="amount" inputMode="decimal" className="c-input c-num" placeholder="0,00" required /></Field>
            </div>
            <Field label="Categoria">
              <select name="category" className="c-select" defaultValue="ads">{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Field label="Descrição"><input name="description" className="c-input" maxLength={160} placeholder="Ex.: Meta Ads — campanha de novembro" required /></Field>
          </ActionForm>
        </Panel>
        <Panel className="xl:col-span-2" title="Despesas do período" description={`Total: ${cents(expenses)}`}>
          <DataTable csvName="despesas" pageSize={10} searchable={f.expenses.length > 8} empty="Nenhuma despesa registrada no período."
            menu={[{ id: "delete", label: "Remover despesa", danger: true, confirm: "Remover esta despesa? A remoção fica registrada na auditoria." }]} onMenu={expenseMenu}
            columns={[{ key: "day", label: "Data" }, { key: "category", label: "Categoria" }, { key: "description", label: "Descrição" }, { key: "amount", label: "Valor", align: "right" }]}
            rows={f.expenses.map((e) => ({ id: e.id, menu: ["delete"], values: { day: e.day, category: CATEGORY[e.category] ?? e.category, description: e.description, amount: e.amount },
              cells: { day: dayLabel(e.day, true), amount: cents(e.amount) } }))} />
        </Panel>
      </div>
    </>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className="c-card-flat flex flex-col gap-1 px-3.5 py-3">
      <span className="flex items-center gap-1.5"><Status tone={tone}>{label}</Status></span>
      <span className="c-num mt-1 text-[17px] font-semibold">{value}</span>
      <span className="c-faint text-[11.5px]">{sub}</span>
    </div>
  );
}

function UnitMetric({ m }: { m: ReturnType<typeof cac> }) {
  if (m.value == null) return <div><div className="c-num text-[24px] font-semibold c-faint">—</div><p className="c-muted mt-2 text-[12.5px] leading-relaxed">Não calculado: {m.reason}</p></div>;
  return <div><div className="c-num text-[24px] font-semibold">{cents(m.value)}</div><p className="c-muted mt-2 text-[12.5px] leading-relaxed">{m.note}</p></div>;
}
