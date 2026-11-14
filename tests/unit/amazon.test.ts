import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAmazon, amazon, buildSearchPayload } from "@/lib/connectors/amazon";
import { signV4 } from "@/lib/connectors/sigv4";

vi.mock("server-only", () => ({}));

const ITEM = {
  ASIN: "B0ABCDEF12", DetailPageURL: "https://www.amazon.com.br/dp/B0ABCDEF12?tag=minhaloja-20",
  Images: { Primary: { Large: { URL: "https://m.media-amazon.com/images/I/1.jpg" } }, Variants: [{ Large: { URL: "https://m.media-amazon.com/images/I/2.jpg" } }] },
  ItemInfo: { Title: { DisplayValue: "Fone Bluetooth X" }, Features: { DisplayValues: ["Bateria de 30 h", "Bluetooth 5.3"] },
    ByLineInfo: { Brand: { DisplayValue: "MarcaX" } }, ExternalIds: { EANs: { DisplayValues: ["7890000000001"] } } },
  Offers: { Listings: [{ Price: { Amount: 89.9, Currency: "BRL" }, SavingBasis: { Amount: 129.9 }, Condition: { Value: "New" },
    DeliveryInfo: { IsFreeShippingEligible: true, IsPrimeEligible: true }, MerchantInfo: { Name: "Amazon.com.br" } }], Summaries: [{ OfferCount: 4 }] },
  CustomerReviews: { Count: 1520, StarRating: { Value: 4.6 } },
  BrowseNodeInfo: { WebsiteSalesRank: { SalesRank: 37, DisplayName: "Eletrônicos" }, BrowseNodes: [{ Id: "16243890011", DisplayName: "Fones" }] },
};

describe("Amazon · Product Advertising API", () => {
  beforeEach(() => {
    __resetAmazon();
    process.env.AMAZON_PAAPI_ACCESS_KEY = "AKID"; process.env.AMAZON_PAAPI_SECRET_KEY = "secret"; process.env.AMAZON_PARTNER_TAG = "minhaloja-20";
  });
  afterEach(() => { vi.unstubAllGlobals(); for (const k of ["AMAZON_PAAPI_ACCESS_KEY", "AMAZON_PAAPI_SECRET_KEY", "AMAZON_PARTNER_TAG"]) delete process.env[k]; });

  it("assina como a AWS (Signature V4) — mesmo resultado do botocore", async () => {
    const body = '{"Keywords":"fone","PartnerTag":"tag-20","PartnerType":"Associates","Marketplace":"www.amazon.com.br"}';
    const h = await signV4({ method: "POST", host: "webservices.amazon.com.br", path: "/paapi5/searchitems", region: "us-east-1", service: "ProductAdvertisingAPI",
      headers: { "content-encoding": "amz-1.0", "content-type": "application/json; charset=utf-8", "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems" },
      body, accessKey: "AKIDEXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", now: new Date("2026-11-14T16:55:17Z") });
    expect(h.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261114/us-east-1/ProductAdvertisingAPI/aws4_request, SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, Signature=2c985958d8f76566eb978db34e7999ae7a127726384901a3beb87b7de25c1fb4");
  });

  it("traduz os filtros para a busca na origem", () => {
    const p = buildSearchPayload({ query: "fone", limit: 20, offset: 0, priceMin: 50, priceMax: 120.5, minRating: 4.5, freeShipping: true, condition: "new", sort: "price_asc" }, 2, ["ItemInfo.Title"]);
    expect(p).toMatchObject({ Keywords: "fone", ItemPage: 2, ItemCount: 10, MinPrice: 5000, MaxPrice: 12050, MinReviewsRating: 4, DeliveryFlags: ["FreeShipping"], Condition: "New", SortBy: "Price:LowToHigh" });
  });

  it("busca com fotos, descrição em tópicos, preço, desconto, Prime e ranking de vendas", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(JSON.stringify({ SearchResult: { Items: [ITEM], TotalResultCount: 1 } }));
    }));
    const [r] = await amazon.search({ query: "fone", limit: 20, offset: 0 }, { logs: [] });
    expect(calls[0]!.url).toBe("https://webservices.amazon.com.br/paapi5/searchitems");
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ PartnerTag: "minhaloja-20", PartnerType: "Associates", Marketplace: "www.amazon.com.br" });
    expect(r).toMatchObject({ source: "amazon", externalId: "a-B0ABCDEF12", title: "Fone Bluetooth X", price: 89.9, originalPrice: 129.9, rating: 4.6, reviewsCount: 1520,
      freeShipping: true, fastDelivery: true, brand: "MarcaX", gtin: "7890000000001", condition: "new", offersCount: 4, salesRank: { rank: 37, category: "Eletrônicos" },
      imageUrl: "https://m.media-amazon.com/images/I/1.jpg", permalink: "https://www.amazon.com.br/dp/B0ABCDEF12?tag=minhaloja-20" });
  });

  it("detalhe traz todas as fotos e todos os tópicos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ItemsResult: { Items: [ITEM] } }))));
    const d = await amazon.getProduct("a-B0ABCDEF12", { logs: [] });
    expect(d.images).toEqual(["https://m.media-amazon.com/images/I/1.jpg", "https://m.media-amazon.com/images/I/2.jpg"]);
    expect(d.features).toEqual(["Bateria de 30 h", "Bluetooth 5.3"]);
  });

  it("conta de Associado sem acesso liberado vira 'em credenciamento', sem inventar dados", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Errors: [{ Code: "AssociateNotEligible", Message: "not eligible" }] }), { status: 403 })));
    await expect(amazon.search({ query: "fone", limit: 10, offset: 0 }, { logs: [] })).rejects.toMatchObject({ code: "pending_approval" });
  });

  it("se a API recusar os recursos de oferta antigos, tenta com OffersV2", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      n++;
      const res = JSON.parse(String(init.body)).Resources as string[];
      if (res.some((x) => x.startsWith("Offers."))) return new Response(JSON.stringify({ Errors: [{ Code: "InvalidParameterValue", Message: "Offers resources are deprecated" }] }), { status: 400 });
      const v2 = { ...ITEM, Offers: undefined, OffersV2: { Listings: [{ Price: { Money: { Amount: 79.9, Currency: "BRL" } } }] } };
      return new Response(JSON.stringify({ SearchResult: { Items: [v2], TotalResultCount: 1 } }));
    }));
    const [r] = await amazon.search({ query: "fone", limit: 10, offset: 0 }, { logs: [] });
    expect(n).toBe(2);
    expect(r!.price).toBe(79.9);
  });

  it("sem credenciais informa 'não configurado'", async () => {
    delete process.env.AMAZON_PARTNER_TAG;
    expect(amazon.state().state).toBe("not_configured");
    await expect(amazon.search({ query: "fone", limit: 10, offset: 0 }, { logs: [] })).rejects.toMatchObject({ code: "not_configured" });
  });
});
