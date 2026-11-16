import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ControlShell } from "@/components/control/shell";
import { controlBase, getControlSession } from "@/lib/control/auth";
import { logControlEvent } from "@/lib/control/events";
import { supabaseServer } from "@/lib/supabase/server";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const base = await controlBase();
  const s = await getControlSession();
  if (s.state === "anon") redirect(`${base}/entrar`);
  if (s.state === "denied") {
    await logControlEvent(await headers(), { kind: "control_denied", severity: "high", class: "blocked", path: "panel", detail: { reason: "not_owner" } });
    redirect(`${base}/entrar?erro=acesso`);
  }
  if (s.state === "mfa") redirect(`${base}/mfa${s.reauth ? "?reauth=1" : ""}`);
  const { data } = await (await supabaseServer()).rpc("control_badge");
  return (
    <Suspense>
      <ControlShell base={base} email={s.session.user.email} areas={s.session.areas} openIncidents={(data as { open: number } | null)?.open ?? 0}>
        {children}
      </ControlShell>
    </Suspense>
  );
}
