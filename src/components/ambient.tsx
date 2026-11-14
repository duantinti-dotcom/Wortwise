"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Fundo de luz em movimento. É o que dá cor para o vidro refratar: sem isso, vidro sobre preto vira cinza.
 * Só usa transform/opacity (composição na GPU), reage ao mouse com leve paralaxe e pausa com
 * prefers-reduced-motion (regra global) e quando a aba está oculta.
 */
export function Ambient({ variant = "vivid" }: { variant?: "vivid" | "calm" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: PointerEvent) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; if (!raf) raf = requestAnimationFrame(tick); };
    const tick = () => {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      el.style.setProperty("--px", cx.toFixed(4)); el.style.setProperty("--py", cy.toFixed(4));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onVis = () => el.classList.toggle("paused", document.hidden);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", onVis); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} aria-hidden className={cn("ambient", variant === "calm" && "ambient-calm")}>
      <span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><span className="blob b4" /><span className="blob b5" />
      <span className="ambient-veil" />
    </div>
  );
}

/** Filtro SVG de refração (usado pelo vidro "líquido" nos navegadores que suportam backdrop-filter com url()). */
export function GlassFilters() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <filter id="lg-refract" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
