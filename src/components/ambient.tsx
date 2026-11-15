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

const enc = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
/** Mapa de deslocamento: neutro (0,5) no meio e forte só nas bordas — a "lente" do vidro da Apple. */
const MAP_X = enc(`<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='g'><stop offset='0' stop-color='#ff0000'/><stop offset='.06' stop-color='#800000'/><stop offset='.94' stop-color='#800000'/><stop offset='1' stop-color='#000000'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>`);
const MAP_Y = enc(`<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='g' x2='0' y2='1'><stop offset='0' stop-color='#00ff00'/><stop offset='.18' stop-color='#008000'/><stop offset='.82' stop-color='#008000'/><stop offset='1' stop-color='#000000'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>`);

/**
 * Filtro de lente usado pelo vidro líquido (backdrop-filter: url(#lg-lens)). Só os navegadores com
 * Chromium aplicam filtros SVG no backdrop; nos demais o vidro fica com desfoque e brilho de borda.
 */
export function GlassFilters() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <filter id="lg-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={MAP_X} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="mx" />
        <feImage href={MAP_Y} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="my" />
        <feComposite in="mx" in2="my" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="16" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
