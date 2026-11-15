import "server-only";
import { z } from "zod";
import { getAiProvider } from "./provider";

/**
 * Ideias de produtos geradas por IA para cada loja e categoria.
 * NÃO são dados da loja: são sugestões a partir de conhecimento geral, com faixa de preço
 * marcada como estimativa e link para a busca real na loja, onde a pessoa confere tudo.
 */
export const IDEA_CATEGORIES = [
  { id: "eletronicos", name: "Eletrônicos" }, { id: "casa", name: "Casa e cozinha" }, { id: "beleza", name: "Beleza" },
  { id: "moda", name: "Moda" }, { id: "esportes", name: "Esportes e fitness" }, { id: "pets", name: "Pets" },
  { id: "infantil", name: "Bebês e brinquedos" }, { id: "celular", name: "Acessórios de celular" },
] as const;

const STORE_NAMES: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon Brasil", tiktokshop: "TikTok Shop Brasil" };

export const ideaSchema = z.object({
  emoji: z.string().max(8).catch("🛍️"),
  nome: z.string().min(2).max(80),
  descricao: z.string().min(5).max(260),
  por_que_vende: z.string().min(5).max(220),
  publico: z.string().max(100).catch(""),
  preco_min: z.coerce.number().min(1).max(20000),
  preco_max: z.coerce.number().min(1).max(20000),
  dica: z.string().max(200).catch(""),
  busca: z.string().min(2).max(60),
});
export type Idea = z.infer<typeof ideaSchema> & { link: string };

export function storeSearchUrl(store: string, q: string) {
  const e = encodeURIComponent(q);
  switch (store) {
    case "mercadolivre": return `https://lista.mercadolivre.com.br/${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}`;
    case "shopee": return `https://shopee.com.br/search?keyword=${e}`;
    case "amazon": return `https://www.amazon.com.br/s?k=${e}`;
    default: return `https://www.tiktok.com/search?q=${e}`;
  }
}

export function parseIdeas(raw: string, store: string): Idea[] {
  const start = raw.indexOf("["), end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try { arr = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Idea[] = [];
  for (const item of arr) {
    const p = ideaSchema.safeParse(item);
    if (!p.success) continue;
    const lo = Math.min(p.data.preco_min, p.data.preco_max), hi = Math.max(p.data.preco_min, p.data.preco_max);
    out.push({ ...p.data, preco_min: lo, preco_max: hi, link: storeSearchUrl(store, p.data.busca) });
  }
  return out.slice(0, 8);
}

const memory = new Map<string, { at: number; ideas: Idea[] }>();
const TTL = 12 * 60 * 60 * 1000;

export async function generateIdeas(store: string, categoryId: string): Promise<{ ideas: Idea[]; generatedAt: string } | null> {
  const cat = IDEA_CATEGORIES.find((c) => c.id === categoryId) ?? IDEA_CATEGORIES[0];
  const storeName = STORE_NAMES[store] ?? "marketplaces brasileiros";
  const key = `${store}:${cat.id}:${new Date().toISOString().slice(0, 10)}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ideas: hit.ideas, generatedAt: new Date(hit.at).toISOString() };

  const provider = getAiProvider();
  if (!provider) return null;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
  const res = await provider.chat([
    { role: "system", content: "Você é especialista em e-commerce no Brasil. Responda SOMENTE com JSON válido, sem texto antes ou depois." },
    { role: "user", content: `Sugira 8 ideias de produtos com bom potencial para revender na ${storeName}, categoria "${cat.name}", pensando em ${month}.
Prefira produtos de giro rápido, fáceis de enviar e com boa margem para pequenos vendedores. Não cite marcas registradas famosas.
Devolva um array JSON com 8 objetos, cada um com exatamente estes campos:
{"emoji": "um emoji que represente o produto", "nome": "nome curto do produto", "descricao": "o que é o produto em 1 frase", "por_que_vende": "por que costuma vender bem, em 1 frase", "publico": "para quem", "preco_min": número em reais, "preco_max": número em reais, "dica": "1 dica prática para vender", "busca": "2 a 4 palavras para buscar o produto na loja"}
preco_min e preco_max são uma faixa de preço de venda ESTIMADA ao consumidor.` },
  ], [], 2600);
  const ideas = parseIdeas(res.content, store);
  if (!ideas.length) return { ideas: [], generatedAt: new Date().toISOString() };
  memory.set(key, { at: Date.now(), ideas });
  if (memory.size > 100) memory.delete(memory.keys().next().value!);
  return { ideas, generatedAt: new Date().toISOString() };
}
