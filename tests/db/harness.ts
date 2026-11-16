import EmbeddedPostgres from "embedded-postgres";
import { readdirSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

/**
 * Sobe um PostgreSQL real e descartável, cria um "shim" mínimo do ambiente Supabase
 * (papéis anon/authenticated, schema auth, auth.uid()) e aplica as migrações do projeto.
 */
const SHIM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const SERVER_SECRET = "test-server-secret";

/**
 * legacyFreeQuotas: recoloca as cotas do antigo plano grátis (3 pesquisas, 5 mensagens, 1 coleção, 3 simulações)
 * para os testes que verificam a mecânica de cotas (atomicidade, concorrência, visibilidade).
 */
export async function startDb(opts: { legacyFreeQuotas?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ww-pg-"));
  const port = 54000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "postgres", port, persistent: false,
    createPostgresUser: process.getuid?.() === 0, onLog: () => {}, onError: () => {},
  });
  await server.initialise();
  await server.start();
  const pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password: "postgres", database: "postgres", max: 20 });
  pool.on("error", () => {});
  await pool.query(SHIM);
  const migDir = join(process.cwd(), "supabase/migrations");
  for (const f of readdirSync(migDir).sort()) {
    try {
      await pool.query(readFileSync(join(migDir, f), "utf8"));
    } catch (e) {
      throw new Error(`Falha na migração ${f}: ${(e as Error).message}`);
    }
  }
  await pool.query("select app_private.set_server_secret($1)", [SERVER_SECRET]);
  if (opts.legacyFreeQuotas) {
    await pool.query(`update public.plan_quotas set limit_value = case resource when 'search' then 3 when 'ai_message' then 5
      when 'collection' then 1 when 'simulation_saved' then 3 else limit_value end where plan_id = 'free'`);
  }
  return {
    pool,
    async stop() { await pool.end(); await server.stop(); },
    async createUser(email: string, confirmed = true) {
      const r = await pool.query(
        "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id",
        [email, confirmed ? new Date() : null, { full_name: email.split("@")[0] }]);
      return r.rows[0].id as string;
    },
    /** Executa SQL como um usuário autenticado (mesma mecânica do PostgREST: SET ROLE + claim). */
    async as<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = [], opts: { aal?: "aal1" | "aal2" } = {}): Promise<T[]> {
      const c = await pool.connect();
      c.on("error", () => {});
      try {
        await c.query("begin");
        await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
        await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
        // Mesmo formato do PostgREST: as claims do JWT (inclui o nível de autenticação, aal1/aal2).
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId ?? undefined, aal: opts.aal ?? "aal1" })]);
        const r = await c.query(sql, params);
        await c.query("commit");
        return r.rows as T[];
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
export type TestDb = Awaited<ReturnType<typeof startDb>>;
