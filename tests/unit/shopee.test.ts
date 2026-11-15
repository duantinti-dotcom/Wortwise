import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildQuery, shopeeAuthHeader, toResult } from "@/lib/connectors/shopee";

describe("conector Shopee (API de Afiliados)", () => {
  it("assina com SHA256(AppId + Timestamp + Payload + Secret)", async () => {
    const payload = '{"query":"{ x }"}';
    const h = await shopeeAuthHeader("123", "segredo", payload, 1700000000);
    const sig = createHash("sha256").update(`1231700000000${payload}segredo`).digest("hex");
    expect(h).toBe(`SHA256 Credential=123, Timestamp=1700000000, Signature=${sig}`);
  });

  it("monta a consulta com ordenação por vendidos e escapa a palavra-chave", () => {
    const q = buildQuery({ keyword: 'fone "bluetooth"', sortType: 2, limit: 80 });
    expect(q).toContain('keyword: "fone \\"bluetooth\\""');
    expect(q).toContain("sortType: 2");
    expect(q).toContain("limit: 50");
  });

  it("converte o produto sem inventar campos ausentes", () => {
    const r = toResult({ itemId: 987, productName: "Fone", imageUrl: "https://img", priceMin: "49.90", priceDiscountRate: 0, ratingStar: "4.7", sales: 1200, shopName: "Loja", offerLink: "https://s.shopee.com.br/x" }, "2026-11-15T00:00:00Z");
    expect(r).toMatchObject({ source: "shopee", externalId: "s-987", price: 49.9, originalPrice: null, rating: 4.7, sellerName: "Loja", permalink: "https://s.shopee.com.br/x", freeShipping: null, reviewsCount: null });
    expect(r.attributes).toEqual([{ name: "Vendidos (segundo a Shopee)", value: "1.200" }]);
  });
});
