"use client";
import { Info, RotateCcw, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildScenarios, calculateProfit, CHANNEL_PRESETS, compareChannels, DEFAULT_INPUTS, priceForTargetMargin, profitCurve, type ProfitInputs } from "@/lib/profit/calc";
import { cn, formatMoney, formatPercent } from "@/lib/utils";

const ProfitCurveChart = dynamic(() => import("./charts").then((m) => m.ProfitCurveChart), { ssr: false, loading: () => <div className="skeleton h-[220px] w-full" /> });
const CompareBars = dynamic(() => import("./charts").then((m) => m.CompareBars), { ssr: false, loading: () => <div className="skeleton h-[300px] w-full" /> });

function NumField({ label, value, onChange, prefix, suffix, hint, step = "0.01" }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; hint?: string; step?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === 0 ? "" : String(value).replace(".", ","));
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        {prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">{prefix}</span> : null}
        <input
          className={cn("input tabular", prefix && "pl-9", suffix && "pr-9")} inputMode="decimal" placeholder="0" value={shown} step={step}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, "");
            setText(raw);
            const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
            onChange(Number(norm) || 0);
          }}
          onBlur={() => setText(null)}
        />
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="float-left mb-4 w-full text-sm font-semibold">{title}</legend>
      <div className="clear-both grid grid-cols-2 gap-x-4 gap-y-4">{children}</div>
    </fieldset>
  );
}

type Tab = "resultado" | "cenarios" | "canais";

