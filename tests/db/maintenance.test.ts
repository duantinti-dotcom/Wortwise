import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVER_SECRET, startDb, type TestDb } from "./harness";

/**
 * Manutenção automática do banco: remove só o que é temporário, preserva dados importantes,
 * arquiva histórico antigo com restauração e avisa ao se aproximar da cota.
 */
let db: TestDb;
beforeAll(async () => { db = await startDb({ legacyFreeQuotas: true }); });
afterAll(async () => { await db?.stop(); });

const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.pool.query(sql, p).then((r) => r.rows as T[]);
const count = async (table: string, where = "true") => Number((await q<{ n: string }>(`select count(*) n from ${table} where ${where}`))[0]!.n);
const maintain = () => db.as<{ r: Record<string, number> }>(null, "select public.server_maintenance($1) r", [SERVER_SECRET]).then((r) => r[0]!.r);

async function product(ext: string) {
  const [{ id }] = await q<{ id: string }>("insert into public.products (source, external_id, title) values ('mercadolivre', $1, 'Fone') returning id", [ext]);
  return id;
}
async function obs(pid: string, price: number, minutesAgo: number, extra: Partial<{ offers: number; metric: string }> = {}) {
  const [{ id }] = await q<{ id: string }>(
    "insert into public.price_observations (product_id, source, metric_type, price, currency, offers_count, collected_at) values ($1, 'mercadolivre', $2, $3, 'BRL', $4, now() - make_interval(mins => $5)) returning id",
    [pid, extra.metric ?? "listing", price, extra.offers ?? null, minutesAgo]);
  return Number(id);
}

