import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, isAdmin } from "@/lib/auth";
import { createSubscriptionLink, HANDLED_TRIGGERS, HeroPayError, heropayConfigured, registerWebhook } from "@/lib/billing/heropay";
import { publicEnv, serverEnv } from "@/lib/env";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_link"), plan: z.enum(["pro", "business"]) }),
  z.object({ action: z.literal("register_webhooks") }),
]);

/** Operações administrativas da HeroPay (criar link do plano, cadastrar webhooks). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user || !(await isAdmin())) return apiError("forbidden", "Acesso restrito a administradores.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Ação inválida.");
  if (!heropayConfigured()) return apiError("not_configured", "HEROPAY_JWT_TOKEN não configurado.");

  const supabase = await supabaseServer();
  try {
    if (body.action === "create_link") {
      const { data: plan } = await supabase.from("plans").select("id, name, description, price_cents").eq("id", body.plan).single();
      if (!plan) return apiError("not_found", "Plano não encontrado.");
      const link = await createSubscriptionLink(plan as { id: string; name: string; description: string | null; price_cents: number });
      const { error } = await supabase.from("plans").update({ provider_link_id: String(link.id), provider_checkout_url: link.url }).eq("id", body.plan);
      if (error) return apiError("internal", "Link criado, mas não foi possível salvar no plano.");
      await supabase.rpc("admin_log", { p_action: "heropay.create_link", p_target: body.plan, p_details: { link_id: link.id, sandbox: serverEnv().heropayUrl.includes("beta") } });
      return NextResponse.json({ url: link.url, id: link.id });
    }
    const results = [];
    for (const trigger of HANDLED_TRIGGERS) {
      results.push(await registerWebhook(trigger, `${publicEnv.appUrl}/api/webhooks/heropay?trigger=${trigger}`));
    }
    await supabase.rpc("admin_log", { p_action: "heropay.register_webhooks", p_target: publicEnv.appUrl, p_details: { results } });
    return NextResponse.json({ results });
  } catch (e) {
    return apiError("source_unavailable", e instanceof HeroPayError ? e.message : "Falha ao falar com a HeroPay.");
  }
}

