import { BadgeCheck, Check, Database, LineChart } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { VisualChart } from "@/components/marketing/visuals";
import { ScoreRing } from "@/components/score-ring";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative flex flex-col px-6 py-7 sm:px-12">
        <div aria-hidden className="aurora -left-24 top-1/3 h-72 w-72 bg-brand/10 lg:hidden" />
        <Link href="/" aria-label="Worthwise — página inicial" className="relative w-fit"><Logo /></Link>
        <main className="relative mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</main>
        <p className="relative text-xs text-faint">© {new Date().getFullYear()} Worthwise · <Link href="/privacidade" className="hover:text-muted">Privacidade</Link> · <Link href="/termos" className="hover:text-muted">Termos</Link></p>
      </div>
      <aside className="relative m-3 hidden overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#0d0d0d] lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20" aria-hidden="true">
        <div className="grid-bg absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_80%_70%_at_70%_20%,#000,transparent)]" />
        <div className="aurora -right-16 -top-16 h-96 w-96 bg-brand/25" />
        <div className="aurora bottom-0 left-10 h-64 w-64 bg-[#ff3d00]/10" />
        <div className="relative max-w-lg">
          <p className="text-grad text-[40px] font-semibold leading-[1.05] tracking-[-0.04em]">Decida o que vender com evidências, não com palpites.</p>
          <ul className="mt-8 space-y-3 text-[15px] text-[#cfcfcf]">
            {["Dados com fonte e data de coleta", "Histórico de preços formado por observações reais", "Lucro calculado com todas as despesas"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex size-5 items-center justify-center rounded-full bg-brand text-black"><Check size={12} strokeWidth={3} /></span>{t}</li>
            ))}
          </ul>
          <div className="relative mt-12">
            <div className="glass rounded-2xl p-5"><VisualChart id="auth" /></div>
            <div className="glass animate-float absolute -bottom-10 -right-6 flex items-center gap-3 rounded-2xl p-3.5 pr-5">
              <ScoreRing value={82} size={58} />
              <div><div className="text-sm font-semibold">Worthwise Score</div><div className="text-xs text-muted">confiança moderada</div></div>
            </div>
          </div>
          <div className="mt-20 flex gap-6 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Database size={13} className="text-brand" />APIs oficiais</span>
            <span className="flex items-center gap-1.5"><BadgeCheck size={13} className="text-brand" />CNPJ verificado</span>
            <span className="flex items-center gap-1.5"><LineChart size={13} className="text-brand" />Histórico real</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
