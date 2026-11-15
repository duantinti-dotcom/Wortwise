import { ArrowDownRight, BadgeCheck, BarChart3, Bell, Bookmark, Calculator, Headphones, Home, Lamp, MessagesSquare, Scale, Search, Sparkles, Star, Store, TrendingDown, Watch } from "lucide-react";
import type { ReactNode } from "react";
import { ScoreRing } from "@/components/score-ring";
import { BorderBeam } from "@/components/ui/fx";
import { cn } from "@/lib/utils";

/**
 * Componentes de DEMONSTRAÇÃO da landing. Produtos, preços e notas são ilustrativos
 * (não vêm de marketplaces) e a seção sempre exibe o selo "Demonstração · dados ilustrativos".
 */
export function DemoTag({ className }: { className?: string }) {
  return <span className={cn("badge !h-[24px] !text-[11px]", className)}><span className="size-1.5 rounded-full bg-brand" />Demonstração · dados ilustrativos</span>;
}

const PRODUCTS = [
  { name: "Fone Bluetooth TWS", price: "R$ 58,90", rating: "4,7", icon: Headphones, tone: "from-brand/20 to-brand/5", color: "text-brand-hi" },
  { name: "Smartwatch esportivo", price: "R$ 129,00", rating: "4,5", icon: Watch, tone: "from-sky-500/20 to-sky-500/5", color: "text-sky-500" },
  { name: "Luminária de mesa LED", price: "R$ 74,50", rating: "4,8", icon: Lamp, tone: "from-violet-500/20 to-violet-500/5", color: "text-violet-500" },
];

function Thumb({ p, size = "size-10" }: { p: (typeof PRODUCTS)[number]; size?: string }) {
  return <span className={cn("flex shrink-0 items-center justify-center rounded-xl border border-tint/10 bg-gradient-to-br", p.tone, size)}><p.icon size={18} className={p.color} /></span>;
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between gap-2.5 rounded-xl border border-tint/8 bg-tint/[0.035] px-3 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3", className)}>{children}</div>;
}

export function SparkPath({ className, animated = true, id = "spark" }: { className?: string; animated?: boolean; id?: string }) {
  const d = "M0 70 C 26 64, 40 78, 66 62 S 104 50, 130 56 S 168 30, 196 38 S 236 52, 262 30 S 318 26, 340 14 S 366 12, 380 6";
  return (
    <svg viewBox="0 0 380 96" className={cn("w-full overflow-visible", className)} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B82F6" stopOpacity="0.35" /><stop offset="1" stopColor="#3B82F6" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3B82F6" stopOpacity="0.5" /><stop offset="1" stopColor="#22D3EE" /></linearGradient>
      </defs>
      {[24, 48, 72].map((y) => <line key={y} x1="0" x2="380" y1={y} y2={y} stroke="rgb(var(--tint) / 0.05)" strokeDasharray="3 5" />)}
      <path d={`${d} L 380 96 L 0 96 Z`} fill={`url(#${id}-fill)`} />
      <path d={d} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        style={animated ? { strokeDasharray: 640, ["--len" as string]: 640 } : undefined} className={animated ? "animate-draw" : undefined} />
    </svg>
  );
}

export function VisualSearch() {
  return (
    <div className="space-y-2.5">
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-tint/12 bg-tint/[0.05] px-3.5 text-sm text-fg"><Search size={16} className="text-brand" /> fone bluetooth para revender<span className="ml-auto kbd">↵</span></div>
      {PRODUCTS.map((p, i) => (
        <Row key={p.name} className={i === 0 ? "border-brand/30 bg-brand/[0.06]" : undefined}>
          <span className="flex min-w-0 items-center gap-3"><Thumb p={p} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted"><Star size={11} className="shrink-0 fill-brand text-brand" /> {p.rating}<span className="hidden sm:inline"> · fonte e data da coleta</span></span></span></span>
          <span className="tabular shrink-0 whitespace-nowrap text-sm font-semibold">{p.price}</span>
        </Row>
      ))}
    </div>
  );
}

