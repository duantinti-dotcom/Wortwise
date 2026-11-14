"use client";
import { ArrowRight, Menu, X } from "lucide-react";
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
    const on = () => setScrolled(window.scrollY > 16);
    on();
    document.documentElement.dataset.navReady = "1";
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 md:pt-4">
      <nav aria-label="Principal"
        className={cn("flex h-[58px] w-full items-center justify-between rounded-2xl border px-3 pl-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          scrolled ? "lg lg-refract max-w-[1000px] !rounded-[22px]" : "max-w-[1240px] border-transparent bg-transparent")}>
        <Link href="/" aria-label="Worthwise — página inicial"><Logo /></Link>
        <ul className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}><Link href={l.href} className="rounded-full px-3.5 py-2 text-[14px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg">{l.label}</Link></li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <Link href="/entrar" className="btn btn-ghost hidden sm:inline-flex">Entrar</Link>
          <Link href="/cadastro" className="btn btn-primary !rounded-xl max-sm:!h-9 max-sm:!px-3.5 max-sm:!text-[13px]">Começar grátis <ArrowRight size={15} className="btn-arrow hidden sm:block" /></Link>
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger className="btn btn-ghost !px-2.5 lg:hidden" aria-label="Abrir menu"><Menu size={20} /></D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
              <D.Content className="lg glass-strong fixed inset-x-3 top-3 z-50 origin-top rounded-3xl p-3 outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out">
                <div className="flex items-center justify-between pl-2">
                  <D.Title asChild><Logo /></D.Title>
                  <D.Close className="btn btn-ghost !px-2.5" aria-label="Fechar menu"><X size={20} /></D.Close>
                </div>
                <D.Description className="sr-only">Navegação do site</D.Description>
                <ul className="mt-2">
                  {LINKS.map((l, i) => (
                    <li key={l.href} className="animate-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="flex h-14 items-center justify-between rounded-2xl px-4 text-[17px] font-medium text-fg active:bg-white/8">{l.label}<ArrowRight size={16} className="text-faint" /></Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
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
