"use client";
import { useId, useMemo, useState } from "react";
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cents, int, pct } from "@/lib/control/format";
import { cn } from "@/lib/utils";

export interface MetricDef { key: string; label: string; group: string; unit: "cents" | "int"; goodWhen?: "up" | "down" }
type Row = Record<string, number | string | null>;

const COLORS = ["#f4f4f5", "#3d8bff", "#34d399", "#f5b84a"];
const fmt = (u: MetricDef["unit"], v: number) => (u === "cents" ? cents(v) : int(v));
const axis = (u: MetricDef["unit"], v: number) => (u === "cents" ? (Math.abs(v) >= 100_000 ? `R$${(v / 100_000).toFixed(1)}k` : `R$${Math.round(v / 100)}`) : Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : String(v));
const dayLabel = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

/**
 * Bancada de gráficos estilo terminal financeiro: escolha até 4 métricas, tipo de traço,
 * acumulado, média móvel de 7 dias, mira em cruz e zoom por arraste.
 */
export function StockWorkbench({ data, metrics }: { data: Row[]; metrics: MetricDef[] }) {
  const [sel, setSel] = useState<string[]>([metrics[0]!.key]);
  const [kind, setKind] = useState<"area" | "line" | "bar">("area");
  const [cum, setCum] = useState(false);
  const [ma, setMa] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const main = metrics.find((m) => m.key === sel[0])!;
  const unit = main.unit;
  const active = sel.map((k) => metrics.find((m) => m.key === k)!).filter((m) => m.unit === unit);

  const rows = useMemo(() => {
    const acc: Record<string, number> = {};
    return data.map((d, i) => {
      const r: Row = { day: d.day ?? null };
      for (const m of active) {
        const v = Number(d[m.key] ?? 0);
        acc[m.key] = (acc[m.key] ?? 0) + v;
        r[m.key] = cum ? acc[m.key]! : v;
        if (ma) {
          const win = data.slice(Math.max(0, i - 6), i + 1).map((x) => Number(x[m.key] ?? 0));
          r[`${m.key}__ma`] = cum ? null : win.reduce((a, b) => a + b, 0) / win.length;
        }
      }
      return r;
    });
  }, [data, active, cum, ma]);

  const idx = hover ?? rows.length - 1;
  const cur = Number(rows[idx]?.[main.key] ?? 0);
  const first = Number(rows.find((r) => Number(r[main.key]) !== 0)?.[main.key] ?? 0);
  const total = data.reduce((a, d) => a + Number(d[main.key] ?? 0), 0);
  const change = first ? ((cur - first) / Math.abs(first)) * 100 : null;
  const up = (change ?? 0) >= 0;
  const good = main.goodWhen === "down" ? !up : up;
  const max = Math.max(0, ...rows.map((r) => Number(r[main.key] ?? 0)));
  const avg = rows.length ? rows.reduce((a, r) => a + Number(r[main.key] ?? 0), 0) / rows.length : 0;
  const groups = [...new Set(metrics.map((m) => m.group))];

  const toggle = (k: string) => setSel((s) => {
    if (s.includes(k)) return s.length > 1 ? s.filter((x) => x !== k) : s;
    const m = metrics.find((x) => x.key === k)!;
    const same = s.filter((x) => metrics.find((y) => y.key === x)!.unit === m.unit);
    return [...(same.length === s.length ? s : [k]), ...(same.length === s.length ? [k] : [])].slice(-4);
  });

  const Tip = ({ active: on, payload, label }: TooltipContentProps<number, string>) => {
    if (!on || !payload?.length) return null;
    return (
      <div className="c-tip">
        <div className="c-eyebrow mb-2">{dayLabel(String(label))}</div>
        {active.map((m, i) => {
          const p = payload.find((x) => x.dataKey === m.key);
          return p ? (
            <div key={m.key} className="flex items-center justify-between gap-5 py-0.5">
              <span className="flex items-center gap-2"><span className="c-dot" style={{ background: COLORS[i], boxShadow: `0 0 8px ${COLORS[i]}` }} /><span className="c-soft">{m.label}</span></span>
              <span className="c-big text-[13px] font-medium">{fmt(unit, Number(p.value))}</span>
            </div>
          ) : null;
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* seletor de métricas */}
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            <span className="c-eyebrow w-24 shrink-0">{g}</span>
            {metrics.filter((m) => m.group === g).map((m) => {
              const on = sel.includes(m.key);
              const ci = sel.indexOf(m.key);
              return (
                <button key={m.key} type="button" onClick={() => toggle(m.key)} aria-pressed={on}
                  className={cn("c-badge h-7 cursor-pointer px-3 text-[12px] transition-all", on ? "border-[var(--c-line-strong)] bg-white/10 text-white" : "c-badge-neutral hover:text-white")}>
                  {on && <span className="c-dot" style={{ background: COLORS[ci], boxShadow: `0 0 8px ${COLORS[ci]}` }} />}{m.label}
                </button>
              );
            })}
          </div>
        ))}
        <p className="c-faint text-[11.5px]">Até 4 métricas da mesma unidade no mesmo gráfico (valores em R$ não se misturam com contagens).</p>
      </div>

      {/* cabeçalho estilo cotação */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-5" style={{ borderColor: "var(--c-line)" }}>
        <div>
          <div className="c-eyebrow">{main.label}{hover != null ? ` · ${dayLabel(String(rows[idx]?.day))}` : " · último dia"}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="c-big text-[44px] font-semibold leading-none sm:text-[52px]">{fmt(unit, cur)}</span>
            {change != null && (
              <span className={cn("c-badge c-num h-7 gap-1 px-2.5 text-[13px]", good ? "c-badge-good" : "c-badge-crit")}>
                {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{pct(Math.abs(change))}
              </span>
            )}
          </div>
          <div className="c-faint mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px]">
            <span>TOTAL {fmt(unit, total)}</span><span>MÁX {fmt(unit, max)}</span><span>MÉDIA {fmt(unit, avg)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="c-seg" role="group" aria-label="Tipo de gráfico">
            {([["area", "Área"], ["line", "Linha"], ["bar", "Barras"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          <div className="c-seg" role="group" aria-label="Opções">
            <button type="button" aria-pressed={cum} onClick={() => setCum((c) => !c)}>Acumulado</button>
            <button type="button" aria-pressed={ma && !cum} onClick={() => setMa((c) => !c)} disabled={cum}>Média 7d</button>
          </div>
        </div>
      </div>

      {/* gráfico */}
      <div className="-ml-2 h-[440px]" role="img" aria-label={`${main.label}: total ${fmt(unit, total)} no período`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
            onMouseMove={(s: { activeTooltipIndex?: number | string | null }) => setHover(s?.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : null)}
            onMouseLeave={() => setHover(null)}>
            <defs>
              <filter id={`${gid}-g`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              {active.map((m, i) => (
                <linearGradient key={m.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i]} stopOpacity={kind === "bar" ? 0.95 : 0.32} />
                  <stop offset="100%" stopColor={COLORS[i]} stopOpacity={kind === "bar" ? 0.3 : 0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={32} tickMargin={10} tickFormatter={(v) => dayLabel(String(v))} />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={unit === "cents" ? 66 : 48} tickFormatter={(v: number) => axis(unit, v)} />
            <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1, strokeDasharray: "3 3" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} />} />
            {!cum && avg > 0 && <ReferenceLine y={avg} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" label={{ value: "média", position: "insideTopLeft", fill: "#5c5c64", fontSize: 10 }} />}
            {active.map((m, i) => kind === "bar"
              ? <Bar key={m.key} dataKey={m.key} fill={`url(#${gid}-${i})`} radius={[5, 5, 1, 1]} maxBarSize={18} activeBar={{ fill: COLORS[i], fillOpacity: 1 }} animationDuration={600} />
              : kind === "line"
                ? <Line key={m.key} dataKey={m.key} type="monotone" stroke={COLORS[i]} strokeWidth={2} dot={false} filter={`url(#${gid}-g)`} activeDot={{ r: 5, stroke: "#000", strokeWidth: 2, fill: COLORS[i] }} animationDuration={800} />
                : <Area key={m.key} dataKey={m.key} type="monotone" stroke={COLORS[i]} strokeWidth={2} fill={`url(#${gid}-${i})`} filter={`url(#${gid}-g)`} activeDot={{ r: 5, stroke: "#000", strokeWidth: 2, fill: COLORS[i] }} animationDuration={800} />)}
            {ma && !cum && active.map((m, i) => <Line key={`${m.key}-ma`} dataKey={`${m.key}__ma`} type="monotone" stroke={COLORS[i]} strokeOpacity={0.45} strokeWidth={1.25} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />)}
            {rows.length > 20 && <Brush dataKey="day" height={26} stroke="rgba(255,255,255,0.25)" fill="#0a0a0b" travellerWidth={8} tickFormatter={(v) => dayLabel(String(v))} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="c-faint text-[11.5px]">Passe o mouse (ou o dedo) para ver cada dia. Arraste as alças da barra de baixo para dar zoom. A linha tracejada é a média móvel de 7 dias.</p>
    </div>
  );
}
