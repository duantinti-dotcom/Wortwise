"use client";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vitrine no estilo das páginas de produto da Apple: cada função ocupa a tela, com título grande,
 * texto curto e a demonstração que cresce e entra em foco conforme a pessoa rola a página.
 */
export interface ShowcaseItem { eyebrow: string; title: string; text: string; visual: ReactNode; glow: string }

function Panel({ item, flip }: { item: ShowcaseItem; flip: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.86, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.55, 1], reduce ? [1, 1, 1] : [0, 0.7, 1]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [60, 0]);
  return (
    <div ref={ref} className={cn("grid items-center gap-10 md:gap-16 lg:grid-cols-2", flip && "lg:[&>*:first-child]:order-2")}>
      <motion.div style={{ opacity, y }} className="text-center lg:text-left">
        <p className="eyebrow">{item.eyebrow}</p>
        <h3 className="display mt-3 text-[34px] leading-[1.05] sm:text-[46px] lg:text-[56px]">{item.title}</h3>
        <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-muted lg:mx-0 md:text-[19px]">{item.text}</p>
      </motion.div>
      <motion.div style={{ scale, opacity }} className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-[-12%] -z-10 rounded-full blur-3xl" style={{ background: item.glow }} />
        <div className="card overflow-hidden p-4 shadow-[0_40px_120px_-40px_rgba(37,99,235,0.45)] md:p-6">{item.visual}</div>
      </motion.div>
    </div>
  );
}

export function Showcase({ items }: { items: ShowcaseItem[] }) {
  return (
    <div className="space-y-28 md:space-y-44">
      {items.map((it, i) => <Panel key={it.title} item={it} flip={i % 2 === 1} />)}
    </div>
  );
}

/** Faixa de números grandes, que sobem ao aparecer. */
export function BigStats({ stats }: { stats: { value: string; label: string }[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div key={s.label} initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }} className="text-center">
          <div className="display bg-gradient-to-b from-fg to-fg/55 bg-clip-text text-[44px] leading-none text-transparent md:text-[64px]">{s.value}</div>
          <div className="mt-3 text-[14.5px] text-muted">{s.label}</div>
        </motion.div>
      ))}
    </div>
  );
}
