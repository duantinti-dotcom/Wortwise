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
  imagem: z.string().max(160).catch(""),
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
  return out.slice(0, 12);
}

/** O ranking da IA é renovado a cada 3 dias (economiza a cota diária da IA). */
const bucket = () => String(Math.floor(Date.now() / (3 * 86400000)));

export class AiQuotaError extends Error {}

const memory = new Map<string, { at: number; ideas: Idea[] }>();
const TTL = 3 * 24 * 60 * 60 * 1000;

export async function generateIdeas(store: string, categoryId: string): Promise<{ ideas: Idea[]; generatedAt: string } | null> {
  const cat = IDEA_CATEGORIES.find((c) => c.id === categoryId) ?? IDEA_CATEGORIES[0];
  const storeName = STORE_NAMES[store] ?? "marketplaces brasileiros";
  const key = `v2:${store}:${cat.id}:${bucket()}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ideas: hit.ideas, generatedAt: new Date(hit.at).toISOString() };

  const provider = getAiProvider();
  if (!provider) return null;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
  const ask = (angle: string) => provider.chat([
    { role: "system", content: "Você é analista de e-commerce no Brasil e conhece bem o que mais vende em cada marketplace. Responda SOMENTE com JSON válido, sem texto antes ou depois." },
    { role: "user", content: `Liste 4 produtos ${angle} entre os que MAIS VENDEM hoje na ${storeName}, categoria "${cat.name}" (${month}), do mais vendido para o menos vendido.
Use produtos genéricos (sem marcas famosas registradas), do tipo que aparece no ranking de mais vendidos.
Devolva um array JSON com 4 objetos, cada um com exatamente estes campos:
{"emoji": "um emoji", "nome": "nome do produto como aparece num anúncio (curto)", "descricao": "o que é, em 1 frase curta", "por_que_vende": "por que vende tanto, em 1 frase curta", "publico": "para quem", "preco_min": número em reais, "preco_max": número em reais, "dica": "1 dica prática curta para vender", "busca": "2 a 4 palavras para buscar na loja", "imagem": "descrição curta EM INGLÊS da aparência do produto para gerar uma foto"}
preco_min e preco_max: faixa de preço de venda típica ao consumidor nessa loja.` },
  ], [], 1700, 80000);
  // Três partes em paralelo (faixas de preço diferentes): 12 produtos no tempo de 4.
  const parts = await Promise.allSettled([ask("baratos (até uns R$ 50)"), ask("de preço médio (R$ 50 a R$ 150)"), ask("de ticket mais alto (acima de R$ 150)")]);
  const seen = new Set<string>();
  if (parts.every((p) => p.status === "rejected")) {
    const msg = parts.map((p) => (p.status === "rejected" ? String((p.reason as Error)?.message ?? p.reason) : "")).join(" ");
    if (/allocation|neurons|429|quota|capacity/i.test(msg)) throw new AiQuotaError(msg);
  }
  const lists = parts.map((p) => (p.status === "fulfilled" ? parseIdeas(p.value.content, store) : []));
  const ideas: Idea[] = [];
  for (let i = 0; i < 4; i++) for (const l of lists) { const it = l[i]; if (it && !seen.has(it.nome.toLowerCase())) { seen.add(it.nome.toLowerCase()); ideas.push(it); } }
  if (!ideas.length) return { ideas: [], generatedAt: new Date().toISOString() };
  memory.set(key, { at: Date.now(), ideas });
  if (memory.size > 100) memory.delete(memory.keys().next().value!);
  return { ideas, generatedAt: new Date().toISOString() };
}

const STORE_IDS = ["mercadolivre", "shopee", "amazon", "tiktokshop"] as const;
type IdeasResult = { ideas: Idea[]; generatedAt: string };
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;
const cacheKey = (store: string, cat: string) => new Request(`https://cache.worthwise.site/ideas-v2/${store}/${cat}/${bucket()}`);

/** Lê do cache compartilhado do Cloudflare; se não houver, pede à IA e guarda por 24 h. */
export async function getIdeasCached(store: string, cat: string): Promise<IdeasResult | null> {
  const edge = edgeCache();
  const key = cacheKey(store, cat);
  const hit = await edge?.match(key).catch(() => undefined);
  if (hit) return (await hit.json()) as IdeasResult;
  const out = await generateIdeas(store, cat);
  if (edge && out?.ideas.length) {
    await edge.put(key, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "public, max-age=259200" } })).catch(() => {});
  }
  return out;
}

/** Prepara todas as combinações de loja e categoria (usado pelo agendamento diário). */
export async function warmAllIdeas(): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  const combos = STORE_IDS.flatMap((s) => IDEA_CATEGORIES.map((c) => [s, c.id] as const));
  for (let i = 0; i < combos.length; i += 4) {
    const batch = await Promise.allSettled(combos.slice(i, i + 4).map(([s, c]) => getIdeasCached(s, c)));
    for (const r of batch) (r.status === "fulfilled" && r.value?.ideas.length ? ok++ : failed++);
  }
  return { ok, failed };
}
