"use client";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#em-alta", label: "Em alta" },
  { href: "/#funcionalidades", label: "Funcionalidades" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/precos", label: "Preços" },
  { href: "/blog", label: "Blog" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 16 || window.innerWidth < 1024);
    on();
    document.documentElement.dataset.navReady = "1";
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 md:pt-4">
      <nav aria-label="Principal"
        className={cn("grid h-[60px] w-full max-w-[1160px] grid-cols-[1fr_auto_1fr] items-center rounded-[18px] pl-5 pr-2.5 transition-all duration-500", scrolled ? "glass" : "bg-transparent")}>
        <Link href="/" aria-label="Worthwise — página inicial" className="flex items-center justify-self-start"><Logo /></Link>
        <ul className="hidden items-center justify-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}><Link href={l.href} className="rounded-[10px] px-3 py-2 text-[14px] text-muted transition-colors hover:bg-tint/[0.07] hover:text-fg">{l.label}</Link></li>
          ))}
        </ul>
        <div className="col-start-3 flex items-center justify-self-end gap-1.5">
          <ThemeToggle size="sm" className="mr-1 hidden sm:inline-flex" />
          <Link href="/entrar" className="hidden rounded-[10px] px-3 py-2 text-[14px] font-medium text-soft transition-colors hover:text-fg sm:inline-flex">Entrar</Link>
          <Link href="/cadastro" className="btn btn-primary btn-sm whitespace-nowrap"><span className="sm:hidden">Começar</span><span className="hidden sm:inline">Começar por R$ 9,90</span></Link>
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger className="btn btn-ghost btn-sm !px-2 lg:hidden" aria-label="Abrir menu"><Menu size={20} /></D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
              <D.Content className="lg glass-strong fixed inset-x-3 top-3 z-50 origin-top rounded-2xl p-3 outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out">
                <div className="flex items-center justify-between pl-2">
                  <D.Title asChild><Logo /></D.Title>
                  <D.Close className="btn btn-ghost !px-2.5" aria-label="Fechar menu"><X size={20} /></D.Close>
                </div>
                <D.Description className="sr-only">Navegação do site</D.Description>
                <ul className="mt-2">
                  {LINKS.map((l, i) => (
                    <li key={l.href} className="animate-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="flex h-14 items-center justify-between rounded-2xl px-4 text-[17px] font-medium text-fg hover:bg-tint/5 active:bg-tint/8">{l.label}<ArrowRight size={16} className="text-faint" /></Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between rounded-2xl px-4 py-3 text-[15px] text-soft">Tema<ThemeToggle /></div>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-tint/8 pt-3">
                  <Link href="/entrar" onClick={() => setOpen(false)} className="btn btn-secondary btn-lg">Entrar</Link>
                  <Link href="/cadastro" onClick={() => setOpen(false)} className="btn btn-primary btn-lg">Começar por R$ 9,90</Link>
                </div>
              </D.Content>
            </D.Portal>
          </D.Root>
        </div>
      </nav>
    </header>
  );
}
