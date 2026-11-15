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
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#F7F7F5" : "#0F0F11");
    try { localStorage.setItem(KEY, next); } catch { /* armazenamento indisponível: vale só nesta visita */ }
    window.dispatchEvent(new CustomEvent("ww-theme", { detail: next }));
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove("theme-switching")));
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return apply();
  const x = origin?.x ?? window.innerWidth / 2, y = origin?.y ?? 0;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (vt) {
    // Navegadores com View Transitions: o novo tema aparece num círculo que nasce no botão.
    d.style.setProperty("--tx", `${x}px`);
    d.style.setProperty("--ty", `${y}px`);
    d.classList.add("theme-vt");
    vt.call(document, apply).finished.finally(() => d.classList.remove("theme-vt"));
    return;
  }
  // Demais navegadores (ex.: iPhone mais antigo): uma onda da cor do novo tema cobre a tela e se dissolve.
  const wave = document.createElement("div");
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  wave.setAttribute("aria-hidden", "true");
  wave.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${next === "light" ? "#F7F7F5" : "#0F0F11"};clip-path:circle(0px at ${x}px ${y}px);-webkit-clip-path:circle(0px at ${x}px ${y}px);transition:clip-path .5s cubic-bezier(.16,1,.3,1),-webkit-clip-path .5s cubic-bezier(.16,1,.3,1),opacity .35s ease`;
  document.body.appendChild(wave);
  void wave.offsetWidth;
  wave.style.clipPath = `circle(${r}px at ${x}px ${y}px)`;
  wave.style.setProperty("-webkit-clip-path", `circle(${r}px at ${x}px ${y}px)`);
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    apply();
    requestAnimationFrame(() => { wave.style.opacity = "0"; setTimeout(() => wave.remove(), 400); });
  };
  wave.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 650);
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
      className={cn("liquid glass-lens relative inline-flex shrink-0 items-center rounded-full p-[3px] transition-[filter] hover:brightness-110", className)}
      style={{ width: s.w, height: s.h }}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-between px-[7px] text-faint">
        <Moon size={size === "sm" ? 12 : 14} /><Sun size={size === "sm" ? 12 : 14} />
      </span>
      <motion.span aria-hidden layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("relative z-10 flex items-center justify-center rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.25)]", light ? "ml-auto bg-gradient-to-b from-[#FDE68A] to-[#F59E0B] text-white shadow-[0_0_14px_rgba(245,158,11,0.55)]" : "bg-gradient-to-b from-[#E0E7FF] to-[#A5B4FC] text-[#1E1B4B] shadow-[0_0_14px_rgba(165,180,252,0.45)]")}
        style={{ width: s.k, height: s.k }}>
        <motion.span key={theme} initial={{ rotate: light ? -180 : 120, scale: 0.2, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
          {light ? <Sun size={size === "sm" ? 12 : 14} strokeWidth={2.4} /> : <Moon size={size === "sm" ? 12 : 14} strokeWidth={2.4} />}
        </motion.span>
      </motion.span>
    </button>
  );
}
