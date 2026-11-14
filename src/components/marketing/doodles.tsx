"use client";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const draw = (delay: number, duration = 1.6) => ({ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { pathLength: { duration, delay, ease: [0.65, 0, 0.35, 1] as const }, opacity: { duration: 0.2, delay } } });

/** Rabisco à mão livre que se desenha ao carregar e flutua levemente com a rolagem. */
export function Squiggle({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -60]);
  const r = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -8]);
  return (
    <motion.svg aria-hidden viewBox="0 0 260 200" fill="none" className={cn("pointer-events-none", className)} style={{ y, rotate: r }}>
      <motion.path d="M4 40c40-30 92-22 104 18 10 34-30 56-44 40-16-18 18-52 58-46 46 7 52 60 18 76-26 12-46-16-24-34 30-24 90-8 140 40" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" {...draw(0.5, 2.2)} />
    </motion.svg>
  );
}

/** Estrela de quatro pontas, desenhada e girando devagar. */
export function Sparkle({ className, delay = 0.9 }: { className?: string; delay?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" fill="none" className={cn("pointer-events-none animate-spin-slow", className)}>
      <motion.path d="M50 6C53 36 64 47 94 50 64 53 53 64 50 94 47 64 36 53 6 50 36 47 47 36 50 6Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" {...draw(delay, 1.2)} />
    </svg>
  );
}

/** Seta curva desenhada à mão, para apontar para um botão. */
export function CurvyArrow({ className, delay = 1.4 }: { className?: string; delay?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 120 80" fill="none" className={cn("pointer-events-none", className)}>
      <motion.path d="M6 10c22 4 60 10 74 34 6 10 6 20 2 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" {...draw(delay, 1)} />
      <motion.path d="M70 62l12 12 12-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...draw(delay + 0.8, 0.4)} />
    </svg>
  );
}

/** Sublinhado de marcador sob uma palavra. */
export function Underline({ className, delay = 1.1 }: { className?: string; delay?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" fill="none" className={cn("pointer-events-none absolute -bottom-[0.12em] left-0 h-[0.22em] w-full", className)}>
      <motion.path d="M3 14C60 6 140 4 297 9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" {...draw(delay, 0.9)} />
    </svg>
  );
}
