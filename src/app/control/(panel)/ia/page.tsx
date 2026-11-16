import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { ActionForm, Field } from "@/components/control/forms";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, Notice, Panel, RankBars, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { cents, int, ms, pct, planLabel, short } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { aiUserMenu, saveAiLimits, saveUserAiLimit } from "../actions";
import { LoadError, RangeMeta, safe, SinceNotice, type SP } from "../shared";

export const metadata: Metadata = { title: "Inteligência artificial" };

interface Ai {
  totals: { responses: number; tokens_in: number; tokens_out: number; users: number; without_usage: number };
  by_day: { day: string; model: string; responses: number; tin: number; tout: number }[];
  by_model: { model: string; responses: number; tin: number; tout: number }[];
  by_plan: { plan: string; responses: number; tokens: number; users: number }[];
  top_users: { user_id: string; customer: string | null; plan: string; responses: number; tokens: number; limit: { daily_requests: number | null; blocked: boolean } | null }[];
  events: { requests: number; errors: number; p50: number | null; p95: number | null; since: string | null };
  errors: { code: string; n: number }[];
  latency_by_day: { day: string; p50: number; p95: number; n: number; errors: number }[];
  month_spend_usd: number;
  limits: { monthly_budget_usd: number | null; per_user_daily_requests: number | null; enforce: boolean } | null;
  user_limits: { user_id: string; customer: string | null; daily_requests: number | null; blocked: boolean; note: string | null; updated_at: string }[];
  prices: Record<string, { in: number | null; out: number | null }> | null;
  usd_brl: number | null;
  generated_at: string;
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("ai");
  const params = await searchParams;
  const range = parseRange(params);
  const res = await safe(controlRpc<Ai>("control_ai", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }));
  if (!res.ok) return <LoadError e={res.error} />;
  const a = res.data;
  const prices = a.prices ?? {};
  let usd = 0;
  const unpriced = new Set<string>();
  for (const m of a.by_model) {
    const p = prices[m.model];
    if (p?.in == null || p?.out == null) { unpriced.add(m.model); continue; }
    usd += (m.tin / 1e6) * p.in + (m.tout / 1e6) * p.out;
  }
  const costCents = a.usd_brl ? Math.round(usd * a.usd_brl * 100) : null;
  const models = [...new Set(a.by_day.map((d) => d.model))];
  const byDay = new Map<string, Record<string, number | string>>();
  for (const d of a.by_day) { const r = byDay.get(d.day) ?? { day: d.day }; r[d.model] = (Number(r[d.model] ?? 0) + d.tin + d.tout); byDay.set(d.day, r); }
  const tokensSeries = [...byDay.values()].sort((x, y) => String(x.day).localeCompare(String(y.day)));
  const budget = a.limits?.monthly_budget_usd ?? null;

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Inteligência artificial</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Uso da Wise (assistente). O painel lê apenas contadores — modelo, tokens, tempo e erros —, nunca o conteúdo das conversas.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={a.generated_at} /></div>
      </div>

      <Grid cols={4}>
        <Kpi label="Respostas" value={int(a.totals.responses)} sub={`${int(a.totals.users)} usuários`} />
        <Kpi label="Tokens" value={short(a.totals.tokens_in + a.totals.tokens_out)} sub={`entrada ${short(a.totals.tokens_in)} · saída ${short(a.totals.tokens_out)}`}
          basis={a.totals.without_usage ? "partial" : "real"} hint={a.totals.without_usage ? `${a.totals.without_usage} respostas sem contagem de tokens informada pelo provedor.` : undefined} />
        <Kpi label="Custo estimado" value={costCents == null ? "—" : cents(costCents)} basis={costCents == null ? "unavailable" : unpriced.size ? "partial" : "estimated"}
          sub={costCents == null ? "cadastre cotação e preços em Configurações" : unpriced.size ? `sem preço: ${[...unpriced].slice(0, 2).join(", ")}` : `US$ ${usd.toFixed(2)}`} />
        <Kpi label="Latência (p50 / p95)" value={ms(a.events.p50)} sub={`p95 ${ms(a.events.p95)} · erros ${pct(a.events.requests ? (a.events.errors / a.events.requests) * 100 : null)}`}
          basis={a.events.requests ? "real" : "unavailable"} />
      </Grid>
      <SinceNotice since={a.events.since} range={range} what="latência e erros da IA" />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Tokens por dia" description="Entrada + saída, por modelo.">
          <TimeChart title="Tokens por dia e modelo" x="day" data={tokensSeries}
            series={models.slice(0, 4).map((m, i) => ({ key: m, label: m, color: ((i % 4) + 1) as 1 | 2 | 3 | 4, kind: "bar" as const, stack: "t" }))} />
          {models.length > 4 && <p className="c-faint mt-2 text-[11.5px]">Mostrando 4 de {models.length} modelos; os demais estão na tabela.</p>}
        </Panel>
        <Panel title="Latência e erros por dia" description="Tempo até a resposta completa (registrado a partir do painel).">
          <TimeChart title="Latência por dia" x="day" unit="ms" data={a.latency_by_day}
            series={[{ key: "p50", label: "p50", color: 1, kind: "line" }, { key: "p95", label: "p95", color: 2, kind: "line" }]} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Modelos utilizados" description="Respostas e tokens no período.">
          <RankBars rows={a.by_model.map((m) => ({ label: <span className="c-mono">{m.model}</span>, value: m.tin + m.tout, hint: `${m.responses} resp.` }))} format={(v) => short(v)} />
        </Panel>
        <Panel title="Consumo por plano" description="Plano atual de quem usou.">
          <RankBars rows={a.by_plan.map((p) => ({ label: planLabel(p.plan), value: p.tokens, hint: `${p.users} usuário(s)` }))} format={(v) => short(v)} color="var(--s3)" />
        </Panel>
        <Panel title="Erros" description="Falhas registradas por código.">
          <RankBars rows={a.errors.map((e) => ({ label: e.code === "quota" ? "Limite do provedor" : e.code === "timeout" ? "Tempo esgotado" : e.code === "unavailable" ? "Indisponível" : e.code, value: e.n }))} color="var(--s2)" empty="Nenhum erro registrado." />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Limites de gasto" description="Aplicados antes de cada mensagem da Wise.">
          {budget != null && <div className="mb-3"><div className="c-label mb-1.5">Gasto estimado no mês: US$ {a.month_spend_usd.toFixed(2)} de US$ {budget.toFixed(2)}</div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--c-surface-3)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (a.month_spend_usd / budget) * 100)}%`, background: a.month_spend_usd >= budget ? "var(--crit)" : "var(--c-accent)" }} /></div></div>}
          <ActionForm action={saveAiLimits} submit="Salvar limites">
            <Field label="Orçamento mensal (US$)" hint="Calculado com os preços por modelo cadastrados em Configurações.">
              <input name="monthly_budget_usd" inputMode="decimal" className="c-input c-num" defaultValue={budget ?? ""} placeholder="sem limite" />
            </Field>
            <Field label="Mensagens por usuário por dia" hint="Vale para todos, exceto quem tiver cota própria.">
              <input name="per_user_daily_requests" inputMode="numeric" className="c-input c-num" defaultValue={a.limits?.per_user_daily_requests ?? ""} placeholder="sem limite" />
            </Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enforce" defaultChecked={a.limits?.enforce ?? false} className="h-4 w-4 accent-[var(--c-accent)]" />
              <span className="c-soft">Bloquear a Wise ao atingir o orçamento</span></label>
          </ActionForm>
        </Panel>
        <Panel className="xl:col-span-2" title="Maiores consumidores" description="Use o menu para definir uma cota diária ou bloquear a assistente para um usuário.">
          <DataTable csvName="ia-usuarios" pageSize={10}
            menu={[{ id: "daily-20", label: "Cota diária: 20 mensagens" }, { id: "daily-50", label: "Cota diária: 50 mensagens" }, { id: "clear", label: "Remover limite" }, { id: "block", label: "Bloquear a assistente", danger: true, confirm: "Bloquear a assistente para este usuário?" }, { id: "copy-id", label: "Copiar ID do usuário" }]}
            onMenu={aiUserMenu}
            columns={[{ key: "customer", label: "Usuário" }, { key: "plan", label: "Plano" }, { key: "responses", label: "Respostas", align: "right" }, { key: "tokens", label: "Tokens", align: "right" }, { key: "limit", label: "Limite" }]}
            rows={a.top_users.map((u) => ({ id: u.user_id, menu: ["daily-20", "daily-50", "clear", "block"], values: { customer: u.customer, plan: planLabel(u.plan), responses: u.responses, tokens: u.tokens,
              limit: u.limit ? (u.limit.blocked ? "bloqueado" : `${u.limit.daily_requests}/dia`) : null },
              cells: { tokens: short(u.tokens), limit: u.limit ? (u.limit.blocked ? <Status tone="crit">Bloqueado</Status> : <Status tone="info">{u.limit.daily_requests}/dia</Status>) : <span className="c-faint">padrão</span> } }))} />
        </Panel>
      </div>

      <Panel className="mt-4" title="Cotas individuais" description="Usuários com limite próprio. Para incluir alguém que não aparece acima, informe o ID (copie do menu).">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ActionForm action={saveUserAiLimit} submit="Aplicar">
            <Field label="ID do usuário"><input name="user" className="c-input c-mono" placeholder="00000000-0000-…" required /></Field>
            <Field label="Mensagens por dia"><input name="daily" inputMode="numeric" className="c-input c-num" placeholder="sem limite" /></Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="blocked" className="h-4 w-4" /><span className="c-soft">Bloquear a assistente</span></label>
            <Field label="Observação"><input name="note" className="c-input" maxLength={200} /></Field>
          </ActionForm>
          <div className="lg:col-span-2">
            {a.user_limits.length ? (
              <DataTable searchable={false} pageSize={8} menu={[{ id: "clear", label: "Remover limite" }]} onMenu={aiUserMenu}
                columns={[{ key: "customer", label: "Usuário" }, { key: "limit", label: "Limite" }, { key: "note", label: "Observação", hideBelow: "md" }]}
                rows={a.user_limits.map((l) => ({ id: l.user_id, menu: ["clear"], values: { customer: l.customer, limit: l.blocked ? "bloqueado" : `${l.daily_requests}/dia`, note: l.note } }))} />
            ) : <Notice tone="neutral">Nenhuma cota individual definida.</Notice>}
          </div>
        </div>
      </Panel>
    </>
  );
}
