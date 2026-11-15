import { NextResponse } from "next/server";
import { CONNECTORS, isSourceId } from "@/lib/connectors/registry";
import { ConnectorError, type ConnectorContext } from "@/lib/connectors/types";
import { publicEnv, serverEnv } from "@/lib/env";
import { createSubscriptionLink, getPaymentLink, HANDLED_TRIGGERS, registerWebhook } from "@/lib/billing/heropay";
import { runMaintenance } from "@/lib/maintenance";
import { warmAllIdeas } from "@/lib/ai/ideas";
import { aiProviders } from "@/lib/ai/provider";
import { flushLogs, toMarketItem } from "@/lib/search/service";
import { serverRpc, serverRpcSafe, supabaseAnon } from "@/lib/supabase/server";

interface DueWatch { id: string; source: string; external_id: string }

/**
 * Tarefas agendadas (Cloudflare Cron Trigger → custom-worker.ts → esta rota).
 *  monitor: verifica produtos monitorados, em lotes, uma consulta por produto distinto.
 *  maintenance (antes "purge"): limpeza e otimização do banco + arquivamento no R2 (ver lib/maintenance.ts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ task: string }> }) {
  const env = serverEnv();
  const auth = req.headers.get("authorization");
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { task } = await params;

  // "purge" (nome antigo do agendamento) e "maintenance" executam a mesma rotina.
  if (task === "purge" || task === "maintenance") {
    return NextResponse.json({ task: "maintenance", result: await runMaintenance() });
  }
  if (task === "ai-check") {
    const results = [];
    for (const p of aiProviders()) {
      const t = Date.now();
      try {
        const r = await p.provider.chat([{ role: "user", content: "Responda apenas: ok" }], [], 400, 30000);
        results.push({ id: p.id, model: p.model, ok: true, ms: Date.now() - t, reply: r.content.slice(0, 40) });
      } catch (e) { results.push({ id: p.id, model: p.model, ok: false, ms: Date.now() - t, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }); }
    }
    return NextResponse.json({ task, results });
  }
  if (task === "heropay-check") {
    const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 5);
    const out = [];
    for (const id of ids) { try { out.push({ id, data: await getPaymentLink(id) }); } catch (e) { out.push({ id, error: e instanceof Error ? e.message : "erro" }); } }
    return NextResponse.json({ task, links: out });
  }
  if (task === "heropay-setup") {
    // Configuração inicial da HeroPay feita pelo servidor: links de assinatura e webhooks.
    const { data: plans } = await supabaseAnon().from("plans").select("id, name, description, price_cents, provider_checkout_url").in("id", ["pro", "business"]);
    const links: { plan: string; id?: number; url?: string; error?: string; existing?: string }[] = [];
    for (const p of (plans ?? []) as { id: string; name: string; description: string | null; price_cents: number; provider_checkout_url: string | null }[]) {
      if (p.provider_checkout_url && new URL(req.url).searchParams.get("recriar") !== "1") { links.push({ plan: p.id, existing: p.provider_checkout_url }); continue; }
      try { const l = await createSubscriptionLink(p); links.push({ plan: p.id, id: l.id, url: l.url }); }
      catch (e) { links.push({ plan: p.id, error: e instanceof Error ? e.message : "erro" }); }
    }
    const hooks = [];
    if (new URL(req.url).searchParams.get("webhooks") !== "0") for (const trigger of HANDLED_TRIGGERS) hooks.push(await registerWebhook(trigger, `${publicEnv.appUrl}/api/webhooks/heropay?trigger=${trigger}`));
    return NextResponse.json({ task, links, hooks });
  }
  if (task === "ideas") {
    return NextResponse.json({ task: "ideas", result: await warmAllIdeas() });
  }
  if (task !== "monitor") return NextResponse.json({ error: "unknown_task" }, { status: 404 });

  const { data: cfg } = await supabaseAnon().from("app_settings").select("value").eq("key", "monitoring").maybeSingle();
  const settings = (cfg?.value ?? {}) as { min_interval_minutes?: number; batch_size?: number };
  const due = await serverRpc<DueWatch[]>("server_due_watches", {
    p_limit: Math.min(settings.batch_size ?? 40, 100), p_min_age_minutes: Math.max(settings.min_interval_minutes ?? 360, 30),
  });

  // Uma consulta por produto distinto, mesmo que vários usuários o monitorem.
  const groups = new Map<string, DueWatch[]>();
  for (const w of due) {
    const k = `${w.source}:${w.external_id}`;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  const ctx: ConnectorContext = { logs: [] };
  let checked = 0;
  let alerts = 0;
  let failed = 0;
  for (const watches of groups.values()) {
    const first = watches[0]!;
    let price: number | null = null;
    let currency = "BRL";
    let error: string | null = null;
    if (!isSourceId(first.source) || CONNECTORS[first.source].state().state !== "connected") {
      error = "Fonte indisponível";
    } else {
      try {
        const p = await CONNECTORS[first.source].getProduct(first.external_id, ctx);
        price = p.price;
        currency = p.currency ?? "BRL";
        if (price == null) error = "A fonte não informou preço";
        else await serverRpcSafe("server_upsert_market_data", { p_items: [toMarketItem(p)] });
      } catch (e) {
        error = e instanceof ConnectorError ? e.code : "falha";
        if (e instanceof ConnectorError && e.code === "rate_limited") break; // respeita o limite da fonte
      }
    }
    for (const w of watches) {
      const r = await serverRpc<{ status: string; alert?: boolean }>("server_record_watch_check", {
        p_watch: w.id, p_price: price, p_currency: currency, p_error: error,
      });
      checked++;
      if (r.alert) alerts++;
      if (r.status === "error") failed++;
    }
  }
  await flushLogs(ctx.logs);
  return NextResponse.json({ task, due: due.length, products: groups.size, checked, alerts, failed });
}
