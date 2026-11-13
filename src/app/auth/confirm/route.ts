import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serverRpcSafe, supabaseServer } from "@/lib/supabase/server";
import { clientIp } from "@/lib/http";
import { sha256Hex } from "@/lib/utils";

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
  const ipHash = await sha256Hex(`ww-ip:${clientIp(request)}`);
  await serverRpcSafe("server_register_signup", { p_user: data.user.id, p_ip_hash: ipHash });
  return NextResponse.redirect(`${origin}/app/boas-vindas`);
}
