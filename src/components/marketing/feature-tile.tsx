"use client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Parallax } from "@/components/ui/scroll-text";

/**
 * Bloco de funcionalidade em gradiente vivo com uma "tela" do produto dentro.
 * A tela reage ao cursor (paralaxe com mola) e sobe levemente no hover.
 */
export function FeatureTile({ tone, icon, title, text, children, className, flip }: {
  tone: string; icon: ReactNode; title: string; text: string; children: ReactNode; className?: string; flip?: boolean;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const cfg = { stiffness: 120, damping: 16, mass: 0.6 };
  const x = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), cfg);
  const y = useSpring(useTransform(my, [-0.5, 0.5], [-4, 4]), cfg);
  const rotate = useSpring(useTransform(mx, [-0.5, 0.5], [0, 0]), cfg);
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ type: "spring", stiffness: 90, damping: 22 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      className={cn("tile group flex flex-col p-5 sm:p-8", tone, className)}>
      <div className={cn("flex flex-col", flip && "order-2 mt-8")}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[9px] border border-tint/10 bg-tint/[0.05] text-brand [&>svg]:size-[17px]">{icon}</span>
          <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.03em] sm:text-[24px]">{title}</h3>
        </div>
        <p className="tile-muted mt-3 max-w-[46ch] text-[15px] leading-relaxed">{text}</p>
      </div>
      <Parallax offset={14} className={flip ? "order-1" : "mt-8"}>
        <motion.div style={reduce ? undefined : { x, y, rotate }} className="demo-screen relative rounded-[14px] p-3 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.7)] sm:p-5">
          {children}
        </motion.div>
      </Parallax>
    </motion.article>
  );
}
