import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, Notice, Panel, RankBars, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { creditForecast } from "@/lib/control/finance";
import { cents, dateTime, int, ms, pct, relative } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { geckoCredits } from "@/lib/control/sources";
import { LoadError, RangeMeta, safe, SinceNotice, type SP } from "../shared";

export const metadata: Metadata = { title: "GeckoAPI" };

interface Gecko {
  latest: { at: string; current_credits: number; consumed_24h: number | null; consumed_7d: number | null; consumed_30d: number | null; plan_id: string | null } | null;
  balance: { at: string; credits: number; c24: number | null }[];
  claimed: { day: string; calls: number }[]; claimed_since: string | null;
  calls: { day: string; metric: "gecko_call" | "gecko_fail" | "gecko_cache_hit"; dim: string; n: number }[]; cache_since: string | null;
  failures: { at: string; source: string; endpoint: string; status: number | null; error: string | null; ms: number | null }[];
  latency: { p50: number | null; p95: number | null; n: number };
  stored: { target: string; type: string; what: string | null; items: number; fetched_at: string; auto_refresh: boolean }[];
  top_queries: { query: string; count: number; users: number }[];
  searches: number;
  settings: { low_balance_credits?: number; low_balance_days?: number } | null;
  costs: { brl_per_credit?: number | null; credits_per_call?: number | null } | null;
  generated_at: string;
}

