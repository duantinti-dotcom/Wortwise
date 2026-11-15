"use client";
import { Info, RotateCcw, Save, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildScenarios, calculateProfit, CHANNEL_PRESETS, compareChannels, DEFAULT_INPUTS, priceForTargetMargin, profitCurve, type ProfitInputs } from "@/lib/profit/calc";
import { AnimatedNumber } from "@/components/ui/fx";
import { EXAMPLE } from "@/lib/profit/example";
import { cn, formatMoney, formatPercent } from "@/lib/utils";

const ProfitCurveChart = dynamic(() => import("./charts").then((m) => m.ProfitCurveChart), { ssr: false, loading: () => <div className="skeleton h-[200px] w-full" /> });

/** Valores de exemplo exibidos ao abrir (identificados na interface até o usuário editar). */
export const EXAMPLE_INPUTS: ProfitInputs = EXAMPLE;

function NumField({ id, label, value, onChange, prefix, suffix, hint }: {
  id: string; label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; hint?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === 0 ? "" : String(value).replace(".", ","));
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="label">{label}</span>
      <span className="relative block">
        {prefix ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">{prefix}</span> : null}
        <input id={id} className={cn("input tabular", prefix && "!pl-10", suffix && "!pr-10")} inputMode="decimal" placeholder="0" value={shown}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, "");
            setText(raw);
            const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
            onChange(Number(norm) || 0);
          }}
          onBlur={() => setText(null)} />
        {suffix ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1.5 block text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="border-t border-tint/[0.07] px-5 py-6 first:border-t-0 md:px-7">
      <div className="mb-4 flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold tracking-tight">{title}</h3><span className="text-xs text-faint">{sub}</span></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">{children}</div>
    </section>
  );
}

/** Cascata da receita ao lucro: cada custo "desce" a barra a partir da receita. */
function Waterfall({ revenue, items, profit }: { revenue: number; items: { label: string; value: number }[]; profit: number }) {
  const max = Math.max(revenue, revenue - profit, 1);
  const sorted = items.filter((i) => i.value > 0.004).sort((a, b) => b.value - a.value);
  // Posição de cada degrau calculada de antemão (valor acumulado antes e depois de cada custo).
  const rows = sorted.map((r, k) => {
    const before = revenue - sorted.slice(0, k).reduce((acc, x) => acc + x.value, 0);
    return { ...r, end: before, after: before - r.value };
  });
  return (
    <div className="space-y-1.5" role="list" aria-label="Da receita ao lucro">
      <WRow label="Receita bruta" value={revenue} start={0} width={revenue / max} tone="pos" strong />
      {rows.map((r) => <WRow key={r.label} label={r.label} value={-r.value} start={Math.max(r.after, 0) / max} width={Math.min(r.value, Math.max(r.end, 0)) / max} tone="neg" />)}
      <div className="hairline !my-2" />
      <WRow label={profit >= 0 ? "Lucro" : "Prejuízo"} value={profit} start={profit >= 0 ? 0 : 0} width={Math.abs(profit) / max} tone={profit >= 0 ? "brand" : "neg"} strong />
    </div>
  );
}

