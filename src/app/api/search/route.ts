import { z } from "zod";
import { getUser } from "@/lib/auth";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { runSearch } from "@/lib/search/service";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const schema = z.object({
  query: z.string().min(2).max(120),
  filters: z.object({
    sources: z.array(z.string().max(20)).max(5).optional(),
    priceMin: z.number().min(0).max(1e7).nullish(),
    priceMax: z.number().min(0).max(1e7).nullish(),
    minRating: z.number().min(0).max(5).nullish(),
    freeShipping: z.boolean().optional(),
    condition: z.enum(["new", "used"]).nullish(),
    sort: z.enum(["relevance", "price_asc", "price_desc", "rating"]).optional(),
  }).default({}),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para pesquisar.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Informe um termo de pesquisa entre 2 e 120 caracteres.");

  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "search" });
  if (allowed === false) return apiError("rate_limited", "Muitas pesquisas em sequência. Aguarde um minuto e tente novamente.");

  try {
    const out = await runSearch(body.query, body.filters);
    switch (out.status) {
      case "invalid":
        return apiError("invalid_input", "Termo de pesquisa inválido.");
      case "quota_exceeded":
        return apiError("quota_exceeded", out.plan === "free"
          ? "Você usou suas 3 pesquisas gratuitas." : "Você atingiu o limite de pesquisas do seu plano neste mês.", { plan: out.plan });
      case "no_source":
        return apiError("not_configured", "Nenhuma fonte de dados está disponível para esta pesquisa no momento. Nenhum crédito foi consumido.",
          { sources: out.sources, remaining: out.remaining });
      default:
        return NextResponse.json(out);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("account_blocked")) return apiError("forbidden", "Sua conta está bloqueada. Fale com o suporte.");
    console.error("[search]", msg);
    return apiError("internal", "Não foi possível concluir a pesquisa. Nenhum crédito foi consumido.");
  }
}
