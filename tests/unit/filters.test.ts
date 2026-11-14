import { describe, expect, it } from "vitest";
import type { ProductResult } from "@/lib/connectors/types";
import { activeCount, applyFilters } from "@/lib/search/filters";

const P = (o: Partial<ProductResult>): ProductResult => ({
  source: "mercadolivre", externalId: o.externalId ?? "i-1", kind: "listing", title: "Fone Bluetooth", imageUrl: null, permalink: null, price: 50, originalPrice: null,
  currency: "BRL", rating: null, reviewsCount: null, sellerId: null, sellerName: null, available: true, freeShipping: null, condition: "new", brand: null, model: null,
  gtin: null, categoryId: null, offersCount: null, attributes: [], collectedAt: "2026-11-14T00:00:00Z", sourceUpdatedAt: null, ...o,
});

const items = [
  P({ externalId: "a", title: "Fone Bluetooth Preto 5.3", price: 40, originalPrice: 60, rating: 4.7, reviewsCount: 2000, freeShipping: true }),
  P({ externalId: "b", title: "Fone com fio branco", price: 25, rating: 3.9, reviewsCount: 15 }),
  P({ externalId: "c", source: "amazon", title: "Fone Bluetooth Pró", price: 150, rating: 4.4, reviewsCount: 300, fastDelivery: true, salesRank: { rank: 12, category: null } }),
  P({ externalId: "d", title: "Fone Gamer usado", price: null, condition: "used" }),
];
const ids = (xs: ProductResult[]) => xs.map((x) => x.externalId);

describe("filtros de pesquisa", () => {
  it("texto no título ignora acentos e exige todas as palavras", () => {
    expect(ids(applyFilters(items, { text: "bluetooth pro" }))).toEqual(["c"]);
  });
  it("faixa de preço exclui itens sem preço", () => {
    expect(ids(applyFilters(items, { priceMin: 30, priceMax: 200 }))).toEqual(["a", "c"]);
  });
  it("avaliação, número de avaliações, frete, desconto, Prime e condição", () => {
    expect(ids(applyFilters(items, { minRating: 4.5 }))).toEqual(["a"]);
    expect(ids(applyFilters(items, { minReviews: 100 }))).toEqual(["a", "c"]);
    expect(ids(applyFilters(items, { freeShipping: true }))).toEqual(["a"]);
    expect(ids(applyFilters(items, { discountOnly: true }))).toEqual(["a"]);
    expect(ids(applyFilters(items, { fastDelivery: true }))).toEqual(["c"]);
    expect(ids(applyFilters(items, { condition: "used" }))).toEqual(["d"]);
    expect(ids(applyFilters(items, { sources: ["amazon"] }))).toEqual(["c"]);
  });
  it("ordenações", () => {
    expect(ids(applyFilters(items, { sort: "price_asc" }))).toEqual(["b", "a", "c", "d"]);
    expect(ids(applyFilters(items, { sort: "discount" }))[0]).toBe("a");
    expect(ids(applyFilters(items, { sort: "reviews" }))).toEqual(["a", "c", "b", "d"]);
    expect(ids(applyFilters(items, { sort: "sales_rank" }))[0]).toBe("c");
  });
  it("conta filtros ativos (ordenação não conta)", () => {
    expect(activeCount({ sort: "price_asc" })).toBe(0);
    expect(activeCount({ text: "x", priceMin: 1, freeShipping: true, sources: ["amazon"] })).toBe(4);
  });
});