function WRow({ label, value, start, width, tone, strong }: { label: string; value: number; start: number; width: number; tone: "pos" | "neg" | "brand"; strong?: boolean }) {
  return (
    <div role="listitem" className="grid grid-cols-[minmax(0,118px)_1fr_auto] items-center gap-3 text-[12.5px]">
      <span className={cn("truncate", strong ? "font-medium text-fg" : "text-muted")}>{label}</span>
      <span className="relative h-5 rounded-md bg-tint/[0.03]">
        <span className={cn("absolute inset-y-0 rounded-md transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          tone === "pos" && "bg-gradient-to-r from-pos/50 to-pos/80", tone === "neg" && "bg-neg/45", tone === "brand" && "bg-brand")}
          style={{ left: `${Math.min(start, 1) * 100}%`, width: `${Math.max(Math.min(width, 1 - Math.min(start, 1)), 0.004) * 100}%` }} />
      </span>
      <span className={cn("tabular w-[92px] text-right", strong ? "font-semibold" : "", value < 0 && !strong ? "text-danger" : "text-fg")}>{formatMoney(value)}</span>
    </div>
  );
}

type Tab = "composicao" | "cenarios" | "canais" | "detalhes";

export function ProfitCalculator({ initial, initialPreset, onSave, saving, compact, example = true }: {
  initial?: Partial<ProfitInputs>; initialPreset?: string; onSave?: (inputs: ProfitInputs) => void; saving?: boolean; compact?: boolean; example?: boolean;
}) {
  const useExample = example && !initial;
  const startPreset = CHANNEL_PRESETS.find((x) => x.id === initialPreset);
  const [i, setI] = useState<ProfitInputs>(() => {
    const base = useExample ? EXAMPLE_INPUTS : { ...DEFAULT_INPUTS, quantity: 1, ...initial };
    return startPreset ? { ...base, marketplaceFeePct: startPreset.marketplaceFeePct, marketplaceFixedFee: startPreset.marketplaceFixedFee, paymentFeePct: startPreset.paymentFeePct } : base;
  });
  const [isExample, setIsExample] = useState(useExample);
  const [targetMargin, setTargetMargin] = useState(20);
  const [tab, setTab] = useState<Tab>("composicao");
  const [preset, setPreset] = useState(startPreset?.id ?? "");
  const [mode, setMode] = useState<"simple" | "full">("simple");
  const set = <K extends keyof ProfitInputs>(k: K) => (v: number) => { setIsExample(false); setI((p) => ({ ...p, [k]: v })); };

  // Publica os valores atuais para quem quiser reagir (ex.: Score na página do produto).
  useEffect(() => { window.dispatchEvent(new CustomEvent("ww:simulation", { detail: i })); }, [i]);

  const r = useMemo(() => calculateProfit(i), [i]);
  const curve = useMemo(() => profitCurve(i), [i]);
  const scenarios = useMemo(() => buildScenarios(i), [i]);
  const channels = useMemo(() => compareChannels(i), [i]);
  const target = useMemo(() => priceForTargetMargin(i, targetMargin), [i, targetMargin]);
  const ready = i.costPrice > 0 && i.salePrice > 0;
  const sliderMin = Math.max(0, Math.floor(Math.min(r.minPrice ?? i.salePrice, i.salePrice || Infinity) * 0.6));
  const sliderMax = Math.max(sliderMin + 10, Math.ceil(Math.max(i.salePrice, r.minPrice ?? 0, target ?? 0) * 1.4) || 100);
  const pos = (v: number | null) => (v == null ? null : Math.min(100, Math.max(0, ((v - sliderMin) / (sliderMax - sliderMin)) * 100)));
  const best = Math.max(...channels.map((x) => x.result.profit));
  const hiddenCosts = [i.purchaseFreight > 0 && "frete da compra", i.otherCosts > 0 && "outros custos", i.packaging > 0 && "embalagem", i.adsPct > 0 && "anúncios",
    i.paymentFeePct > 0 && "taxa do pagamento", i.returnsPct > 0 && "devoluções", i.lossPct > 0 && "perdas"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " e $1");

  return (
    <div className={cn("grid items-start gap-5", compact ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]")}>
      <div className="card overflow-hidden !rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tint/[0.07] px-5 py-4 md:px-7">
          <div className="text-[15px] font-semibold tracking-tight">Seus números</div>
          {isExample ? <span className="badge badge-brand max-sm:order-3 max-sm:w-full max-sm:justify-center"><Sparkles size={12} />Exemplo — troque pelos seus valores</span> : null}
          <button className="btn btn-ghost btn-sm -mr-2" onClick={() => { setI({ ...DEFAULT_INPUTS, quantity: 1 }); setPreset(""); setIsExample(false); }}><RotateCcw size={14} /> Limpar</button>
        </div>
        <div className="border-b border-tint/[0.07] px-5 pt-4 md:px-7">
          <div className="seg mb-4 max-w-xs" role="tablist" aria-label="Modo da calculadora">
            <button type="button" role="tab" aria-selected={mode === "simple"} onClick={() => setMode("simple")}>Simples</button>
            <button type="button" role="tab" aria-selected={mode === "full"} onClick={() => setMode("full")}>Completo</button>
          </div>
        </div>
        {mode === "simple" ? (
          <Section title="Responda 6 perguntas" sub="o resto a gente calcula">
            <NumField id="pc-cost" label="Quanto você paga em cada unidade?" prefix="R$" value={i.costPrice} onChange={set("costPrice")} />
            <NumField id="pc-qty" label="Quantas unidades vai comprar?" value={i.quantity} onChange={set("quantity")} suffix="un." />
            <NumField id="pc-price" label="Por quanto vai vender cada uma?" prefix="R$" value={i.salePrice} onChange={set("salePrice")} />
            <NumField id="pc-ship" label="Frete que você paga por venda" prefix="R$" value={i.saleShipping} onChange={set("saleShipping")} hint="0 se o comprador paga" />
          <label className="col-span-2 block" htmlFor="pc-channel">
            <span className="label">Onde você vai vender?</span>
            <select id="pc-channel" className="input" value={preset} onChange={(e) => {
              setPreset(e.target.value);
              setIsExample(false);
              const p = CHANNEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) setI((s) => ({ ...s, marketplaceFeePct: p.marketplaceFeePct, marketplaceFixedFee: p.marketplaceFixedFee, paymentFeePct: p.paymentFeePct }));
            }}>
              <option value="">Personalizado</option>
              {CHANNEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="mt-2 flex gap-1.5 text-[11.5px] leading-relaxed text-faint"><Info size={13} className="mt-0.5 shrink-0" />
              Preenche a comissão com um valor de partida ({formatPercent(i.marketplaceFeePct)}{i.marketplaceFixedFee ? ` + ${formatMoney(i.marketplaceFixedFee)} por venda` : ""}). As taxas reais mudam por categoria: confira no marketplace.</span>
          </label>
            <NumField id="pc-tax" label="Imposto sobre a venda" suffix="%" value={i.taxPct} onChange={set("taxPct")} hint="MEI costuma usar 0; Simples, 4 a 6" />
            {hiddenCosts ? (
              <p className="col-span-2 flex gap-1.5 rounded-xl bg-tint/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-muted"><Info size={13} className="mt-0.5 shrink-0 text-brand" />
                A conta também inclui {hiddenCosts}. <button type="button" className="font-medium text-brand-hi hover:underline" onClick={() => setMode("full")}>Ajustar no modo Completo</button></p>
            ) : null}
          </Section>
        ) : (<>
        <Section title="Compra" sub="o que você paga ao fornecedor">
          <NumField id="pc-cost" label="Quanto você paga em cada unidade?" prefix="R$" value={i.costPrice} onChange={set("costPrice")} />
          <NumField id="pc-qty" label="Quantas unidades vai comprar?" value={i.quantity} onChange={set("quantity")} suffix="un." />
          <NumField id="pc-pfreight" label="Frete da compra (total)" prefix="R$" value={i.purchaseFreight} onChange={set("purchaseFreight")} hint="o que paga para receber o lote" />
          <NumField id="pc-other" label="Outros custos (total)" prefix="R$" value={i.otherCosts} onChange={set("otherCosts")} hint="ex.: etiquetas, fotos" />
        </Section>
        <Section title="Venda" sub="por unidade vendida">
          <NumField id="pc-price" label="Por quanto vai vender cada uma?" prefix="R$" value={i.salePrice} onChange={set("salePrice")} />
          <NumField id="pc-ship" label="Frete que você paga por venda" prefix="R$" value={i.saleShipping} onChange={set("saleShipping")} hint="0 se o comprador paga" />
          <NumField id="pc-pack" label="Embalagem por unidade" prefix="R$" value={i.packaging} onChange={set("packaging")} />
          <NumField id="pc-ads" label="Anúncios pagos" suffix="%" value={i.adsPct} onChange={set("adsPct")} hint="% do preço gasto em anúncios" />
        </Section>
        <Section title="Taxas e impostos" sub="percentuais sobre a venda">
          <label className="col-span-2 block" htmlFor="pc-channel">
            <span className="label">Onde você vai vender?</span>
            <select id="pc-channel" className="input" value={preset} onChange={(e) => {
              setPreset(e.target.value);
              setIsExample(false);
              const p = CHANNEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) setI((s) => ({ ...s, marketplaceFeePct: p.marketplaceFeePct, marketplaceFixedFee: p.marketplaceFixedFee, paymentFeePct: p.paymentFeePct }));
            }}>
              <option value="">Personalizado</option>
              {CHANNEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="mt-2 flex gap-1.5 text-[11.5px] leading-relaxed text-faint"><Info size={13} className="mt-0.5 shrink-0" />
              Preenche a comissão com um valor de partida ({formatPercent(i.marketplaceFeePct)}{i.marketplaceFixedFee ? ` + ${formatMoney(i.marketplaceFixedFee)} por venda` : ""}). As taxas reais mudam por categoria: confira no marketplace.</span>
          </label>
          <NumField id="pc-fee" label="Comissão do marketplace" suffix="%" value={i.marketplaceFeePct} onChange={(v) => { setPreset(""); set("marketplaceFeePct")(v); }} />
          <NumField id="pc-fixed" label="Tarifa fixa por venda" prefix="R$" value={i.marketplaceFixedFee} onChange={(v) => { setPreset(""); set("marketplaceFixedFee")(v); }} />
          <NumField id="pc-pay" label="Taxa do pagamento" suffix="%" value={i.paymentFeePct} onChange={set("paymentFeePct")} hint="cartão/Pix, se não estiver na comissão" />
          <NumField id="pc-tax" label="Imposto sobre a venda" suffix="%" value={i.taxPct} onChange={set("taxPct")} />
          <NumField id="pc-ret" label="Devoluções" suffix="%" value={i.returnsPct} onChange={set("returnsPct")} hint="de cada 100 vendas, quantas voltam" />
          <NumField id="pc-loss" label="Perdas e avarias" suffix="%" value={i.lossPct} onChange={set("lossPct")} hint="% das unidades que estragam" />
        </Section>
        </>)}
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <div className={cn("edge-grad relative overflow-hidden rounded-2xl border p-6 md:p-7", ready && r.profit < 0 ? "border-neg/30 bg-surface" : "bg-surface")}>
          <div className="relative">
            <div className="text-[13px] text-muted">{ready && r.profit < 0 ? `Prejuízo total (${i.quantity} unidades)` : `Lucro total (${i.quantity} unidades)`}</div>
            <div className={cn("tabular mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em] transition-colors md:text-5xl", !ready ? "text-faint" : r.profit >= 0 ? "text-fg" : "text-danger")}
              data-testid="profit-total">{ready ? <AnimatedNumber value={r.profit} format={(v) => formatMoney(v)} /> : "R$ —"}</div>
            <p className="mt-3 text-[14px] leading-relaxed text-soft" data-testid="profit-verdict">
              {!ready ? "Preencha quanto você paga e por quanto vai vender para ver o resultado."
                : r.profit >= 0 ? <>Você ganha <b className="text-pos">{formatMoney(r.profitPerUnit)}</b> em cada venda: {formatPercent(r.marginPct)} do preço fica com você depois de todos os custos.</>
                : <>Você <b className="text-danger">perde {formatMoney(Math.abs(r.profitPerUnit))}</b> em cada venda.{r.minPrice != null ? <> Para não ter prejuízo, venda por pelo menos <b>{formatMoney(r.minPrice)}</b>.</> : null}</>}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[["Por venda", ready ? formatMoney(r.profitPerUnit) : "—", "profit-unit"], ["Margem", ready ? formatPercent(r.marginPct) : "—", "profit-margin"], ["Retorno do investimento", ready ? formatPercent(r.roiPct) : "—", "profit-roi"]].map(([k, v, t]) => (
                <div key={k} className="rounded-xl border border-tint/[0.08] bg-tint/[0.05] px-3 py-2.5"><div className="text-[11px] text-muted">{k}</div><div className="tabular mt-0.5 text-[15px] font-semibold" data-testid={t}>{v}</div></div>
              ))}
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between text-[13px]"><span className="text-muted">Arraste para mudar o preço de venda</span><span className="tabular text-base font-semibold">{formatMoney(i.salePrice)}</span></div>
              <div className="relative mt-3">
                <input type="range" aria-label="Preço de venda" min={sliderMin} max={sliderMax} step={0.1} value={Math.min(Math.max(i.salePrice, sliderMin), sliderMax)}
                  onChange={(e) => set("salePrice")(Number(e.target.value))} className="relative z-10 w-full accent-[#3B82F6]" disabled={!ready} />
                <div className="pointer-events-none relative mt-1 h-11 text-[10.5px]">
                  {ready && r.minPrice != null && pos(r.minPrice) != null ? (
                    <span className="absolute -translate-x-1/2 whitespace-nowrap text-center text-danger" style={{ left: `${pos(r.minPrice)}%` }}><span className="mx-auto block h-2 w-px bg-current" />mínimo {formatMoney(r.minPrice)}</span>) : null}
                  {ready && target != null && pos(target) != null ? (
                    <span className="absolute top-3.5 -translate-x-1/2 whitespace-nowrap text-center text-brand-hi" style={{ left: `${pos(target)}%` }}><span className="mx-auto block h-1 w-px bg-current" />{targetMargin}% · {formatMoney(target)}</span>) : null}
                </div>
              </div>
              <label className="mt-2 flex items-center justify-between gap-3 text-[13px] text-muted" htmlFor="pc-target">
                <span>Margem desejada</span>
                <span className="flex items-center gap-2"><input id="pc-target" aria-label="Margem desejada" className="input tabular !h-8 !w-16 !rounded-lg !px-2 text-center !text-sm" inputMode="decimal" value={targetMargin}
                  onChange={(e) => setTargetMargin(Math.min(95, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} />%
                  <span className="tabular min-w-[84px] text-right font-semibold text-brand-hi">{ready ? (target == null ? "Inviável" : formatMoney(target)) : "—"}</span></span>
              </label>
            </div>
          </div>
        </div>

        <div className="card !rounded-2xl p-5 md:p-6">
          <div className="seg" role="tablist">
            {([["composicao", "Composição"], ["cenarios", "Cenários"], ["canais", "Canais"], ["detalhes", "Detalhes"]] as [Tab, string][]).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <div className="mt-5">
            {!ready ? <p className="rounded-xl border border-dashed border-tint/10 px-4 py-6 text-center text-sm text-muted">Informe o preço de aquisição e o preço de venda para ver o resultado.</p> : null}
            {ready && tab === "composicao" ? (
              <>
                <Waterfall revenue={r.grossRevenue} items={r.breakdown} profit={r.profit} />
                <div className="mt-6 text-xs font-medium text-muted">Lucro do lote conforme o preço de venda</div>
                <div className="-ml-2 mt-2"><ProfitCurveChart data={curve} current={i.salePrice} height={200} /></div>
              </>
            ) : null}
            {ready && tab === "cenarios" ? (
              <div className="space-y-2.5">
                {scenarios.map((s) => (
                  <div key={s.id} className={cn("rounded-2xl border p-4", s.id === "base" ? "border-brand/40 bg-brand/[0.06]" : "border-tint/[0.08] bg-tint/[0.02]")}>
                    <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">{s.name}</span>
                      <span className={cn("tabular text-lg font-semibold", s.result.profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(s.result.profit)}</span></div>
                    <div className="mt-1 flex justify-between text-xs text-muted"><span>Venda a {formatMoney(s.inputs.salePrice)}</span><span>Margem {formatPercent(s.result.marginPct)}</span></div>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">{s.assumptions.map((a) => <li key={a} className="badge !h-auto py-0.5 !text-[11px]">{a}</li>)}</ul>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-faint">Hipóteses fixas e transparentes aplicadas sobre os seus números. São simulações, não previsões.</p>
              </div>
            ) : null}
            {ready && tab === "canais" ? (
              <div className="space-y-2">
                <p className="mb-3 text-xs leading-relaxed text-muted">Mesmo produto e mesmos custos; muda só a taxa do canal (valores de partida, editáveis).</p>
                {[...channels].sort((a, b) => b.result.profit - a.result.profit).map((c) => (
                  <div key={c.preset.id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm", c.result.profit === best ? "border-brand/40 bg-brand/[0.06]" : "border-tint/[0.07]")}>
                    <span className="min-w-0 truncate">{c.preset.name}</span>
                    <span className="flex shrink-0 items-baseline gap-3"><span className="text-xs text-muted">{formatPercent(c.result.marginPct)}</span>
                      <span className={cn("tabular w-24 text-right font-semibold", c.result.profit >= 0 ? "text-fg" : "text-neg")}>{formatMoney(c.result.profit)}</span></span>
                  </div>
                ))}
              </div>
            ) : null}
            {ready && tab === "detalhes" ? (
              <dl className="space-y-2.5 text-sm">
                {[["Receita bruta", formatMoney(r.grossRevenue)], ["Custo total", formatMoney(r.totalCost)], ["Custo por unidade (com frete)", formatMoney(r.landedUnitCost)],
                  ["Margem de contribuição", `${formatMoney(r.contributionPerUnit)} · ${formatPercent(r.contributionMarginPct)}`],
                  ["Ponto de equilíbrio", r.breakEvenUnits == null ? "Não atinge" : r.breakEvenUnits === 0 ? "Desde a 1ª venda" : `${r.breakEvenUnits} un.`],
                  ["Preço mínimo (lucro zero)", r.minPrice != null ? formatMoney(r.minPrice) : "—"], ["Unidades vendidas", `${r.unitsSold.toLocaleString("pt-BR")} de ${i.quantity}`]].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-tint/[0.05] pb-2.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="tabular text-right font-medium">{v}</dd></div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>

        {onSave ? <button className="btn btn-primary btn-lg w-full" disabled={!ready || saving} onClick={() => onSave(i)}><Save size={16} /> {saving ? "Salvando…" : "Salvar simulação"}</button> : null}
      </div>
    </div>
  );
}
