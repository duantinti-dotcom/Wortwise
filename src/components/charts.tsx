"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatMoney } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "var(--chart-axis)" };
const money0 = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs">
      <div className="mb-1.5 text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-1.5 rounded-full" style={{ background: r.color ?? "#ff7900" }} />{r.label}
          </span>
          <span className="tabular font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface HistoryPoint { date: string; price: number; offersCount?: number | null }

/** Evolução de preço — somente observações reais armazenadas. */
export function PriceHistoryChart({ data, height = 260 }: { data: HistoryPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, t: new Date(d.date).getTime() }));
  const prices = rows.map((r) => r.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max((max - min) * 0.15, max * 0.02, 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ww-price" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff7900" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#ff7900" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgb(var(--tint) / 0.06)" vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={AXIS} tickLine={false} axisLine={false}
          tickFormatter={(t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} minTickGap={40} />
        <YAxis domain={[Math.max(0, min - pad), max + pad]} tick={AXIS} tickLine={false} axisLine={false} width={78} tickFormatter={money0} />
        <Tooltip cursor={{ stroke: "rgb(var(--tint) / 0.18)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (HistoryPoint & { t: number }) | undefined;
            if (!active || !p) return null;
            return <TipBox title={formatDate(p.date, true)} rows={[{ label: "Preço", value: formatMoney(p.price) },
              ...(p.offersCount != null ? [{ label: "Ofertas", value: String(p.offersCount), color: "var(--muted)" }] : [])]} />;
          }} />
        <Area type="stepAfter" dataKey="price" stroke="#ff7900" strokeWidth={2} fill="url(#ww-price)" dot={rows.length < 30 ? { r: 2.5, fill: "#ff7900", strokeWidth: 0 } : false}
          activeDot={{ r: 4, fill: "#ff7900", stroke: "var(--bg)", strokeWidth: 2 }} animationDuration={900} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Lucro em função do preço de venda. */
export function ProfitCurveChart({ data, current, height = 220 }: { data: { price: number; profit: number }[]; current: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgb(var(--tint) / 0.06)" vertical={false} />
        <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money0} minTickGap={36} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={78} tickFormatter={money0} />
        <ReferenceLine y={0} stroke="rgba(242,95,92,0.55)" strokeDasharray="4 4" />
        {current > 0 ? <ReferenceLine x={current} stroke="rgb(var(--tint) / 0.3)" strokeDasharray="3 3" /> : null}
        <Tooltip cursor={{ stroke: "rgb(var(--tint) / 0.18)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { price: number; profit: number } | undefined;
            if (!active || !p) return null;
            return <TipBox title={`Vendendo a ${formatMoney(p.price)}`} rows={[{ label: "Lucro do lote", value: formatMoney(p.profit), color: p.profit >= 0 ? "#3ecf8e" : "#f25f5c" }]} />;
          }} />
        <Line type="monotone" dataKey="profit" stroke="#ff7900" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: "#ff7900", stroke: "var(--bg)", strokeWidth: 2 }} animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais simples (comparações de preço, canais, fornecedores). */
export function CompareBars({ data, height, positiveNegative }: { data: { name: string; value: number; highlight?: boolean }[]; height?: number; positiveNegative?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(72, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 84, left: 0, bottom: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide domain={positiveNegative ? ["dataMin", "dataMax"] : [0, "dataMax"]} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "var(--soft)", fontSize: 12 }} tickLine={false} axisLine={false} width={150} />
        <Tooltip cursor={{ fill: "rgb(var(--tint) / 0.04)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { name: string; value: number } | undefined;
            if (!active || !p) return null;
            return <TipBox title={p.name} rows={[{ label: "Valor", value: formatMoney(p.value) }]} />;
          }} />
        <Bar dataKey="value" radius={[6, 6, 6, 6]} animationDuration={600} maxBarSize={26}>
          {data.map((d) => (
            <Cell key={d.name} fill={positiveNegative ? (d.value >= 0 ? (d.highlight ? "#3ecf8e" : "rgba(62,207,142,0.45)") : "rgba(242,95,92,0.6)") : d.highlight ? "#ff7900" : "rgba(255,121,0,0.35)"} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v: unknown) => formatMoney(Number(v))} style={{ fill: "var(--soft)", fontSize: 12, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras verticais de contagem (distribuição de preços). */
export function CountBars({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgb(var(--tint) / 0.06)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgb(var(--tint) / 0.04)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { name: string; value: number } | undefined;
            if (!active || !p) return null;
            return <TipBox title={p.name} rows={[{ label: "Anúncios", value: String(p.value) }]} />;
          }} />
        <Bar dataKey="value" fill="#ff7900" radius={[5, 5, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}
