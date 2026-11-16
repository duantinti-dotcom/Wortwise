import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVER_SECRET, startDb, type TestDb } from "./harness";

/** Worthwise Control: autorização (papel + MFA), coleta, alertas e relatórios. */
let db: TestDb;
let owner: string;
let customer: string;
let fakeAdmin: string;

const AAL2 = { aal: "aal2" as const };
const RANGE = "now() - interval '30 days', now() + interval '1 minute'";

async function makeOwner(email: string) {
  const id = await db.createUser(email);
  await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [id]);
  await db.pool.query("insert into app_private.admin_emails (email) values (lower($1)) on conflict do nothing", [email]);
  return id;
}

beforeAll(async () => {
  db = await startDb();
  owner = await makeOwner("dono-control@test.dev");
  customer = await db.createUser("cliente-control@test.dev");
  // Tem o papel "admin", mas o e-mail não está na lista do dono: não pode entrar no painel.
  fakeAdmin = await db.createUser("falso-admin@test.dev");
  await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [fakeAdmin]);
});
afterAll(async () => { await db?.stop(); });

const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as Error).message; } };

describe("autorização do painel", () => {
  it("usuário comum não acessa nenhum relatório, nem com MFA", async () => {
    expect(await err(db.as(customer, `select public.control_overview(${RANGE})`, [], AAL2))).toMatch(/forbidden/);
    expect(await err(db.as(customer, `select public.control_security(${RANGE})`, [], AAL2))).toMatch(/forbidden/);
    const [s] = await db.as<{ s: { role: string | null; areas: string[] } }>(customer, "select public.control_session() s");
    expect(s!.s.role).toBeNull();
    expect(s!.s.areas).toEqual([]);
  });

  it("anônimo não consegue nem chamar as funções", async () => {
    expect(await err(db.as(null, `select public.control_overview(${RANGE})`))).toMatch(/permission denied/);
  });

  it("administrador sem MFA (aal1) é recusado com mfa_required", async () => {
    expect(await err(db.as(owner, `select public.control_overview(${RANGE})`))).toMatch(/mfa_required/);
    const [s] = await db.as<{ s: { role: string; aal: string } }>(owner, "select public.control_session() s");
    expect(s!.s).toMatchObject({ role: "owner", aal: "aal1" });
  });

  it("dono com MFA acessa todas as áreas", async () => {
    for (const fn of ["control_overview", "control_finance", "control_security", "control_gecko", "control_ai", "control_funnel"]) {
      const args = fn === "control_finance" ? `${RANGE}, 'day'` : RANGE;
      const r = await db.as<{ r: unknown }>(owner, `select public.${fn}(${args}) r`, [], AAL2);
      expect(r[0]!.r).toBeTruthy();
    }
    expect((await db.as(owner, "select public.control_infra() r", [], AAL2))[0]).toBeTruthy();
    expect((await db.as(owner, "select public.control_subscribers(now() - interval '90 days', now(), 'week') r", [], AAL2))[0]).toBeTruthy();
  });

  it("só os donos entram: papel admin sem o e-mail na lista é recusado", async () => {
    expect(await err(db.as(fakeAdmin, `select public.control_overview(${RANGE})`, [], AAL2))).toMatch(/forbidden/);
    expect(await err(db.as(fakeAdmin, "select public.control_add_expense(current_date, 'ads', 'x', 100)", [], AAL2))).toMatch(/forbidden/);
    const [s] = await db.as<{ s: { role: string | null } }>(fakeAdmin, "select public.control_session() s", [], AAL2);
    expect(s!.s.role).toBeNull();
  });

  it("não há gerenciamento de equipe pela interface", async () => {
    expect(await err(db.as(owner, "select public.control_set_member('cliente-control@test.dev', 'analyst')", [], AAL2))).toMatch(/does not exist/);
  });

  it("tabelas do painel ficam invisíveis para clientes", async () => {
    expect(await err(db.as(owner, "select * from app_private.control_events", [], AAL2))).toMatch(/permission denied/);
    expect(await err(db.as(owner, "select * from app_private.metrics_daily", [], AAL2))).toMatch(/permission denied/);
  });

  it("intervalo inválido é recusado", async () => {
    expect(await err(db.as(owner, "select public.control_overview(now(), now() - interval '1 day')", [], AAL2))).toMatch(/invalid_range/);
    expect(await err(db.as(owner, "select public.control_overview(now() - interval '5 years', now())", [], AAL2))).toMatch(/invalid_range/);
  });
});

