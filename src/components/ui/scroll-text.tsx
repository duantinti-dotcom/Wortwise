"use client";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

type Part = { text: string; className?: string };
const words = (parts: Part[]) => parts.flatMap((p) => p.text.split(" ").filter(Boolean).map((w) => ({ w, className: p.className })));

/**
 * Título que surge palavra por palavra ao entrar na tela (desfoque → nítido, com mola).
 * O texto completo fica no HTML desde o início (bom para SEO e leitores de tela).
 */
export function RevealWords({ parts, className, as: Tag = "h2" }: { parts: Part[]; className?: string; as?: "h2" | "h3" | "p" }) {
  const reduce = useReducedMotion();
  const C = motion[Tag];
  const list = words(parts);
  if (reduce) return <Tag className={className}>{list.map((x, i) => <span key={i} className={x.className}>{x.w}{i < list.length - 1 ? " " : ""}</span>)}</Tag>;
  return (
    <C className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {list.map((x, i) => (
        <span key={i}>
          <motion.span className={cn("inline-block", x.className)}
            variants={{ hidden: { opacity: 0, y: "0.5em", filter: "blur(10px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 120, damping: 20 } } }}>
            {x.w}
          </motion.span>{i < list.length - 1 ? " " : ""}
        </span>
      ))}
    </C>
  );
}

function ScrubWord({ progress, range, children, strong }: { progress: MotionValue<number>; range: [number, number]; children: string; strong?: boolean }) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return <motion.span style={{ opacity }} className={cn("inline", strong && "text-fg")}>{children} </motion.span>;
}

/**
 * Parágrafo que "acende" palavra por palavra conforme a rolagem (efeito das páginas da Apple).
 * Palavras marcadas como fortes terminam na cor principal; as demais, em cinza.
 */
export function ScrubWords({ parts, className }: { parts: { text: string; strong?: boolean }[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const list = parts.flatMap((p) => p.text.split(" ").filter(Boolean).map((w) => ({ w, strong: p.strong })));
  if (reduce) return <p ref={ref} className={className}>{list.map((x, i) => <span key={i} className={x.strong ? "text-fg" : undefined}>{x.w} </span>)}</p>;
  return (
    <p ref={ref} className={className}>
      {list.map((x, i) => <ScrubWord key={i} progress={scrollYProgress} range={[i / list.length, (i + 1) / list.length]} strong={x.strong}>{x.w}</ScrubWord>)}
    </p>
  );
}

/** Paralaxe suave: o filho se move num ritmo diferente da rolagem (profundidade). */
export function Parallax({ children, className, offset = 40 }: { children: React.ReactNode; className?: string; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : offset, reduce ? 0 : -offset]);
  return <motion.div ref={ref} style={{ y }} className={className}>{children}</motion.div>;
}

/** Bloco que cresce suavemente ao entrar na tela (escala 0,92 → 1 ligada à rolagem). */
export function ScaleIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center 0.6"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [reduce ? 1 : 0.3, 1]);
  return <motion.div ref={ref} style={{ scale, opacity }} className={className}>{children}</motion.div>;
}
