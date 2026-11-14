import type { ProductResult } from "@/lib/connectors/types";
import { groupComparable } from "@/lib/normalize/title";

/** Estatísticas descritivas de um conjunto de ofertas reais (sem extrapolação). */
export function marketStats(items: ProductResult[]) {
  const prices = items.map((p) => p.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  const q = (f: number) => (prices.length ? prices[Math.min(prices.length - 1, Math.floor(f * (prices.length - 1) + 0.5))]! : null);
  const sellers = new Set(items.map((p) => p.sellerId ?? p.sellerName).filter(Boolean));
  const withShip = items.filter((p) => p.freeShipping != null);
  const rated = items.filter((p) => p.rating != null);
  const buckets: { name: string; value: number }[] = [];
  if (prices.length >= 4) {
    const min = prices[0]!;
    const max = prices.at(-1)!;
    const n = Math.min(6, Math.max(3, Math.round(Math.sqrt(prices.length))));
    const step = (max - min) / n || 1;
    for (let i = 0; i < n; i++) {
      const lo = min + i * step;
      const hi = i === n - 1 ? max : lo + step;
      buckets.push({ name: `R$ ${Math.round(lo)}–${Math.round(hi)}`, value: prices.filter((p) => p >= lo && (i === n - 1 ? p <= hi : p < hi)).length });
    }
  }
  return {
    count: items.length, priced: prices.length, min: prices[0] ?? null, max: prices.at(-1) ?? null, median: q(0.5), p25: q(0.25), p75: q(0.75),
    sellers: sellers.size || null, freeShippingPct: withShip.length ? (withShip.filter((p) => p.freeShipping).length / withShip.length) * 100 : null,
    avgRating: rated.length ? rated.reduce((a, p) => a + p.rating!, 0) / rated.length : null, ratedCount: rated.length, buckets,
  };
}

export interface Opportunity {
  product: ProductResult;
  comparables: number;
  median: number;
  discountPct: number;
  evidence: string[];
  risks: string[];
}

/**
 * Oportunidades: produtos cujo preço está bem abaixo da mediana de anúncios COMPARÁVEIS
 * (mesmo produto e mesma variante) encontrados nas pesquisas do próprio usuário.
 * É um sinal de preço, não uma previsão de venda.
 */
export function findOpportunities(items: ProductResult[], minGroup = 3, minDiscountPct = 12): Opportunity[] {
  const priced = items.filter((p) => p.price != null && p.price > 0);
  const out: Opportunity[] = [];
  for (const group of groupComparable(priced)) {
    if (group.length < minGroup) continue;
    const sorted = group.map((g) => g.price!).sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
    const cheapest = group.reduce((a, b) => (a.price! <= b.price! ? a : b));
    const discountPct = ((median - cheapest.price!) / median) * 100;
    if (discountPct < minDiscountPct) continue;
    const risks = ["Preço muito abaixo do mercado pode indicar produto diferente, usado, sem garantia ou anúncio incorreto: confira o anúncio original."];
    if (cheapest.rating == null) risks.push("Sem avaliações disponíveis na fonte para este anúncio.");
    if (cheapest.condition && cheapest.condition !== "new") risks.push("O anúncio não é de produto novo.");
    out.push({ product: cheapest, comparables: group.length, median, discountPct, risks,
      evidence: [`${group.length} anúncios comparáveis encontrados na mesma pesquisa`, `Mediana dos comparáveis: R$ ${median.toFixed(2).replace(".", ",")}`,
        `Este anúncio está ${discountPct.toFixed(1).replace(".", ",")}% abaixo da mediana`] });
  }
  return out.sort((a, b) => b.discountPct - a.discountPct).slice(0, 30);
}
