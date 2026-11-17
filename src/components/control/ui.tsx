import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed, Info, OctagonAlert, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { delta as deltaOf, isNum, pct, relative } from "@/lib/control/format";

/* ───────────── Cabeçalho de página ───────────── */
export function PageHeader({ title, description, actions, meta }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="c-h1">{title}</h1>
        {description && <p className="c-muted mt-1 max-w-[70ch] text-[13.5px] leading-relaxed">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───────────── Painel ───────────── */
export function Panel({ title, description, actions, children, footer, className, bodyClass, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; bodyClass?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("c-card c-rise flex min-w-0 flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="c-h2">{title}</h2>}
            {description && <p className="c-muted mt-0.5 text-[12.5px] leading-relaxed">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1 px-5 py-5 sm:px-6", bodyClass)}>{children}</div>
      {footer && <footer className="c-faint flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-5 py-3 font-mono text-[11px] sm:px-6" style={{ borderColor: "var(--c-line)" }}>{footer}</footer>}
    </section>
  );
}

/* ───────────── Origem do dado ───────────── */
export type Basis = "real" | "estimated" | "partial" | "unavailable" | "official";
const BASIS: Record<Basis, { label: string; cls: string; tip: string }> = {
  real: { label: "Real", cls: "c-badge-neutral", tip: "Calculado a partir de registros do banco do Worthwise." },
  official: { label: "Oficial", cls: "c-badge-info", tip: "Valor informado pela API oficial do provedor." },
  estimated: { label: "Estimado", cls: "c-badge-warn", tip: "Depende de hipóteses ou preços cadastrados; veja a nota." },
  partial: { label: "Parcial", cls: "c-badge-warn", tip: "Parte dos dados não está disponível." },
  unavailable: { label: "Indisponível", cls: "c-badge-neutral", tip: "Fonte não configurada ou fora do ar." },
};
export function BasisBadge({ basis }: { basis: Basis }) {
  const b = BASIS[basis];
  return <span className={cn("c-badge", b.cls)} title={b.tip}>{basis === "unavailable" && <CircleDashed size={11} aria-hidden />}{b.label}</span>;
}

export function Updated({ at, source }: { at: string | null | undefined; source?: string }) {
  return <span title={at ?? undefined}>{source ? `${source} · ` : ""}atualizado {relative(at)}</span>;
}

/* ───────────── KPI ───────────── */
export function Kpi({ label, value, sub, cur, prev, goodWhen = "up", basis = "real", hint, updated, className, spark }: {
  label: string; value: ReactNode; sub?: ReactNode; cur?: number | null; prev?: number | null; goodWhen?: "up" | "down" | "none";
  basis?: Basis; hint?: string; updated?: string | null; className?: string; spark?: ReactNode;
}) {
  const d = deltaOf(cur, prev);
  const up = d != null && d > 0;
  const good = d == null || goodWhen === "none" ? null : (goodWhen === "up") === up;
  return (
    <div className={cn("c-card c-lift c-rise flex min-w-0 flex-col gap-3 p-5", className)} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="c-eyebrow truncate">{label}</span>
        <BasisBadge basis={basis} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="c-big truncate text-[30px] font-semibold leading-none">{value}</div>
        {spark}
      </div>
      <div className="flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {d != null && (
          <span className={cn("c-badge c-num gap-0.5", good === null ? "c-badge-neutral" : good ? "c-badge-good" : "c-badge-crit")}>
            {up ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
            {pct(Math.abs(d), Math.abs(d) >= 100 ? 0 : 1)}
            <span className="sr-only">{up ? "acima" : "abaixo"} do período anterior</span>
          </span>
        )}
        {d == null && isNum(cur) && prev === 0 && cur > 0 && <span className="c-muted">sem base anterior</span>}
        {sub && <span className="c-muted truncate">{sub}</span>}
      </div>
      {updated !== undefined && <div className="c-faint text-[11px]"><Updated at={updated} /></div>}
    </div>
  );
}

/* ───────────── Estados (ícone + texto, nunca só cor) ───────────── */
export type Tone = "good" | "warn" | "serious" | "crit" | "neutral" | "info";
const TONE_ICON = { good: CheckCircle2, warn: AlertTriangle, serious: ShieldAlert, crit: OctagonAlert, neutral: CircleDashed, info: Info };
export function Status({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const Icon = TONE_ICON[tone];
  return <span className={cn("c-badge", `c-badge-${tone}`, className)}><Icon size={12} aria-hidden />{children}</span>;
}

export const SEVERITY: Record<string, { tone: Tone; label: string }> = {
  critical: { tone: "crit", label: "Crítica" }, high: { tone: "serious", label: "Alta" }, medium: { tone: "warn", label: "Média" },
  low: { tone: "neutral", label: "Baixa" }, info: { tone: "info", label: "Info" },
};
export const PRIORITY: Record<string, Tone> = { P1: "crit", P2: "serious", P3: "warn", P4: "neutral" };

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = TONE_ICON[tone];
  const bg = tone === "neutral" ? "rgb(255 255 255 / 0.03)" : tone === "info" ? "var(--info-bg)" : `var(--${tone === "crit" ? "crit" : tone === "warn" ? "warn" : tone === "serious" ? "serious" : "good"}-bg)`;
  const fg = tone === "neutral" ? "var(--c-muted)" : tone === "info" ? "var(--c-fg)" : `var(--${tone === "crit" ? "crit" : tone === "warn" ? "warn" : tone === "serious" ? "serious" : "good"})`;
  return (
    <div role={tone === "crit" ? "alert" : "note"} className={cn("flex gap-3 rounded-[16px] border px-4 py-3.5 text-[13px] leading-relaxed", className)}
      style={{ background: bg, borderColor: "var(--c-line)" }}>
      <Icon size={16} className="mt-[2px] shrink-0" style={{ color: fg }} aria-hidden />
      <div className="min-w-0">
        {title && <div className="c-fg font-medium">{title}</div>}
        {children && <div className="c-soft">{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      <CircleDashed size={20} className="c-faint" aria-hidden />
      <div className="c-soft text-[13.5px] font-medium">{title}</div>
      {children && <div className="c-muted max-w-[46ch] text-[12.5px] leading-relaxed">{children}</div>}
    </div>
  );
}

/* ───────────── Medidor ───────────── */
export function Meter({ value, max, label, warnAt = 70, critAt = 90 }: { value: number; max: number; label?: string; warnAt?: number; critAt?: number }) {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  const color = p >= critAt ? "var(--crit)" : p >= warnAt ? "var(--warn)" : "#f4f4f5";
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--c-surface-3)" }}>
      <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${p}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
    </div>
  );
}

/* ───────────── Barras horizontais ranqueadas (HTML) ───────────── */
export function RankBars({ rows, format = (n) => n.toLocaleString("pt-BR"), color = "#f4f4f5", empty = "Sem dados no período." }: {
  rows: { label: ReactNode; value: number; hint?: ReactNode }[]; format?: (n: number) => string; color?: string; empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty title={empty} />;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className="c-soft truncate">{r.label}</span>
          <span className="c-big c-fg text-right font-medium">{format(r.value)}{r.hint && <span className="c-faint ml-1.5 font-normal">{r.hint}</span>}</span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}>
            <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, transparent, ${color})`, boxShadow: `0 0 10px ${color}`, minWidth: r.value > 0 ? 3 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Barra segmentada (um todo em partes) ───────────── */
export function SegmentBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <Empty title="Sem dados." />;
  return (
    <div>
      <div className="flex h-9 w-full gap-[3px] overflow-hidden rounded-[12px]" role="img"
        aria-label={parts.map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`).join("; ")}>
        {parts.filter((p) => p.value > 0).map((p) => {
          const share = (p.value / total) * 100;
          return (
            <div key={p.label} className="flex h-full items-center px-2.5 font-mono text-[11.5px] font-semibold" style={{ width: `${share}%`, background: p.color, minWidth: 4, color: p.color.includes("prev") ? "#fff" : "#000", borderRadius: 6 }}
              title={`${p.label}: ${p.value.toLocaleString("pt-BR")} (${share.toFixed(1)}%)`}>
              {share >= 12 ? `${Math.round(share)}%` : ""}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="c-dot" style={{ background: p.color }} aria-hidden />
            <span className="c-soft">{p.label}</span>
            <span className="c-num c-muted">{p.value.toLocaleString("pt-BR")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Lista definição (chave/valor) ───────────── */
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="c-divide text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2">
          <dt className="c-muted">{k}</dt>
          <dd className="c-num c-fg min-w-0 truncate text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Grid({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4 | 6; className?: string }) {
  const map = { 2: "lg:grid-cols-2", 3: "md:grid-cols-2 xl:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4", 6: "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" };
  return <div className={cn("grid grid-cols-1 gap-3 sm:gap-4", map[cols], className)}>{children}</div>;
}
