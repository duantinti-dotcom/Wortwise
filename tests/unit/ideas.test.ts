import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
import { parseIdeas, storeSearchUrl } from "@/lib/ai/ideas";

describe("produtos estimados", () => {
  it("lê o JSON mesmo com cercas de código e corrige faixa invertida", () => {
    const raw = "```json\n[{\"emoji\":\"🎧\",\"nome\":\"Fone sem fio\",\"descricao\":\"Fone com estojo\",\"por_que_vende\":\"Muita procura\",\"publico\":\"Jovens\",\"preco_min\":90,\"preco_max\":40,\"dica\":\"Vídeo curto\",\"busca\":\"fone bluetooth\",\"imagem\":\"white wireless earbuds\"}, {\"nome\":\"x\"}]\n```";
    const out = parseIdeas(raw, "shopee");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ nome: "Fone sem fio", preco_min: 40, preco_max: 90, imagem: "white wireless earbuds", link: "https://shopee.com.br/search?keyword=fone%20bluetooth" });
  });
  it("monta o link de busca de cada loja", () => {
    expect(storeSearchUrl("mercadolivre", "garrafa térmica")).toBe("https://lista.mercadolivre.com.br/garrafa-t%C3%A9rmica");
    expect(storeSearchUrl("amazon", "fone")).toBe("https://www.amazon.com.br/s?k=fone");
  });
});
