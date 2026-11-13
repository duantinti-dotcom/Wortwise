import { NextResponse } from "next/server";
import { dedupeKey, HEROPAY_TRIGGERS, verifySignature } from "@/lib/billing/heropay";
import { serverEnv } from "@/lib/env";
import { serverRpc } from "@/lib/supabase/server";

/**
 * Webhook HeroPay. Cada gatilho é cadastrado apontando para /api/webhooks/heropay?trigger=<gatilho>,
 * pois o payload não informa qual evento o originou.
 *  1. valida o HMAC SHA-256 do corpo bruto (X-HeroPay-Signature);
 *  2. grava o evento com chave de deduplicação única e aplica o efeito de forma idempotente no banco.
 * Responde 2xx apenas quando o evento foi persistido; caso contrário a HeroPay reenvia.
 */
export async function POST(req: Request) {
  const env = serverEnv();
  if (!env.heropayWebhookSecret || !env.serverSecret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const valid = await verifySignature(raw, req.headers.get("x-heropay-signature"), env.heropayWebhookSecret);
  if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const trigger = new URL(req.url).searchParams.get("trigger") ?? "";
  if (!(HEROPAY_TRIGGERS as readonly string[]).includes(trigger)) return NextResponse.json({ error: "unknown_trigger" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") throw new Error("payload");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await serverRpc<{ outcome: string }>("server_apply_billing_event", {
      p_trigger: trigger, p_dedupe_key: dedupeKey(trigger, payload), p_payload: payload,
    });
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (e) {
    console.error("[heropay-webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
