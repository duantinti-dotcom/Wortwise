"use client";
import { useId, useMemo, useState } from "react";
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { bytes, cents, int, ms, pct, short } from "@/lib/control/format";

export type Unit = "cents" | "int" | "bytes" | "ms" | "pct" | "num";
const FMT: Record<Unit, (v: number) => string> = {
  cents: (v) => cents(v), int: (v) => int(v), bytes: (v) => bytes(v), ms: (v) => ms(v), pct: (v) => pct(v), num: (v) => short(v),
};
const AXIS: Record<Unit, (v: number) => string> = {
  cents: (v) => (Math.abs(v) >= 100_000 ? `R$${(v / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$${Math.round(v / 100)}`),
  int: (v) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : v.toLocaleString("pt-BR")),
  bytes: (v) => bytes(v), ms: (v) => ms(v), pct: (v) => `${v}%`, num: (v) => short(v),
};

export interface Series {
  key: string;
  label: string;
  /** Cor: 1 branco · 2 azul (destaque) · 3 verde · 4 âmbar · "prev" cinza (período anterior). */
  color: 1 | 2 | 3 | 4 | "prev";
  kind?: "area" | "line" | "bar";
  stack?: string;
}

const colorVar = (c: Series["color"]) => (c === "prev" ? "var(--s-prev)" : `var(--s${c})`);
const HEX: Record<string, string> = { 1: "#f4f4f5", 2: "#3d8bff", 3: "#34d399", 4: "#f5b84a", prev: "#52525b" };

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
      <div className="c-eyebrow mb-2">{head}</div>
      <ul className="flex flex-col gap-1.5">
        {series.map((s) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          const v = p.value as number | null;
          return (
            <li key={s.key} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-2"><span className="c-dot" style={{ background: colorVar(s.color), boxShadow: `0 0 8px ${HEX[String(s.color)]}` }} /><span className="c-soft">{s.label}</span></span>
              <span className="c-big c-fg text-[13px] font-medium">{v == null ? "—" : FMT[unit](v)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Legenda interativa: clique para mostrar/ocultar a série. */
export function Legend({ series, hidden, toggle }: { series: Series[]; hidden?: Set<string>; toggle?: (k: string) => void }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1 text-[12px]">
      {series.map((s) => (
        <li key={s.key}>
          <button type="button" className="c-legend-btn" aria-pressed={!hidden?.has(s.key)} onClick={() => toggle?.(s.key)} disabled={!toggle}>
            {s.kind === "line" || s.color === "prev"
              ? <span className="inline-block h-[2px] w-3.5 rounded" style={{ background: colorVar(s.color), boxShadow: `0 0 6px ${HEX[String(s.color)]}` }} aria-hidden />
              : <span className="c-dot" style={{ background: colorVar(s.color), boxShadow: `0 0 6px ${HEX[String(s.color)]}` }} aria-hidden />}
            <span className="c-soft">{s.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Gráfico temporal interativo (um eixo): áreas com degradê, linhas com brilho, barras arredondadas,
 * mira com tooltip, legenda que liga/desliga séries e zoom por arraste em séries longas.
 * Sempre oferece a visão em tabela.
 */
export function TimeChart({ data, x, series, unit = "int", mode = "day", height = 260, title }: {
  data: Record<string, unknown>[]; x: string; series: Series[]; unit?: Unit; mode?: "day" | "week" | "month" | "hour"; height?: number; title: string;
}) {
  const [table, setTable] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const gid = useId().replace(/:/g, "");
  const visible = series.filter((s) => !hidden.has(s.key));
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else if (n.size < series.length - 1) n.add(k); return n; });
  const hasData = data.some((d) => series.some((s) => typeof d[s.key] === "number" && (d[s.key] as number) !== 0));
  const summary = useMemo(() => {
    const totals = series.map((s) => `${s.label}: ${FMT[unit](data.reduce((a, d) => a + (typeof d[s.key] === "number" ? (d[s.key] as number) : 0), 0))}`);
    return `${title}. ${data.length} pontos. Totais — ${totals.join("; ")}.`;
  }, [data, series, unit, title]);
  const bars = visible.filter((s) => s.kind === "bar" && !s.stack).length || 1;
  const barSize = Math.max(4, Math.min(22, Math.floor(640 / Math.max(1, data.length) / bars) - 3));
  const brush = data.length > 40 && !table;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Legend series={series} hidden={hidden} toggle={toggle} />
        <button type="button" className="c-btn c-btn-ghost c-btn-icon ml-auto h-8 w-8" onClick={() => setTable((t) => !t)}
          aria-pressed={table} aria-label={table ? "Ver gráfico" : "Ver tabela"} title={table ? "Ver gráfico" : "Ver tabela"}>
          {table ? <LineIcon size={14} /> : <Table2 size={14} />}
        </button>
      </div>
      {table ? (
        <div className="c-scroll max-h-[340px] overflow-auto">
          <table className="c-table">
            <thead><tr><th>{mode === "hour" ? "Hora" : "Data"}</th>{series.map((s) => <th key={s.key} className="r">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d, i) => (
              <tr key={i}><td>{mode === "week" ? `Sem. ${xLabel(d[x], "day")}` : xLabel(d[x], mode)}</td>
                {series.map((s) => <td key={s.key} className="r">{typeof d[s.key] === "number" ? FMT[unit](d[s.key] as number) : "—"}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary} style={{ height: height + (brush ? 34 : 0) }} className="relative -ml-2">
          {!hasData && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5">
              <span className="c-eyebrow">sem movimento</span>
              <span className="c-faint text-[12px]">Nenhum registro no período selecionado.</span>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} barGap={3} barCategoryGap="22%">
              <defs>
                <filter id={`${gid}-glow`} x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HEX[String(s.color)]} stopOpacity={s.kind === "bar" ? 0.95 : 0.28} />
                    <stop offset="100%" stopColor={HEX[String(s.color)]} stopOpacity={s.kind === "bar" ? 0.35 : 0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey={x} tickLine={false} axisLine={false} minTickGap={28} tickMargin={10} tickFormatter={(v) => xLabel(v, mode)} />
              <YAxis tickLine={false} axisLine={false} width={unit === "cents" ? 64 : 46} tickFormatter={(v: number) => AXIS[unit](v)} allowDecimals={unit !== "int"} />
              <Tooltip cursor={{ stroke: "rgba(255,255,255,0.25)", strokeWidth: 1, fill: "rgba(255,255,255,0.03)" }}
                content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} unit={unit} mode={mode} series={visible} />} />
              {visible.map((s) => s.kind === "bar"
                ? <Bar key={s.key} dataKey={s.key} name={s.label} stackId={s.stack} fill={`url(#${gid}-${s.key})`} maxBarSize={22} barSize={s.stack ? undefined : barSize}
                    radius={s.stack ? [0, 0, 0, 0] : [6, 6, 2, 2]} stroke="#000" strokeWidth={s.stack ? 1 : 0}
                    activeBar={{ fill: HEX[String(s.color)], fillOpacity: 1 }} isAnimationActive animationDuration={700} animationEasing="ease-out" />
                : s.kind === "line" || s.color === "prev"
                  ? <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={colorVar(s.color)} strokeWidth={s.color === "prev" ? 1.5 : 2}
                      filter={s.color === "prev" ? undefined : `url(#${gid}-glow)`} dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#000", fill: HEX[String(s.color)] }} connectNulls isAnimationActive animationDuration={900} />
                  : <Area key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={colorVar(s.color)} strokeWidth={2} fill={`url(#${gid}-${s.key})`}
                      filter={`url(#${gid}-glow)`} stackId={s.stack}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#000", fill: HEX[String(s.color)] }} connectNulls isAnimationActive animationDuration={900} />)}
              {brush && <Brush dataKey={x} height={24} stroke="rgba(255,255,255,0.25)" fill="#0a0a0b" travellerWidth={8} tickFormatter={(v) => xLabel(v, mode)} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Sparkline com brilho para os KPIs. */
export function Spark({ values, color = 1 }: { values: number[]; color?: Series["color"] }) {
  const gid = useId().replace(/:/g, "");
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const w = 96;
  const h = 32;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / Math.max(1e-9, max - min)) * (h - 6)] as const);
  const line = pts.map(([a, b]) => `${a},${b}`).join(" ");
  const c = HEX[String(color)];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.25} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient></defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={c} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} fill={c} />
    </svg>
  );
}

/** Medidor radial (anel) para percentuais: uso do banco, conversão etc. */
export function Ring({ value, max = 100, label, sub, size = 132, tone = "auto" }: { value: number | null; max?: number; label: string; sub?: string; size?: number; tone?: "auto" | "white" }) {
  const p = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const r = size / 2 - 9;
  const len = 2 * Math.PI * r;
  const color = tone === "white" ? "#f4f4f5" : p >= 0.9 ? "#f87171" : p >= 0.7 ? "#f5b84a" : "#f4f4f5";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${len * p} ${len}`} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" role="img" aria-label={`${label}: ${value == null ? "sem dado" : pct((value / max) * 100)}`}>
        <span className="c-big text-[22px] font-semibold">{value == null ? "—" : pct((value / max) * 100, 0)}</span>
        <span className="c-eyebrow mt-0.5">{label}</span>
        {sub && <span className="c-faint mt-0.5 text-[10.5px]">{sub}</span>}
      </div>
    </div>
  );
}
