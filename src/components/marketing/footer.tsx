import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { FooterMark } from "./footer-mark";

const COLS = [
  { title: "Produto", links: [["/#funcionalidades", "Funcionalidades"], ["/precos", "Preços"], ["/calculadora-de-lucro", "Calculadora de lucro"], ["/cadastro", "Começar grátis"]] },
  { title: "Transparência", links: [["/metodologia", "Metodologia"], ["/fontes-de-dados", "Fontes de dados"], ["/blog", "Blog"]] },
  { title: "Legal", links: [["/privacidade", "Privacidade"], ["/termos", "Termos de uso"]] },
] as const;

export function Footer() {
  return (
    <footer className="relative px-3 pb-3">
      <div className="lg relative mx-auto max-w-[1240px] overflow-hidden rounded-2xl">
        <div className="grid gap-10 px-6 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-12 md:py-14">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Inteligência comercial para quem vende online. Dados com fonte, cálculos transparentes e conclusões fundamentadas.</p>
            <Link href="/cadastro" className="btn btn-contrast btn-sm mt-6">Começar grátis <ArrowRight className="btn-arrow" size={14} /></Link>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <div className="mono-label">{c.title}</div>
              <ul className="mt-4 space-y-3">
                {c.links.map(([href, label]) => <li key={href}><Link href={href} className="text-[14.5px] text-soft transition-colors hover:text-brand-hi">{label}</Link></li>)}
              </ul>
            </nav>
          ))}
        </div>
        <FooterMark />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tint/10 px-6 py-5 text-xs text-faint md:px-12">
          <span>© {new Date().getFullYear()} Worthwise. Todos os direitos reservados.</span>
          <span>Não somos afiliados aos marketplaces citados. Marcas pertencem aos seus titulares.</span>
        </div>
      </div>
    </footer>
  );
}
