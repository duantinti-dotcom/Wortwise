"use client";
import Lenis from "lenis";
import { useEffect } from "react";

/** Rolagem suave com inércia (Lenis). Desligada em telas de toque e com movimento reduzido. Âncoras continuam funcionando. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    const lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), anchors: { offset: -90 }, prevent: (n) => !!n.closest?.("[role=dialog],[data-radix-popper-content-wrapper]") });
    let raf = requestAnimationFrame(function loop(t) { lenis.raf(t); raf = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return null;
}
