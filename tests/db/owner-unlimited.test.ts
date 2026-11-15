import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDb, type TestDb } from "./harness";

/** O administrador (dono) usa o plano interno Ilimitado; ninguém mais recebe esse plano. */
let db: TestDb;
beforeAll(async () => { db = await startDb(); });
afterAll(async () => { await db?.stop(); });

const usage = (u: string) => db.as<{ u: { plan: string; quotas: { resource: string; limit: number }[] } }>(u, "select public.my_usage() u").then((x) => x[0]!.u);

describe("plano ilimitado do dono", () => {
  it("administrador fica no plano ilimitado; usuário comum continua no grátis", async () => {
    const owner = await db.createUser("dono@test.dev");
    const user = await db.createUser("cliente@test.dev");
    await db.pool.query("with r as (insert into public.user_roles (user_id, role) values ($1, 'admin') returning user_id) insert into app_private.admin_emails select lower(u.email) from auth.users u join r on r.user_id = u.id on conflict do nothing", [owner]);
    const uo = await usage(owner);
    expect(uo.plan).toBe("ilimitado");
    expect(uo.quotas.find((q) => q.resource === "search")!.limit).toBeGreaterThanOrEqual(1000000);
    expect((await usage(user)).plan).toBe("free");
  });

  it("o plano ilimitado não aparece entre os planos públicos", async () => {
    const r = await db.as<{ id: string }>(null, "select id from public.plans where active");
    expect(r.map((x) => x.id)).not.toContain("ilimitado");
  });

  it("o dono consegue gastar além do limite do Business", async () => {
    const owner = await db.createUser("dono2@test.dev");
    await db.pool.query("with r as (insert into public.user_roles (user_id, role) values ($1, 'admin') returning user_id) insert into app_private.admin_emails select lower(u.email) from auth.users u join r on r.user_id = u.id on conflict do nothing", [owner]);
    for (let i = 0; i < 5; i++) {
      const [r] = await db.as<{ r: { allowed: boolean } }>(owner, "select public.consume_quota('export') r");
      expect(r!.r.allowed).toBe(true);
    }
  });

  it("o painel administrativo só abre para o e-mail do dono, mesmo com o papel de admin", async () => {
    const intruso = await db.createUser("intruso@test.dev");
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [intruso]);
    expect((await db.as<{ a: boolean }>(intruso, "select public.is_admin() a"))[0]!.a).toBe(false);
    const dono = await db.createUser("duantinti@gmail.com");
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [dono]);
    expect((await db.as<{ a: boolean }>(dono, "select public.is_admin() a"))[0]!.a).toBe(true);
  });
});