export function VisualCompare() {
  const rows = [["Fornecedor A", "R$ 13,00", 58, true, "Verificação documental realizada"], ["Fornecedor B", "R$ 14,20", 70, false, "Ainda não verificado"], ["Fornecedor C", "R$ 16,00", 92, false, "Informações insuficientes"]] as const;
  return (
    <div className="space-y-2.5">
      {rows.map(([n, v, w, best, s]) => (
        <div key={n} className={cn("rounded-xl border px-3.5 py-3", best ? "border-brand/40 bg-brand/[0.07]" : "border-tint/8 bg-tint/[0.03]")}>
          <div className="flex items-start justify-between gap-2 text-sm"><span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium"><span className="whitespace-nowrap">{n}</span>{best ? <span className="badge badge-brand !h-5 !text-[10.5px]">menor custo total</span> : null}</span><span className="tabular whitespace-nowrap font-semibold">{v}<span className="text-xs font-normal text-faint"> /un</span></span></div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-tint/8"><div className={cn("h-full rounded-full", best ? "bg-gradient-to-r from-brand to-brand-hi" : "bg-tint/30")} style={{ width: `${w}%` }} /></div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">{best ? <BadgeCheck size={13} className="text-pos" /> : null}{s}</div>
        </div>
      ))}
    </div>
  );
}

export function VisualChart({ id = "vc" }: { id?: string }) {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div><div className="text-xs text-muted">Preço observado</div><div className="flex items-baseline gap-2"><span className="tabular text-2xl font-semibold tracking-tight">R$ 58,90</span><span className="badge badge-pos !h-5 !text-[11px]"><TrendingDown size={11} /> 6,2%</span></div></div>
        <div className="flex gap-1 rounded-lg bg-tint/[0.05] p-0.5">{["7d", "30d", "90d"].map((r, i) => <span key={r} className={cn("rounded-md px-2 py-1 text-[11px]", i === 1 ? "bg-tint/12 text-fg" : "text-faint")}>{r}</span>)}</div>
      </div>
      <SparkPath id={id} className="mt-4 h-28" />
    </div>
  );
}

export function VisualCalc() {
  return (
    <div>
      <div className="flex items-end justify-between"><div><div className="text-xs text-muted">Lucro estimado do lote</div><div className="tabular text-3xl font-semibold tracking-tight text-pos">R$ 1.370,00</div></div>
        <div className="text-right"><div className="text-xs text-muted">Margem</div><div className="tabular text-lg font-semibold">22,8%</div></div></div>
      <div className="mt-4 space-y-2.5">
        {[["Produto", 86, "R$ 2.000"], ["Comissão", 44, "R$ 720"], ["Frete de venda", 32, "R$ 500"], ["Impostos", 24, "R$ 360"]].map(([l, w, v]) => (
          <div key={l} className="flex items-center gap-3 text-xs"><span className="w-24 shrink-0 text-muted">{l}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint/8"><span className="block h-full rounded-full bg-tint/35" style={{ width: `${w}%` }} /></span><span className="tabular w-16 text-right text-fg">{v}</span></div>
        ))}
      </div>
    </div>
  );
}

export function VisualWatch() {
  return (
    <div className="space-y-2.5">
      <Row><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-brand/15 text-brand-hi"><Bell size={16} /></span>
        <span><span className="block text-sm font-medium">Avisar abaixo de R$ 55,00</span><span className="text-xs text-muted">regra ativa · verificado há 2 h</span></span></span><span className="size-2 rounded-full bg-pos animate-pulse-ring" /></Row>
      <Row className="border-pos/25 bg-pos/[0.07]"><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-pos/15 text-pos"><ArrowDownRight size={16} /></span>
        <span><span className="block text-sm font-medium">Preço abaixo do alvo</span><span className="text-xs text-muted">caiu de R$ 58,90 para R$ 53,40</span></span></span><span className="text-[11px] text-faint">agora</span></Row>
    </div>
  );
}

export function VisualAssistant() {
  return (
    <div className="space-y-3">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-tint/10 px-3.5 py-2.5 text-sm">Vale a pena vender isso no Mercado Livre?</div>
      <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-tint/8 bg-tint/[0.035] px-3.5 py-3 text-sm leading-relaxed text-muted">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand-hi"><Sparkles size={13} /> Assistente Worthwise</div>
        <span className="text-fg">Vale, com ressalvas.</span> A margem simulada fica em 22,8% e o preço está 6% abaixo da mediana, mas há 34 ofertas concorrentes.
        <div className="mt-3 flex flex-wrap gap-1.5"><span className="badge !h-5 !text-[10.5px]">Fonte: Mercado Livre · hoje</span><span className="badge !h-5 !text-[10.5px]">Cálculo de lucro</span><span className="badge !h-5 !text-[10.5px]">3 riscos</span></div>
      </div>
    </div>
  );
}

const SIDE = [[Home, "Início", true], [Search, "Descobrir"], [Store, "Fornecedores"], [Scale, "Comparar"], [BarChart3, "Mercado"], [Calculator, "Calculadora"], [Bell, "Monitoramento"], [MessagesSquare, "Assistente"], [Bookmark, "Favoritos"]] as const;

