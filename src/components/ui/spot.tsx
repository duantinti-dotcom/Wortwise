"use client";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Superfície com luz que acompanha o cursor. Só atualiza variáveis CSS (sem re-render). */
export function Spot({ as: Tag = "div", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag
      {...rest}
      className={cn("spot", className)}
      onMouseMove={(e: React.MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </Tag>
  );
}
