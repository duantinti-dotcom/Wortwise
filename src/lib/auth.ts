import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

/** Usuário autenticado (validado no servidor de autenticação), ou null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const meta = u.user_metadata as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email ?? "",
    name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? null,
    emailVerified: Boolean(u.email_confirmed_at),
  };
});

export async function requireUser(next = "/app"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}

/** Só o dono acessa o painel administrativo (além do papel no banco, o e-mail precisa bater). */
export const OWNER_EMAILS = (process.env.ADMIN_EMAILS ?? "duantinti@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user || !OWNER_EMAILS.includes(user.email.toLowerCase())) return false;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("is_admin");
  return data === true;
});

/** Páginas administrativas: a checagem é feita no banco (user_roles), nunca no cliente. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!(await isAdmin())) redirect("/app");
  return user;
}

export interface Usage {
  plan: string;
  /** Motivo de a conta não ter recebido as cotas grátis (outra conta grátis no mesmo aparelho/rede). */
  trial_denied?: string | null;
  quotas: { resource: string; limit: number; used: number; period: "total" | "month" | "count" }[];
}

export const getUsage = cache(async (): Promise<Usage> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("my_usage");
  return (data as Usage) ?? { plan: "free", quotas: [] };
});

export function quotaOf(usage: Usage, resource: string) {
  const q = usage.quotas.find((x) => x.resource === resource);
  return q ? { ...q, remaining: Math.max(0, q.limit - q.used) } : null;
}
