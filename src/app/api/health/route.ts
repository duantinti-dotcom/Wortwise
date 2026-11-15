import { NextResponse } from "next/server";
import { sourcesOverview } from "@/lib/connectors/registry";
import { heropayConfigured } from "@/lib/billing/heropay";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";

/** Diagnóstico de configuração (sem segredos): útil após o deploy. */
export function GET() {
  const e = serverEnv();
  return NextResponse.json({
    ok: true,
    supabase: isSupabaseConfigured(),
    serverSecret: Boolean(e.serverSecret),
    cronSecret: Boolean(e.cronSecret),
    heropay: { token: heropayConfigured(), webhookSecret: Boolean(e.heropayWebhookSecret), sandbox: e.heropayUrl.includes("beta") },
    sources: sourcesOverview().map((s) => ({ id: s.id, state: s.state })),
    ai: { providers: [e.geminiKey && "gemini", e.groqKey && "groq", e.openrouterKey && "openrouter", "cloudflare"].filter(Boolean) },
  });
}
