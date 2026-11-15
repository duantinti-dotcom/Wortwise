"use client";
import { useEffect } from "react";

const SELECTOR = ".card, .lg, .glass, .liquid, .tile";

/**
 * Reflexo de luz que acompanha o cursor sobre qualquer superfície de vidro (como o brilho especular do iOS).
 * Um único ouvinte para a página inteira; só atualiza duas variáveis CSS do elemento sob o cursor.
 */
export function GlassLight() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last: { el: HTMLElement; x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      last = { el, x: e.clientX - r.left, y: e.clientY - r.top };
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        last.el.style.setProperty("--lx", `${last.x}px`);
        last.el.style.setProperty("--ly", `${last.y}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
