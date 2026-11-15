import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAmazonBestsellers } from "@/lib/connectors/amazon-bestsellers";

describe("mais vendidos da Amazon (página pública)", () => {
  it("extrai posição, nome, foto, preço, avaliação e link", () => {
    const html = readFileSync("tests/fixtures/amazon-bestsellers.html", "utf8");
    const out = parseAmazonBestsellers(html, "2026-11-15T00:00:00Z");
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]).toMatchObject({
      rank: 1, source: "amazon", externalId: "a-B0F256HPZJ", price: 53.88, rating: 4.7, reviewsCount: 5208, offersCount: 10,
      permalink: "https://www.amazon.com.br/dp/B0F256HPZJ",
    });
    expect(out[0]!.title).toContain("Filtro/Refil Original");
    expect(out[0]!.imageUrl).toBe("https://images-na.ssl-images-amazon.com/images/I/61Wa-avvnwL._AC_UL900_SR900,600_.jpg");
  });
  it("não inventa nada quando a página não tem produtos", () => {
    expect(parseAmazonBestsellers("<html>verificação</html>")).toEqual([]);
  });
});
