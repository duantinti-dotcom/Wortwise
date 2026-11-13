import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/** Cliente com a sessão do usuário (RLS aplicado). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Em Server Components os cookies são somente leitura; o middleware renova a sessão.
        }
      },
    },
  });
}

/** Cliente sem sessão, para leitura pública (planos, blog) e funções server_*. */
export function supabaseAnon() {
  return createPlainClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export class ServerSecretMissing extends Error {
  constructor() {
    super("WW_SERVER_SECRET não configurado");
  }
}

/** Chama uma função server_* do banco, autenticada pelo segredo do servidor. */
export async function serverRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const secret = serverEnv().serverSecret;
  if (!secret) throw new ServerSecretMissing();
  const { data, error } = await supabaseAnon().rpc(fn, { p_secret: secret, ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Versão que nunca lança: para gravações de melhor esforço (logs, cache de mercado). */
export async function serverRpcSafe(fn: string, args: Record<string, unknown> = {}): Promise<void> {
  try {
    await serverRpc(fn, args);
  } catch (e) {
    console.warn(`[server-rpc] ${fn} falhou:`, e instanceof Error ? e.message : e);
  }
}
