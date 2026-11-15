import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVER_SECRET, startDb, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => { db = await startDb(); });
afterAll(async () => { await db?.stop(); });

const results = (n = 2) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `MLB${i}` })));
const search = (uid: string, fp: string, res = results()) =>
  db.as<{ record_search: { status: string; remaining: number } }>(uid,
    "select public.record_search($1, 'fone', '{}', $2::jsonb, '[]')", [fp, res]).then((r) => r[0].record_search);

const event = (trigger: string, key: string, payload: object, secret = SERVER_SECRET) =>
  db.as<{ r: { outcome: string } }>(null,
    "select public.server_apply_billing_event($1, $2, $3, $4::jsonb) r", [secret, trigger, key, JSON.stringify(payload)])
    .then((r) => r[0].r);

describe("cadastro e perfil", () => {
  it("cria o perfil automaticamente e começa no plano grátis", async () => {
    const u = await db.createUser("a@test.dev");
    const [p] = await db.as<{ full_name: string }>(u, "select full_name from public.profiles");
    expect(p.full_name).toBe("a");
    const [{ my_plan }] = await db.as<{ my_plan: string }>(u, "select public.my_plan()");
    expect(my_plan).toBe("free");
  });

  it("usuário não altera colunas sensíveis nem concede papel de admin a si mesmo", async () => {
    const u = await db.createUser("b@test.dev");
    await db.as(u, "update public.profiles set risk_flag = 'x', blocked_at = now(), full_name = 'Novo'");
    const { rows } = await db.pool.query("select risk_flag, blocked_at, full_name from public.profiles where id = $1", [u]);
    expect(rows[0]).toMatchObject({ risk_flag: null, blocked_at: null, full_name: "Novo" });
    await expect(db.as(u, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [u])).rejects.toThrow();
    await expect(db.as(u, "insert into public.subscriptions (user_id, plan_id, status, current_period_end) values ($1, 'pro', 'active', now() + interval '1 year')", [u])).rejects.toThrow();
    await expect(db.as(u, "update public.usage_counters set used = 0")).rejects.toThrow();
  });
});

describe("três pesquisas gratuitas", () => {
  it("cobra apenas pesquisas com resultado e bloqueia a quarta", async () => {
    const u = await db.createUser("c@test.dev");
    expect((await search(u, "empty", "[]")).status).toBe("empty");
    expect(await search(u, "q1")).toMatchObject({ status: "charged", remaining: 2 });
    expect(await search(u, "q2")).toMatchObject({ status: "charged", remaining: 1 });
    // reabrir a mesma pesquisa não consome crédito
    expect(await search(u, "q1")).toMatchObject({ status: "cached", remaining: 1 });
    expect(await search(u, "q3")).toMatchObject({ status: "charged", remaining: 0 });
    expect((await search(u, "q4")).status).toBe("quota_exceeded");
    const [{ p }] = await db.as<{ p: { status: string } }>(u, "select public.search_precheck('q5') p");
    expect(p.status).toBe("quota_exceeded");
    const [{ p: cached }] = await db.as<{ p: { status: string } }>(u, "select public.search_precheck('q2') p");
    expect(cached.status).toBe("cached");
  });

  it("requisições simultâneas nunca entregam mais de três pesquisas", async () => {
    const u = await db.createUser("d@test.dev");
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => search(u, `par-${i}`)));
    expect(out.filter((o) => o.status === "charged")).toHaveLength(3);
    expect(out.filter((o) => o.status === "quota_exceeded")).toHaveLength(9);
    const { rows } = await db.pool.query("select used from public.usage_counters where user_id = $1 and resource = 'search'", [u]);
    expect(rows[0].used).toBe(3);
  });

  it("a mesma pesquisa disparada em paralelo é cobrada uma única vez", async () => {
    const u = await db.createUser("e@test.dev");
    const out = await Promise.all(Array.from({ length: 6 }, () => search(u, "same")));
    expect(out.filter((o) => o.status === "charged")).toHaveLength(1);
    expect(out.filter((o) => o.status === "cached")).toHaveLength(5);
  });

  it("conta bloqueada não pesquisa", async () => {
    const u = await db.createUser("blocked@test.dev");
    await db.pool.query("update public.profiles set blocked_at = now() where id = $1", [u]);
    await expect(search(u, "x")).rejects.toThrow(/account_blocked/);
  });
});

