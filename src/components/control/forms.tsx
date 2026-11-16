"use client";
import { useActionState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; message?: string } | null;

/** Formulário ligado a uma server action, com estado de envio e mensagem de retorno. */
export function ActionForm({ action, children, submit, className, compact }: {
  action: (prev: Result, form: FormData) => Promise<Result>; children: ReactNode; submit: string; className?: string; compact?: boolean;
}) {
  const [state, run, pending] = useActionState<Result, FormData>(action, null);
  return (
    <form action={run} className={cn("flex flex-col gap-3", className)}>
      {children}
      <div className={cn("flex flex-wrap items-center gap-3", compact && "justify-end")}>
        <button type="submit" className="c-btn c-btn-primary" disabled={pending}>{pending && <Loader2 size={14} className="animate-spin" />}{submit}</button>
        {state?.message && <span role="status" className={cn("c-badge", state.ok ? "c-badge-good" : "c-badge-crit")}>{state.message}</span>}
      </div>
    </form>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-[12.5px]", className)}>
      <span className="c-muted">{label}</span>
      {children}
      {hint && <span className="c-faint text-[11.5px] leading-snug">{hint}</span>}
    </label>
  );
}
