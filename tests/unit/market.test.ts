import { describe, expect, it } from "vitest";
import type { ProductResult } from "@/lib/connectors/types";
import { applyFilters } from "@/lib/search/filters";
import { findOpportunities, marketStats } from "@/lib/market";

const mk = (id: string, title: string, price: number | null, extra: Partial<ProductResult> = {}): ProductResult => ({
  source: "mercadolivre", externalId: `i-${id}`, kind: "listing", title, imageUrl: null, permalink: null, price, originalPrice: null, currency: "BRL",
  rating: null, reviewsCount: null, sellerId: id, sellerName: null, available: true, freeShipping: null, condition: "new", brand: null, model: null, gtin: null,
  categoryId: null, offersCount: null, attributes: [], collectedAt: "2026-11-13T00:00:00Z", sourceUpdatedAt: null, ...extra });

describe("análise de mercado", () => {
  it("calcula estatísticas sem transformar ausência em zero", () => {
    const st = marketStats([mk("1", "A", 10), mk("2", "B", 20), mk("3", "C", 30), mk("4", "D", null)]);
    expect(st).toMatchObject({ count: 4, priced: 3, min: 10, max: 30, median: 20, sellers: 4, freeShippingPct: null, avgRating: null });
    expect(marketStats([]).median).toBeNull();
  });

  it("só aponta oportunidade com comparáveis suficientes e desconto relevante", () => {
    const same = ["Fone Bluetooth JBL Tune 520BT Preto", "Fone JBL Tune 520BT Bluetooth Azul", "Fone Bluetooth JBL Tune 520BT Original", "JBL Tune 520BT Fone Bluetooth"];
    const ops = findOpportunities([mk("1", same[0]!, 200), mk("2", same[1]!, 210), mk("3", same[2]!, 205), mk("4", same[3]!, 150), mk("5", "Capa Celular Silicone", 5)]);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.product.externalId).toBe("i-4");
    expect(ops[0]!.comparables).toBe(4);
    expect(ops[0]!.discountPct).toBeGreaterThan(20);
    expect(ops[0]!.risks.length).toBeGreaterThan(0);
    // dois comparáveis apenas: sem evidência suficiente
    expect(findOpportunities([mk("1", same[0]!, 200), mk("2", same[1]!, 100)])).toHaveLength(0);
    // capacidades diferentes não são comparáveis
    expect(findOpportunities([mk("1", "Galaxy A15 128GB", 900), mk("2", "Galaxy A15 256GB", 1300), mk("3", "Galaxy A15 256GB", 1320), mk("4", "Galaxy A15 256GB", 1310)])).toHaveLength(0);
  });

  it("filtros excluem itens sem o dado exigido e ordenam por preço", () => {
    const items = [mk("1", "A", 30, { freeShipping: true, rating: 4.8 }), mk("2", "B", 10), mk("3", "C", null), mk("4", "D", 20, { freeShipping: false, rating: 3 })];
    expect(applyFilters(items, { priceMax: 25 }).map((p) => p.externalId)).toEqual(["i-2", "i-4"]);
    expect(applyFilters(items, { freeShipping: true })).toHaveLength(1);
    expect(applyFilters(items, { minRating: 4 })).toHaveLength(1);
    expect(applyFilters(items, { sort: "price_asc" }).map((p) => p.price)).toEqual([10, 20, 30, null]);
  });
});