describe("isolamento entre usuários (RLS)", () => {
  it("um usuário não lê nem altera dados de outro", async () => {
    const a = await db.createUser("f@test.dev");
    const b = await db.createUser("g@test.dev");
    await search(a, "priv");
    await db.as(a, "insert into public.favorites (user_id, source, external_id, title) values ($1, 'mercadolivre', 'MLB1', 'Fone')", [a]);
    expect(await db.as(b, "select * from public.favorites")).toHaveLength(0);
    expect(await db.as(b, "select id from public.searches")).toHaveLength(0);
    await expect(db.as(b, "insert into public.favorites (user_id, source, external_id, title) values ($1, 'mercadolivre', 'MLB2', 'x')", [a])).rejects.toThrow();
    expect(await db.as(null, "select * from public.plans where active")).toHaveLength(3);
    await expect(db.as(null, "select * from public.profiles")).rejects.toThrow();
  });
});

describe("cobrança HeroPay", () => {
  const paid = (src: string, id: string, value = "29.90") => ({
    buyer: { email: "x@nowhere.dev" }, payment: { id, value, method: "pix", status: "paid", net_value_cents: "2990", date: "2026-11-13T10:00:00-03:00" },
    cart: { src }, subscription: { id: "sub-1", status: "active", next_invoice_at: "" },
  });

  it("rejeita chamadas sem o segredo do servidor", async () => {
    await expect(event("spark_payment_confirmed", "k0", paid("x", "1"), "errado")).rejects.toThrow(/forbidden/);
  });

  it("ativa o plano somente com evento válido, é idempotente e confere o valor", async () => {
    const u = await db.createUser("h@test.dev");
    const [{ i }] = await db.as<{ i: { token: string } }>(u, "select public.create_checkout_intent('pro') i");
    // valor menor que o preço do plano: não libera
    expect((await event("spark_payment_confirmed", "pay:900", paid(i.token, "900", "5.00"))).outcome).toBe("amount_mismatch");
    expect((await db.as<{ my_plan: string }>(u, "select public.my_plan()"))[0].my_plan).toBe("free");

    expect((await event("spark_payment_confirmed", "pay:901", paid(i.token, "901"))).outcome).toBe("activated");
    expect((await event("spark_payment_confirmed", "pay:901", paid(i.token, "901"))).outcome).toBe("duplicate");
    expect((await db.as<{ my_plan: string }>(u, "select public.my_plan()"))[0].my_plan).toBe("pro");
    expect(await db.as(u, "select * from public.payments where status = 'paid'")).toHaveLength(2);

    // cota passa a ser a do plano Pro
    const [{ p }] = await db.as<{ p: { status: string; remaining: number } }>(u, "select public.search_precheck('novo') p");
    expect(p).toMatchObject({ status: "proceed", remaining: 300 });

    // cancelamento mantém o acesso até o fim do período pago
    expect((await event("subscription_cancel", "cancel:sub-1", paid(i.token, "901"))).outcome).toBe("canceled");
    expect((await db.as<{ my_plan: string }>(u, "select public.my_plan()"))[0].my_plan).toBe("pro");

    // estorno revoga imediatamente
    expect((await event("refunded", "refund:901", paid(i.token, "901"))).outcome).toBe("revoked");
    expect((await db.as<{ my_plan: string }>(u, "select public.my_plan()"))[0].my_plan).toBe("free");
  });

  it("evento sem usuário identificável não ativa nada", async () => {
    expect((await event("spark_payment_confirmed", "pay:777", { ...paid("desconhecido", "777"), subscription: { id: "sub-outro" } })).outcome).toBe("unmatched_user");
  });

  it("assinatura vencida deixa de dar acesso", async () => {
    const u = await db.createUser("i@test.dev");
    await db.pool.query("insert into public.subscriptions (user_id, plan_id, status, current_period_end) values ($1, 'business', 'active', now() - interval '1 minute')", [u]);
    expect((await db.as<{ my_plan: string }>(u, "select public.my_plan()"))[0].my_plan).toBe("free");
  });
});

