"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Frase que alterna letra por letra (desfoque + mola), sempre em uma linha própria e centralizada.
 * Leitores de tela recebem todas as frases de uma vez; o primeiro item é renderizado no servidor.
 */
export function TextRotator({ phrases, interval = 2800, className }: { phrases: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % phrases.length), interval);
    return () => clearInterval(t);
  }, [reduce, interval, phrases.length]);
  const cur = phrases[i]!;
  return (
    <span className={cn("relative block", className)}>
      <span className="sr-only">{phrases.join(" / ")}</span>
      <span aria-hidden className="block min-h-[2.06em] sm:min-h-[1.03em]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={cur} className="inline"
            initial="in" animate="show" exit="out"
            variants={{ in: {}, show: { transition: { staggerChildren: 0.022 } }, out: { transition: { staggerChildren: 0.008 } } }}>
            {cur.split(" ").map((word, w, words) => (
              <span key={w}><span className="inline-block whitespace-nowrap">
                {Array.from(word).map((ch, k) => (
                  <motion.span key={k} className="inline-block"
                    variants={{
                      in: { opacity: 0, y: "0.45em", filter: "blur(10px)" },
                      show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 220, damping: 24 } },
                      out: { opacity: 0, y: "-0.35em", filter: "blur(8px)", transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
                    }}>{ch}</motion.span>
                ))}
                </span>{w < words.length - 1 ? " " : null}</span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
