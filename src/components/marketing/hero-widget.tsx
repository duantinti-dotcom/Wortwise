"use client";
import { useMemo, useState } from "react";
import { calculateProfit, EXAMPLE } from "@/lib/profit/example";
import { AnimatedNumber } from "@/components/ui/fx";
import { cn, formatMoney, formatPercent } from "@/lib/utils";

/** Mini simulador do hero: arraste o preço e veja o lucro mudar (valores de exemplo). */
export function HeroWidget() {
  const [price, setPrice] = useState(EXAMPLE.salePrice);
  const r = useMemo(() => calculateProfit({ ...EXAMPLE, salePrice: price }), [price]);
  const ok = r.profit >= 0;
  return (
    <div className="lg lg-refract w-[min(300px,80vw)] rounded-[22px] p-4">
      <div className="flex items-center justify-between"><span className="mono-label">Simulador ao vivo</span><span className="rounded-full bg-tint/10 px-2 py-0.5 text-[11px] text-muted">exemplo</span></div>
      <div className="mt-2 flex items-baseline justify-between">
        <AnimatedNumber value={r.profitPerUnit} format={(v) => formatMoney(v)} className={cn("tabular text-[26px] font-semibold tracking-tight transition-colors", ok ? "text-fg" : "text-danger")} />
        <span className="text-xs text-muted">por unidade</span>
      </div>
      <input type="range" aria-label="Preço de venda de exemplo" min={40} max={120} step={0.5} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-3 w-full accent-[#ff7900]" />
      <div className="mt-2 flex justify-between text-[11.5px]"><span className="text-muted">Venda a <span className="tabular text-fg">{formatMoney(price)}</span></span><span className="tabular text-muted">margem <span className={ok ? "text-pos" : "text-neg"}>{formatPercent(r.marginPct)}</span></span></div>
    </div>
  );
}
