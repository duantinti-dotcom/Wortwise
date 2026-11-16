"use client";
import { useId, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { bytes, cents, int, ms, pct, short } from "@/lib/control/format";

export type Unit = "cents" | "int" | "bytes" | "ms" | "pct" | "num";
const FMT: Record<Unit, (v: number) => string> = {
  cents: (v) => cents(v), int: (v) => int(v), bytes: (v) => bytes(v), ms: (v) => ms(v), pct: (v) => pct(v), num: (v) => short(v),
};
const AXIS: Record<Unit, (v: number) => string> = {
  cents: (v) => (Math.abs(v) >= 1_000_000 ? `R$${(v / 100_000).toFixed(0)}k` : Math.abs(v) >= 100_000 ? `R$${(v / 100_000).toFixed(1)}k` : `R$${Math.round(v / 100)}`),
  int: (v) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : v.toLocaleString("pt-BR")),
  bytes: (v) => bytes(v), ms: (v) => ms(v), pct: (v) => `${v}%`, num: (v) => short(v),
};

export interface Series {
  key: string;
  label: string;
  /** Índice da cor categórica (1–4) ou "prev" para o período anterior. */
  color: 1 | 2 | 3 | 4 | "prev";
  kind?: "area" | "line" | "bar";
  stack?: string;
}

const colorVar = (c: Series["color"]) => (c === "prev" ? "var(--s-prev)" : `var(--s${c})`);

function xLabel(v: unknown, mode: "day" | "week" | "month" | "hour") {
  const s = String(v);
  if (mode === "hour") {
    if (/^\d{1,2}$/.test(s)) return `${s.padStart(2, "0")}h`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit", timeZone: "America/Sao_Paulo" }) + "h";
  }
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  if (mode === "month") return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function Tip({ active, payload, label, unit, mode, series }: TooltipContentProps<number, string> & { unit: Unit; mode: "day" | "week" | "month" | "hour"; series: Series[] }) {
  if (!active || !payload?.length) return null;
  const head = mode === "week" ? `Semana de ${xLabel(label, "day")}` : xLabel(label, mode);
  return (
    <div className="c-tip">
      <div className="c-muted mb-1.5 text-[11.5px]">{head}</div>
      <ul className="flex flex-col gap-1">
        {series.map((s) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          const v = p.value as number | null;
          return (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5"><span className="c-dot" style={{ background: colorVar(s.color) }} /> <span className="c-soft">{s.label}</span></span>
              <span className="c-num c-fg font-medium">{v == null ? "—" : FMT[unit](v)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          {s.kind === "line" || s.color === "prev"
            ? <span className="inline-block h-[2px] w-3.5 rounded" style={{ background: colorVar(s.color) }} aria-hidden />
            : <span className="c-dot" style={{ background: colorVar(s.color) }} aria-hidden />}
          <span className="c-soft">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Gráfico temporal único (um eixo). Área/linha/barras combináveis; o período anterior é uma linha cinza.
 * Sempre oferece a visão em tabela.
 */
export function TimeChart({ data, x, series, unit = "int", mode = "day", height = 240, title }: {
  data: Record<string, unknown>[]; x: string; series: Series[]; unit?: Unit; mode?: "day" | "week" | "month" | "hour"; height?: number; title: string;
}) {
  const [table, setTable] = useState(false);
  const gid = useId().replace(/:/g, "");
  const hasData = data.some((d) => series.some((s) => typeof d[s.key] === "number" && (d[s.key] as number) !== 0));
  const summary = useMemo(() => {
    const totals = series.map((s) => `${s.label}: ${FMT[unit](data.reduce((a, d) => a + (typeof d[s.key] === "number" ? (d[s.key] as number) : 0), 0))}`);
    return `${title}. ${data.length} pontos. Totais — ${totals.join("; ")}.`;
  }, [data, series, unit, title]);
  const barSize = Math.max(4, Math.min(24, Math.floor(600 / Math.max(1, data.length) / Math.max(1, series.filter((s) => s.kind === "bar" && !s.stack).length || 1)) - 2));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Legend series={series} />
        <button type="button" className="c-btn c-btn-ghost c-btn-icon ml-auto h-7 w-7" onClick={() => setTable((t) => !t)}
          aria-pressed={table} aria-label={table ? "Ver gráfico" : "Ver tabela"} title={table ? "Ver gráfico" : "Ver tabela"}>
          {table ? <LineIcon size={14} /> : <Table2 size={14} />}
        </button>
      </div>
      {table ? (
        <div className="c-scroll max-h-[320px] overflow-auto">
          <table className="c-table">
            <thead><tr><th>{mode === "hour" ? "Hora" : "Data"}</th>{series.map((s) => <th key={s.key} className="r">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d, i) => (
              <tr key={i}><td>{mode === "week" ? `Sem. ${xLabel(d[x], "day")}` : xLabel(d[x], mode)}</td>
                {series.map((s) => <td key={s.key} className="r">{typeof d[s.key] === "number" ? FMT[unit](d[s.key] as number) : "—"}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary} style={{ height }} className="relative -ml-2">
          {!hasData && <div className="c-faint absolute inset-0 z-10 flex items-center justify-center text-[12.5px]">Sem movimento no período.</div>}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="18%">
              <defs>
                {series.filter((s) => s.kind === "area" || !s.kind).map((s) => (
                  <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorVar(s.color)} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={colorVar(s.color)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={x} tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} tickFormatter={(v) => xLabel(v, mode)} />
              <YAxis tickLine={false} axisLine={false} width={unit === "cents" ? 62 : 44} tickFormatter={(v: number) => AXIS[unit](v)} allowDecimals={unit !== "int"} />
              <Tooltip cursor={{ stroke: "var(--c-line-strong)", strokeWidth: 1, fill: "var(--c-surface-2)", fillOpacity: 0.5 }}
                content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} unit={unit} mode={mode} series={series} />} />
              {series.map((s) => s.kind === "bar"
                ? <Bar key={s.key} dataKey={s.key} name={s.label} stackId={s.stack} fill={colorVar(s.color)} maxBarSize={24} barSize={s.stack ? undefined : barSize}
                    radius={s.stack ? [0, 0, 0, 0] : [4, 4, 0, 0]} stroke="var(--c-surface)" strokeWidth={s.stack ? 1 : 0} isAnimationActive animationDuration={500} />
                : s.kind === "line" || s.color === "prev"
                  ? <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={colorVar(s.color)} strokeWidth={2} dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--c-surface)" }} connectNulls isAnimationActive animationDuration={500} />
                  : <Area key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={colorVar(s.color)} strokeWidth={2} fill={`url(#${gid}-${s.key})`}
                      stackId={s.stack} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--c-surface)" }} connectNulls isAnimationActive animationDuration={500} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Sparkline (tendência) para KPIs: só a forma, sem eixos. */
export function Spark({ values, color = 1 }: { values: number[]; color?: Series["color"] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const w = 72;
  const h = 26;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / Math.max(1e-9, max - min)) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke={colorVar(color)} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