describe("cotas por plano", () => {
  it("plano grátis não cria monitoramento; Pro cria e gera alerta real", async () => {
    const u = await db.createUser("j@test.dev");
    const ins = "insert into public.watches (user_id, source, external_id, title, rule_type, threshold) values ($1, 'mercadolivre', $2, 'Fone', 'price_below', 40) returning id";
    await expect(db.as(u, ins, [u, "MLB1"])).rejects.toThrow(/quota_exceeded:watch/);
    await db.pool.query("insert into public.subscriptions (user_id, plan_id, status, current_period_end) values ($1, 'pro', 'active', now() + interval '20 days')", [u]);
    const [{ id }] = await db.as<{ id: string }>(u, ins, [u, "MLB1"]);
    const check = (price: number) => db.as<{ r: { alert: boolean } }>(null,
      "select public.server_record_watch_check($1, $2, $3, 'BRL', null) r", [SERVER_SECRET, id, price]).then((r) => r[0].r);
    expect((await check(55)).alert).toBe(false);
    expect((await check(39.9)).alert).toBe(true);
    expect((await check(38)).alert).toBe(false); // já estava abaixo: não repete o alerta
    expect(await db.as(u, "select * from public.alerts")).toHaveLength(1);
  });

  it("coleções respeitam o limite do plano grátis", async () => {
    const u = await db.createUser("k@test.dev");
    const ins = "insert into public.collections (user_id, name) values ($1, $2)";
    await db.as(u, ins, [u, "Produtos para testar"]);
    await expect(db.as(u, ins, [u, "Outra"])).rejects.toThrow(/quota_exceeded:collection/);
  });

  it("mensagens de IA são consumidas atomicamente", async () => {
    const u = await db.createUser("l@test.dev");
    const out = await Promise.all(Array.from({ length: 9 }, () =>
      db.as<{ r: { allowed: boolean } }>(u, "select public.consume_quota('ai_message') r").then((r) => r[0].r.allowed)));
    expect(out.filter(Boolean)).toHaveLength(5);
    await expect(db.as(u, "select public.consume_quota('search')")).rejects.toThrow(/invalid_resource/);
  });
});

