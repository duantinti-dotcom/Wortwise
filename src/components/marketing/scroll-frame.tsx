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
  const rotateX = useTransform(p, [0, 1], [reduce ? 0 : 14, 0]);
  const scale = useTransform(p, [0, 1], [reduce ? 1 : 0.94, 1]);
  const y = useTransform(p, [0, 1], [reduce ? 0 : 40, 0]);
  return (
    <div ref={ref} className="[perspective:1600px]">
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="liquid relative rounded-[24px] p-1.5 shadow-[0_40px_120px_-40px_rgba(59,130,246,0.35)] sm:rounded-[30px] sm:p-2.5">
        <div aria-hidden className="pointer-events-none absolute inset-x-[15%] -top-px h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
        <div className="relative">{children}</div>
      </motion.div>
    </div>
  );
}
