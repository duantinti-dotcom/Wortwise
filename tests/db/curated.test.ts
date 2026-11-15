import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDb, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => { db = await startDb(); });
afterAll(async () => { await db?.stop(); });

describe("vitrine do dono", () => {
  it("só o dono cadastra; todos os logados veem; cada preço novo entra no histórico", async () => {
    const dono = await db.createUser("duantinti@gmail.com");
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [dono]);
    const cliente = await db.createUser("cliente@test.dev");
    const [{ id }] = await db.as<{ id: string }>(dono, "insert into public.curated_products (store, title, link, price, image_url) values ('shopee', 'Garrafa térmica 1L', 'https://shopee.com.br/x', 49.9, 'https://img.test/a.jpg') returning id");
    await db.as(dono, "update public.curated_products set price = 44.9 where id = $1", [id]);
    await db.as(dono, "update public.curated_products set title = 'Garrafa térmica 1 litro' where id = $1", [id]);
    const hist = await db.as<{ price: string }>(cliente, "select price from public.curated_price_history where product_id = $1 order by recorded_at", [id]);
    expect(hist.map((h) => Number(h.price))).toEqual([49.9, 44.9]);
    expect(await db.as(cliente, "select id from public.curated_products")).toHaveLength(1);
    await expect(db.as(cliente, "insert into public.curated_products (store, title, link) values ('shopee', 'x y', 'https://a.b')")).rejects.toThrow();
    await expect(db.as(dono, "insert into public.curated_products (store, title, link) values ('shopee', 'Teste', 'javascript:alert(1)')")).rejects.toThrow();
  });
});
