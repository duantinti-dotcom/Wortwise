import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMercadoLivre, mercadoLivre } from "@/lib/connectors/mercadolivre";
import { ConnectorError } from "@/lib/connectors/types";

vi.mock("server-only", () => ({}));

type Route = (url: string) => unknown;
function mockFetch(routes: Record<string, Route | unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 21600 }));
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.includes(prefix)) {
        const out = typeof body === "function" ? (body as Route)(url) : body;
        return out instanceof Response ? out : new Response(JSON.stringify(out));
      }
    }
    return new Response("{}", { status: 404 });
  }));
  return calls;
}

describe("Mercado Livre · vitrine Em alta", () => {
  beforeEach(() => { __resetMercadoLivre(); process.env.MELI_CLIENT_ID = "id"; process.env.MELI_CLIENT_SECRET = "secret"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.MELI_CLIENT_ID; delete process.env.MELI_CLIENT_SECRET; });

  it("monta o ranking com fotos, preço e link, na ordem informada pela fonte", async () => {
    mockFetch({
      "/highlights/MLB/category/MLB1000": { query_data: { highlight_type: "BEST_SELLER" }, content: [
        { id: "MLB111", position: 2, type: "ITEM" },
        { id: "MLB222", position: 1, type: "PRODUCT" },
        { id: "MLB333", position: 3, type: "USER_PRODUCT" },
      ] },
      "/products/MLB222": { id: "MLB222", name: "Fone TWS", permalink: "https://www.mercadolivre.com.br/p/MLB222",
        pictures: [{ url: "http://http2.mlstatic.com/D_1-O.jpg" }], buy_box_winner: { item_id: "MLB9", price: 59.9, currency_id: "BRL", shipping: { free_shipping: true } } },
      "/items?ids=MLB111": [{ code: 200, body: { id: "MLB111", title: "Smartwatch", price: 129, currency_id: "BRL", thumbnail: "http://http2.mlstatic.com/D_2-I.jpg",
        permalink: "https://produto.mercadolivre.com.br/MLB-111", pictures: [], seller: { id: 5, nickname: "LOJA" } } }],
    });
    const out = await mercadoLivre.getBestsellers!("MLB1000", { logs: [] });
    expect(out.map((p) => [p.rank, p.title])).toEqual([[1, "Fone TWS"], [2, "Smartwatch"]]);
    expect(out[0]!.imageUrl).toBe("https://http2.mlstatic.com/D_1-O.jpg");
    expect(out[0]!.price).toBe(59.9);
    expect(out[0]!.freeShipping).toBe(true);
    // Miniatura pequena (-I) vira a versão grande (-O), sempre em https.
    expect(out[1]!.imageUrl).toBe("https://http2.mlstatic.com/D_2-O.jpg");
    expect(out[1]!.permalink).toBe("https://produto.mercadolivre.com.br/MLB-111");
  });

  it("não inventa itens: o que a fonte não detalha fica de fora", async () => {
    mockFetch({
      "/highlights/MLB/category/MLB1051": { content: [{ id: "MLB1", position: 1, type: "PRODUCT" }, { id: "MLB2", position: 2, type: "PRODUCT" }] },
      "/products/MLB1": new Response("{}", { status: 500 }),
      "/products/MLB2": { id: "MLB2", name: "Celular X", pictures: [] },
    });
    const out = await mercadoLivre.getBestsellers!("MLB1051", { logs: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rank: 2, title: "Celular X", price: null, imageUrl: null });
  });

  it("rejeita categoria inválida sem chamar a API", async () => {
    const calls = mockFetch({});
    await expect(mercadoLivre.getBestsellers!("../x", { logs: [] })).rejects.toBeInstanceOf(ConnectorError);
    expect(calls).toHaveLength(0);
  });

  it("lê as buscas em alta da categoria", async () => {
    const calls = mockFetch({ "/trends/MLB/MLB1000": [{ keyword: " fone bluetooth ", url: "http://lista.mercadolivre.com.br/fone" }, { keyword: "" }] });
    const out = await mercadoLivre.getTrends!("MLB1000", { logs: [] });
    expect(out).toEqual([{ keyword: "fone bluetooth", url: "https://lista.mercadolivre.com.br/fone" }]);
    expect(calls.some((u) => u.endsWith("/trends/MLB/MLB1000"))).toBe(true);
  });

  it("sem credenciais, informa que a fonte não está configurada", async () => {
    delete process.env.MELI_CLIENT_ID;
    mockFetch({});
    await expect(mercadoLivre.getBestsellers!("MLB1000", { logs: [] })).rejects.toMatchObject({ code: "not_configured" });
  });
});
