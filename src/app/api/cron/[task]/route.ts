import { NextResponse } from "next/server";
import { CONNECTORS, isSourceId } from "@/lib/connectors/registry";
import { ConnectorError, type ConnectorContext } from "@/lib/connectors/types";
import { publicEnv, serverEnv } from "@/lib/env";
import { createSubscriptionLink, deleteWebhook, getPaymentLink, HANDLED_TRIGGERS, listWebhooks, registerWebhook } from "@/lib/billing/heropay";
import { runMaintenance } from "@/lib/maintenance";
import { warmAllIdeas } from "@/lib/ai/ideas";
import { AMAZON_CATEGORIES, getAmazonBestsellers } from "@/lib/connectors/amazon-bestsellers";
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
  if (task === "amz-check") {
    const out = [];
    for (const c of AMAZON_CATEGORIES) {
      try { const r = await getAmazonBestsellers(c.id); out.push({ c: c.id, n: r.products.length, first: r.products[0] && { t: r.products[0].title.slice(0, 50), price: r.products[0].price, rating: r.products[0].rating, img: Boolean(r.products[0].imageUrl) } }); }
      catch (e) { out.push({ c: c.id, error: e instanceof Error ? e.message : "erro" }); }
    }
    return NextResponse.json(out);
  }
  if (task === "amz-sample") {
    const r = await fetch("https://www.amazon.com.br/gp/bestsellers/kitchen", { headers: { accept: "text/html", "accept-language": "pt-BR,pt;q=0.9", "user-agent": "Mozilla/5.0 (compatible; WorthwiseBot/1.0; +https://worthwise.site)" }, signal: AbortSignal.timeout(12000) });
    const t = await r.text();
    const i = t.indexOf('id="gridItemRoot"');
    const j = t.indexOf('data-client-recs-list');
    return NextResponse.json({ status: r.status, grid: i, count: t.split('id="gridItemRoot"').length - 1, block: i >= 0 ? t.slice(i, i + 4500) : t.slice(0, 1500), recs: j >= 0 ? t.slice(j, j + 600) : null });
  }
  if (task === "robots") {
    const r = await fetch("https://www.amazon.com.br/robots.txt", { signal: AbortSignal.timeout(10000) });
    const t = await r.text();
    const lines = t.split("\n").map((l) => l.trim());
    // Só o bloco "User-agent: *"
    const start = lines.findIndex((l) => /^user-agent:\s*\*$/i.test(l));
    const block: string[] = [];
    for (let i = start + 1; i < lines.length && start >= 0; i++) { if (/^user-agent:/i.test(lines[i]!)) break; block.push(lines[i]!); }
    return NextResponse.json({ status: r.status, relevant: block.filter((l) => /bestseller|gp\/|zgbs|movers|new-releases|\/s\?|\/s$|dp\//i.test(l)).slice(0, 60) });
  }
  if (task === "meli-probe") {
    // Testa quais fontes públicas respondem sem credenciais.
    const urls = [
      "https://www.mercadolivre.com.br/mais-vendidos/MLB1574",
      "https://lista.mercadolivre.com.br/garrafa-termica",
      "https://www.amazon.com.br/gp/bestsellers/kitchen",
      "https://shopee.com.br/search?keyword=garrafa%20termica",
      "https://www.amazon.com.br/gp/rss/bestsellers/electronics",
      "https://www.amazon.com.br/gp/rss/bestsellers/kitchen",
      "https://www.amazon.com/gp/rss/bestsellers/electronics",
      "https://api.mercadolibre.com/sites/MLB/search?q=garrafa%20termica&limit=3",
      "https://api.mercadolibre.com/highlights/MLB/category/MLB1574",
      "https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=garrafa%20termica&limit=3",
      "https://api.mercadolibre.com/sites/MLB/categories",
      "https://api.mercadolibre.com/trends/MLB",
    ];
    const out = [];
    for (const u of urls) {
      const t = Date.now();
      try {
        const r = await fetch(u, { headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9", "user-agent": "Mozilla/5.0 (compatible; WorthwiseBot/1.0; +https://worthwise.site)" }, signal: AbortSignal.timeout(12000) });
        const body = await r.text();
        out.push({ u, status: r.status, type: r.headers.get("content-type"), ms: Date.now() - t, size: body.length,
          prices: (body.match(/R\$\s?\d[\d.]*,\d{2}|"price":\s?\d+/g) ?? []).length, title: (/<title>([^<]{0,90})/i.exec(body)?.[1] ?? "").trim(), robot: /captcha|robot|verifica|unusual traffic|access denied/i.test(body) });
      }
      catch (err) { out.push({ u, error: String(err).slice(0, 100) }); }
    }
    return NextResponse.json(out);
  }
  if (task === "ai-debug") {
    // Diagnóstico: modelos grátis do OpenRouter com ferramentas e teste nativo do Gemini.
    const e = serverEnv();
    const out: Record<string, unknown> = {};
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) });
      const j = (await r.json()) as { data?: { id: string; supported_parameters?: string[]; context_length?: number }[] };
      out.openrouterFree = (j.data ?? []).filter((m) => m.id.endsWith(":free") && (m.supported_parameters ?? []).includes("tools")).map((m) => m.id).slice(0, 40);
    } catch (err) { out.openrouterFree = String(err); }
    const variants: [string, string, Record<string, unknown> | null][] = [
      ["3.8-flash-low", "gemini-3.8-flash", { thinkingLevel: "low" }],
      ["3.5-flash-lite", "gemini-3.5-flash-lite", null],
      ["flash-lite-latest", "gemini-flash-lite-latest", null],
      ["3.5-flash-low", "gemini-3.5-flash", { thinkingLevel: "low" }],
    ];
    await Promise.all(variants.map(async ([name, model, thinking]) => {
      const t = Date.now();
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": e.geminiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Responda apenas: ok" }] }], generationConfig: { maxOutputTokens: 200, ...(thinking ? { thinkingConfig: thinking } : {}) } }), signal: AbortSignal.timeout(25000) });
        out[name] = { status: r.status, ms: Date.now() - t, body: (await r.text()).replace(/\s+/g, " ").slice(0, 220) };
      } catch (err) { out[name] = { ms: Date.now() - t, error: String(err).slice(0, 120) }; }
    }));
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=50", { headers: { "x-goog-api-key": e.geminiKey }, signal: AbortSignal.timeout(15000) });
      const j = (await r.json()) as { models?: { name: string }[]; error?: unknown };
      out.geminiModels = j.models ? j.models.map((m) => m.name).filter((n) => /flash|pro/.test(n)).slice(0, 30) : j.error;
    } catch (err) { out.geminiModels = String(err); }
    return NextResponse.json(out);
  }
  if (task === "ai-check") {
    const results = [];
    for (const p of aiProviders()) {
      const t = Date.now();
      try {
        const r = await p.provider.chat([{ role: "user", content: "Responda apenas: ok" }], [], 400, 30000);
        const t2 = Date.now();
        const tool = await p.provider.chat([{ role: "user", content: "Quanto lucro tenho comprando a 25 e vendendo a 79,90, 50 unidades?" }],
          [{ name: "calcular_lucro", description: "Calcula lucro.", parameters: { type: "object", properties: { preco_aquisicao: { type: "number" }, preco_venda: { type: "number" }, quantidade: { type: "number" } }, required: ["preco_aquisicao", "preco_venda", "quantidade"] } }], 800, 30000)
          .then((x) => x.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`).join(" ") || `sem ferramenta: ${x.content.slice(0, 60)}`).catch((er: unknown) => `erro: ${er instanceof Error ? er.message.slice(0, 120) : er}`);
        results.push({ id: p.id, model: p.model, ok: true, ms: Date.now() - t, reply: r.content.slice(0, 40), tool, toolMs: Date.now() - t2 });
      } catch (e) { results.push({ id: p.id, model: p.model, ok: false, ms: Date.now() - t, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }); }
    }
    return NextResponse.json({ task, results });
  }
  if (task === "heropay-rekey") {
    // Recadastra os 7 avisos com a senha secreta no endereço e remove os antigos (sem senha).
    const secret = serverEnv().heropayWebhookSecret;
    if (secret.length < 32) return NextResponse.json({ error: "HEROPAY_WEBHOOK_SECRET ausente" }, { status: 503 });
    const before = await listWebhooks();
    const created = [];
    for (const trigger of HANDLED_TRIGGERS) {
      const url = `${publicEnv.appUrl}/api/webhooks/heropay?trigger=${trigger}&k=${encodeURIComponent(secret)}`;
      const r = await registerWebhook(trigger, url);
      created.push({ trigger: r.trigger, ok: r.ok, error: r.error });
    }
    const removed = [];
    for (const w of before.filter((x) => x.url.includes("/api/webhooks/heropay") && !x.url.includes("&k="))) removed.push({ id: w.id, ...(await deleteWebhook(w.id)) });
    const after = await listWebhooks();
    return NextResponse.json({ task, created, removed, total: after.length, withKey: after.filter((x) => x.url.includes("&k=")).length });
  }
  if (task === "heropay-probe") {
    // Leitura (GET) de endpoints da HeroPay para achar o segredo de assinatura dos webhooks.
    const e = serverEnv();
    const out = [];
    for (const path of ["/webhook", "/webhooks", "/webhook/list", "/account", "/me", "/settings/webhook"]) {
      try {
        const r = await fetch(`${e.heropayUrl}${path}`, { headers: { authorization: `Bearer ${e.heropayToken}`, accept: "application/vnd.herospark.com; version=1" }, signal: AbortSignal.timeout(10000) });
        const t = await r.text();
        out.push({ path, status: r.status, keys: t.slice(0, 1).match(/[[{]/) ? Object.keys(((): Record<string, unknown> => { try { const j = JSON.parse(t); return Array.isArray(j) ? (j[0] ?? {}) : (j.data && !Array.isArray(j.data) ? j.data : Array.isArray(j.data) ? j.data[0] ?? {} : j); } catch { return {}; } })()) : [], sample: t.replace(/"(secret|token|signature[a-z_]*|key)"\s*:\s*"[^"]{6,}"/gi, '"$1":"<oculto>"').slice(0, 500) });
      } catch (err) { out.push({ path, error: String(err).slice(0, 100) }); }
    }
    if (new URL(req.url).searchParams.get("full") === "1") {
      const r = await fetch(`${e.heropayUrl}/webhook`, { headers: { authorization: `Bearer ${e.heropayToken}`, accept: "application/vnd.herospark.com; version=1" } });
      const j = (await r.json()) as { data?: { actions?: Record<string, unknown>[] } };
      const a = j.data?.actions?.[0] ?? {};
      const cfg = (a.configurations ?? {}) as Record<string, unknown>;
      return NextResponse.json({ count: j.data?.actions?.length, actionKeys: Object.keys(a), cfgKeys: Object.keys(cfg), headers: cfg.headers ?? null, method: cfg.request_method ?? cfg.method ?? null,
        names: (j.data?.actions ?? []).map((x) => `${x.id}:${x.name}:${String(((x.configurations ?? {}) as Record<string, unknown>).url ?? "").replace(/^https:\/\/worthwise\.site/, "")}`) });
    }
    return NextResponse.json(out);
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
