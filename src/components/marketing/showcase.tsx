"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ShowcaseItem { id: string; title: string; text: string; visual: ReactNode }

/** Vitrine interativa: troca sozinha a cada 7 s (com barra de progresso), pausa no hover, troca no clique. */
export function Showcase({ items }: { items: ShowcaseItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % items.length), 7000);
    return () => clearTimeout(t);
  }, [active, paused, reduce, items.length]);
  const cur = items[active]!;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div role="tablist" aria-label="Funcionalidades" className="flex flex-col gap-1.5">
        {items.map((it, i) => {
          const on = i === active;
          return (
            <button key={it.id} role="tab" aria-selected={on} aria-controls="showcase-panel" onClick={() => setActive(i)}
              className={cn("group relative overflow-hidden rounded-2xl px-5 py-4 text-left transition-all duration-500", on ? "lg glass-strong" : "hover:bg-white/[0.04]")}>
              <div className={cn("text-lg font-semibold tracking-tight transition-colors md:text-xl", on ? "text-fg" : "text-muted group-hover:text-fg")}>{it.title}</div>
              <div className={cn("grid transition-[grid-template-rows,opacity] duration-500", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <p className="overflow-hidden pt-1.5 text-[14.5px] leading-relaxed text-muted">{it.text}</p>
              </div>
              {on && !reduce ? <span key={`${active}-${paused}`} aria-hidden className="absolute inset-x-5 bottom-0 h-[2px] origin-left rounded-full bg-gradient-to-r from-brand to-[#ff4d6d]"
                style={{ animation: paused ? "none" : "fill 7s linear forwards", transform: paused ? "scaleX(0.35)" : undefined }} /> : null}
            </button>
          );
        })}
      </div>
      <div id="showcase-panel" role="tabpanel" className="lg relative min-h-[380px] overflow-hidden rounded-[28px] p-6 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={cur.id}
            initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            {cur.visual}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
