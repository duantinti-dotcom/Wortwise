"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

export interface RotatorItem { word: string; icon: ReactNode; tone: string }

/** Palavra que gira no título, com ícone em cápsula colorida. O primeiro item é renderizado no servidor (SEO). */
export function WordRotator({ items, interval = 2400 }: { items: RotatorItem[]; interval?: number }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [reduce, interval, items.length]);
  const cur = items[i]!;
  return (
    <span className="relative inline-flex items-center gap-[0.18em] align-baseline">
      <span className="sr-only">{items.map((x) => x.word).join(", ")}</span>
      <motion.span aria-hidden layout className={`relative inline-flex size-[0.82em] shrink-0 items-center justify-center overflow-hidden rounded-[0.2em] text-white shadow-[0_0.1em_0.4em_-0.1em_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.4)] ${cur.tone}`}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={cur.word} className="flex [&>svg]:size-[0.46em]"
            initial={{ y: "110%", rotate: -20, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: "-110%", rotate: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}>{cur.icon}</motion.span>
        </AnimatePresence>
      </motion.span>
      <motion.span aria-hidden layout className="relative inline-flex overflow-hidden pb-[0.12em] -mb-[0.12em]" transition={{ type: "spring", stiffness: 300, damping: 30 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={cur.word} className="accent inline-block whitespace-nowrap"
            initial={{ y: "100%", opacity: 0, filter: "blur(10px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: "-100%", opacity: 0, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}>{cur.word}</motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
