"use client";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useState } from "react";
import { SourceMark } from "@/components/source-mark";
import { calculateProfit, CHANNEL_PRESETS, DEFAULT_INPUTS, priceForTargetMargin, type ProfitInputs } from "@/lib/profit/calc";
import { cn, formatMoney } from "@/lib/utils";

/**
 * Calculadora simples, em 3 passos, para quem não entende de contas:
 * quanto paga, por quanto vende e onde vende. A resposta aparece em letras grandes,
 * com um gráfico de "para onde vai o dinheiro" e o preço recomendado.
 */
const STORES: { preset: string; label: string; mark: string | null }[] = [
  { preset: "mercadolivre-classico", label: "Mercado Livre", mark: "mercadolivre" },
  { preset: "mercadolivre-premium", label: "ML Premium", mark: "mercadolivre" },
  { preset: "shopee", label: "Shopee", mark: "shopee" },
  { preset: "amazon", label: "Amazon", mark: "amazon" },
  { preset: "tiktokshop", label: "TikTok Shop", mark: "tiktokshop" },
  { preset: "loja-propria", label: "Loja própria", mark: null },
];

/** Lê o número digitado (até R$ 10 milhões, para nada absurdo quebrar a tela). */
function parse(v: string, max = 10_000_000) { const n = Number(v.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; }
const fit = (t: string) => (t.length > 18 ? "text-[28px]" : t.length > 14 ? "text-[36px]" : "text-[44px]");
const show = (n: number) => (n ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false }) : "");

function Money({ id, label, help, value, onChange, big }: { id: string; label: string; help?: string; value: number; onChange: (v: number) => void; big?: boolean }) {
  const [text, setText] = useState(show(value));
  // Quando o valor muda por fora (ex.: a barrinha de preço), o campo acompanha.
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); if (parse(text) !== value) setText(show(Math.round(value * 100) / 100)); }
  return (
    <label htmlFor={id} className="block">
      <span className={cn("block font-semibold", big ? "text-[17px]" : "text-[14.5px]")}>{label}</span>
      {help ? <span className="mt-0.5 block text-[13px] text-muted">{help}</span> : null}
      <span className="relative mt-2.5 block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">R$</span>
        <input id={id} inputMode="decimal" placeholder="0,00" value={text} onChange={(e) => { const v = parse(e.target.value); setText(v >= 10_000_000 ? show(v) : e.target.value); setLast(v); onChange(v); }}
          className={cn("input !pl-12 tabular", big ? "!h-14 !text-[22px] font-semibold" : "!h-12 !text-[17px]")} />
      </span>
    </label>
  );
}

function Pct({ id, label, help, value, onChange }: { id: string; label: string; help?: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(show(value));
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[14.5px] font-semibold">{label}</span>
      {help ? <span className="mt-0.5 block text-[13px] text-muted">{help}</span> : null}
      <span className="relative mt-2.5 block">
        <input id={id} inputMode="decimal" placeholder="0" value={text} onChange={(e) => { const v = parse(e.target.value, 100); setText(v >= 100 ? "100" : e.target.value); onChange(v); }} className="input tabular !h-12 !pr-10 !text-[17px]" />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">%</span>
      </span>
    </label>
  );
}

function PriceSlider({ price, cost, minPrice, recommended, onChange }: { price: number; cost: number; minPrice: number | null; recommended: number | null; onChange: (v: number) => void }) {
  // A barra tem tamanho fixo pelo custo (não muda enquanto se arrasta): de 0 até 5x o custo.
  // Se a pessoa digitar um preço maior, a barra vai até ele.
  const lo = 0;
  const hi = Math.max(Math.ceil(Math.max(cost * 5, (recommended ?? 0) * 1.5, 20)), Math.ceil(price));
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const fill = pct(price);
  const mark = (v: number | null, cls: string, text: string) => v != null && v >= lo && v <= hi ? (
    <span className={cn("absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium", cls)} style={{ left: `${Math.min(90, Math.max(10, pct(v)))}%` }}>
      <span className="mx-auto mb-0.5 block h-2 w-px bg-current" />{text}
    </span>) : null;
  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] font-semibold">Arraste para testar outro preço</span>
        <span className="tabular truncate text-[17px] font-semibold text-brand-hi">{formatMoney(price)}</span></div>
      <div className="relative mt-4 h-7">
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-tint/[0.1] shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]" />
        <div className="absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#F87171,#F59E0B_35%,#22C55E_70%)]" style={{ width: `${fill}%` }} />
        <div className="pointer-events-none absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-[radial-gradient(circle_at_35%_30%,#fff,#dbe4ff_55%,#a5b4fc)] shadow-[0_4px_14px_rgba(37,99,235,0.55),inset_0_1px_0_#fff]" style={{ left: `${fill}%` }} />
        <input type="range" aria-label="Preço de venda" min={lo} max={hi} step={0.1} value={Math.min(Math.max(price, lo), hi)} onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0" />
      </div>
      <div className="relative mt-1 h-12">
        {mark(minPrice, "top-0 text-neg", `mínimo ${formatMoney(minPrice)}`)}
        {mark(recommended, "top-[22px] text-pos", `recomendado ${formatMoney(recommended)}`)}
      </div>
    </div>
  );
}

