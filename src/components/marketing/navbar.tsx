"use client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#produto", label: "Produto" },
  { href: "/#funcionalidades", label: "Funcionalidades" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/precos", label: "Preços" },
  { href: "/blog", label: "Blog" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    document.documentElement.dataset.navReady = "1";
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 md:px-5">
      <nav aria-label="Principal"
        className={cn("mx-auto flex h-14 max-w-[1180px] items-center justify-between rounded-2xl border px-3 pl-4 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
          scrolled ? "glass" : "border-transparent bg-transparent")}>
        <Link href="/" aria-label="Worthwise — página inicial"><Logo /></Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}><Link href={l.href} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-fg">{l.label}</Link></li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <Link href="/entrar" className="btn btn-ghost hidden sm:inline-flex">Entrar</Link>
          <Link href="/cadastro" className="btn btn-primary">Começar grátis</Link>
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger className="btn btn-ghost !px-2.5 lg:hidden" aria-label="Abrir menu"><Menu size={20} /></D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
              <D.Content className="glass fixed inset-x-3 top-3 z-50 origin-top rounded-2xl p-3 outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out">
                <div className="flex items-center justify-between pl-1">
                  <D.Title asChild><Logo /></D.Title>
                  <D.Close className="btn btn-ghost !px-2.5" aria-label="Fechar menu"><X size={20} /></D.Close>
                </div>
                <D.Description className="sr-only">Navegação do site</D.Description>
                <ul className="mt-3 space-y-0.5">
                  {LINKS.map((l) => (
                    <li key={l.href}><Link href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-xl px-3 text-base text-fg active:bg-white/8">{l.label}</Link></li>
                  ))}
                </ul>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
                  <Link href="/entrar" onClick={() => setOpen(false)} className="btn btn-secondary btn-lg">Entrar</Link>
                  <Link href="/cadastro" onClick={() => setOpen(false)} className="btn btn-primary btn-lg">Começar grátis</Link>
                </div>
              </D.Content>
            </D.Portal>
          </D.Root>
        </div>
      </nav>
    </header>
  );
}
