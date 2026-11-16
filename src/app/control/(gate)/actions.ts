"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { supabaseServer, serverRpc } from "@/lib/supabase/server";
import { ADMIN_LOGIN_EMAIL, controlBase } from "@/lib/control/auth";
import { logControlEvent } from "@/lib/control/events";
import { actorHash, requestIp } from "@/lib/control/identity";

export interface GateState { error?: string; qr?: string; secret?: string; factorId?: string }

const GENERIC = "E-mail/usuário ou senha incorretos, ou acesso não autorizado.";

/** Limite por origem (IP em hash): 5 tentativas a cada 15 minutos. Falha fechada se o banco não responder. */
async function allowAttempt(bucket: string): Promise<boolean> {
  const h = await headers();
  const actor = await actorHash(serverEnv().serverSecret, requestIp(h));
  try {
    return await serverRpc<boolean>("server_rate_limit", { p_key: `ctl:${actor}:${bucket}`, p_limit: 5, p_window: 900 });
  } catch {
    return false;
  }
}

const loginSchema = z.object({ login: z.string().trim().min(3).max(200), password: z.string().min(6).max(200) });

export async function loginAction(_prev: GateState, form: FormData): Promise<GateState> {
  const parsed = loginSchema.safeParse({ login: form.get("login"), password: form.get("password") });
  if (!parsed.success) return { error: "Preencha usuário/e-mail e senha." };
  const h = await headers();
  if (!(await allowAttempt("login"))) {
    await logControlEvent(h, { kind: "control_login_rate_limited", severity: "high", class: "blocked", path: "/entrar" });
    return { error: "Muitas tentativas. Aguarde 15 minutos." };
  }
  // "admin" é o login curto da conta interna do painel.
  const email = parsed.data.login.toLowerCase() === "admin" ? ADMIN_LOGIN_EMAIL : parsed.data.login.toLowerCase();
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    await logControlEvent(h, { kind: "control_login_failed", severity: "medium", class: "suspicious", path: "/entrar" });
    return { error: GENERIC };
  }
  const { data: s } = await supabase.rpc("control_session");
  if (!(s as { role: string | null } | null)?.role) {
    await supabase.auth.signOut();
    await logControlEvent(h, { kind: "control_denied", severity: "high", class: "blocked", path: "/entrar", detail: { reason: "not_owner" } });
    return { error: GENERIC };
  }
  await supabase.rpc("control_audit", { p_action: "login.password", p_target: null, p_details: {} });
  redirect(`${await controlBase()}/mfa`);
}

/** Primeiro acesso: cadastra o aplicativo autenticador (TOTP) e devolve o QR code. */
export async function enrollAction(): Promise<GateState> {
  const supabase = await supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Sessão expirada. Entre novamente." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Remove cadastros incompletos anteriores (o Supabase recusa um novo com o mesmo nome).
  for (const f of factors?.all ?? []) if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Worthwise Control ${new Date().toISOString().slice(0, 10)}`, issuer: "Worthwise Control" });
  if (error || !data) return { error: "Não foi possível iniciar o cadastro do autenticador. Verifique se o MFA (TOTP) está habilitado no Supabase." };
  return { qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
}

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/), factorId: z.string().uuid() });

export async function verifyAction(_prev: GateState, form: FormData): Promise<GateState> {
  const parsed = codeSchema.safeParse({ code: form.get("code"), factorId: form.get("factorId") });
  if (!parsed.success) return { error: "Digite o código de 6 dígitos do aplicativo autenticador.", factorId: String(form.get("factorId") ?? "") };
  const h = await headers();
  if (!(await allowAttempt("mfa"))) {
    await logControlEvent(h, { kind: "control_login_rate_limited", severity: "high", class: "blocked", path: "/mfa" });
    return { error: "Muitas tentativas. Aguarde 15 minutos.", factorId: parsed.data.factorId };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) {
    await logControlEvent(h, { kind: "mfa_failed", severity: "medium", class: "suspicious", path: "/mfa" });
    return { error: "Código inválido ou expirado.", factorId: parsed.data.factorId };
  }
  await supabase.rpc("control_audit", { p_action: "login.mfa", p_target: null, p_details: {} });
  redirect(`${(await controlBase()) || "/"}`);
}
