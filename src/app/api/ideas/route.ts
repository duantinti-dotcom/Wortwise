import { getUser } from "@/lib/auth";
import { generateIdeas, IDEA_CATEGORIES } from "@/lib/ai/ideas";
import { apiError } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const STORES = new Set(["mercadolivre", "shopee", "amazon", "tiktokshop"]);

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para ver as ideias.");
  const url = new URL(req.url);
  const store = url.searchParams.get("loja") ?? "mercadolivre";
  const cat = url.searchParams.get("categoria") ?? IDEA_CATEGORIES[0].id;
  if (!STORES.has(store) || !IDEA_CATEGORIES.some((c) => c.id === cat)) return apiError("invalid_input", "Loja ou categoria inválida.");
  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "product" });
  if (allowed === false) return apiError("rate_limited", "Muitas consultas seguidas. Aguarde um minuto.");
  // Cache compartilhado do Cloudflare: a primeira pessoa espera a IA; as próximas recebem na hora.
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(`https://cache.worthwise.site/ideas/${store}/${cat}/${new Date().toISOString().slice(0, 10)}`);
  const hit = await edge?.match(cacheKey).catch(() => undefined);
  if (hit) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "private, max-age=600" } });
  try {
    const out = await generateIdeas(store, cat);
    if (!out) return apiError("not_configured", "A IA ainda não está disponível neste ambiente.");
    if (edge && out.ideas.length) {
      await edge.put(cacheKey, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "public, max-age=43200" } })).catch(() => {});
    }
    return Response.json(out, { headers: { "cache-control": "private, max-age=600" } });
  } catch (e) {
    console.error("[ideas]", e instanceof Error ? e.message : e);
    return apiError("source_unavailable", "A IA não respondeu agora. Tente de novo em instantes.");
  }
}
