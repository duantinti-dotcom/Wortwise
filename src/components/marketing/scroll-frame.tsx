"use client";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * Moldura em gradiente que "deita" o produto e o endireita conforme a rolagem
 * (rotateX 22° → 0°, escala 0,9 → 1), com mola para o movimento não ficar duro.
 */
export function ScrollFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.25"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const rotateX = useTransform(p, [0, 1], [reduce ? 0 : 22, 0]);
  const scale = useTransform(p, [0, 1], [reduce ? 1 : 0.9, 1]);
  const y = useTransform(p, [0, 1], [reduce ? 0 : 60, 0]);
  return (
    <div ref={ref} className="[perspective:1600px]">
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="tile tile-sunset anim-gradient relative rounded-[28px] p-2.5 sm:rounded-[40px] sm:p-5 md:p-10">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-white/25 blur-3xl" />
        <div className="theme-dark relative">{children}</div>
      </motion.div>
    </div>
  );
}
