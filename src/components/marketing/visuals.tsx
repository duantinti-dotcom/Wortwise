import { ArrowDownRight, Bell, Check, Search, Sparkles, Star } from "lucide-react";
import type { ReactNode } from "react";
import { ScoreRing } from "@/components/score-ring";
import { cn } from "@/lib/utils";

/** Componentes de DEMONSTRAÇÃO da landing. Todos os valores são ilustrativos e identificados como tal. */
export function DemoTag({ className }: { className?: string }) {
  return <span className={cn("badge !h-[22px] !text-[11px]", className)}>Demonstração · dados ilustrativos</span>;
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/70 px-3.5 py-3", className)}>{children}</div>;
}

const Thumb = ({ tone = "#2a2a2a" }: { tone?: string }) => (
  <span className="size-10 shrink-0 rounded-lg border border-line" style={{ background: `linear-gradient(135deg, ${tone}, #151515)` }} />
);

export function SparkPath({ className, animated = true }: { className?: string; animated?: boolean }) {
  const d = "M0 78 C 30 70, 46 84, 74 66 S 118 58, 146 62 S 190 30, 222 40 S 268 52, 296 26 S 344 20, 380 8";
  return (
    <svg viewBox="0 0 380 96" className={cn("w-full", className)} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7900" stopOpacity="0.28" /><stop offset="1" stopColor="#ff7900" stopOpacity="0" /></linearGradient></defs>
      {[24, 48, 72].map((y) => <line key={y} x1="0" x2="380" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />)}
      <path d={`${d} L 380 96 L 0 96 Z`} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke="#ff7900" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        style={animated ? { strokeDasharray: 600, ["--len" as string]: 600 } : undefined} className={animated ? "animate-draw" : undefined} />
    </svg>
  );
}

export function VisualSearch() {
  return (
    <div className="space-y-2.5">
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-line-strong bg-surface-2 px-3.5 text-sm text-muted"><Search size={16} /> fone bluetooth para revender</div>
      {[["Produto de exemplo A", "R$ 00,00", "#3a2a1a"], ["Produto de exemplo B", "R$ 00,00", "#1f2a33"], ["Produto de exemplo C", "R$ 00,00", "#2a2233"]].map(([t, p, tone]) => (
        <Row key={t}><span className="flex min-w-0 items-center gap-3"><Thumb tone={tone} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{t}</span>
          <span className="flex items-center gap-1 text-xs text-muted"><Star size={11} className="fill-brand text-brand" /> avaliação · fonte · data da coleta</span></span></span>
          <span className="tabular text-sm font-medium">{p}</span></Row>
      ))}
    </div>
  );
}

export function VisualCompare() {
  const rows = [["Fornecedor 1", "Verificação documental realizada", 62, true], ["Fornecedor 2", "Fornecedor ainda não verificado", 78, false], ["Fornecedor 3", "Informações insuficientes", 100, false]] as const;
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between text-xs text-muted"><span>Custo final por unidade</span><span>preço + frete + impostos</span></div>
      {rows.map(([n, s, w, best]) => (
        <div key={n} className={cn("rounded-xl border px-3.5 py-3", best ? "border-brand/40 bg-brand/6" : "border-line bg-surface-2/70")}>
          <div className="flex items-center justify-between text-sm"><span className="font-medium">{n}</span>{best ? <span className="badge badge-brand !h-5 !text-[11px]">menor custo total</span> : null}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6"><div className={cn("h-full rounded-full", best ? "bg-brand" : "bg-white/30")} style={{ width: `${w}%` }} /></div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">{best ? <Check size={12} className="text-pos" /> : null}{s}</div>
        </div>
      ))}
    </div>
  );
}

export function VisualChart() {
  return (
    <div>
      <div className="flex items-end justify-between"><div><div className="text-xs text-muted">Preço observado</div><div className="tabular text-2xl font-semibold tracking-tight">R$ 00,00</div></div>
        <div className="flex gap-1">{["7d", "30d", "90d", "365d"].map((r, i) => <span key={r} className={cn("rounded-md px-2 py-1 text-[11px]", i === 1 ? "bg-surface-3 text-fg" : "text-faint")}>{r}</span>)}</div></div>
      <SparkPath className="mt-4 h-28" />
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">{["Menor", "Maior", "Variação"].map((l) => <div key={l} className="rounded-lg border border-line bg-surface-2/70 px-2.5 py-2"><div className="text-faint">{l}</div><div className="tabular mt-0.5 font-medium">—</div></div>)}</div>
    </div>
  );
}

