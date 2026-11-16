import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { Empty, Notice, Panel } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { int, pct, planLabel } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { LoadError, RangeMeta, safe, type SP } from "../shared";

export const metadata: Metadata = { title: "Funil de conversão" };

interface Funnel {
  stages: { key: string; label: string; count: number | null; since?: string | null }[];
  activity: { day: string; plan: string; users: number }[];
  retention: { week: string; plan: string; size: number; weeks: number[] }[];
  generated_at: string;
}

const PLAN_SLOT: Record<string, 1 | 2 | 3 | 4> = { free: 4, pro: 1, business: 2, inicial: 3 };

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("funnel");
  const params = await searchParams;
  const range = parseRange(params);
  const res = await safe(controlRpc<Funnel>("control_funnel", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }));
  if (!res.ok) return <LoadError e={res.error} />;
  const f = res.data;
  const top = Math.max(1, ...f.stages.map((s) => s.count ?? 0));
  const visitors = f.stages[0];

  // Atividade diária por plano (uma coluna por plano)
  const plans = [...new Set(f.activity.map((a) => a.plan))].sort();
  const byDay = new Map<string, Record<string, number | string>>();
  for (const a of f.activity) {
    const row = byDay.get(a.day) ?? { day: a.day };
    row[a.plan] = a.users;
    byDay.set(a.day, row);
  }
  const activity = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const maxWeeks = Math.max(0, ...f.retention.map((r) => r.weeks.length));

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Funil de conversão</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Pessoas que se cadastraram no período e até onde chegaram. Visitantes vêm da medição anônima (sem cookie); as demais etapas usam a conta de quem aceitou os termos ao se cadastrar.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={f.generated_at} /></div>
      </div>

      <Panel title="Visitante → Assinatura paga" description="Largura proporcional ao total de cada etapa. Abandono = quem não passou da etapa anterior.">
        {visitors?.count == null && <Notice tone="neutral" className="mb-4">A contagem de visitantes começou junto com o painel; períodos anteriores não têm essa etapa.</Notice>}
        <ol className="flex flex-col gap-2">
          {f.stages.map((s, i) => {
            const prev = i > 0 ? f.stages[i - 1]!.count : null;
            const conv = prev && s.count != null ? (s.count / prev) * 100 : null;
            const lost = prev != null && s.count != null ? prev - s.count : null;
            const w = s.count != null ? Math.max(1.5, (s.count / top) * 100) : 0;
            return (
              <li key={s.key} className="grid grid-cols-1 gap-1.5 md:grid-cols-[180px_minmax(0,1fr)_200px] md:items-center md:gap-4">
                <div className="flex items-baseline justify-between gap-2 md:block">
                  <div className="c-fg text-[13.5px] font-medium">{s.label}</div>
                  <div className="c-num c-muted text-[12.5px] md:hidden">{s.count == null ? "—" : int(s.count)}</div>
                </div>
                <div className="relative h-9 overflow-hidden rounded-[8px]" style={{ background: "var(--c-surface-2)" }}>
                  <div className="flex h-full items-center rounded-[8px] px-3 transition-[width] duration-700" style={{ width: `${w}%`, background: `color-mix(in srgb, var(--s1) ${100 - i * 11}%, var(--c-surface-3))` }}>
                    <span className="c-num hidden text-[12.5px] font-semibold text-white md:inline">{s.count == null ? "" : int(s.count)}</span>
                  </div>
                </div>
                <div className="c-num flex gap-3 text-[12px] md:justify-end">
                  {i === 0 ? <span className="c-faint">topo do funil</span> : <>
                    <span className="c-soft">{pct(conv)} avançaram</span>
                    {lost != null && lost > 0 && <span className="c-neg">−{int(lost)}</span>}
                  </>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="c-faint mt-4 text-[12px] leading-relaxed">Pesquisas contam buscas distintas salvas por conta. Checkout = abriu o pagamento na HeroPay. Assinatura paga = pagamento de plano reconhecido.</p>
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Usuários ativos por dia" description="Pessoas que pesquisaram ou falaram com a Wise, separadas pelo plano atual.">
          {activity.length
            ? <TimeChart title="Usuários ativos por plano" x="day" data={activity}
                series={plans.map((p, i) => ({ key: p, label: planLabel(p), color: PLAN_SLOT[p] ?? ((i % 4) + 1) as 1 | 2 | 3 | 4, kind: "bar" as const, stack: "a" }))} />
            : <Empty title="Sem atividade no período." />}
        </Panel>
        <Panel title="Retenção semanal por plano" description="Das contas criadas em cada semana, % que voltou a usar na semana S0, S1…">
          {f.retention.length ? (
            <div className="c-scroll -mx-4 overflow-x-auto sm:-mx-5">
              <table className="c-table min-w-[520px]">
                <thead><tr><th className="pl-4 sm:pl-5">Semana</th><th>Plano</th><th className="r">Contas</th>{Array.from({ length: maxWeeks }, (_, k) => <th key={k} className="r">S{k}</th>)}</tr></thead>
                <tbody>{f.retention.map((r) => (
                  <tr key={r.week + r.plan}>
                    <td className="pl-4 sm:pl-5 whitespace-nowrap">{new Date(`${r.week}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</td>
                    <td>{planLabel(r.plan)}</td><td className="r">{int(r.size)}</td>
                    {Array.from({ length: maxWeeks }, (_, k) => {
                      const v = r.weeks[k];
                      if (v == null) return <td key={k} className="r c-faint">·</td>;
                      const p = r.size ? (v / r.size) * 100 : 0;
                      return <td key={k} className="r" style={{ background: `color-mix(in srgb, var(--s1) ${Math.min(70, p * 1.2)}%, transparent)`, color: p > 40 ? "#fff" : undefined }}>{pct(p, 0)}</td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty title="Sem cadastros nas últimas 12 semanas do período." />}
        </Panel>
      </div>
    </>
  );
}
