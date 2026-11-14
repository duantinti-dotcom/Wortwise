import { BarChart3, Calculator, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SparkPath } from "@/components/marketing/visuals";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-7 sm:px-10">
        <Link href="/" aria-label="Worthwise — página inicial" className="w-fit"><Logo /></Link>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</main>
        <p className="text-xs text-faint">© {new Date().getFullYear()} Worthwise</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16" aria-hidden="true">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_80%_10%,rgba(255,121,0,0.13),transparent_70%)]" />
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Decida o que vender com evidências, não com palpites.</p>
          <ul className="mt-10 space-y-5 text-[15px] text-muted">
            {[[ShieldCheck, "Dados com fonte e data de coleta — nada inventado."], [BarChart3, "Histórico de preços formado por observações reais."], [Calculator, "Lucro calculado com todas as despesas na conta."]].map(([Icon, text]) => {
              const I = Icon as typeof ShieldCheck;
              return <li key={text as string} className="flex items-center gap-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand-hi"><I size={17} /></span>{text as string}</li>;
            })}
          </ul>
          <div className="card mt-12 p-5"><SparkPath className="h-24" /></div>
        </div>
      </aside>
    </div>
  );
}
