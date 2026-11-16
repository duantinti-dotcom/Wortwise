import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { controlBase, getControlSession } from "@/lib/control/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { GateFrame, MfaForm } from "../gate-ui";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const base = await controlBase();
  const s = await getControlSession();
  if (s.state === "anon") redirect(`${base}/entrar`);
  if (s.state === "denied") redirect(`${base}/entrar?erro=acesso`);
  const { reauth } = await searchParams;
  if (s.state === "ok" && !reauth) redirect(base || "/");
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.find((f) => f.status === "verified") ?? null;
  return (
    <GateFrame title="Verificação em duas etapas" subtitle={factor ? "Abra o aplicativo autenticador e digite o código atual." : "Primeiro acesso: configure o seu segundo fator."}>
      <MfaForm factorId={factor?.id ?? null} reauth={s.state === "mfa" && s.reauth} />
    </GateFrame>
  );
}