describe("limpeza automática", () => {
  it("remove caches e logs vencidos e preserva contas, assinaturas, pagamentos, favoritos e simulações", async () => {
    const u = await db.createUser("keep@test.dev");
    await q("insert into public.subscriptions (user_id, plan_id, status, current_period_end) values ($1, 'pro', 'active', now() + interval '20 days')", [u]);
    await q("insert into public.payments (user_id, provider_payment_id, status, amount_cents) values ($1, 'pay-1', 'paid', 2990)", [u]);
    await q("insert into public.favorites (user_id, source, external_id, title) values ($1, 'mercadolivre', 'MLB1', 'Fone')", [u]);
    await q("insert into public.simulations (user_id, name, inputs, results) values ($1, 'Sim', '{}', '{}')", [u]);
    await q("insert into public.webhook_events (provider, dedupe_key, trigger, payload, received_at) values ('heropay', 'old', 'x', '{}', now() - interval '3 years')");
    await q("insert into public.admin_audit_logs (action, created_at) values ('old_action', now() - interval '3 years')");
    // Temporários: velhos (devem sair) e novos (devem ficar)
    await q("insert into public.api_usage_logs (source, endpoint, ok, created_at) values ('ml', 'a', true, now() - interval '40 days'), ('ml', 'b', true, now())");
    await q("insert into public.rate_limits (key, window_start, count) values ('k1', now() - interval '3 days', 1), ('k2', now(), 1)");
    await q("insert into public.signup_events (user_id, ip_hash, created_at) values ($1, 'h', now() - interval '100 days'), ($1, 'h2', now())", [u]);
    await q("insert into public.checkout_intents (token, user_id, plan_id, created_at) values ('t-old', $1, 'pro', now() - interval '40 days'), ('t-new', $1, 'pro', now())", [u]);
    await q("insert into public.checkout_intents (token, user_id, plan_id, created_at, consumed_at) values ('t-paid', $1, 'pro', now() - interval '400 days', now() - interval '399 days')", [u]);

    const r = await maintain();
    expect(r.api_logs).toBe(1);
    expect(r.rate_limits).toBe(1);
    expect(r.signup_ips).toBe(1);
    expect(r.checkout_intents).toBe(1);
    expect(await count("public.api_usage_logs")).toBe(1);
    expect(await count("public.rate_limits")).toBe(1);
    expect(await count("public.checkout_intents", "token in ('t-new', 't-paid')")).toBe(2); // pago é histórico financeiro
    // Nada importante foi tocado
    expect(await count("auth.users", "id = '" + u + "'")).toBe(1);
    expect(await count("public.subscriptions", "user_id = '" + u + "' and status = 'active'")).toBe(1);
    expect(await count("public.payments")).toBeGreaterThanOrEqual(1);
    expect(await count("public.favorites")).toBe(1);
    expect(await count("public.simulations")).toBe(1);
    expect(await count("public.webhook_events", "dedupe_key = 'old'")).toBe(1);
    expect(await count("public.admin_audit_logs", "action = 'old_action'")).toBe(1);
  });

  it("registra cada execução com quantidade removida e tamanho do banco, e tira a foto do dia", async () => {
    const [run] = await q<{ ok: boolean; rows_removed: number; bytes_before: string; bytes_after: string }>(
      "select ok, rows_removed, bytes_before, bytes_after from app_private.maintenance_runs where task = 'maintenance' order by id desc limit 1");
    expect(run!.ok).toBe(true);
    expect(Number(run!.bytes_before)).toBeGreaterThan(0);
    expect(Number(run!.bytes_after)).toBeGreaterThan(0);
    expect(await count("app_private.storage_snapshots", "day = current_date")).toBe(1);
  });

  it("pode ser desligada (e cada tarefa individualmente)", async () => {
    await q("update public.app_settings set value = jsonb_set(value, '{enabled}', 'false') where key = 'maintenance'");
    expect((await maintain()).skipped).toBe("disabled");
    await q("update public.app_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{tasks,purge_logs}', 'false') where key = 'maintenance'");
    await q("insert into public.api_usage_logs (source, endpoint, ok, created_at) values ('ml', 'velho', true, now() - interval '90 days')");
    await maintain();
    expect(await count("public.api_usage_logs", "endpoint = 'velho'")).toBe(1);
    await q("update public.app_settings set value = jsonb_set(value, '{tasks,purge_logs}', 'true') where key = 'maintenance'");
  });

  it("só administradores veem a saúde do banco, executam ou mudam a rotina", async () => {
    const u = await db.createUser("comum@test.dev");
    await expect(db.as(u, "select public.admin_db_health()")).rejects.toThrow(/forbidden/);
    await expect(db.as(u, "select public.admin_run_maintenance()")).rejects.toThrow(/forbidden/);
    await expect(db.as(null, "select public.server_maintenance('segredo-errado')")).rejects.toThrow();
    await expect(db.as(u, "select * from app_private.maintenance_runs")).rejects.toThrow();
    const a = await db.createUser("adm-maint@test.dev");
    await q("with r as (insert into public.user_roles (user_id, role) values ($1, 'admin') returning user_id) insert into app_private.admin_emails select lower(u.email) from auth.users u join r on r.user_id = u.id on conflict do nothing", [a]);
    const [{ h }] = await db.as<{ h: { db_bytes: number; percent: number; tables: unknown[]; runs: unknown[] } }>(a, "select public.admin_db_health() h");
    expect(h.db_bytes).toBeGreaterThan(0);
    expect(h.tables.length).toBeGreaterThan(0);
    expect(h.runs.length).toBeGreaterThan(0);
    const [{ s }] = await db.as<{ s: { tasks: { analyze: boolean }; enabled: boolean } }>(a, "select public.admin_set_maintenance(true, '{\"analyze\": false, \"inventada\": true}') s");
    expect(s.tasks.analyze).toBe(false);
    expect((s.tasks as Record<string, unknown>).inventada).toBeUndefined();
    await db.as(a, "select public.admin_set_maintenance(true, '{\"analyze\": true}')");
  });
});

