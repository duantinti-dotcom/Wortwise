import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { checkoutUrlFor } from "@/lib/billing/heropay";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.object({ plan: z.enum(["pro", "business"]) });

/**
 * Inicia a assinatura: cria uma intenção de checkout (token) e devolve a URL do checkout hospedado
 * pela HeroPay. O plano só é ativado quando o webhook assinado confirmar o pagamento.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para assinar.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Plano inválido.");

  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "checkout" });
  if (allowed === false) return apiError("rate_limited", "Muitas tentativas. Aguarde alguns minutos.");

  const { data, error } = await supabase.rpc("create_checkout_intent", { p_plan: body.plan });
  if (error) return apiError("internal", "Não foi possível iniciar o checkout.");
  const intent = data as { status: string; token?: string; checkout_url?: string | null; plan?: string };
  if (intent.status === "already_subscribed") {
    return apiError("invalid_input", "Você já tem uma assinatura ativa. Para trocar de plano, cancele a atual e assine o novo plano ao fim do período.", { plan: intent.plan });
  }
  if (!intent.checkout_url || !intent.token) {
    return apiError("not_configured", "O pagamento ainda não está habilitado para este plano. Tente novamente mais tarde.");
  }
  return NextResponse.json({ url: checkoutUrlFor(intent.checkout_url, intent.token) });
}