describe("coleta", () => {
  it("visitantes: o mesmo hash conta uma vez por dia; pageviews somam", async () => {
    for (const h of ["aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]) {
      await db.as(null, "select public.server_track_visit($1, $2, 'BR')", [SERVER_SECRET, h]);
    }
    const { rows } = await db.pool.query("select metric, value::int v from app_private.metrics_daily where metric in ('visitors', 'pageviews') order by metric");
    expect(rows).toEqual([{ metric: "pageviews", v: 3 }, { metric: "visitors", v: 2 }]);
  });

  it("visitas com hash inválido ou sem segredo são ignoradas/recusadas", async () => {
    await db.as(null, "select public.server_track_visit($1, 'not a hash', 'BR')", [SERVER_SECRET]);
    expect(await err(db.as(null, "select public.server_track_visit('errado', 'cccccccccccccccc', 'BR')"))).toMatch(/forbidden/);
  });

  it("eventos repetidos da mesma origem são agrupados com contador", async () => {
    for (let i = 0; i < 4; i++) {
      await db.as(null, "select public.server_control_event($1, 'security', 'scanner_probe', 'medium', 'blocked', 'actor1', 'US', '/wp-login.php', '{}')", [SERVER_SECRET]);
    }
    const { rows } = await db.pool.query("select hits, country from app_private.control_events where kind = 'scanner_probe'");
    expect(rows).toEqual([{ hits: 4, country: "US" }]);
  });

  it("tipo de evento inválido é recusado", async () => {
    expect(await err(db.as(null, "select public.server_control_event($1, 'security', 'DROP TABLE', 'medium', 'blocked', 'a', null, null, '{}')", [SERVER_SECRET]))).toMatch(/invalid_event/);
  });

  it("estouro de limite de requisições vira evento (uma vez por janela) e o limite continua funcionando", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const [r] = await db.as<{ ok: boolean }>(null, "select public.server_rate_limit($1, 'ip:abc:login', 2, 600) ok", [SERVER_SECRET]);
      results.push(r!.ok);
    }
    expect(results).toEqual([true, true, false, false, false]);
    const { rows } = await db.pool.query("select hits, path from app_private.control_events where kind = 'rate_limited'");
    expect(rows).toEqual([{ hits: 1, path: "login" }]);
  });

  it("leituras do cache da GeckoAPI contam como economia de créditos", async () => {
    await db.pool.query("insert into app_private.gecko_cache (key, body) values ('v1:shopee.com.br:plp:abc', '{\"source\":\"shopee.com.br\",\"items\":[{\"name\":\"Garrafa térmica\",\"productId\":\"1\"}]}')");
    await db.as(null, "select public.server_gecko_get($1, 'v1:shopee.com.br:plp:abc')", [SERVER_SECRET]);
    await db.as(null, "select public.server_gecko_get_many($1, array['v1:shopee.com.br:plp:abc', 'v1:x:y:nao-existe'])", [SERVER_SECRET]);
    await db.as(null, "select public.server_gecko_search_items($1, 'shopee.com.br', array['garrafa'], 10)", [SERVER_SECRET]);
    await db.as(null, "select public.server_gecko_get($1, 'nao-existe')", [SERVER_SECRET]);
    const { rows } = await db.pool.query("select dim, value::int v from app_private.metrics_daily where metric = 'gecko_cache_hit' order by dim");
    expect(rows).toEqual([{ dim: "shopee.com.br:plp", v: 2 }, { dim: "shopee.com.br:search", v: 1 }]);
  });

  it("uso de IA é registrado sem conteúdo e respeita limites por usuário", async () => {
    const [g0] = await db.as<{ g: { allowed: boolean } }>(null, "select public.server_ai_guard($1, $2) g", [SERVER_SECRET, customer]);
    expect(g0!.g.allowed).toBe(true);
    await db.as(owner, "select public.control_set_ai_user_limit($1, 2, false, 'teste')", [customer], AAL2);
    for (let i = 0; i < 2; i++) {
      await db.as(null, "select public.server_ai_usage($1, $2, 'assistant', 'groq', 'openai/gpt-oss-120b', 100, 50, 900, true, null)", [SERVER_SECRET, customer]);
    }
    const [g1] = await db.as<{ g: { allowed: boolean; reason: string } }>(null, "select public.server_ai_guard($1, $2) g", [SERVER_SECRET, customer]);
    expect(g1!.g).toEqual({ allowed: false, reason: "user_daily_limit" });
    const cols = (await db.pool.query("select column_name from information_schema.columns where table_schema = 'app_private' and table_name = 'ai_usage_events'")).rows.map((r) => r.column_name);
    expect(cols).not.toContain("content");
    await db.as(owner, "select public.control_set_ai_user_limit($1, null, false, null)", [customer], AAL2);
  });

  it("limite de gasto mensal bloqueia quando ativado", async () => {
    const conv = (await db.pool.query("insert into public.ai_conversations (user_id) values ($1) returning id", [customer])).rows[0].id;
    await db.pool.query("insert into public.ai_messages (conversation_id, user_id, role, content, model, tokens_in, tokens_out) values ($1, $2, 'assistant', 'x', 'm1', 1000000, 1000000)", [conv, customer]);
    const [{ s }] = await db.as<{ s: { costs: Record<string, unknown> } }>(owner, "select public.control_get_settings() s", [], AAL2);
    await db.as(owner, "select public.control_set_setting('costs', $1)", [{ ...s.costs, ai_prices_usd_per_mtok: { m1: { in: 1, out: 2 } } }], AAL2);
    await db.as(owner, "select public.control_set_setting('ai_limits', $1)", [{ monthly_budget_usd: 2.5, per_user_daily_requests: null, enforce: true }], AAL2);
    const [g] = await db.as<{ g: { allowed: boolean; reason: string } }>(null, "select public.server_ai_guard($1, $2) g", [SERVER_SECRET, customer]);
    expect(g!.g).toEqual({ allowed: false, reason: "budget_exceeded" });
    await db.as(owner, "select public.control_set_setting('ai_limits', $1)", [{ monthly_budget_usd: null, per_user_daily_requests: null, enforce: false }], AAL2);
  });
});