describe("histórico de preços", () => {
  it("remove só observações repetidas em sequência (< 6 h) e nunca cria ou altera valores", async () => {
    const pid = await product("MLB-dedupe");
    await obs(pid, 50, 1800);
    const dup = await obs(pid, 50, 1740);            // igual e 1 h depois → duplicata
    await obs(pid, 50, 1200);                        // igual, mas 9 h depois → mantém (confirma o preço no tempo)
    await obs(pid, 50, 1170, { offers: 7 });         // mesmo preço, número de ofertas diferente → mantém
    await obs(pid, 45, 1140);                        // mudou → mantém
    await obs(pid, 50, 1740, { metric: "buy_box" }); // outra métrica → mantém
    await maintain();
    const left = await q<{ id: string; price: string }>("select id, price from public.price_observations where product_id = $1 order by collected_at", [pid]);
    expect(left.map((r) => Number(r.id))).not.toContain(dup);
    expect(left).toHaveLength(5);
    expect(left.map((r) => Number(r.price)).sort()).toEqual([45, 50, 50, 50, 50]);
  });

  it("evita gravar a mesma observação duas vezes, mesmo em chamadas simultâneas", async () => {
    const item = JSON.stringify([{ source: "mercadolivre", external_id: "MLB-conc", title: "X", price: "10", currency: "BRL", metric_type: "listing" }]);
    await Promise.all(Array.from({ length: 6 }, () => db.as(null, "select public.server_upsert_market_data($1, $2::jsonb)", [SERVER_SECRET, item])));
    expect(await count("public.price_observations o join public.products p on p.id = o.product_id", "p.external_id = 'MLB-conc'")).toBe(1);
  });

  it("arquiva histórico antigo com manifesto, consulta e restauração idêntica", async () => {
    const pid = await product("MLB-archive");
    const oldIds = [await obs(pid, 99.9, 60 * 24 * 500), await obs(pid, 89.9, 60 * 24 * 450)];
    const recent = await obs(pid, 79.9, 60 * 24 * 10);
    const before = await q("select * from public.price_observations where id = any($1) order by id", [oldIds]);

    const [{ c }] = await db.as<{ c: { id: number }[] }>(null, "select public.server_archive_candidates($1, 100) c", [SERVER_SECRET]);
    const ids = c.map((r) => Number(r.id));
    expect(ids).toEqual(expect.arrayContaining(oldIds));
    expect(ids).not.toContain(recent); // recente nunca é candidato

    // recusa commit que inclua uma observação recente
    await expect(db.as(null, "select public.server_archive_commit($1, 'price-history/2025/01/x.ndjson.gz', $2, 10, $3)",
      [SERVER_SECRET, "a".repeat(64), [...oldIds, recent]])).rejects.toThrow(/archive_mismatch/);
    expect(await count("public.price_observations", `id = ${recent}`)).toBe(1);

    const key = "price-history/2025/06/lote-1.ndjson.gz";
    await db.as(null, "select public.server_archive_commit($1, $2, $3, 1234, $4)", [SERVER_SECRET, key, "b".repeat(64), oldIds]);
    expect(await count("public.price_observations", `id = any('{${oldIds.join(",")}}')`)).toBe(0);
    const [{ l }] = await db.as<{ l: { key: string }[] }>(null, "select public.server_archive_lookup($1, $2) l", [SERVER_SECRET, pid]);
    expect(l.map((x) => x.key)).toEqual([key]);

    // restauração: mesmas linhas, mesmos ids e valores
    const rows = JSON.stringify(c.filter((r) => oldIds.includes(Number(r.id))));
    await db.as(null, "select public.server_archive_restore($1, $2, $3::jsonb)", [SERVER_SECRET, key, rows]);
    const after = await q("select * from public.price_observations where id = any($1) order by id", [oldIds]);
    expect(after).toEqual(before);
  });
});

describe("alertas de cota", () => {
  it("avisa os administradores ao cruzar 70%, 85% e 95% — uma vez por nível", async () => {
    const a = await db.createUser("adm-alert@test.dev");
    await q("with r as (insert into public.user_roles (user_id, role) values ($1, 'admin') returning user_id) insert into app_private.admin_emails select lower(u.email) from auth.users u join r on r.user_id = u.id on conflict do nothing", [a]);
    const [{ size }] = await q<{ size: string }>("select pg_database_size(current_database()) size");
    const quotaFor = (pct: number) => Math.floor(Number(size) * 100 / pct);
    const setQuota = (b: number) => q("update public.app_settings set value = jsonb_set(value, '{quota_bytes}', to_jsonb($1::bigint)) where key = 'maintenance'", [b]);

    await setQuota(quotaFor(75)); await maintain();
    await maintain(); // mesmo nível: não repete
    await setQuota(quotaFor(96)); await maintain();
    const msgs = await q<{ title: string }>("select title from public.alerts where user_id = $1 and kind = 'system_storage' order by created_at", [a]);
    expect(msgs.map((m) => m.title)).toEqual(["Banco de dados em 70% da cota", "Banco de dados em 95% da cota"]);
    await setQuota(524288000); await maintain();
    const [{ value }] = await q<{ value: { last_alert_level: number } }>("select value from public.app_settings where key = 'maintenance'");
    expect(value.last_alert_level).toBe(0);
  });
});

describe("pesquisas salvas", () => {
  it("remove só a lista de atributos do cache e mantém preço, foto, título e demais campos", async () => {
    const u = await db.createUser("busca@test.dev");
    const res = [{ externalId: "i-1", title: "Fone", price: 50, imageUrl: "https://x/y.jpg", attributes: [{ name: "Cor", value: "Preto" }] }];
    await db.as(u, "select public.record_search('fp-comp', 'fone', '{}', $1::jsonb, '[]')", [JSON.stringify(res)]);
    await maintain();
    const [{ results }] = await q<{ results: Record<string, unknown>[] }>("select results from public.searches where fingerprint = 'fp-comp'");
    expect(results[0]).toEqual({ externalId: "i-1", title: "Fone", price: 50, imageUrl: "https://x/y.jpg" });
  });
});
