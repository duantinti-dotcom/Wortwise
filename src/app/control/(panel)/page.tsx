import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ring, Spark, TimeChart } from "@/components/control/charts";
import { Grid, Kpi, KV, Notice, Panel, PRIORITY, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { computeCosts, type CostSettings } from "@/lib/control/finance";
import { cents, int, pct, relative } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { checkIntegrations, geckoCredits, zoneDaily } from "@/lib/control/sources";
import { LoadError, RangeMeta, safe, type SP } from "./shared";
import { AckAllButton } from "@/components/control/ack-button";
import { ackAllIncidents } from "./actions";

export const metadata: Metadata = { title: "Visão executiva" };

interface Overview {
  revenue: { today: number; today_net: number; month: number; month_net: number; range: number; range_net: number; range_net_estimated_share: number | null; prev: number; prev_net: number; refunds: number; last_at: string | null };
  mrr_cents: number;
  subs: { active: number; renewing: number; past_due: number; new: number; new_prev: number; canceled: number; canceled_prev: number; last_at: string | null };
  users: { total: number; free: number; signups: number; signups_prev: number; converted: number; converted_prev: number; paying_ever: number; last_at: string | null };
  visitors: { range: number | null; prev: number | null; since: string | null; last_at: string | null };
  usage: { gecko_calls: number; gecko_since: string | null; ai_tokens: Record<string, { in: number; out: number }>; fees: number; expenses: number };
  series: { day: string; revenue: number; net: number; signups: number; visitors: number | null }[];
  sources: { id: string; name: string; status: string; detail: string | null; last_ok_at: string | null; last_error_at: string | null }[];
  incidents: { id: number; rule_key: string; title: string; priority: string; status: string; last_seen: string; occurrences: number }[];
  security_24h: { events: number; high: number };
  generated_at: string;
}

const SRC_TONE: Record<string, { tone: "good" | "warn" | "crit" | "neutral"; label: string }> = {
  connected: { tone: "good", label: "Operando" }, error: { tone: "crit", label: "Com erro" }, not_configured: { tone: "neutral", label: "Não configurado" },
  pending_approval: { tone: "warn", label: "Aguardando credenciamento" }, planned: { tone: "neutral", label: "Planejado" },
};

export default async function Overview({ searchParams }: { searchParams: SP }) {
  const session = await requireControl("overview");
  const params = await searchParams;
  const range = parseRange(params);
  const [res, settings, live, gecko, cf] = await Promise.all([
    safe(controlRpc<Overview>("control_overview", { p_from: range.from.toISOString(), p_to: range.to.toISOString() })),
    safe(controlRpc<{ costs: CostSettings }>("control_get_settings")),
    checkIntegrations(),
    geckoCredits(),
    zoneDaily(range.from, range.to),
  ]);
  if (!res.ok) return <LoadError e={res.error} />;
  const o = res.data;
  // Alertas já lidos (reconhecidos) não aparecem na tela inicial.
  o.incidents = o.incidents.filter((i) => i.status === "open");

  // Créditos oficiais da GeckoAPI quando a janela coincide com a da API (24 h / 7 / 30 dias).
  const official = gecko.ok ? ({ "24h": gecko.data.last24Hours, "7d": gecko.data.last7Days, "30d": gecko.data.last30Days } as Record<string, number | null>)[range.key] ?? null : null;
  const estShare = o.revenue.range_net_estimated_share ?? 0;
  const costs = computeCosts(settings.ok ? settings.data.costs ?? {} : {}, {
    days: range.days, feesCents: o.usage.fees, feesEstimated: estShare > 0, geckoCalls: o.usage.gecko_calls, geckoCreditsOfficial: official,
    aiTokens: o.usage.ai_tokens, expensesCents: o.usage.expenses,
  });
  // Lucro operacional estimado = receita líquida − custos de serviços − despesas (as tarifas já saíram no líquido).
  const serviceCosts = costs.lines.filter((l) => l.key !== "fees").reduce((a, l) => a + (l.cents ?? 0), 0);
  const profit = o.revenue.range_net - serviceCosts;
  const conv = o.users.signups ? (o.users.converted / o.users.signups) * 100 : null;
  const convPrev = o.users.signups_prev ? (o.users.converted_prev / o.users.signups_prev) * 100 : null;
  const cmp = range.compare;
  const cfVisitors = cf.ok ? cf.data.days.reduce((a, d) => a + d.uniques, 0) : null;

  return (
    <>
      <div className="mb-7 flex flex-col gap-2">
        <span className="c-eyebrow">central de comando</span>
        <h1 className="c-h1 text-[30px]">Visão executiva</h1>
        <div className="flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={o.generated_at} /></div>
      </div>

      {o.incidents.length > 0 && (
        <Notice tone={o.incidents.some((i) => i.priority === "P1") ? "crit" : "warn"} className="mb-5"
          title={`${o.incidents.length} alerta(s) não lido(s)`}>
          <span>{o.incidents.slice(0, 3).map((i) => i.title).join(" · ")}{o.incidents.length > 3 ? "…" : ""} </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <AckAllButton action={ackAllIncidents} />
            <Link href={`${session.base}/alertas`} className="c-btn c-btn-ghost h-8">Ver alertas <ArrowRight size={13} /></Link>
          </span>
        </Notice>
      )}

      <section className="c-card c-rise mb-4 grid grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="c-eyebrow">receita líquida · {range.label.toLowerCase()}</span>
              <div className="c-big mt-2 text-[clamp(30px,9vw,56px)] font-semibold leading-none">{cents(o.revenue.range_net)}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="c-badge c-badge-neutral">bruto {cents(o.revenue.range)}</span>
                <span className="c-badge c-badge-neutral">hoje {cents(o.revenue.today)}</span>
                <span className="c-badge c-badge-neutral">MRR {cents(o.mrr_cents)}</span>
              </div>
            </div>
            <Spark values={o.series.map((d) => d.net)} />
          </div>
          <div className="mt-6">
            <TimeChart title="Receita diária" x="day" unit="cents" height={280} data={o.series}
              series={[{ key: "revenue", label: "Pago", color: 1, kind: "area" }, { key: "net", label: "Líquido", color: 2, kind: "line" }]} />
          </div>
        </div>
        <div className="grid grid-cols-2 place-items-center gap-4 border-t p-6 xl:grid-cols-1 xl:border-l xl:border-t-0" style={{ borderColor: "var(--c-line)" }}>
          <Ring value={conv} label="conversão" sub={`${int(o.users.converted)} de ${int(o.users.signups)}`} tone="white" />
          <Ring value={live.filter((c) => c.ok).length} max={Math.max(1, live.filter((c) => c.ok !== null).length)} label="integrações" sub={`${live.filter((c) => c.ok).length} de ${live.filter((c) => c.ok !== null).length}`} tone="white" />
        </div>
      </section>

      <Grid cols={4}>
        <Kpi label="Receita recebida hoje" value={cents(o.revenue.today)} sub={`líquido ${cents(o.revenue.today_net)}`} updated={o.revenue.last_at} />
        <Kpi label="Receita no mês" value={cents(o.revenue.month, { compact: true })} sub={`líquido ${cents(o.revenue.month_net, { compact: true })}`} updated={o.revenue.last_at} />
        <Kpi label="Receita líquida no período" value={cents(o.revenue.range_net, { compact: true })} cur={cmp ? o.revenue.range_net : null} prev={o.revenue.prev_net}
          basis={estShare > 0 ? "estimated" : "real"} sub={estShare > 0 ? `${pct(estShare * 100, 0)} estimado pelas tarifas` : `bruto ${cents(o.revenue.range, { compact: true })}`}
          hint="Valor pago menos as tarifas da HeroPay. Quando o provedor não informa o líquido, a tarifa publicada é aplicada." />
        <Kpi label="MRR" value={cents(o.mrr_cents, { compact: true })} sub="assinaturas mensais que renovam" hint="Soma do preço mensal das assinaturas ativas que não estão marcadas para cancelar." updated={o.subs.last_at} />

        <Kpi label="Assinantes ativos" value={int(o.subs.active)} sub={`${int(o.subs.renewing)} renovam · ${int(o.subs.past_due)} pendentes`} updated={o.subs.last_at} />
        <Kpi label="Novos assinantes" value={int(o.subs.new)} cur={cmp ? o.subs.new : null} prev={o.subs.new_prev} sub="primeiro pagamento no período" />
        <Kpi label="Cancelamentos" value={int(o.subs.canceled)} cur={cmp ? o.subs.canceled : null} prev={o.subs.canceled_prev} goodWhen="down" sub={o.revenue.refunds ? `estornos ${cents(o.revenue.refunds)}` : "no período"} />
        <Kpi label="Usuários sem plano" value={int(o.users.free)} sub={`${int(o.users.total)} contas · +${int(o.users.signups)} no período`} updated={o.users.last_at} />

        <Kpi label="Visitantes únicos" value={o.visitors.range == null ? "—" : int(o.visitors.range)} cur={cmp ? o.visitors.range : null} prev={o.visitors.prev}
          basis={o.visitors.range == null ? "unavailable" : "real"}
          sub={o.visitors.since ? `desde ${new Date(`${o.visitors.since}T12:00:00Z`).toLocaleDateString("pt-BR")}` : "coleta ainda não começou"}
          hint="Soma dos visitantes únicos de cada dia (medição anônima sem cookie). Visitantes que voltam em dias diferentes contam de novo." updated={o.visitors.last_at} />
        <Kpi label="Conversão cadastro → pago" value={pct(conv)} cur={cmp ? conv : null} prev={convPrev}
          sub={`${int(o.users.converted)} de ${int(o.users.signups)} cadastros`} basis={o.users.signups ? "real" : "unavailable"} />
        <Kpi label="Custo estimado dos serviços" value={cents(costs.totalCents)} basis={costs.complete ? "estimated" : "partial"}
          sub={costs.complete ? "tarifas, APIs, IA, hospedagem e despesas" : "faltam preços em Configurações"} />
        <Kpi label="Lucro operacional estimado" value={cents(profit)} basis={costs.complete ? "estimated" : "partial"}
          sub="receita líquida − serviços − despesas" hint="Estimativa: depende dos preços cadastrados. Itens sem preço não entram no cálculo." />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-3" title="Integrações" description="Verificação ao vivo e último estado registrado."
          footer={<span>Verificado agora</span>}>
          <ul className="grid grid-cols-1 gap-x-8 text-[13px] md:grid-cols-2 [&>li]:border-b [&>li]:border-[var(--c-line)]">
            {live.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0"><div className="c-fg font-medium">{c.name}</div><div className="c-muted truncate text-[12px]" title={c.detail}>{c.detail}</div></div>
                <Status tone={c.ok === null ? "neutral" : c.ok ? "good" : "crit"}>{c.ok === null ? "Não configurado" : c.ok ? `OK${c.ms ? ` · ${c.ms} ms` : ""}` : "Falha"}</Status>
              </li>
            ))}
            {o.sources.filter((s) => s.status !== "planned").map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0"><div className="c-fg font-medium">{s.name}</div>
                  <div className="c-muted truncate text-[12px]">{s.status === "error" ? `erro ${relative(s.last_error_at)}` : s.last_ok_at ? `ok ${relative(s.last_ok_at)}` : s.detail ?? ""}</div></div>
                <Status tone={SRC_TONE[s.status]?.tone ?? "neutral"}>{SRC_TONE[s.status]?.label ?? s.status}</Status>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Cadastros e visitantes" description="Por dia, no período." className="xl:col-span-2">
          <TimeChart title="Cadastros e visitantes" x="day" unit="int" data={o.series}
            series={[{ key: "visitors", label: "Visitantes únicos", color: 1, kind: "area" }, { key: "signups", label: "Cadastros", color: 4, kind: "bar" }]} />
          {cf.ok && <p className="c-faint mt-2 text-[12px]">Cloudflare registrou {int(cfVisitors)} IPs únicos/dia somados no período (inclui robôs).</p>}
        </Panel>
        <Panel title="Segurança e disponibilidade" description="Últimas 24 horas."
          actions={<Link href={`${session.base}/seguranca`} className="c-btn c-btn-ghost h-7 text-[12px]">Abrir <ArrowRight size={13} /></Link>}>
          <KV rows={[
            ["Eventos de segurança", int(o.security_24h.events)],
            ["Gravidade alta/crítica", o.security_24h.high ? <Status tone="serious">{int(o.security_24h.high)}</Status> : <Status tone="good">0</Status>],
            ["Alertas abertos", o.incidents.length ? <Status tone="warn">{o.incidents.length}</Status> : <Status tone="good">Nenhum</Status>],
            ["Saldo GeckoAPI", gecko.ok ? `${int(gecko.data.currentCredits)} créditos` : <span className="c-faint">indisponível</span>],
          ]} />
          {o.incidents.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {o.incidents.slice(0, 4).map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-[12.5px]"><Status tone={PRIORITY[i.priority] ?? "warn"}>{i.priority}</Status><span className="c-soft truncate">{i.title}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Custos e resultado estimado" description="Como o custo e o lucro do período foram calculados."
        actions={<Link href={`${session.base}/financeiro`} className="c-btn c-btn-ghost h-7 text-[12px]">Financeiro <ArrowRight size={13} /></Link>}>
        <ul className="c-divide text-[13px]">
          {costs.lines.map((l) => (
            <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-2.5">
              <span className="c-fg">{l.label}</span>
              <span className="c-num c-fg text-right font-medium">{l.cents == null ? <span className="c-faint font-normal">não calculado</span> : cents(l.cents)}</span>
              <span className="c-muted col-span-2 text-[12px]">{l.note}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