export function VisualCalc() {
  return (
    <div>
      <div className="text-xs text-muted">Lucro estimado do lote</div>
      <div className="tabular text-3xl font-semibold tracking-tight text-pos">R$ 0.000,00</div>
      <div className="mt-4 space-y-2.5">
        {[["Produto", 86], ["Comissão do marketplace", 48], ["Frete de venda", 32], ["Impostos", 22], ["Publicidade", 16]].map(([l, w]) => (
          <div key={l} className="flex items-center gap-3 text-xs"><span className="w-40 shrink-0 text-muted">{l}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/6"><span className="block h-full rounded-full bg-white/35" style={{ width: `${w}%` }} /></span></div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">{["Conservador", "Base", "Otimista"].map((s, i) => <div key={s} className={cn("rounded-lg border py-2", i === 1 ? "border-brand/40 bg-brand/6 text-fg" : "border-line text-muted")}>{s}</div>)}</div>
    </div>
  );
}

export function VisualWatch() {
  return (
    <div className="space-y-2.5">
      <Row><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-brand/12 text-brand-hi"><Bell size={16} /></span>
        <span><span className="block text-sm font-medium">Avise quando o preço cair abaixo do alvo</span><span className="text-xs text-muted">regra ativa · verificação periódica</span></span></span></Row>
      <Row className="border-pos/25 bg-pos/6"><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-pos/12 text-pos"><ArrowDownRight size={16} /></span>
        <span><span className="block text-sm font-medium">Preço abaixo do alvo</span><span className="text-xs text-muted">alerta gerado a partir de uma observação real</span></span></span></Row>
      <Row><span className="text-sm text-muted">Histórico de alertas</span><span className="text-xs text-faint">nada inventado: só o que foi observado</span></Row>
    </div>
  );
}

export function VisualAssistant() {
  return (
    <div className="space-y-3">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-3.5 py-2.5 text-sm">Vale a pena vender isso no Mercado Livre?</div>
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface-2/70 px-3.5 py-3 text-sm leading-relaxed text-muted">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand-hi"><Sparkles size={13} /> Assistente Worthwise</div>
        Conclusão primeiro, depois os pontos que a sustentam — com <span className="text-fg">fonte e data da coleta</span>, cálculo de margem e os riscos.
        <div className="mt-3 flex flex-wrap gap-1.5"><span className="badge !h-5 !text-[11px]">Fonte: marketplace</span><span className="badge !h-5 !text-[11px]">Cálculo de lucro</span><span className="badge !h-5 !text-[11px]">Riscos</span></div>
      </div>
    </div>
  );
}

/** Composição do hero: janela da plataforma + celular. Demonstração ilustrativa. */
export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,121,0,0.16),transparent)]" />
      <div className="card overflow-hidden !rounded-2xl !border-line-strong shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
          <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-white/12" />)}</span>
          <span className="mx-auto flex h-7 w-[58%] items-center gap-2 rounded-lg border border-line bg-ink/60 px-3 text-xs text-faint"><Search size={12} /> fone bluetooth</span>
        </div>
        <div className="grid grid-cols-[1fr] gap-4 p-4 sm:grid-cols-[1.25fr_1fr] sm:p-5">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4">
            <div className="flex items-center justify-between"><span className="text-xs text-muted">Evolução de preço</span><span className="text-[11px] text-faint">30 dias</span></div>
            <SparkPath className="mt-3 h-24 sm:h-32" />
            <div className="mt-3 flex gap-2 text-[11px] text-muted"><span className="rounded-md bg-white/5 px-2 py-1">Ofertas comparáveis</span><span className="rounded-md bg-white/5 px-2 py-1">Concorrência</span></div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
              <ScoreRing value={82} size={76} />
              <div><div className="text-sm font-medium">Worthwise Score</div><div className="mt-0.5 text-xs leading-relaxed text-muted">Confiança: moderada</div></div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/50 p-4">
              <div className="text-xs text-muted">Margem estimada</div>
              <div className="tabular mt-1 text-2xl font-semibold tracking-tight text-pos">24,0%</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/6"><div className="h-full w-[62%] rounded-full bg-pos/80" /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-20 -right-2 hidden w-[180px] rounded-[26px] border border-line-strong bg-surface p-2.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.95)] sm:block lg:-right-14">
        <div className="rounded-[18px] border border-line bg-ink p-3.5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/12" />
          <div className="text-[11px] text-muted">Lucro por unidade</div>
          <div className="tabular text-xl font-semibold tracking-tight text-pos">R$ 13,70</div>
          <div className="mt-3 space-y-1.5">{[70, 44, 28].map((w) => <div key={w} className="h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full bg-brand/80" style={{ width: `${w}%` }} /></div>)}</div>
          <div className="mt-3 rounded-lg bg-brand py-1.5 text-center text-[11px] font-semibold text-black">Salvar simulação</div>
        </div>
      </div>
      <DemoTag className="absolute -bottom-10 left-0 sm:-bottom-9" />
    </div>
  );
}
