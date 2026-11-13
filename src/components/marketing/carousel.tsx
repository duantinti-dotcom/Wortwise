"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Carrossel horizontal contínuo sobre rolagem nativa: o usuário pode arrastar/rolar a qualquer momento.
 * Pausa ao interagir (hover, toque, foco), fora da tela e com prefers-reduced-motion.
 */
export function Carousel({ children, label }: { children: ReactNode[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let paused = false;
    let visible = false;
    let resume: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    let pos = el.scrollLeft;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      if (!paused && visible) {
        const half = el.scrollWidth / 2;
        pos += dt * 0.035;
        if (pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    const pause = () => { paused = true; clearTimeout(resume); };
    const play = () => { clearTimeout(resume); resume = setTimeout(() => { pos = el.scrollLeft; paused = false; }, 1800); };
    const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); }, { threshold: 0.1 });
    io.observe(el);
    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", play);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", play);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", play);
    el.addEventListener("wheel", () => { pause(); play(); }, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(resume); io.disconnect(); };
  }, []);

  return (
    <div ref={ref} role="region" aria-label={label} tabIndex={0}
      className="flex gap-5 overflow-x-auto px-5 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)" }}>
      {children}
      {/* cópia para o laço contínuo; oculta de leitores de tela */}
      <div aria-hidden className="contents">{children}</div>
    </div>
  );
}
