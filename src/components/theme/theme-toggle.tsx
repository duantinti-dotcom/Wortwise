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
  // Um círculo da cor do novo tema cresce a partir do botão (só transform/opacity: roda na placa de vídeo,
  // sem travar mesmo com o vidro desfocado na tela). Coberta a tela, o tema troca e o círculo se dissolve.
  const r = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)));
  const wave = document.createElement("div");
  wave.setAttribute("aria-hidden", "true");
  wave.style.cssText = `position:fixed;left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;z-index:2147483647;pointer-events:none;`
    + `background:${next === "light" ? "#F7F7F5" : "#0F0F11"};transform:scale(0.001);will-change:transform,opacity;`
    + `transition:transform .55s cubic-bezier(.65,0,.35,1),opacity .4s ease;`;
  document.body.appendChild(wave);
  requestAnimationFrame(() => requestAnimationFrame(() => { wave.style.transform = "scale(1)"; }));
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    apply();
    requestAnimationFrame(() => requestAnimationFrame(() => { wave.style.opacity = "0"; setTimeout(() => wave.remove(), 450); }));
  };
  wave.addEventListener("transitionend", (e) => { if (e.propertyName === "transform") finish(); });
  setTimeout(finish, 700);
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