describe("administração e dados globais", () => {
  it("funções administrativas exigem papel de admin no banco", async () => {
    const u = await db.createUser("m@test.dev");
    await expect(db.as(u, "select public.admin_overview()")).rejects.toThrow(/forbidden/);
    await expect(db.as(u, "update public.plans set price_cents = 1 where id = 'pro' returning id")).resolves.toHaveLength(0);
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [u]);
    const [{ o }] = await db.as<{ o: { users: number } }>(u, "select public.admin_overview() o");
    expect(o.users).toBeGreaterThan(0);
    expect(await db.as(u, "update public.plans set price_cents = 5990 where id = 'pro' returning id")).toHaveLength(1);
    await db.pool.query("update public.plans set price_cents = 2990 where id = 'pro'");
  });

  it("fornecedor só vira 'verificado' por procedimento do servidor", async () => {
    const u = await db.createUser("n@test.dev");
    await expect(db.as(u, "insert into public.suppliers (owner_id, name, verification_status) values ($1, 'ACME', 'doc_verified')", [u])).rejects.toThrow();
    const [{ id }] = await db.as<{ id: string }>(u, "insert into public.suppliers (owner_id, name, cnpj) values ($1, 'ACME', '11222333000181') returning id", [u]);
    await db.as(u, "update public.suppliers set verification_status = 'doc_verified' where id = $1", [id]);
    let { rows } = await db.pool.query("select verification_status from public.suppliers where id = $1", [id]);
    expect(rows[0].verification_status).toBe("unverified");
    await db.as(null, "select public.server_record_verification($1, $2, 'passed', 'brasilapi', $3::jsonb)", [SERVER_SECRET, id, JSON.stringify({ razao_social: "ACME LTDA" })]);
    ({ rows } = await db.pool.query("select verification_status, legal_name from public.suppliers where id = $1", [id]));
    expect(rows[0]).toMatchObject({ verification_status: "doc_verified", legal_name: "ACME LTDA" });
  });

  it("histórico de preços só registra observações reais e sem duplicar", async () => {
    const item = { source: "mercadolivre", external_id: "MLB999", title: "Fone X", price: "59.90", currency: "BRL", metric_type: "buy_box" };
    const up = (it: object) => db.as<{ n: number }>(null, "select public.server_upsert_market_data($1, $2::jsonb) n", [SERVER_SECRET, JSON.stringify([it])]).then((r) => r[0].n);
    expect(await up(item)).toBe(1);
    expect(await up(item)).toBe(0); // mesmo preço, mesma janela: não cria ponto artificial
    expect(await up({ ...item, price: "54.90" })).toBe(1);
    expect(await up({ ...item, price: "" })).toBe(0); // ausência de preço não vira zero
    const { rows } = await db.pool.query("select price from public.price_observations order by id");
    expect(rows.map((r) => Number(r.price))).toEqual([59.9, 54.9]);
  });

  it("rate limit por usuário", async () => {
    const u = await db.createUser("o@test.dev");
    const hits: boolean[] = [];
    for (let i = 0; i < 7; i++) hits.push((await db.as<{ r: boolean }>(u, "select public.rate_limit_me('checkout') r"))[0].r);
    expect(hits.filter(Boolean).length).toBeLessThanOrEqual(5);
    expect(hits[6]).toBe(false);
  });

  it("exclusão de conta remove os dados do usuário", async () => {
    const u = await db.createUser("p@test.dev");
    await search(u, "bye");
    await db.as(u, "select public.delete_my_account()");
    const { rows } = await db.pool.query("select (select count(*) from public.profiles where id = $1) p, (select count(*) from public.searches where user_id = $1) s", [u]);
    expect(rows[0]).toMatchObject({ p: "0", s: "0" });
  });
});

describe("visibilidade limitada no plano grátis", () => {
  it("o banco só devolve os resultados visíveis e bloqueia leitura direta da coluna", async () => {
    const u = await db.createUser("q@test.dev");
    await search(u, "big", results(20));
    const [{ p }] = await db.as<{ p: { results: unknown[]; locked: number } }>(u, "select public.search_precheck('big') p");
    expect(p.results).toHaveLength(6);
    expect(p.locked).toBe(14);
    await expect(db.as(u, "select results from public.searches")).rejects.toThrow(/permission denied/);
    const rows = await db.as<{ id: string; result_count: number }>(u, "select id, result_count from public.searches");
    expect(rows[0]!.result_count).toBe(20);
    const [{ o }] = await db.as<{ o: { results: unknown[] } }>(u, "select public.open_search($1) o", [rows[0]!.id]);
    expect(o.results).toHaveLength(6);
    await db.pool.query("insert into public.subscriptions (user_id, plan_id, status, current_period_end) values ($1, 'pro', 'active', now() + interval '20 days')", [u]);
    const [{ p: pro }] = await db.as<{ p: { results: unknown[]; locked: number } }>(u, "select public.search_precheck('big') p");
    expect(pro.results).toHaveLength(20);
    expect(pro.locked).toBe(0);
  });
});