export function EasyProfit({ initialPrice, initialPreset, productName, initialCost }: { initialPrice?: number; initialPreset?: string; productName?: string; initialCost?: number }) {
  const LIMIT = 10_000_000;
  const [rawCost, setCost] = useState(initialCost ?? 0);
  const [rawPrice, setPrice] = useState(initialPrice ?? 0);
  // Segunda trava: a conta nunca usa valores acima de R$ 10 milhões.
  const cost = Math.min(Math.max(rawCost, 0), LIMIT);
  const price = Math.min(Math.max(rawPrice, 0), LIMIT);
  const [preset, setPreset] = useState(STORES.some((s) => s.preset === initialPreset) ? initialPreset! : "mercadolivre-classico");
  const [more, setMore] = useState(false);
  const [rawShipping, setShipping] = useState(0);
  const shipping = Math.min(rawShipping, LIMIT);
  const [rawTax, setTax] = useState(0);
  const tax = Math.min(rawTax, 100);
  const [rawPackaging, setPackaging] = useState(0);
  const packaging = Math.min(rawPackaging, LIMIT);
  const [target, setTarget] = useState(30);

  const ch = CHANNEL_PRESETS.find((c) => c.id === preset)!;
  const inputs: ProfitInputs = { ...DEFAULT_INPUTS, quantity: 1, costPrice: cost, salePrice: price, saleShipping: shipping, taxPct: tax, packaging,
    marketplaceFeePct: ch.marketplaceFeePct, marketplaceFixedFee: ch.marketplaceFixedFee, paymentFeePct: ch.paymentFeePct };
  const r = calculateProfit(inputs);
  const recommended = priceForTargetMargin(inputs, target);
  const ready = cost > 0 && price > 0;

  const storeFee = price * (ch.marketplaceFeePct + ch.paymentFeePct) / 100 + ch.marketplaceFixedFee;
  const taxValue = price * tax / 100;
  const parts = [
    { label: "Custo do produto", value: cost, color: "#94A3B8" },
    { label: `Taxa da loja (${ch.marketplaceFeePct}%${ch.marketplaceFixedFee ? ` + ${formatMoney(ch.marketplaceFixedFee)}` : ""})`, value: storeFee, color: "#F59E0B" },
    { label: "Frete e embalagem", value: shipping + packaging, color: "#A78BFA" },
    { label: "Imposto", value: taxValue, color: "#F87171" },
  ].filter((p) => p.value > 0.004);
  const profit = r.profitPerUnit;
  const total = Math.max(price, 0.01);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Perguntas */}
      <div className="card space-y-7 p-6 md:p-7">
        {productName ? <p className="rounded-xl bg-tint/[0.05] px-4 py-3 text-[14px] text-soft">Calculando para: <b className="font-semibold text-fg">{productName}</b></p> : null}
        <Money id="ep-cost" big label="1. Quanto você paga em cada produto?" help="O preço do fornecedor, por unidade." value={cost} onChange={setCost} />
        <Money id="ep-price" big label="2. Por quanto você vai vender?" help={initialPrice ? "Já preenchemos com o preço que está na loja. Pode mudar." : "O preço que o cliente paga."} value={price} onChange={setPrice} />
        <div>
          <span className="block text-[17px] font-semibold">3. Onde você vai vender?</span>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STORES.map((s) => (
              <button key={s.preset} type="button" onClick={() => setPreset(s.preset)} aria-pressed={preset === s.preset}
                className={cn("flex h-12 items-center gap-2 rounded-[12px] border px-3 text-left text-[14px] font-medium transition-colors",
                  preset === s.preset ? "border-[#3B82F6] bg-[#3B82F6]/12 text-fg" : "border-tint/[0.12] text-muted hover:text-fg")}>
                {s.mark ? <SourceMark source={s.mark} size={20} /> : <span className="size-5 rounded-[5px] bg-tint/15" />}{s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-tint/[0.08] pt-5">
          <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between text-[15px] font-semibold">
            Tem mais algum custo? <span className="flex items-center gap-1 text-[13px] font-normal text-muted">opcional<ChevronDown size={16} className={cn("transition-transform", more && "rotate-180")} /></span>
          </button>
          {more ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <Money id="ep-ship" label="Frete que você paga" help="Por venda. 0 se o cliente paga." value={shipping} onChange={setShipping} />
              <Money id="ep-pack" label="Embalagem" help="Por venda." value={packaging} onChange={setPackaging} />
              <Pct id="ep-tax" label="Imposto" help="MEI: 0. Simples: 4 a 6." value={tax} onChange={setTax} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Resposta */}
      <div className="space-y-5 lg:sticky lg:top-24">
        {!ready ? (
          <div className="card p-7 text-center">
            <p className="text-[17px] font-semibold">{price > 0 ? "Agora diga quanto você paga no produto" : "Responda as perguntas ao lado"}</p>
            <p className="mt-2 text-[14.5px] text-muted">A resposta aparece aqui na hora: quanto sobra no seu bolso em cada venda.</p>
          </div>
        ) : (
          <>
            <div className={cn("card p-7", profit < 0 && "!bg-[linear-gradient(180deg,rgba(248,113,113,0.12),rgba(248,113,113,0.03))]")}>
              <p className="text-[15px] text-muted">{profit >= 0 ? "Em cada venda sobra no seu bolso" : "Em cada venda você PERDE"}</p>
              <p className={cn("tabular mt-1 break-all font-semibold leading-none tracking-tight", fit(formatMoney(Math.abs(profit))), profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(Math.abs(profit))}</p>
              <p className="mt-3 text-[15px] text-soft">
                {profit >= 0 ? <>De cada <b>{formatMoney(price)}</b> que o cliente paga, <b>{Math.round((profit / total) * 100)}%</b> fica com você.</>
                  : <>Com esse preço você tem prejuízo. Venda por pelo menos <b>{formatMoney(r.minPrice)}</b>.</>}
              </p>

              {/* Barrinha: arraste para mudar o preço de venda */}
              <PriceSlider price={price} cost={cost} minPrice={r.minPrice} recommended={recommended} onChange={setPrice} />

              {/* Para onde vai o dinheiro */}
              <div className="mt-7">
                <p className="text-[14px] font-semibold">Para onde vai o dinheiro de cada venda</p>
                <div className="mt-3 flex h-6 w-full overflow-hidden rounded-full bg-tint/[0.08]">
                  {parts.map((p) => <span key={p.label} style={{ width: `${Math.min(100, (p.value / total) * 100)}%`, background: p.color }} />)}
                  {profit > 0 ? <span style={{ width: `${(profit / total) * 100}%`, background: "#22C55E" }} /> : null}
                </div>
                <ul className="mt-4 space-y-2.5 text-[14.5px]">
                  {parts.map((p) => (
                    <li key={p.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5"><span className="size-3 rounded-[4px]" style={{ background: p.color }} />{p.label}</span><span className="tabular text-muted">{formatMoney(p.value)}</span></li>
                  ))}
                  <li className="flex items-center justify-between gap-3 border-t border-tint/[0.08] pt-2.5 font-semibold"><span className="flex items-center gap-2.5"><span className="size-3 rounded-[4px] bg-[#22C55E]" />Seu lucro</span><span className={cn("tabular", profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(profit)}</span></li>
                </ul>
              </div>
            </div>

            <div className="card p-7">
              <p className="flex items-center gap-2 text-[15px] font-semibold"><Lightbulb size={17} className="text-[#F59E0B]" />Preço recomendado</p>
              <p className="mt-1 text-[14px] text-muted">Quanto você quer ganhar de cada venda?</p>
              <div className="mt-3 flex gap-2">
                {[20, 30, 40].map((t) => (
                  <button key={t} type="button" onClick={() => setTarget(t)} className={cn("h-10 flex-1 rounded-[10px] border text-[14.5px] font-semibold", target === t ? "border-[#3B82F6] bg-[#3B82F6]/12" : "border-tint/[0.12] text-muted")}>{t}%</button>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div><p className="text-[13px] text-muted">Venda por pelo menos</p><p className="tabular text-[26px] font-semibold text-brand-hi">{recommended ? formatMoney(recommended) : "—"}</p></div>
                <div><p className="text-[13px] text-muted">Mínimo sem prejuízo</p><p className="tabular text-[26px] font-semibold">{formatMoney(r.minPrice)}</p></div>
              </div>
            </div>

            <div className="card p-7">
              <p className="text-[15px] font-semibold">Se você vender por mês…</p>
              <ul className="mt-4 divide-y divide-tint/[0.08]">
                {[10, 50, 100].map((n) => (
                  <li key={n} className="flex items-center justify-between py-3 text-[15px]"><span>{n} unidades</span><span className={cn("tabular font-semibold", profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(profit * n)}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-faint">Taxas da loja são de referência e mudam por categoria. Confira na página da loja.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
