import { NextResponse } from "next/server";
import { serverRpcSafe, supabaseServer } from "@/lib/supabase/server";
import { clientIp } from "@/lib/http";
import { sha256Hex } from "@/lib/utils";

/** Só aceita redirecionamentos internos (evita open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (!code) return NextResponse.redirect(`${origin}/entrar?erro=oauth`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/entrar?erro=oauth`);

  // Registro antifraude proporcional: hash do IP (nunca o IP puro), retido por 90 dias.
  const ipHash = await sha256Hex(`ww-ip:${clientIp(request)}`);
  await serverRpcSafe("server_register_signup", { p_user: data.user.id, p_ip_hash: ipHash });

  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", data.user.id).maybeSingle();
  const dest = profile && !profile.onboarded_at && next === "/app" ? "/app/boas-vindas" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}
