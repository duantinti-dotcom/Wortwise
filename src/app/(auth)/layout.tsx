import { BadgeCheck, Check, Database, LineChart } from "lucide-react";
import Link from "next/link";
import { Ambient } from "@/components/ambient";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { VisualChart } from "@/components/marketing/visuals";
import { ScoreRing } from "@/components/score-ring";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Ambient />
      <div className="relative flex flex-col px-6 py-7 sm:px-12">
        <div aria-hidden className="aurora -left-24 top-1/3 h-72 w-72 bg-brand/10 lg:hidden" />
        <div className="relative flex items-center justify-between"><Link href="/" aria-label="Worthwise — página inicial" className="w-fit"><Logo /></Link><ThemeToggle size="sm" /></div>
        <main className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12"><div className="lg rounded-2xl p-7 sm:p-9">{children}</div></main>
        <p className="relative text-xs text-faint">© {new Date().getFullYear()} Worthwise · <Link href="/privacidade" className="hover:text-muted">Privacidade</Link> · <Link href="/termos" className="hover:text-muted">Termos</Link></p>
      </div>
      <aside className="tile relative m-3 hidden lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20" aria-hidden="true">
        
        <div className="relative max-w-lg">
          <p className="display text-[44px]">Decida o que vender com evidências, não com palpites.</p>
          <ul className="tile-muted mt-8 space-y-3 text-[15px] font-medium">
            {["Dados com fonte e data de coleta", "Histórico de preços formado por observações reais", "Lucro calculado com todas as despesas"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex size-5 items-center justify-center rounded-md bg-brand/15 text-brand"><Check size={12} strokeWidth={3} /></span>{t}</li>
            ))}
          </ul>
          <div className="relative mt-12">
            <div className="glass rounded-2xl p-5"><VisualChart id="auth" /></div>
            <div className="glass animate-float absolute -bottom-10 -right-6 flex items-center gap-3 rounded-2xl p-3.5 pr-5">
              <ScoreRing value={82} size={58} />
              <div><div className="text-sm font-semibold">Worthwise Score</div><div className="text-xs text-muted">confiança moderada</div></div>
            </div>
          </div>
          <div className="tile-muted mt-20 flex gap-6 text-xs font-medium">
            <span className="flex items-center gap-1.5"><Database size={13} className="text-brand" />APIs oficiais</span>
            <span className="flex items-center gap-1.5"><BadgeCheck size={13} className="text-brand" />CNPJ verificado</span>
            <span className="flex items-center gap-1.5"><LineChart size={13} className="text-brand" />Histórico real</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
