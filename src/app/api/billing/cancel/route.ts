import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { cancelRecurring, HeroPayError, heropayConfigured } from "@/lib/billing/heropay";
import { apiError, sameOrigin } from "@/lib/http";
import { serverRpc, supabaseServer } from "@/lib/supabase/server";

/** Cancela a assinatura no provedor. O acesso permanece até o fim do período já pago. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta.");

  const supabase = await supabaseServer();
  const { data: sub } = await supabase.from("subscriptions").select("status, provider_subscription_id, current_period_end").eq("user_id", user.id).maybeSingle();
  if (!sub || !["active", "past_due"].includes(sub.status as string)) return apiError("not_found", "Você não tem assinatura ativa para cancelar.");
  if (!heropayConfigured()) return apiError("not_configured", "O cancelamento automático está indisponível. Fale com o suporte para cancelar.");
  if (!sub.provider_subscription_id) {
    return apiError("source_unavailable", "Ainda não recebemos o identificador da assinatura do provedor. Tente novamente em alguns minutos ou fale com o suporte.");
  }
  try {
    await cancelRecurring(sub.provider_subscription_id as string);
  } catch (e) {
    // 400 = já cancelada no provedor: seguimos para sincronizar o estado local.
    if (!(e instanceof HeroPayError && e.status === 400)) {
      return apiError("source_unavailable", "O provedor de pagamento não confirmou o cancelamento. Nada foi alterado; tente novamente.");
    }
  }
  try {
    await serverRpc("server_mark_canceled", { p_user: user.id, p_reason: "user_request" });
  } catch {
    return apiError("internal", "Cancelamento confirmado pelo provedor, mas a sincronização falhou. Ela será concluída pelo webhook.");
  }
  return NextResponse.json({ status: "canceled", accessUntil: sub.current_period_end });
}
