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
  if (task === "amz-search-sample") {
    const r = await fetch("https://www.amazon.com.br/s?k=garrafa+termica", { headers: { accept: "text/html", "accept-language": "pt-BR,pt;q=0.9", "user-agent": "Mozilla/5.0 (compatible; WorthwiseBot/1.0; +https://worthwise.site)" }, signal: AbortSignal.timeout(12000) });
    const t = await r.text();
    const i = t.indexOf('data-component-type="s-search-result"');
    return NextResponse.json({ status: r.status, size: t.length, count: t.split('data-component-type="s-search-result"').length - 1, robot: /captcha|robot/i.test(t.slice(0, 5000)), block: i >= 0 ? (t.split('data-component-type="s-search-result"')[2] ?? '').slice(0, 30000) : t.slice(0, 800) });
  }
  if (task === "apify-probe") {
    // Testa o robô de TikTok Shop da Apify (e mostra os campos que ele devolve). Só leitura, poucos itens.
    const token = serverEnv().apifyToken;
    if (!token) return NextResponse.json({ error: "APIFY_TOKEN ausente" }, { status: 503 });
    const u = new URL(req.url);
    const actor = (u.searchParams.get("actor") ?? "pratikdani~tiktok-shop-scraper").replace("/", "~");
    const t = Date.now();
    const info = await fetch(`https://api.apify.com/v2/acts/${actor}?token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => null) as { data?: { name?: string; stats?: unknown; defaultRunOptions?: unknown; exampleRunInput?: { body?: string } } } | null;
    if (u.searchParams.get("schema") === "1") {
      const b = await fetch(`https://api.apify.com/v2/acts/${actor}/builds/default?token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => null) as { data?: { inputSchema?: string; actorDefinition?: { input?: unknown; readme?: string } } } | null;
      const schema = b?.data?.inputSchema ?? JSON.stringify(b?.data?.actorDefinition?.input ?? null);
      return NextResponse.json({ actor, schema: String(schema).slice(0, 6000), readme: (b?.data?.actorDefinition?.readme ?? "").slice(0, 3000) });
    }
    if (u.searchParams.get("search")) {
      const q = u.searchParams.get("search")!;
      const r = await fetch(`https://api.apify.com/v2/store?search=${encodeURIComponent(q)}&limit=12&token=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => null) as { data?: { items?: { username: string; name: string; title?: string; stats?: { totalUsers?: number }; currentPricingInfo?: { pricingModel?: string; pricePerUnitUsd?: number } }[] } } | null;
      return NextResponse.json((r?.data?.items ?? []).map((a) => ({ id: `${a.username}/${a.name}`, title: a.title, users: a.stats?.totalUsers, pricing: a.currentPricingInfo })));
    }
    const input = u.searchParams.get("input") ? JSON.parse(u.searchParams.get("input")!) : null;
    if (!input) return NextResponse.json({ actor, ms: Date.now() - t, exampleInput: info?.data?.exampleRunInput?.body ?? null, name: info?.data?.name ?? null });
    const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&limit=5&timeout=120`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(130000),
    });
    const body = await r.text();
    return NextResponse.json({ actor, status: r.status, ms: Date.now() - t, sample: body.slice(0, 4000) });
  }
  if (task === "gecko-refresh") {
    // Diário: atualiza sozinho os rankings da GeckoAPI guardados há mais de 3 dias.
    const { refreshStaleGecko } = await import("@/lib/connectors/gecko");
    return NextResponse.json({ task, result: await refreshStaleGecko() });
  }
  if (task === "gecko-check") {
    // Testa o caminho real do site: top 10, busca e produto, por loja. Só leitura (grava o histórico de preço, como o site).
    const { loadStoreTrending } = await import("@/lib/trending");
    const u = new URL(req.url);
    const store = (u.searchParams.get("store") ?? "mercadolivre") as "mercadolivre" | "shopee" | "tiktokshop";
    const what = u.searchParams.get("what") ?? "top";
    const t = Date.now();
    const ctx: ConnectorContext = { logs: [] };
    const brief = (p: { rank?: number; title: string; price: number | null; rating: number | null; reviewsCount: number | null; soldQuantity?: number | null; imageUrl: string | null; permalink: string | null; externalId: string }) =>
      ({ rank: p.rank, id: p.externalId, title: p.title.slice(0, 60), price: p.price, rating: p.rating, reviews: p.reviewsCount, sold: p.soldQuantity ?? null, img: p.imageUrl, link: p.permalink });
    try {
      if (what === "top") {
        const d = await loadStoreTrending(store, u.searchParams.get("cat"));
        return NextResponse.json({ ms: Date.now() - t, state: d.state, category: d.category, categories: d.categories.length, n: d.products.length, products: d.products.map(brief) });
      }
      if (what === "search") {
        const r = await CONNECTORS[store].search({ query: u.searchParams.get("q") ?? "garrafa termica", limit: 40, offset: 0 }, ctx);
        return NextResponse.json({ ms: Date.now() - t, n: r.length, products: r.slice(0, 5).map(brief) });
      }
      const p = await CONNECTORS[store].getProduct(u.searchParams.get("id") ?? "", ctx);
      return NextResponse.json({ ms: Date.now() - t, ...brief(p), description: p.description?.slice(0, 200) ?? null, images: p.images.length, attributes: p.attributes.length, available: p.available, seller: p.sellerName });
    } catch (e) {
      return NextResponse.json({ ms: Date.now() - t, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), logs: ctx.logs }, { status: 500 });
    }
  }
  if (task === "gecko-probe") {
    // Descobre o que a GeckoAPI entrega (tipos e campos) para ligar o Mercado Livre. Só leitura.
    const token = serverEnv().geckoToken;
    if (!token) return NextResponse.json({ error: "GECKO_API_KEY ausente" }, { status: 503 });
    // Teste: "body" é o JSON exato enviado à GeckoAPI (sempre para api.geckoapi.com.br/v1/extract).
    const u = new URL(req.url);
    const tries: Record<string, unknown>[] = JSON.parse(u.searchParams.get("body") ?? "[]");
    const max = Number(u.searchParams.get("max") ?? 6000);
    const out = [];
    for (const body of tries) {
      const t = Date.now();
      try {
        const r = await fetch("https://api.geckoapi.com.br/v1/extract", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
        out.push({ type: body.type, status: r.status, ms: Date.now() - t, body: (await r.text()).slice(0, max) });
      } catch (e) { out.push({ type: body.type, error: String(e).slice(0, 120) }); }
    }
    return NextResponse.json(out);
  }
  if (task === "img-check") {
    const u = "https://images-na.ssl-images-amazon.com/images/I/61Wa-avvnwL._AC_UL900_SR900,600_.jpg";
    const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
    return NextResponse.json({ status: r.status, type: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength });
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
    const { data: plans } = await supabaseAnon().from("plans").select("id, name, description, price_cents, provider_checkout_url").in("id", ["inicial", "pro", "business"]);
    const links: { plan: string; id?: number; url?: string; error?: string; existing?: string }[] = [];
    for (const p of (plans ?? []) as { id: string; name: string; description: string | null; price_cents: number; provider_checkout_url: string | null }[]) {
      if (p.provider_checkout_url && new URL(req.url).searchParams.get("recriar") !== "1") { links.push({ plan: p.id, existing: p.provider_checkout_url }); continue; }
      try {
        const l = await createSubscriptionLink(p);
        await serverRpc("server_set_plan_link", { p_plan: p.id, p_link_id: String(l.id), p_url: l.url });
        links.push({ plan: p.id, id: l.id, url: l.url });
      }
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
