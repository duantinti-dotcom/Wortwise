import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { controlBase, getControlSession } from "@/lib/control/auth";
import { GateFrame, LoginForm } from "../gate-ui";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  acesso: "Esta conta não tem acesso ao painel.",
  oauth: "Não foi possível concluir o login com Google.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const base = await controlBase();
  const s = await getControlSession();
  if (s.state === "ok") redirect(base || "/");
  if (s.state === "mfa") redirect(`${base}/mfa`);
  const { erro } = await searchParams;
  return (
    <GateFrame title="Entrar no painel" subtitle="Somente o proprietário do Worthwise. Depois da senha, o código do aplicativo autenticador é obrigatório.">
      <LoginForm initialError={erro ? ERRORS[erro] : undefined} googleHref={`${base}/auth/callback?start=google`} />
    </GateFrame>
  );
}
