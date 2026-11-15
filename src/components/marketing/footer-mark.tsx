"use client";
import { motion, useReducedMotion } from "motion/react";

/** "Worthwise" gigante do rodapé: as letras sobem em cascata quando o rodapé aparece. */
export function FooterMark() {
  const reduce = useReducedMotion();
  return (
    <motion.div aria-hidden className="pointer-events-none select-none overflow-hidden px-4 pb-2 text-center font-semibold leading-[0.85] tracking-[-0.07em]"
      style={{ fontSize: "clamp(64px, 16vw, 240px)" }}
      initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "-20px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045 } } }}>
      {Array.from("Worthwise").map((ch, i) => (
        <motion.span key={i} className="inline-block"
          style={{ backgroundImage: "linear-gradient(180deg, rgb(var(--tint) / 0.16), rgb(var(--tint) / 0.01) 85%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          variants={{ hidden: { y: "60%", opacity: 0 }, show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 90, damping: 16 } } }}>{ch}</motion.span>
      ))}
    </motion.div>
  );
}
