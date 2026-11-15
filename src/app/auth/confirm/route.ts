import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { registerSignup } from "@/lib/signup-guard";
import { supabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "recovery", "email", "email_change", "invite", "magiclink"];

/** Confirma links enviados por e-mail (cadastro, recuperação de senha). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  if (type === "recovery") return NextResponse.redirect(`${origin}/redefinir-senha`);
  // Uma conta grátis por aparelho e por rede (só hashes, nunca o IP puro).
  await registerSignup(request, data.user.id);
  return NextResponse.redirect(`${origin}/app/boas-vindas`);
}
