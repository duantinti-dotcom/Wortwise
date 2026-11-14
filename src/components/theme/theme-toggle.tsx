"use client";
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type Theme = "dark" | "light";
import { THEME_KEY as KEY } from "./script";

function current(): Theme { return document.documentElement.dataset.theme === "light" ? "light" : "dark"; }

export function setTheme(next: Theme, origin?: { x: number; y: number }) {
  const d = document.documentElement;
  const apply = () => {
    d.classList.add("theme-switching");
    d.dataset.theme = next; d.style.colorScheme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#f7f6f3" : "#0a0a0b");
    try { localStorage.setItem(KEY, next); } catch { /* armazenamento indisponível: vale só nesta visita */ }
    window.dispatchEvent(new CustomEvent("ww-theme", { detail: next }));
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove("theme-switching")));
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (!vt || reduce) return apply();
  d.style.setProperty("--tx", `${origin?.x ?? window.innerWidth / 2}px`);
  d.style.setProperty("--ty", `${origin?.y ?? 0}px`);
  d.classList.add("theme-vt");
  vt.call(document, apply).finished.finally(() => d.classList.remove("theme-vt"));
}

function subscribe(cb: () => void) {
  window.addEventListener("ww-theme", cb);
  return () => window.removeEventListener("ww-theme", cb);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "dark");
}

/** Interruptor claro/escuro em pílula. A troca revela o novo tema num círculo que parte do botão. */
export function ThemeToggle({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const theme = useTheme();
  const light = theme === "light";
  const s = size === "sm" ? { w: 52, h: 28, k: 22 } : { w: 60, h: 32, k: 26 };
  return (
    <button type="button" role="switch" aria-checked={light} aria-label={light ? "Mudar para o modo escuro" : "Mudar para o modo claro"}
      title={light ? "Modo escuro" : "Modo claro"}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTheme(light ? "dark" : "light", { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
      className={cn("relative inline-flex shrink-0 items-center rounded-full border border-tint/15 bg-tint/[0.06] p-[2px] transition-colors hover:border-tint/30", className)}
      style={{ width: s.w, height: s.h }}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-between px-[7px] text-faint">
        <Moon size={size === "sm" ? 12 : 14} /><Sun size={size === "sm" ? 12 : 14} />
      </span>
      <motion.span aria-hidden layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("relative z-10 flex items-center justify-center rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.25)]", light ? "ml-auto bg-gradient-to-b from-[#ffb15c] to-brand text-[#1a0900]" : "bg-fg text-ink")}
        style={{ width: s.k, height: s.k }}>
        <motion.span key={theme} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
          {light ? <Sun size={size === "sm" ? 12 : 14} strokeWidth={2.4} /> : <Moon size={size === "sm" ? 12 : 14} strokeWidth={2.4} />}
        </motion.span>
      </motion.span>
    </button>
  );
}
