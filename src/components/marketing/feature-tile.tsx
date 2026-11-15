import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloco de ferramenta: título e texto curtos em cima, uma tela de exemplo embaixo. */
export function FeatureTile({ icon, title, text, children, className }: {
  tone?: string; icon: ReactNode; title: string; text: string; children: ReactNode; className?: string; flip?: boolean;
}) {
  return (
    <article className={cn("card flex flex-col p-6 sm:p-8", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-tint/[0.06] text-brand-hi [&>svg]:size-[17px]">{icon}</span>
        <h3 className="text-[19px] font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-muted">{text}</p>
      <div className="demo-screen mt-7 rounded-[12px] p-3 sm:p-5">{children}</div>
    </article>
  );
}
