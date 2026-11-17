"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

/** Botão "Marcar como lido": reconhece os alertas abertos e atualiza a tela. */
export function AckAllButton({ action }: { action: () => Promise<{ ok: boolean; message?: string }> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="c-btn h-8 shrink-0" disabled={pending}
      onClick={() => start(async () => { await action(); router.refresh(); })}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Marcar como lido
    </button>
  );
}
