import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

/** Encerra a sessão do painel (POST, mesma origem). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await supabaseServer();
  await supabase.rpc("control_audit", { p_action: "logout", p_target: null, p_details: {} }).then(() => null, () => null);
  await supabase.auth.signOut();
  const base = req.headers.get("x-control-base") ?? "/control";
  return NextResponse.redirect(new URL(`${base}/entrar`, req.url), 303);
}
