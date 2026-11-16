import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
import { isSmallTalk } from "@/lib/ai/small-talk";
import { buildSystemPrompt } from "@/lib/ai/agent";
import { parseWorkersAi } from "@/lib/ai/provider";

describe("assistente", () => {
  it("reconhece cumprimentos curtos (não gastam mensagem)", () => {
    for (const t of ["boa noite", "Boa noite!", "oi", "Olá, tudo bem?", "obrigado", "valeu", "bom dia wise"]) expect(isSmallTalk(t), t).toBe(true);
    for (const t of ["boa noite, quanto lucro tenho vendendo fone a 50?", "como vender na shopee", "oi quero ver garrafa térmica"]) expect(isSmallTalk(t), t).toBe(false);
  });

  it("informa a situação real das lojas e proíbe pesquisar quando nada está conectado", () => {
    const p = buildSystemPrompt({ firstName: "Ana", plan: "Grátis", searchesLeft: 3, stores: [{ name: "Mercado Livre", connected: false }, { name: "Shopee", connected: false }], interests: [] });
    expect(p).toContain("Lojas com dados conectados agora: nenhuma");
    expect(p).toContain("NÃO chame pesquisar_produtos");
    expect(p).toContain("Só cumprimente se a pessoa cumprimentar");
  });

  it("lê respostas do Workers AI no formato novo (choices) e no antigo (response)", () => {
    const novo = parseWorkersAi({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "calcular_lucro", arguments: "{\"preco_venda\":79.9}" } }] } }] });
    expect(novo.toolCalls).toEqual([{ id: "c1", name: "calcular_lucro", arguments: { preco_venda: 79.9 } }]);
    expect(parseWorkersAi({ choices: [{ message: { content: "Boa noite!" } }] }).content).toBe("Boa noite!");
    expect(parseWorkersAi({ response: "Oi", tool_calls: [{ name: "x", arguments: {} }] })).toMatchObject({ content: "Oi", toolCalls: [{ name: "x" }] });
  });
});
