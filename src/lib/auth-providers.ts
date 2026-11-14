import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * Consulta no Supabase quais logins externos estão ativos (endpoint público /auth/v1/settings).
 * O botão "Continuar com Google" só aparece quando o provedor está ligado — assim ele nunca leva a um erro.
 */
export async function isGoogleEnabled(): Promise<boolean> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) return false;
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseKey }, next: { revalidate: 300 }, signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { external?: { google?: boolean } };
    return data.external?.google === true;
  } catch {
    return false;
  }
}
