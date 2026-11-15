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
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [owner]);
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
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [owner]);
    for (let i = 0; i < 5; i++) {
      const [r] = await db.as<{ r: { allowed: boolean } }>(owner, "select public.consume_quota('export') r");
      expect(r!.r.allowed).toBe(true);
    }
  });
});
