import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVER_SECRET, startDb, type TestDb } from "./harness";

/** Uma conta grátis por aparelho e por rede: a segunda conta é criada, mas sem as cotas grátis. */
let db: TestDb;
beforeAll(async () => { db = await startDb(); });
afterAll(async () => { await db?.stop(); });

const register = (user: string, ip: string, device: string | null) =>
  db.as<{ r: { trial: boolean; reason: string | null; status: string } }>(null, "select public.server_register_signup($1, $2, $3, $4) r", [SERVER_SECRET, user, ip, device]).then((x) => x[0]!.r);
const usage = (user: string) => db.as<{ u: { trial_denied: string | null; quotas: { resource: string; limit: number }[] } }>(user, "select public.my_usage() u").then((x) => x[0]!.u);
const useAi = (user: string) => db.as<{ r: { allowed: boolean } }>(user, "select public.consume_quota('ai_message') r").then((x) => x[0]!.r.allowed);

describe("teste grátis único", () => {
  it("primeira conta recebe as cotas; segunda no mesmo aparelho não recebe", async () => {
    const a = await db.createUser("a@test.dev");
    const b = await db.createUser("b@test.dev");
    expect((await register(a, "ip-1", "dev-1")).trial).toBe(true);
    const rb = await register(b, "ip-2", "dev-1");
    expect(rb).toMatchObject({ trial: false, reason: "same_device" });

    const ua = await usage(a), ub = await usage(b);
    expect(ua.trial_denied).toBeNull();
    expect(ua.quotas.find((q) => q.resource === "search")!.limit).toBeGreaterThan(0);
    expect(ub.trial_denied).toBe("same_device");
    expect(ub.quotas.find((q) => q.resource === "search")!.limit).toBe(0);
  });

  it("mesma rede em 30 dias também não recebe; rede diferente e aparelho novo recebe", async () => {
    const c = await db.createUser("c@test.dev");
    const d = await db.createUser("d@test.dev");
    const e = await db.createUser("e@test.dev");
    expect((await register(c, "ip-net", "dev-c")).trial).toBe(true);
    expect(await register(d, "ip-net", "dev-d")).toMatchObject({ trial: false, reason: "same_network" });
    expect((await register(e, "ip-other", "dev-e")).trial).toBe(true);
  });

  it("conta sem teste não consegue gastar pesquisas grátis, e não pode se liberar sozinha", async () => {
    const f = await db.createUser("f@test.dev");
    const g = await db.createUser("g@test.dev");
    await register(f, "ip-f", "dev-f");
    await register(g, "ip-g", "dev-f");
    expect(await useAi(f)).toBe(true);
    expect(await useAi(g)).toBe(false);
    await db.as(g, "update public.profiles set free_trial_denied = null where id = $1", [g]);
    expect((await usage(g)).trial_denied).toBe("same_device");
  });

  it("registrar duas vezes não muda a decisão, e o admin pode liberar", async () => {
    const h = await db.createUser("h@test.dev");
    await register(h, "ip-f", "dev-h"); // rede usada por f
    expect((await register(h, "ip-x", "dev-z")).status).toBe("known");
    expect((await usage(h)).trial_denied).toBe("same_network");
    const admin = await db.createUser("admin@test.dev");
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [admin]);
    await db.as(admin, "select public.admin_set_free_trial($1, true)", [h]);
    expect((await usage(h)).trial_denied).toBeNull();
    await expect(db.as(h, "select public.admin_set_free_trial($1, true)", [h])).rejects.toThrow();
  });

  it("contas antigas (antes da regra) mantêm as cotas", async () => {
    const old = await db.createUser("old@test.dev");
    await db.pool.query("update public.profiles set created_at = now() - interval '10 days' where id = $1", [old]);
    expect((await register(old, "ip-1", "dev-1")).status).toBe("recorded_existing");
    expect((await usage(old)).trial_denied).toBeNull();
  });
});
