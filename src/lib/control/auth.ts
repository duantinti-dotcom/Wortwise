import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, type SessionUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { logControlEvent } from "./events";

export type Area = "overview" | "subscribers" | "finance" | "funnel" | "security" | "gecko" | "ai" | "infra" | "alerts" | "audit" | "team" | "settings" | "export";
export type Role = "owner" | "finance" | "analyst" | "security";

export interface ControlSession {
  user: SessionUser;
  role: Role;
  areas: Area[];
  writes: string[];
  base: string;
}

/** Login curto "admin" → conta interna do painel (a senha fica só no Supabase, nunca no código). */
export const ADMIN_LOGIN_EMAIL = (process.env.CONTROL_ADMIN_EMAIL ?? "admin@worthwise.site").toLowerCase();

/** Prefixo dos links: vazio em admin.worthwise.site (o middleware reescreve), "/control" no domínio local. */
export const controlBase = cache(async (): Promise<string> => {
  const h = await headers();
  return h.get("x-control-base") ?? "/control";
});

/** Sessões com MFA expiram depois deste tempo sem nova verificação do código. */
const MFA_MAX_AGE_S = 12 * 3600;

const AREA_HOME: [Area, string][] = [["overview", ""], ["security", "/seguranca"], ["finance", "/financeiro"], ["subscribers", "/assinantes"], ["infra", "/infraestrutura"]];

export const getControlSession = cache(async (): Promise<{ state: "anon" } | { state: "denied"; user: SessionUser } | { state: "mfa"; user: SessionUser; reauth: boolean } | { state: "ok"; session: ControlSession }> => {
  const user = await getUser();
  if (!user) return { state: "anon" };
  const supabase = await supabaseServer();
  const [{ data: s }, { data: aal }] = await Promise.all([
    supabase.rpc("control_session"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const sess = s as { role: Role | null; aal: string; areas: Area[]; writes: string[] } | null;
  if (!sess?.role) return { state: "denied", user };
  if (aal?.currentLevel !== "aal2" || sess.aal !== "aal2") return { state: "mfa", user, reauth: false };
  const totp = (aal.currentAuthenticationMethods ?? []).flatMap((m) => (typeof m === "object" && m.method === "totp" ? [m.timestamp] : []));
  if (!totp.length || Date.now() / 1000 - Math.max(...totp) > MFA_MAX_AGE_S) return { state: "mfa", user, reauth: true };
  return { state: "ok", session: { user, role: sess.role, areas: sess.areas, writes: sess.writes, base: await controlBase() } };
});

/** Exige sessão do painel com MFA e acesso à área. Redireciona (login, MFA ou primeira área permitida). */
export async function requireControl(area: Area): Promise<ControlSession> {
  const base = await controlBase();
  const r = await getControlSession();
  if (r.state === "anon") redirect(`${base}/entrar`);
  if (r.state === "denied") {
    await logControlEvent(await headers(), { kind: "control_denied", severity: "high", class: "blocked", path: area, detail: { reason: "not_member" } });
    redirect(`${base}/entrar?erro=acesso`);
  }
  if (r.state === "mfa") redirect(`${base}/mfa${r.reauth ? "?reauth=1" : ""}`);
  const s = r.session;
  if (!s.areas.includes(area)) {
    const home = AREA_HOME.find(([a]) => s.areas.includes(a));
    redirect(`${base}${home ? home[1] : "/sem-acesso"}`);
  }
  return s;
}

export class ControlRpcError extends Error {
  constructor(message: string, public code: "forbidden" | "mfa_required" | "invalid" | "unavailable") { super(message); }
}

/** Chama uma função control_* com a sessão do usuário (a autorização é repetida no banco). */
export async function controlRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const m = error.message ?? "";
    if (/mfa_required/.test(m)) redirect(`${await controlBase()}/mfa`);
    if (/forbidden/.test(m)) throw new ControlRpcError("Sem permissão para estes dados.", "forbidden");
    if (/invalid_/.test(m)) throw new ControlRpcError("Parâmetros inválidos.", "invalid");
    throw new ControlRpcError(`Banco indisponível: ${m.slice(0, 160)}`, "unavailable");
  }
  return data as T;
}
