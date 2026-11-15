"use client";
import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const SPRING = { type: "spring", stiffness: 90, damping: 18, mass: 0.9 } as const;

/** Entrada ao rolar com mola (desfoque → nítido). Desligada com prefers-reduced-motion. */
export function Reveal({ children, delay = 0, className, y = 28, scale = 1 }: { children: ReactNode; delay?: number; className?: string; y?: number; scale?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y, scale, filter: "blur(4px)" }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ ...SPRING, delay, filter: { duration: 0.6, delay } , opacity: { duration: 0.6, delay } }}>
      {children}
    </motion.div>
  );
}

const parent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const child: Variants = {
  hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { ...SPRING, opacity: { duration: 0.5 }, filter: { duration: 0.5 } } },
};

/** Grupo com entrada em cascata: cada filho direto <Stagger.Item> entra um pouco depois do anterior. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const reduce = useReducedMotion();
  const C = motion[as];
  return <C className={className} variants={parent} initial={reduce ? "show" : "hidden"} whileInView="show" viewport={{ once: true, margin: "0px 0px -15% 0px" }}>{children}</C>;
}
export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const C = motion[as];
  return <C className={className} variants={child}>{children}</C>;
}
