import { describe, expect, it } from "vitest";
import { buildScenarios, calculateProfit, compareChannels, DEFAULT_INPUTS, landedCost, priceForTargetMargin, profitCurve } from "@/lib/profit/calc";

const base = { ...DEFAULT_INPUTS, costPrice: 20, salePrice: 60, quantity: 100, purchaseFreight: 200, saleShipping: 5,
  taxPct: 6, marketplaceFeePct: 12, marketplaceFixedFee: 1, paymentFeePct: 0, adsPct: 5, packaging: 1.5, otherCosts: 300 };

describe("calculadora de lucro", () => {
  it("calcula receita, custos, lucro e margens", () => {
    const r = calculateProfit(base);
    expect(r.grossRevenue).toBe(6000);
    expect(r.productCost).toBe(2200); // 100×20 + 200
    // por venda: 60×23% = 13,80 + 1 + 5 + 1,50 = 21,30
    expect(r.variableCostPerSale).toBe(21.3);
    expect(r.sellingCosts).toBe(2130);
    expect(r.totalCost).toBe(4630);
    expect(r.profit).toBe(1370);
    expect(r.profitPerUnit).toBe(13.7);
    expect(r.marginPct).toBeCloseTo(22.83, 2);
    expect(r.landedUnitCost).toBe(22);
    expect(r.contributionPerUnit).toBe(16.7);
    expect(r.breakEvenUnits).toBe(18); // 300 / 16,70
    expect(r.breakdown.reduce((a, b) => a + b.value, 0)).toBeCloseTo(r.totalCost, 2);
  });

  it("no preço mínimo o lucro é zero", () => {
    const r = calculateProfit(base);
    expect(calculateProfit({ ...base, salePrice: r.minPrice! }).profit).toBeCloseTo(0, 0);
  });

  it("encontra o preço para a margem desejada", () => {
    const p = priceForTargetMargin(base, 25)!;
    expect(calculateProfit({ ...base, salePrice: p }).marginPct).toBeCloseTo(25, 1);
    expect(priceForTargetMargin(base, 90)).toBeNull(); // impossível: taxas + margem > 100%
  });

  it("devoluções e perdas reduzem unidades vendidas e geram custo", () => {
    const r = calculateProfit({ ...base, returnsPct: 10, lossPct: 5 });
    expect(r.unitsLost).toBe(5);
    expect(r.unitsReturned).toBe(9.5);
    expect(r.unitsSold).toBe(85.5);
    expect(r.returnsCost).toBe(61.75);
    expect(r.profit).toBeLessThan(calculateProfit(base).profit);
  });

  it("não produz NaN com entradas vazias ou inválidas", () => {
    const r = calculateProfit({ ...DEFAULT_INPUTS, quantity: 0, salePrice: Number.NaN, taxPct: 500 });
    expect(r.marginPct).toBeNull();
    expect(Number.isFinite(r.profit)).toBe(true);
    expect(r.minPrice).toBeNull();
  });

  it("cenários ordenam do conservador ao otimista com hipóteses explícitas", () => {
    const [c, b, o] = buildScenarios({ ...base, returnsPct: 2 });
    expect(c!.result.profit).toBeLessThan(b!.result.profit);
    expect(o!.result.profit).toBeGreaterThan(b!.result.profit);
    expect(c!.assumptions.length).toBeGreaterThan(0);
  });

  it("curva de lucro cresce com o preço e comparação de canais mantém demais custos", () => {
    const curve = profitCurve(base);
    expect(curve.at(-1)!.profit).toBeGreaterThan(curve[0]!.profit);
    const ch = compareChannels(base);
    const own = ch.find((c) => c.preset.id === "loja-propria")!;
    const shopee = ch.find((c) => c.preset.id === "shopee")!;
    expect(own.result.profit).toBeGreaterThan(shopee.result.profit);
  });

  it("custo final por unidade distribui frete e impostos e aponta o que falta", () => {
    expect(landedCost({ unitPrice: 10, quantity: 50, freight: 100, taxes: 50 })).toMatchObject({ total: 650, perUnit: 13, missing: [] });
    expect(landedCost({ unitPrice: 10, quantity: 50 }).missing).toEqual(["frete", "impostos"]);
  });
});
