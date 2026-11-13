import Link from "next/link";
import { Logo } from "@/components/logo";

const COLS = [
  { title: "Produto", links: [["/#funcionalidades", "Funcionalidades"], ["/precos", "Preços"], ["/calculadora-de-lucro", "Calculadora de lucro"], ["/cadastro", "Começar grátis"]] },
  { title: "Transparência", links: [["/metodologia", "Metodologia"], ["/fontes-de-dados", "Fontes de dados"], ["/blog", "Blog"]] },
  { title: "Legal", links: [["/privacidade", "Privacidade"], ["/termos", "Termos de uso"]] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Inteligência comercial para quem vende online. Dados com fonte, cálculos transparentes e conclusões fundamentadas.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <div className="text-sm font-medium">{c.title}</div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([href, label]) => <li key={href}><Link href={href} className="text-sm text-muted transition-colors hover:text-fg">{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-page flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-xs text-faint">
        <span>© {new Date().getFullYear()} Worthwise. Todos os direitos reservados.</span>
        <span>Worthwise não é afiliado aos marketplaces citados. Marcas pertencem aos seus titulares.</span>
      </div>
    </footer>
  );
}
