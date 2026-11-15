import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import fixture from "../fixtures/gecko.json";
import { geckoMercadoLivre, geckoShopee, geckoTikTok, mlItem, shopeeItem, tiktokItem } from "@/lib/connectors/gecko";

type Json = Record<string, unknown>;
const now = "2026-11-15T22:00:00Z";
const items = (d: unknown) => ((d as { items: Json[] }).items);

describe("GeckoAPI: normalização das respostas reais", () => {
  it("Mercado Livre: mais vendidos com foto, preço, link e id do catálogo", () => {
    const list = items(fixture.mlBestsellers).map((i) => mlItem(i, now)).filter(Boolean);
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const p of list) {
      expect(p!.externalId).toMatch(/^[pi]-MLB\d+$/);
      expect(p!.title.length).toBeGreaterThan(5);
      expect(p!.permalink).toMatch(/^https:\/\/(www|produto)\.mercadolivre\.com\.br\//);
      expect(p!.provider).toBe("geckoapi");
    }
    expect(list[0]!.price).toBe(28);
  });

  it("Shopee: id com loja e item, nota e número de avaliações; vendidos só se a Shopee informar", () => {
    const list = items(fixture.shopeePlp).map((i) => shopeeItem(i, now)).filter(Boolean);
    expect(list.length).toBeGreaterThanOrEqual(10);
    const p = list[0]!;
    expect(p.externalId).toMatch(/^s-\d+x\d+$/);
    expect(p.imageUrl).toMatch(/^https:\/\/down-br\.img\.susercontent\.com\//);
    expect(p.rating).toBeGreaterThan(0);
    expect(p.reviewsCount).toBeGreaterThan(0);
    const raw = items(fixture.shopeePlp)[0]!;
    expect(p.soldQuantity).toBe(raw.soldCount ?? null);
  });

  it("TikTok Shop: quantidade vendida informada pelo TikTok, sem anúncios", () => {
    const list = items(fixture.tiktokPlp).map((i) => tiktokItem(i, now)).filter(Boolean);
    expect(list.length).toBeGreaterThan(0);
    const raw = items(fixture.tiktokPlp)[0]!;
    expect(list[0]).toMatchObject({ externalId: `t-${raw.productId}`, price: raw.price, soldQuantity: raw.soldCount, rating: raw.rating, currency: "BRL" });
    expect(tiktokItem({ ...raw, isAd: true }, now)).toBeNull();
  });

  it("não inventa campo ausente", () => {
    const p = tiktokItem({ productId: "1234567890", name: "Produto X" }, now)!;
    expect(p).toMatchObject({ price: null, currency: null, rating: null, soldQuantity: null, imageUrl: null, originalPrice: null });
    expect(mlItem({ name: "Sem id" }, now)).toBeNull();
    expect(shopeeItem({ itemId: "1", name: "Sem loja" }, now)).toBeNull();
  });
});

describe("GeckoAPI: chamadas", () => {
  it("sem GECKO_API_KEY os conectores dizem que não estão configurados e não chamam a rede", async () => {
    delete process.env.GECKO_API_KEY; delete process.env.GECKO_API_TOKEN;
    for (const c of [geckoMercadoLivre, geckoShopee, geckoTikTok]) expect(c.state().state).toBe("not_configured");
    await expect(geckoTikTok.getBestsellers!("casa", { logs: [] })).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("GeckoAPI: link do TikTok Shop", () => {
  it("usa o formato público /shop/pdp/{nome}/{id}", async () => {
    const { tiktokLink } = await import("@/lib/connectors/gecko");
    expect(tiktokLink("1737850574647363367", "Escorredor de Louças 2 Andares")).toBe("https://www.tiktok.com/shop/pdp/escorredor-de-loucas-2-andares/1737850574647363367");
  });
});