describe("relatórios financeiros", () => {
  it("receita, líquido estimado, teste e assinatura reconhecida", async () => {
    const buyer = await db.createUser("comprador@test.dev");
    await db.pool.query(`insert into public.payments (user_id, provider_payment_id, plan_id, amount_cents, net_cents, method, status, occurred_at) values
      ($1, 'p1', 'pro', 1990, 1990, 'pix', 'paid', now() - interval '2 days'),
      ($1, 'p2', 'pro', 1990, null, 'credit_card', 'paid', now() - interval '1 day'),
      ($1, 'p3', null, 100, 100, 'pix', 'paid', now() - interval '1 day'),
      ($1, 'p4', 'pro', 1990, null, 'credit_card', 'refused', now() - interval '1 hour')`, [buyer]);
    const [{ r }] = await db.as<{ r: { totals: Record<string, number>; payments: { valid: boolean; customer: string }[] } }>(owner, `select public.control_finance(${RANGE}, 'day') r`, [], AAL2);
    expect(r.totals.paid).toBe(1990 + 1990 + 100);
    // cartão 3,49% sobre 1990 = 69,45 → líquido estimado 1921 (arredondado)
    expect(r.totals.net).toBe(1990 + 1921 + 100);
    expect(r.totals.net_estimated).toBe(1921);
    expect(r.totals.refused_n).toBe(1);
    expect(r.totals.invalid_paid_n).toBe(1);
    expect(r.payments.every((p) => !p.customer || p.customer.includes("***"))).toBe(true);

    // Classificar o pagamento de R$ 1 como teste o tira da receita (sem alterar a tabela de pagamentos).
    const pid = (await db.pool.query("select id from public.payments where provider_payment_id = 'p3'")).rows[0].id;
    expect(await err(db.as(customer, "select public.control_flag_payment($1, true, 'teste')", [pid], AAL2))).toMatch(/forbidden/);
    await db.as(owner, "select public.control_flag_payment($1, true, 'Pix de teste')", [pid], AAL2);
    const [{ r: r2 }] = await db.as<{ r: { totals: Record<string, number>; test: { count: number } } }>(owner, `select public.control_finance(${RANGE}, 'day') r`, [], AAL2);
    expect(r2.totals.paid).toBe(3980);
    expect(r2.test.count).toBe(1);
    const { rows } = await db.pool.query("select status, amount_cents from public.payments where id = $1", [pid]);
    expect(rows[0]).toEqual({ status: "paid", amount_cents: 100 });

    const [{ r: ov }] = await db.as<{ r: { subs: { new: number }; revenue: { range: number } } }>(owner, `select public.control_overview(${RANGE}) r`, [], AAL2);
    expect(ov.revenue.range).toBe(3980);
    expect(ov.subs.new).toBeGreaterThanOrEqual(1);
  });

  it("despesas: o dono registra e remove; outros não; tudo auditado", async () => {
    expect(await err(db.as(customer, "select public.control_add_expense(current_date, 'ads', 'Meta Ads', 5000)", [], AAL2))).toMatch(/forbidden/);
    const [{ id }] = await db.as<{ id: string }>(owner, "select public.control_add_expense(current_date, 'ads', 'Meta Ads', 5000) id", [], AAL2);
    const [{ r }] = await db.as<{ r: { unit: { ads: number }; expenses: unknown[] } }>(owner, `select public.control_finance(${RANGE}, 'week') r`, [], AAL2);
    expect(r.unit.ads).toBe(5000);
    await db.as(owner, "select public.control_delete_expense($1)", [id], AAL2);
    const { rows } = await db.pool.query("select action from public.admin_audit_logs where action like 'control.expense.%' order by id");
    expect(rows.map((x) => x.action)).toEqual(["control.expense.add", "control.expense.delete"]);
  });

  it("assinantes: série sem períodos antes da primeira coleta", async () => {
    const [{ r }] = await db.as<{ r: { since: string; series: { b: string }[] } }>(owner, "select public.control_subscribers(now() - interval '300 days', now(), 'month') r", [], AAL2);
    expect(r.since).toBeTruthy();
    expect(r.series.every((s) => s.b >= r.since.slice(0, 7))).toBe(true);
  });

  it("exportação só para o dono, com MFA", async () => {
    expect(await err(db.as(customer, `select public.control_export('payments', ${RANGE})`, [], AAL2))).toMatch(/forbidden/);
    expect(await err(db.as(owner, `select public.control_export('payments', ${RANGE})`))).toMatch(/mfa_required/);
    const [{ r }] = await db.as<{ r: unknown[] }>(owner, `select public.control_export('payments', ${RANGE}) r`, [], AAL2);
    expect(r.length).toBeGreaterThan(0);
  });
});

