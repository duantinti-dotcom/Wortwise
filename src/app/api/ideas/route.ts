import { getUser } from "@/lib/auth";
import { AiQuotaError, getIdeasCached, IDEA_CATEGORIES } from "@/lib/ai/ideas";
import { apiError } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

// A IA só é usada nas lojas sem API rápida de conseguir (o Mercado Livre usa só dados oficiais).
const STORES = new Set(["shopee", "amazon", "tiktokshop"]);

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para ver as ideias.");
  const url = new URL(req.url);
  const store = url.searchParams.get("loja") ?? "shopee";
  const cat = url.searchParams.get("categoria") ?? IDEA_CATEGORIES[0].id;
  if (!STORES.has(store) || !IDEA_CATEGORIES.some((c) => c.id === cat)) return apiError("invalid_input", "Loja ou categoria inválida.");
  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "product" });
  if (allowed === false) return apiError("rate_limited", "Muitas consultas seguidas. Aguarde um minuto.");
  try {
    const out = await getIdeasCached(store, cat);
    if (!out) return apiError("not_configured", "A IA ainda não está disponível neste ambiente.");
    return Response.json(out, { headers: { "cache-control": "private, max-age=600" } });
  } catch (e) {
    if (e instanceof AiQuotaError) return apiError("rate_limited", "A IA atingiu o limite de uso de hoje. Volta a funcionar às 21h (horário de Brasília).");
    console.error("[ideas]", e instanceof Error ? e.message : e);
    return apiError("source_unavailable", "A IA não respondeu agora. Tente de novo em instantes.");
  }
}