/** Composição do hero: a plataforma numa janela de vidro, com cartões flutuantes. Demonstração ilustrativa. */
export function HeroPreview({ widget }: { widget?: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[1120px]">
      <div className="relative">
        <div className="lg glass-strong relative overflow-hidden rounded-2xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)]">
          <BorderBeam />
          <div aria-hidden className="beam absolute inset-x-10 top-0 z-10 h-px opacity-80" />
          <div className="flex items-center gap-2 border-b border-tint/10 px-4 py-3">
            <span className="flex gap-1.5">{["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} className="size-2.5 rounded-full opacity-80" style={{ background: c }} />)}</span>
            <span className="mx-auto flex h-7 w-[46%] items-center justify-center gap-2 rounded-lg border border-tint/10 bg-tint/5 px-3"><span className="live-dot !size-1.5" /><span className="mono-label truncate !text-[10px] !text-muted">app.worthwise<span className="hidden sm:inline"> / produto</span></span></span>
            <DemoTag className="hidden md:inline-flex" />
          </div>
          <div className="grid md:grid-cols-[184px_1fr]">
            <aside className="hidden border-r border-tint/10 p-3 md:block">
              {SIDE.map(([Icon, label, on]) => (
                <div key={label} className={cn("flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px]", on ? "bg-tint/12 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-muted")}><Icon size={14} className={on ? "text-brand" : "text-faint"} />{label}</div>
              ))}
            </aside>
            <div className="p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Thumb p={PRODUCTS[0]!} size="size-12" />
                <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">Fone Bluetooth TWS com estojo de carga</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted"><span className="flex items-center gap-1"><Star size={11} className="fill-brand text-brand" /> 4,7 · 1.284 avaliações</span><span className="hidden sm:inline">34 ofertas concorrentes</span><span className="mono-label hidden !text-[10px] md:inline">coletado há 12 min</span></div></div>
                <span className="btn btn-primary btn-sm pointer-events-none"><Bell size={13} /> Monitorar</span>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <div className="rounded-2xl border border-tint/10 bg-tint/[0.04] p-4"><VisualChart id="hero" />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">{[["Menor", "R$ 52,00"], ["Mediana", "R$ 62,70"], ["Maior", "R$ 89,90"]].map(([l, v]) => <div key={l} className="rounded-lg bg-tint/[0.05] px-2.5 py-2"><div className="text-faint">{l}</div><div className="tabular mt-0.5 font-medium">{v}</div></div>)}</div>
                </div>
                <div className="hidden flex-col gap-4 sm:flex">
                  <div className="rounded-2xl border border-tint/10 bg-tint/[0.04] p-4">
                    <div className="flex items-center gap-4"><ScoreRing value={82} size={78} /><div><div className="text-sm font-semibold">Worthwise Score</div><div className="mt-0.5 text-xs text-muted">Grau de confiança: <span className="text-fg">moderado</span></div></div></div>
                    <div className="mt-4 space-y-2">{[["Margem estimada", 76], ["Evidências de demanda", 68], ["Preço competitivo", 84]].map(([l, w]) => (
                      <div key={l} className="flex items-center gap-2.5 text-[11px]"><span className="w-32 shrink-0 text-muted">{l}</span><span className="h-1 flex-1 rounded-full bg-tint/10"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-hi" style={{ width: `${w}%` }} /></span></div>))}</div>
                  </div>
                  <div className="rounded-2xl border border-tint/10 bg-tint/[0.04] p-4"><div className="text-xs text-muted">Lucro por unidade</div>
                    <div className="mt-1 flex items-baseline gap-2"><span className="tabular text-2xl font-semibold tracking-tight text-pos">R$ 13,70</span><span className="text-xs text-muted">margem 22,8%</span></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="glass glass-lens animate-float absolute -right-3 top-28 z-20 hidden w-60 rounded-2xl p-3.5 lg:block xl:-right-7">
          <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-pos/20 text-pos"><ArrowDownRight size={15} /></span>
            <div><div className="text-xs font-medium">Preço abaixo do alvo</div><div className="text-[11px] text-muted">R$ 58,90 → R$ 53,40</div></div></div>
        </div>
        {widget ? <div className="absolute -bottom-28 -left-4 hidden lg:block xl:-left-14">{widget}</div> : null}
      </div>
      {widget ? <div className="mt-6 flex justify-center lg:hidden">{widget}</div> : null}
      <div className="mt-5 flex justify-center md:hidden"><DemoTag /></div>
    </div>
  );
}
