"use client";
import { Trophy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn } from "@/lib/utils";

/** Pílula de vidro que desliza até a loja escolhida. */
export function StorePill({ id }: { id: string }) {
  return (
    <motion.span layoutId={`store-pill-${id}`} aria-hidden transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="absolute inset-0 -z-10 rounded-[10px] bg-[linear-gradient(180deg,rgba(59,130,246,0.22),rgba(59,130,246,0.10))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(0,0,0,0.3)] ring-1 ring-[#3B82F6]/70" />
  );
}

/** Abas de loja (Mercado Livre, Shopee, Amazon, TikTok Shop) com logo e animação de troca. */
export function StoreTabs({ stores, active, links }: { stores: readonly string[]; active: string; links: Record<string, string> }) {
  return (
    <nav aria-label="Lojas" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="glass flex w-max gap-1 rounded-[14px] p-1">
        {stores.map((s) => {
          const on = s === active;
          return (
            <li key={s}>
              <Link href={links[s] ?? "#"} scroll={false} aria-current={on ? "page" : undefined}
                className={cn("relative isolate flex h-10 items-center gap-2.5 rounded-[10px] px-3.5 text-[15px] font-medium transition-colors", on ? "text-fg" : "text-muted hover:text-fg")}>
                {on ? <StorePill id="tabs" /> : null}
                <motion.span animate={on ? { scale: [1, 1.18, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.45 }} className="flex">
                  {s === "geral" ? <span className="flex size-[22px] items-center justify-center rounded-[6px] bg-gradient-to-br from-[#F59E0B] to-[#EF4444] text-white"><Trophy size={13} /></span> : <SourceMark source={s} size={22} />}
                </motion.span>
                {s === "geral" ? "Geral" : sourceName(s)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Conteúdo da loja escolhida entra com um leve deslize e desfoque. */
export function StoreSwitch({ store, children }: { store: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div key={store} initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