describe("alertas", () => {
  it("abre um incidente, não duplica, notifica uma vez e resolve sozinho", async () => {
    // Recusas de pagamento acima do limite (5 em 24h)
    const u = await db.createUser("recusas@test.dev");
    for (let i = 0; i < 6; i++) {
      await db.pool.query("insert into public.payments (user_id, provider_payment_id, amount_cents, method, status, occurred_at) values ($1, $2, 1990, 'credit_card', 'refused', now())", [u, `r${i}`]);
    }
    const ev = () => db.as<{ r: { notify: { rule_key: string; first_time: boolean }[] } }>(null, "select public.server_control_evaluate($1, $2) r", [SERVER_SECRET, {}]).then((x) => x[0]!.r);
    const first = await ev();
    expect(first.notify.filter((n) => n.rule_key === "payment_refusals")).toEqual([expect.objectContaining({ first_time: true })]);
    const second = await ev();
    expect(second.notify.filter((n) => n.rule_key === "payment_refusals")).toEqual([]);
    const { rows } = await db.pool.query("select count(*)::int n, max(occurrences) o from app_private.control_incidents where rule_key = 'payment_refusals'");
    expect(rows[0]).toEqual({ n: 1, o: 2 });
    // sino do dono recebeu um único aviso
    const bell = await db.pool.query("select count(*)::int n from public.alerts where kind = 'system_control' and user_id = $1 and title like '%recusados%'", [owner]);
    expect(bell.rows[0].n).toBe(1);

    await db.pool.query("delete from public.payments where status = 'refused'");
    await ev();
    const after = await db.pool.query("select status, auto_resolved from app_private.control_incidents where rule_key = 'payment_refusals'");
    expect(after.rows[0]).toEqual({ status: "resolved", auto_resolved: true });
  });

  it("medições externas: saldo da GeckoAPI baixo e integração fora do ar", async () => {
    const r = await db.as<{ r: { notify: { rule_key: string }[] } }>(null, "select public.server_control_evaluate($1, $2) r",
      [SERVER_SECRET, { gecko: { current_credits: 50, days_left: 3 }, integrations: [{ id: "heropay", name: "HeroPay", ok: false, detail: "401" }] }]);
    const keys = r[0]!.r.notify.map((n) => n.rule_key);
    expect(keys).toContain("gecko_low_credits");
    expect(keys).toContain("integration_down");
  });

  it("regra desativada não dispara; ajuste só pelo dono", async () => {
    expect(await err(db.as(customer, "select public.control_update_rule('db_near_limit', false, 80, 'P2', 60)", [], AAL2))).toMatch(/forbidden/);
    await db.as(owner, "select public.control_update_rule('db_near_limit', true, 0, 'P2', 60)", [], AAL2);
    await db.as(null, "select public.server_control_evaluate($1, '{}')", [SERVER_SECRET]);
    expect((await db.pool.query("select count(*)::int n from app_private.control_incidents where rule_key = 'db_near_limit' and status = 'open'")).rows[0].n).toBe(1);
    await db.as(owner, "select public.control_update_rule('db_near_limit', false, 0, 'P2', 60)", [], AAL2);
    await db.as(null, "select public.server_control_evaluate($1, '{}')", [SERVER_SECRET]);
    expect((await db.pool.query("select count(*)::int n from app_private.control_incidents where rule_key = 'db_near_limit' and status = 'open'")).rows[0].n).toBe(0);
  });

  it("incidente pode ser reconhecido, confirmado e resolvido, com auditoria", async () => {
    const id = (await db.pool.query("select id from app_private.control_incidents where status = 'open' limit 1")).rows[0].id;
    expect(await err(db.as(customer, "select public.control_incident_action($1, 'resolve')", [id], AAL2))).toMatch(/forbidden/);
    await db.as(owner, "select public.control_incident_action($1, 'acknowledge')", [id], AAL2);
    await db.as(owner, "select public.control_incident_action($1, 'confirm')", [id], AAL2);
    await db.as(owner, "select public.control_incident_action($1, 'resolve')", [id], AAL2);
    const { rows } = await db.pool.query("select status, confirmed from app_private.control_incidents where id = $1", [id]);
    expect(rows[0]).toEqual({ status: "resolved", confirmed: true });
  });
});

