"use client";
import { useEffect, useRef, useState } from "react";

/** Feixe de luz contornando a borda do elemento pai (que precisa ter border-radius e position). */
export function BorderBeam() {
  return <span aria-hidden className="border-beam" />;
}

/** Número que desliza suavemente até o novo valor (sem saltos). */
export function AnimatedNumber({ value, format, className, duration = 450 }: { value: number; format: (v: number) => string; className?: string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const a = from.current;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const k = instant ? 1 : Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className={className}>{format(shown)}</span>;
}
