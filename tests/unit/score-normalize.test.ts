import { describe, expect, it } from "vitest";
import { computeScore } from "@/lib/score/score";
import { analyzeTitle, groupComparable, isComparable, normalizeQuery } from "@/lib/normalize/title";

describe("Worthwise Score", () => {
  it("não inventa nota sem dados suficientes", () => {
    expect(computeScore({})).toMatchObject({ status: "insufficient", score: null, confidence: null });
    expect(computeScore({ marginPct: 25 }).status).toBe("insufficient");
    expect(computeScore({ offersCount: 5, reviewsCount: 100, supplierVerified: true }).status).toBe("insufficient");
  });

  it("calcula nota e confiança separadamente", () => {
    const r = computeScore({ marginPct: 24, price: 50, comparablePrices: [55, 60, 58, 62], offersCount: 8, reviewsCount: 1200 });
    expect(r.status).toBe("ok");
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe("alto");
    const partial = computeScore({ marginPct: 24, offersCount: 8, supplierVerified: false });
    expect(partial.status).toBe("ok");
    expect(partial.confidence).toBe("baixo");
  });

  it("fatores ausentes ficam nulos (não viram zero)", () => {
    const r = computeScore({ marginPct: 30, price: 40, comparablePrices: [50, 52, 49], offersCount: 2 });
    expect(r.factors.find((f) => f.id === "stability")!.score).toBeNull();
    expect(r.score).toBeGreaterThan(80);
  });

  it("margem ruim e preço acima do mercado derrubam a nota", () => {
    const r = computeScore({ marginPct: 2, price: 80, comparablePrices: [55, 60, 58], offersCount: 50, reviewsCount: 3 });
    expect(r.score).toBeLessThan(30);
  });
});

describe("normalização de títulos", () => {
  it("remove ruído e extrai variantes", () => {
    const t = analyzeTitle("Fone Bluetooth JBL Tune 520BT Preto - Original Frete Grátis!");
    expect(t.tokens).toEqual(expect.arrayContaining(["fone", "bluetooth", "jbl", "tune", "520bt"]));
    expect(t.tokens).not.toContain("original");
    expect(t.variants.color).toBe("preto");
    expect(analyzeTitle("Smartphone Galaxy A15 128GB 4GB RAM").variants.capacity).toEqual(["128gb", "4gb"]);
    expect(analyzeTitle("Kit 3 Camisetas Básicas Algodão").variants.pack).toBe(3);
    expect(analyzeTitle("Garrafa Térmica 500 ml").variants.capacity).toEqual(["500ml"]);
  });

  it("não trata capacidades ou kits diferentes como o mesmo produto", () => {
    expect(isComparable({ title: "Smartphone Galaxy A15 128GB" }, { title: "Smartphone Galaxy A15 256GB" })).toBe(false);
    expect(isComparable({ title: "Kit 3 Camisetas Básicas" }, { title: "Camisetas Básicas" })).toBe(false);
    expect(isComparable({ title: "Fone Bluetooth JBL Tune 520BT Preto" }, { title: "Fone JBL Tune 520BT Bluetooth Azul Original" })).toBe(true);
    expect(isComparable({ title: "A", gtin: "789" }, { title: "B completamente diferente", gtin: "789" })).toBe(true);
    expect(isComparable({ title: "Fone X", brand: "JBL" }, { title: "Fone X", brand: "Sony" })).toBe(false);
  });

  it("agrupa comparáveis e normaliza consultas", () => {
    const g = groupComparable([{ title: "Mouse Gamer Redragon Cobra" }, { title: "Mouse Redragon Cobra Gamer Preto" }, { title: "Teclado Mecânico Redragon Kumara" }]);
    expect(g.map((x) => x.length)).toEqual([2, 1]);
    expect(normalizeQuery("  Fone   Bluetooth!! para Revender ")).toBe("fone bluetooth para revender");
  });
});
