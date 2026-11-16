import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Login com Google no painel.
 *  ?start=google → inicia o OAuth (o retorno volta para esta mesma rota no subdomínio admin);
 *  ?code=...     → troca o código pela sessão e segue para o MFA.
 * A URL de retorno precisa estar em Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = req.headers.get("x-control-base") ?? "/control";
  const origin = `${url.protocol}//${req.headers.get("host") ?? url.host}`;
  const supabase = await supabaseServer();
  if (url.searchParams.get("start") === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}${base}/auth/callback`, skipBrowserRedirect: true } });
    if (error || !data.url) return NextResponse.redirect(`${origin}${base}/entrar?erro=oauth`);
    return NextResponse.redirect(data.url);
  }
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}${base}/entrar?erro=oauth`);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}${base}/entrar?erro=oauth`);
  return NextResponse.redirect(`${origin}${base}/mfa`);
}
