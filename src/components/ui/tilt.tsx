"use client";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inclinação 3D com mola seguindo o cursor (desligada em toque e com movimento reduzido). */
export function Tilt({ children, className, max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const cfg = { stiffness: 150, damping: 18, mass: 0.6 };
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [max, -max]), cfg);
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-max, max]), cfg);
  const gx = useTransform(mx, [-0.5, 0.5], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(60% 40% at ${gx}% 0%, rgba(255,255,255,0.12), transparent 70%)`;
  return (
    <div className={cn("[perspective:1600px]", className)}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}>
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative">
        {children}
        <motion.span aria-hidden style={{ background: glare }} className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </motion.div>
    </div>
  );
}
