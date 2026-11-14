"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { supabaseBrowser } from "@/lib/supabase/client";

export function BlockButton({ id, blocked }: { id: string; blocked: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <button className={blocked ? "btn btn-secondary btn-sm" : "btn btn-danger btn-sm"} disabled={busy} onClick={async () => {
      if (!blocked && !window.confirm("Bloquear esta conta? Ela não poderá fazer pesquisas.")) return;
      setBusy(true);
      const { error } = await supabaseBrowser().rpc("admin_set_blocked", { p_user: id, p_blocked: !blocked });
      setBusy(false);
      toast(error ? "Ação não permitida." : blocked ? "Conta desbloqueada" : "Conta bloqueada", error ? "error" : "success");
      if (!error) router.refresh();
    }}>{blocked ? "Desbloquear" : "Bloquear"}</button>
  );
}