describe("consolidação e retenção", () => {
  it("agrega chamadas da GeckoAPI por funcionalidade e apaga dados vencidos", async () => {
    await db.as(null, "select public.server_log_api($1, 'shopee', 'POST /v1/extract shopee.com.br plp [ranking]', 200, true, 1200, null)", [SERVER_SECRET]);
    await db.as(null, "select public.server_log_api($1, 'shopee', 'POST /v1/extract shopee.com.br plp [ranking]', 500, false, 1200, 'unavailable')", [SERVER_SECRET]);
    await db.pool.query("insert into app_private.visitor_days (day, vhash) values (current_date - 10, 'old')");
    await db.pool.query("insert into app_private.control_events (category, kind, severity, at, last_at) values ('security', 'old_event', 'low', now() - interval '100 days', now() - interval '100 days')");
    const [{ r }] = await db.as<{ r: { ok: boolean; removed: number } }>(null, "select public.server_control_rollup($1) r", [SERVER_SECRET]);
    expect(r.ok).toBe(true);
    expect(r.removed).toBeGreaterThanOrEqual(2);
    const { rows } = await db.pool.query("select metric, dim, value::int v from app_private.metrics_daily where metric in ('gecko_call', 'gecko_fail') order by metric");
    expect(rows).toEqual([{ metric: "gecko_call", dim: "shopee.com.br:plp:ranking", v: 1 }, { metric: "gecko_fail", dim: "shopee.com.br:plp:ranking", v: 1 }]);
  });
});