const MARKET: Record<string, string> = { "mercadolivre.com.br": "Mercado Livre", "shopee.com.br": "Shopee", "tiktok.com": "TikTok Shop" };
const FEATURE: Record<string, string> = { ranking: "Mais vendidos (rankings)", search: "Pesquisa de produtos", product: "Página do produto", refresh: "Atualização automática", geral: "Não identificada", item: "Página do produto (cache)", plp: "Listas" };
const market = (t: string) => MARKET[t] ?? t;

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("gecko");
  const params = await searchParams;
  const range = parseRange(params);
  const [res, live] = await Promise.all([
    safe(controlRpc<Gecko>("control_gecko", { p_from: range.from.toISOString(), p_to: range.to.toISOString() })),
    geckoCredits(),
  ]);
  if (!res.ok) return <LoadError e={res.error} />;
  const g = res.data;
  const cur = live.ok ? live.data : g.latest ? { currentCredits: g.latest.current_credits, last24Hours: g.latest.consumed_24h, last7Days: g.latest.consumed_7d, last30Days: g.latest.consumed_30d, planId: g.latest.plan_id, updatedAt: g.latest.at } : null;
  const fc = creditForecast(cur?.currentCredits, cur?.last7Days, cur?.last24Hours);
  const lowCredits = g.settings?.low_balance_credits ?? 200;
  const lowDays = g.settings?.low_balance_days ?? 7;
  const low = cur != null && (cur.currentCredits < lowCredits || (fc.daysLeft != null && fc.daysLeft < lowDays));

  // Consultas pagas (registradas pelo limite diário) vs. atendidas pelo cache, por dia.
  const days = new Map<string, { day: string; paid: number; cache: number; fail: number }>();
  const touch = (d: string) => days.get(d) ?? { day: d, paid: 0, cache: 0, fail: 0 };
  for (const c of g.claimed) { const r = touch(c.day); r.paid = c.calls; days.set(c.day, r); }
  const byMarket = new Map<string, number>(), byFeature = new Map<string, number>(), hitsByMarket = new Map<string, number>();
  let hits = 0, fails = 0;
  for (const c of g.calls) {
    const [target = "", type = "", feature = "geral"] = c.dim.split(":");
    const r = touch(c.day);
    if (c.metric === "gecko_cache_hit") { r.cache += c.n; hits += c.n; hitsByMarket.set(target, (hitsByMarket.get(target) ?? 0) + c.n); }
    if (c.metric === "gecko_fail") { r.fail += c.n; fails += c.n; }
    if (c.metric === "gecko_call") {
      byMarket.set(target, (byMarket.get(target) ?? 0) + c.n);
      byFeature.set(feature === "geral" ? type : feature, (byFeature.get(feature === "geral" ? type : feature) ?? 0) + c.n);
    }
    days.set(c.day, r);
  }
  const series = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const paidTotal = g.claimed.reduce((a, c) => a + c.calls, 0);
  const cpc = g.costs?.credits_per_call ?? 1;
  const price = g.costs?.brl_per_credit ?? null;
  const costPerSearch = price != null && g.searches > 0 ? Math.round(((paidTotal * cpc * price) / g.searches) * 100) : null;
  const saved = price != null ? Math.round(hits * cpc * price * 100) : null;

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">GeckoAPI</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Saldo e consumo vêm do endpoint oficial <span className="c-mono">GET /v1/me/credits</span>; as métricas por marketplace, funcionalidade e cache são medidas pelo Worthwise.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={g.generated_at} /></div>
      </div>

      {!live.ok && <Notice tone={live.configured ? "crit" : "neutral"} className="mb-4" title="Saldo ao vivo indisponível">{live.reason}{g.latest ? ` Mostrando a última leitura (${relative(g.latest.at)}).` : ""}</Notice>}
      {low && <Notice tone="crit" className="mb-4" title="Saldo baixo">Restam {int(cur?.currentCredits)} créditos{fc.daysLeft != null ? `, cerca de ${fc.daysLeft.toFixed(1)} dias no ritmo atual` : ""}. Limites configurados: {lowCredits} créditos ou {lowDays} dias.</Notice>}

      <Grid cols={4}>
        <Kpi label="Saldo de créditos" value={int(cur?.currentCredits)} basis={live.ok ? "official" : cur ? "official" : "unavailable"}
          sub={cur?.planId ? `plano ${cur.planId}` : undefined} updated={live.ok ? live.fetchedAt : g.latest?.at ?? null} />
        <Kpi label="Consumo 24 h" value={int(cur?.last24Hours)} basis={cur ? "official" : "unavailable"} sub={`7 dias: ${int(cur?.last7Days)} · 30 dias: ${int(cur?.last30Days)}`} />
        <Kpi label="Previsão de esgotamento" value={fc.daysLeft == null ? "—" : fc.daysLeft > 365 ? "> 1 ano" : `${fc.daysLeft.toFixed(fc.daysLeft < 10 ? 1 : 0)} dias`} basis="estimated"
          sub={fc.perDay ? `${fc.perDay.toFixed(1)} créditos/dia` : fc.basis} hint={fc.basis} />
        <Kpi label="Atendidas pelo cache" value={pct(hits + paidTotal ? (hits / (hits + paidTotal)) * 100 : null)} basis="real"
          sub={`${int(hits)} sem gastar crédito${saved != null ? ` · economia ${cents(saved)}` : ""}`} hint="Leituras de listas e produtos já guardados no banco (cada uma evitaria uma consulta paga)." />
      </Grid>
      <Grid cols={4} className="mt-3">
        <Kpi label="Consultas pagas no período" value={int(paidTotal)} sub={`limite diário: ${process.env.GECKO_DAILY_MAX ?? 5}`} />
        <Kpi label="Pesquisas com falha" value={int(fails)} goodWhen="down" sub={`${g.failures.length} detalhadas abaixo`} />
        <Kpi label="Custo por pesquisa" value={costPerSearch == null ? "—" : cents(costPerSearch)} basis={price == null ? "unavailable" : "estimated"}
          sub={price == null ? "informe o preço do crédito em Configurações" : `${int(g.searches)} pesquisas de usuários`} />
        <Kpi label="Tempo de resposta" value={ms(g.latency.p50)} sub={`p95 ${ms(g.latency.p95)} · ${int(g.latency.n)} chamadas`} />
      </Grid>

      <SinceNotice since={g.cache_since} range={range} what="cache (economia de créditos)" />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Consultas pagas vs. cache" description="Por dia. Consultas pagas = autorizadas pelo limite diário de créditos.">
          <TimeChart title="Consultas pagas e atendidas pelo cache" x="day" data={series}
            series={[{ key: "paid", label: "Pagas", color: 2, kind: "bar" }, { key: "cache", label: "Cache", color: 1, kind: "bar" }, { key: "fail", label: "Falhas", color: 4, kind: "line" }]} />
        </Panel>
        <Panel title="Saldo ao longo do tempo" description="Leituras horárias do endpoint oficial (coletadas pelo monitoramento).">
          {g.balance.length >= 2 ? <TimeChart title="Saldo de créditos" x="at" mode="hour" data={g.balance} series={[{ key: "credits", label: "Créditos", color: 1, kind: "area" }]} />
            : <Notice tone="neutral">{g.balance.length ? "Uma leitura até agora; o gráfico aparece a partir da segunda." : "Ainda sem leituras no período. O monitoramento lê o saldo a cada hora."}</Notice>}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Créditos por marketplace" description="Consultas pagas com sucesso.">
          <RankBars rows={[...byMarket].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: market(k), value: v, hint: hitsByMarket.get(k) ? `${int(hitsByMarket.get(k))} cache` : undefined }))} empty="Sem consultas pagas no período." />
        </Panel>
        <Panel title="Créditos por funcionalidade" description="De onde veio cada consulta paga.">
          <RankBars rows={[...byFeature].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: FEATURE[k] ?? k, value: v }))} color="var(--s3)" empty="Sem consultas pagas no período." />
          <p className="c-faint mt-3 text-[11.5px]">A funcionalidade é registrada a partir deste painel; consultas antigas aparecem como &quot;Listas&quot;.</p>
        </Panel>
        <Panel title="Consultas mais utilizadas" description="Termos pesquisados pelos usuários (agregado, sem identificar quem).">
          <RankBars rows={g.top_queries.slice(0, 10).map((q) => ({ label: q.query, value: q.count, hint: `${q.users} usuário(s)` }))} color="var(--s4)" empty="Nenhuma pesquisa no período." />
        </Panel>
      </div>

      <Panel className="mt-4" title="Listas guardadas" description="Respostas da GeckoAPI mantidas no banco (servem o site sem gastar créditos). Rankings são atualizados automaticamente a cada 3 dias.">
        <DataTable csvName="gecko-listas" pageSize={10}
          columns={[{ key: "target", label: "Marketplace" }, { key: "type", label: "Tipo" }, { key: "what", label: "Consulta" }, { key: "items", label: "Itens", align: "right" }, { key: "fetched_at", label: "Atualizada" }, { key: "auto", label: "Auto", hideBelow: "sm" }]}
          rows={g.stored.map((s, i) => ({ id: String(i), values: { target: market(s.target), type: s.type, what: s.what, items: s.items, fetched_at: s.fetched_at, auto: s.auto_refresh ? "sim" : "não" },
            cells: { what: <span className="c-mono block max-w-[340px] truncate" title={s.what ?? ""}>{s.what ?? "—"}</span>, fetched_at: <span className="whitespace-nowrap">{relative(s.fetched_at)}</span>,
              auto: s.auto_refresh ? <Status tone="good">Sim</Status> : <Status tone="neutral">Não</Status> } }))} />
      </Panel>

      <Panel className="mt-4" title="Falhas recentes" description="Chamadas à GeckoAPI que não retornaram dados (nenhuma consome crédito no Worthwise).">
        <DataTable csvName="gecko-falhas" pageSize={10} empty="Nenhuma falha no período."
          columns={[{ key: "at", label: "Quando" }, { key: "endpoint", label: "Consulta" }, { key: "status", label: "HTTP", align: "right" }, { key: "error", label: "Erro" }, { key: "ms", label: "Tempo", align: "right", hideBelow: "sm" }]}
          rows={g.failures.map((f, i) => ({ id: String(i), values: { at: f.at, endpoint: f.endpoint, status: f.status, error: f.error, ms: f.ms },
            cells: { at: <span className="whitespace-nowrap">{dateTime(f.at)}</span>, endpoint: <span className="c-mono">{f.endpoint.replace("POST /v1/extract ", "")}</span>, ms: ms(f.ms) } }))} />
      </Panel>
    </>
  );
}
