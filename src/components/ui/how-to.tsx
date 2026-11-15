"use client";
import { HelpCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";

const KEY = (id: string) => `ww-howto-${id}`;
const listeners = new Set<() => void>();
const read = (id: string) => { try { return localStorage.getItem(KEY(id)) === "0"; } catch { return false; } };
const write = (id: string, hidden: boolean) => {
  try { if (hidden) localStorage.setItem(KEY(id), "0"); else localStorage.removeItem(KEY(id)); } catch { /* sem armazenamento: vale só agora */ }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** "Como usar" da tela: 3 passos curtos em linguagem simples. Pode ser fechado e reaberto. */
export function HowTo({ id, steps }: { id: string; steps: string[] }) {
  const hidden = useSyncExternalStore(subscribe, () => read(id), () => false);
  return (
    <AnimatePresence initial={false} mode="wait">
      {hidden ? (
        <motion.button key="show" type="button" onClick={() => write(id, false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
          <HelpCircle size={14} className="text-brand" />Como usar esta tela?
        </motion.button>
      ) : (
        <motion.section key="steps" aria-label="Como usar esta tela" className="card relative mb-6 overflow-hidden p-4 sm:p-5"
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-semibold"><HelpCircle size={15} className="text-brand" />Como usar<span className="font-normal text-faint md:hidden">· deslize →</span></span>
            <button type="button" onClick={() => write(id, true)} className="icon-btn !size-7" aria-label="Fechar ajuda"><X size={14} /></button>
          </div>
          <ol className="snap-row !-mx-4 !px-4 !pb-1 md:grid md:grid-cols-3 md:gap-2.5">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-3 rounded-xl bg-tint/[0.035] px-3.5 py-3 text-[13.5px] leading-snug text-soft max-md:!basis-[82%]">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-[#FFFFFF]">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
