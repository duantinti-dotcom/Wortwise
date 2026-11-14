"use client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  const x = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), cfg);
  const y = useSpring(useTransform(my, [-0.5, 0.5], [-8, 8]), cfg);
  const rotate = useSpring(useTransform(mx, [-0.5, 0.5], [-1.2, 1.2]), cfg);
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 50, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ type: "spring", stiffness: 80, damping: 18 }}
      whileHover={reduce ? undefined : { y: -6 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      className={cn("tile group flex flex-col p-6 sm:p-9", tone, className)}>
      <div className={cn("flex flex-col", flip && "order-2 mt-8")}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur [&>svg]:size-5">{icon}</span>
          <h3 className="text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[32px]">{title}</h3>
        </div>
        <p className="tile-muted mt-3 max-w-[46ch] text-[16px] leading-relaxed sm:text-[17px]">{text}</p>
      </div>
      <motion.div style={reduce ? undefined : { x, y, rotate }} className={cn("theme-dark relative rounded-[22px] border border-white/10 bg-[#0d0d0f]/90 p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] sm:p-5", flip ? "order-1" : "mt-8")}>
        {children}
      </motion.div>
    </motion.article>
  );
}
