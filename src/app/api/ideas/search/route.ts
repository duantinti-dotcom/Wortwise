import { getUser } from "@/lib/auth";
import { AiQuotaError, searchProducts } from "@/lib/ai/ideas";
import { apiError } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const STORES = new Set(["mercadolivre", "shopee", "amazon", "tiktokshop"]);

/** Pesquisa de produtos com estimativas (usada enquanto a loja não tem dados conectados). */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para pesquisar.");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const loja = url.searchParams.get("loja");
  if (q.length < 2 || q.length > 80) return apiError("invalid_input", "Digite de 2 a 80 caracteres.");
  if (loja && !STORES.has(loja)) return apiError("invalid_input", "Loja inválida.");
  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "search" });
  if (allowed === false) return apiError("rate_limited", "Muitas pesquisas seguidas. Aguarde um minuto.");
  try {
    const out = await searchProducts(q, loja);
    if (!out) return apiError("not_configured", "A pesquisa está indisponível no momento.");
    return Response.json(out, { headers: { "cache-control": "private, max-age=600" } });
  } catch (e) {
    if (e instanceof AiQuotaError) return apiError("rate_limited", "A pesquisa atingiu o limite de uso de hoje. Volta às 21h (horário de Brasília).");
    console.error("[ideas-search]", e instanceof Error ? e.message : e);
    return apiError("source_unavailable", "Não foi possível pesquisar agora. Tente de novo em instantes.");
  }
}