export function ProfitCalculator({ initial, onSave, saving, compact }: {
  initial?: Partial<ProfitInputs>; onSave?: (inputs: ProfitInputs) => void; saving?: boolean; compact?: boolean;
}) {
  const [i, setI] = useState<ProfitInputs>({ ...DEFAULT_INPUTS, quantity: 1, ...initial });
  const [targetMargin, setTargetMargin] = useState(20);
  const [tab, setTab] = useState<Tab>("resultado");
  const [preset, setPreset] = useState("");
  const set = <K extends keyof ProfitInputs>(k: K) => (v: number) => setI((p) => ({ ...p, [k]: v }));

  // Publica os valores atuais para quem quiser reagir (ex.: Score na página do produto).
  useEffect(() => { window.dispatchEvent(new CustomEvent("ww:simulation", { detail: i })); }, [i]);

  const r = useMemo(() => calculateProfit(i), [i]);
  const curve = useMemo(() => profitCurve(i), [i]);
  const scenarios = useMemo(() => buildScenarios(i), [i]);
  const channels = useMemo(() => compareChannels(i), [i]);
  const target = useMemo(() => priceForTargetMargin(i, targetMargin), [i, targetMargin]);
  const ready = i.costPrice > 0 && i.salePrice > 0;
  const sliderMin = Math.max(0, Math.floor((r.minPrice ?? i.salePrice) * 0.6));
  const sliderMax = Math.max(sliderMin + 1, Math.ceil(Math.max(i.salePrice, r.minPrice ?? 0) * 1.6) || 100);
  const maxCost = Math.max(...r.breakdown.map((b) => b.value), 1);

  return (
    <div className={cn("grid gap-5", compact ? "lg:grid-cols-[1fr_1fr]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]")}>
      <div className="space-y-5">
        <Group title="Compra">
          <NumField label="Preço de aquisição (un.)" prefix="R$" value={i.costPrice} onChange={set("costPrice")} />
          <NumField label="Quantidade" value={i.quantity} onChange={set("quantity")} step="1" suffix="un." />
          <NumField label="Frete de compra (total)" prefix="R$" value={i.purchaseFreight} onChange={set("purchaseFreight")} />
          <NumField label="Outros custos (total)" prefix="R$" value={i.otherCosts} onChange={set("otherCosts")} />
        </Group>
        <Group title="Venda">
          <NumField label="Preço de venda (un.)" prefix="R$" value={i.salePrice} onChange={set("salePrice")} />
          <NumField label="Frete de venda (un.)" prefix="R$" value={i.saleShipping} onChange={set("saleShipping")} hint="Pago por você" />
          <NumField label="Embalagem (un.)" prefix="R$" value={i.packaging} onChange={set("packaging")} />
          <NumField label="Publicidade" suffix="%" value={i.adsPct} onChange={set("adsPct")} hint="% do preço de venda" />
        </Group>
        <Group title="Taxas e impostos">
          <label className="col-span-2 block">
            <span className="label">Canal de venda (preenche as taxas)</span>
            <select className="input" value={preset} onChange={(e) => {
              setPreset(e.target.value);
              const p = CHANNEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) setI((s) => ({ ...s, marketplaceFeePct: p.marketplaceFeePct, marketplaceFixedFee: p.marketplaceFixedFee, paymentFeePct: p.paymentFeePct }));
            }}>
              <option value="">Personalizado</option>
              {CHANNEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-faint"><Info size={13} className="mt-0.5 shrink-0" />
              Os valores sugeridos são pontos de partida, não tarifas oficiais. As taxas mudam por categoria e tipo de anúncio: confira a tabela do marketplace e ajuste.</span>
          </label>
          <NumField label="Comissão do marketplace" suffix="%" value={i.marketplaceFeePct} onChange={(v) => { setPreset(""); set("marketplaceFeePct")(v); }} />
          <NumField label="Tarifa fixa (un.)" prefix="R$" value={i.marketplaceFixedFee} onChange={(v) => { setPreset(""); set("marketplaceFixedFee")(v); }} />
          <NumField label="Taxa de pagamento" suffix="%" value={i.paymentFeePct} onChange={set("paymentFeePct")} />
          <NumField label="Impostos sobre a venda" suffix="%" value={i.taxPct} onChange={set("taxPct")} />
          <NumField label="Devoluções" suffix="%" value={i.returnsPct} onChange={set("returnsPct")} hint="% das vendas desfeitas" />
          <NumField label="Perdas e avarias" suffix="%" value={i.lossPct} onChange={set("lossPct")} hint="% das unidades compradas" />
        </Group>
      </div>

      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="card overflow-hidden">
          <div className="flex gap-1 border-b border-line p-1.5" role="tablist">
            {([["resultado", "Resultado"], ["cenarios", "Cenários"], ["canais", "Canais"]] as [Tab, string][]).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn("flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-150", tab === id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{label}</button>
            ))}
          </div>

          {tab === "resultado" ? (
            <div className="p-5">
              <div className="text-xs text-muted">Lucro estimado do lote</div>
              <div className={cn("tabular mt-1 text-4xl font-semibold tracking-tight transition-colors", !ready ? "text-faint" : r.profit >= 0 ? "text-pos" : "text-neg")}
                data-testid="profit-total">{ready ? formatMoney(r.profit) : "R$ —"}</div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs text-muted">Por unidade</div><div className="tabular mt-0.5 font-medium" data-testid="profit-unit">{ready ? formatMoney(r.profitPerUnit) : "—"}</div></div>
                <div><div className="text-xs text-muted">Margem</div><div className="tabular mt-0.5 font-medium" data-testid="profit-margin">{ready ? formatPercent(r.marginPct) : "—"}</div></div>
                <div><div className="text-xs text-muted">Retorno (ROI)</div><div className="tabular mt-0.5 font-medium">{ready ? formatPercent(r.roiPct) : "—"}</div></div>
              </div>

              <div className="mt-6">
                <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Preço de venda</span><span className="tabular font-medium">{formatMoney(i.salePrice)}</span></div>
                <input type="range" aria-label="Preço de venda" min={sliderMin} max={sliderMax} step={0.5} value={Math.min(Math.max(i.salePrice, sliderMin), sliderMax)}
                  onChange={(e) => set("salePrice")(Number(e.target.value))} className="mt-2 w-full accent-[#ff7900]" disabled={!ready} />
              </div>

              <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
                {[
                  ["Receita bruta", formatMoney(r.grossRevenue)], ["Custo total", formatMoney(r.totalCost)],
                  ["Margem de contribuição", ready ? `${formatMoney(r.contributionPerUnit)} · ${formatPercent(r.contributionMarginPct)}` : "—"],
                  ["Ponto de equilíbrio", r.breakEvenUnits == null ? (ready ? "Não atinge" : "—") : `${r.breakEvenUnits} un.`],
                  ["Preço mínimo (lucro zero)", ready && r.minPrice != null ? formatMoney(r.minPrice) : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="tabular text-right font-medium">{v}</dd></div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <dt className="flex items-center gap-2 text-muted">Preço para margem de
                    <input aria-label="Margem desejada" className="input tabular !h-8 !w-16 !px-2 text-center !text-sm" inputMode="decimal" value={targetMargin}
                      onChange={(e) => setTargetMargin(Math.min(95, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} />%
                  </dt>
                  <dd className="tabular font-medium text-brand-hi">{ready ? (target == null ? "Inviável" : formatMoney(target)) : "—"}</dd>
                </div>
              </dl>

              {ready ? (
                <>
                  <div className="mt-6 text-xs font-medium text-muted">Para onde vai o custo</div>
                  <div className="mt-3 space-y-2">
                    {r.breakdown.filter((b) => b.value > 0).sort((a, b) => b.value - a.value).map((b) => (
                      <div key={b.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
                        <div className="flex items-center gap-2"><span className="w-40 shrink-0 truncate text-muted">{b.label}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/6"><span className="block h-full rounded-full bg-white/35 transition-[width] duration-300" style={{ width: `${(b.value / maxCost) * 100}%` }} /></span></div>
                        <span className="tabular text-right text-fg">{formatMoney(b.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 text-xs font-medium text-muted">Lucro conforme o preço de venda</div>
                  <div className="mt-2 -ml-2"><ProfitCurveChart data={curve} current={i.salePrice} /></div>
                </>
              ) : <p className="mt-5 rounded-lg bg-white/4 px-3 py-2.5 text-sm text-muted">Informe o preço de aquisição e o preço de venda para ver o resultado.</p>}
            </div>
          ) : null}

          {tab === "cenarios" ? (
            <div className="space-y-3 p-5">
              {scenarios.map((s) => (
                <div key={s.id} className={cn("rounded-xl border p-4", s.id === "base" ? "border-brand/40 bg-brand/5" : "border-line")}>
                  <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">{s.name}</span>
                    <span className={cn("tabular text-lg font-semibold", !ready ? "text-faint" : s.result.profit >= 0 ? "text-pos" : "text-neg")}>{ready ? formatMoney(s.result.profit) : "—"}</span></div>
                  <div className="mt-1 flex justify-between text-xs text-muted"><span>Venda a {formatMoney(s.inputs.salePrice)}</span><span>Margem {ready ? formatPercent(s.result.marginPct) : "—"}</span></div>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">{s.assumptions.map((a) => <li key={a} className="badge !h-auto py-0.5">{a}</li>)}</ul>
                </div>
              ))}
              <p className="text-xs leading-relaxed text-faint">Os cenários aplicam hipóteses fixas e transparentes sobre os seus números. São simulações, não previsões.</p>
            </div>
          ) : null}

          {tab === "canais" ? (
            <div className="p-5">
              <p className="mb-3 text-xs leading-relaxed text-muted">Mesmo produto e mesmos custos, mudando apenas as taxas do canal (valores de partida, editáveis em “Resultado”).</p>
              {ready ? <CompareBars positiveNegative data={channels.map((c) => ({ name: c.preset.name, value: c.result.profit, highlight: c.result.profit === Math.max(...channels.map((x) => x.result.profit)) }))} />
                : <p className="rounded-lg bg-white/4 px-3 py-2.5 text-sm text-muted">Informe os preços para comparar os canais.</p>}
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={() => { setI({ ...DEFAULT_INPUTS, quantity: 1 }); setPreset(""); }}><RotateCcw size={15} /> Limpar</button>
          {onSave ? <button className="btn btn-primary flex-1" disabled={!ready || saving} onClick={() => onSave(i)}><Save size={15} /> {saving ? "Salvando…" : "Salvar simulação"}</button> : null}
        </div>
      </div>
    </div>
  );
}
