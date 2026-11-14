"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Modal em vidro: no desktop centralizado; no celular vira uma folha inferior que respeita o viewport. */
export function DialogContent({ title, description, children, className, wide }: {
  title: string; description?: string; children: ReactNode; className?: string; wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
      <D.Content
        className={cn(
          "glass glass-strong fixed z-50 flex max-h-[88dvh] flex-col overflow-hidden outline-none",
          "inset-x-0 bottom-0 rounded-t-3xl data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-40px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "sm:data-[state=open]:animate-modal-in sm:data-[state=closed]:animate-modal-out",
          wide ? "sm:max-w-2xl" : "sm:max-w-md", className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div>
            <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm leading-relaxed text-muted">{description}</D.Description> : null}
          </div>
          <D.Close className="btn btn-ghost btn-sm -mr-2 -mt-1 !px-2" aria-label="Fechar"><X size={18} /></D.Close>
        </div>
        <div className="overflow-y-auto px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-3">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
