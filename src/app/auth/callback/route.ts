import { NextResponse } from "next/server";
import { registerSignup } from "@/lib/signup-guard";
import { supabaseServer } from "@/lib/supabase/server";

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
  if (error || !data.user) {
    // O código pode já ter sido usado (a página abriu duas vezes): se a sessão já existe, segue em frente.
    const { data: current } = await supabase.auth.getUser();
    if (current.user) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/entrar?erro=oauth${next !== "/app" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  // Uma conta grátis por aparelho e por rede (só hashes, nunca o IP puro).
  await registerSignup(request, data.user.id);

  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", data.user.id).maybeSingle();
  const dest = profile && !profile.onboarded_at && next === "/app" ? "/app/boas-vindas" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}
