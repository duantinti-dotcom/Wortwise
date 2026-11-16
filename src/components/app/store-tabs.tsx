"use client";
import { Trophy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn } from "@/lib/utils";

/** Pílula de vidro que desliza até a loja escolhida. */
export function StorePill({ id }: { id: string }) {
  return (
    <motion.span layoutId={`store-pill-${id}`} aria-hidden transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="absolute inset-0 -z-10 rounded-[10px] bg-[linear-gradient(180deg,rgba(59,130,246,0.22),rgba(59,130,246,0.10))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(0,0,0,0.3)] ring-1 ring-[#3B82F6]/70" />
  );
}

/** Navegação entre lojas: a aba escolhida muda na hora e o conteúdo atual esmaece enquanto o próximo carrega. */
const NavCtx = createContext<{ pending: string | null; go: (id: string, href: string) => void } | null>(null);

export function StoreNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const go = (id: string, href: string) => {
    if (isPending && target === id) return; // ignora cliques repetidos no mesmo item
    setTarget(id); start(() => router.push(href, { scroll: false }));
  };
  return <NavCtx.Provider value={{ pending: isPending ? target : null, go }}>{children}</NavCtx.Provider>;
}

/** Abas de loja (Mercado Livre, Shopee, Amazon, TikTok Shop) com logo e animação de troca. */
export function StoreTabs({ stores, active, links }: { stores: readonly string[]; active: string; links: Record<string, string> }) {
  const nav = useContext(NavCtx);
  const shown = nav?.pending && !nav.pending.startsWith("cat:") ? nav.pending : active;
  return (
    <nav aria-label="Lojas" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="glass flex w-max gap-1 rounded-[14px] p-1">
        {stores.map((s) => {
          const on = s === shown;
          return (
            <li key={s}>
              <Link href={links[s] ?? "#"} scroll={false} aria-current={s === active ? "page" : undefined}
                onClick={(e) => { if (!nav || e.metaKey || e.ctrlKey || s === active) return; e.preventDefault(); nav.go(s, links[s] ?? "#"); }}
                className={cn("relative isolate flex h-10 items-center gap-2.5 rounded-[10px] px-3.5 text-[15px] font-medium transition-colors", on ? "text-fg" : "text-muted hover:text-fg")}>
                {on ? <StorePill id="tabs" /> : null}
                <motion.span animate={on ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ duration: 0.3 }} className="flex">
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

/** Tópicos (Eletrônicos, Casa…): o escolhido fica marcado na hora e cliques repetidos são ignorados. */
export function CategoryChips({ items, active }: { items: { id: string; name: string; href: string }[]; active: string }) {
  const nav = useContext(NavCtx);
  const pendingCat = nav?.pending?.startsWith("cat:") ? nav.pending.slice(4) : null;
  const shown = pendingCat ?? active;
  return (
    <nav aria-label="Categorias" className="-mx-5 mt-6 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={c.href} scroll={false} aria-current={c.id === shown ? "page" : undefined} className="chip whitespace-nowrap"
              onClick={(e) => { if (!nav || e.metaKey || e.ctrlKey) return; e.preventDefault(); if (c.id !== active) nav.go(`cat:${c.id}`, c.href); }}>
              {c.name}{pendingCat === c.id ? <span className="ml-1 size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Conteúdo da loja: esmaece na hora do clique e entra com um deslize curto (sem desfoque, que pesa no celular). */
export function StoreSwitch({ store, children }: { store: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const nav = useContext(NavCtx);
  const leaving = Boolean(nav?.pending && nav.pending !== store);
  // (inclui troca de tópico: "cat:…")
  return (
    <div className={cn("transition-opacity duration-200", leaving && "pointer-events-none opacity-40")} aria-busy={leaving || undefined}>
      <motion.div key={store} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} style={{ willChange: "transform, opacity" }}>
        {children}
      </motion.div>
    </div>
  );
}
