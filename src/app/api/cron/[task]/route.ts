import { NextResponse } from "next/server";
import { CONNECTORS, isSourceId } from "@/lib/connectors/registry";
import { ConnectorError, type ConnectorContext } from "@/lib/connectors/types";
import { serverEnv } from "@/lib/env";
import { runMaintenance } from "@/lib/maintenance";
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
