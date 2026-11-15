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

function parse(v: string) { const n = Number(v.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; }
const show = (n: number) => (n ? String(n).replace(".", ",") : "");

function Money({ id, label, help, value, onChange, big }: { id: string; label: string; help?: string; value: number; onChange: (v: number) => void; big?: boolean }) {
  const [text, setText] = useState(show(value));
  return (
    <label htmlFor={id} className="block">
      <span className={cn("block font-semibold", big ? "text-[17px]" : "text-[14.5px]")}>{label}</span>
      {help ? <span className="mt-0.5 block text-[13px] text-muted">{help}</span> : null}
      <span className="relative mt-2.5 block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">R$</span>
        <input id={id} inputMode="decimal" placeholder="0,00" value={text} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }}
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
        <input id={id} inputMode="decimal" placeholder="0" value={text} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} className="input tabular !h-12 !pr-10 !text-[17px]" />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">%</span>
      </span>
    </label>
  );
}

export function EasyProfit({ initialPrice, initialPreset, productName }: { initialPrice?: number; initialPreset?: string; productName?: string }) {
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(initialPrice ?? 0);
  const [preset, setPreset] = useState(STORES.some((s) => s.preset === initialPreset) ? initialPreset! : "mercadolivre-classico");
  const [more, setMore] = useState(false);
  const [shipping, setShipping] = useState(0);
  const [tax, setTax] = useState(0);
  const [packaging, setPackaging] = useState(0);
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
              <p className={cn("tabular mt-1 text-[44px] font-semibold leading-none tracking-tight", profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(Math.abs(profit))}</p>
              <p className="mt-3 text-[15px] text-soft">
                {profit >= 0 ? <>De cada <b>{formatMoney(price)}</b> que o cliente paga, <b>{Math.round((profit / total) * 100)}%</b> fica com você.</>
                  : <>Com esse preço você tem prejuízo. Venda por pelo menos <b>{formatMoney(r.minPrice)}</b>.</>}
              </p>

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
