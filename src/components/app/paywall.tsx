"use client";
import { BarChart3, Calculator, Flame, MessagesSquare, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { PlanInfo } from "@/lib/plans";
import { PlanCards, useUpgrade, visiblePlans } from "./upgrade";

/** Páginas abertas mesmo sem plano (conta e assinatura). */
const OPEN = ["/app/configuracoes"];

const PERKS = [
  { icon: Flame, title: "Mais vendidos de cada loja", text: "Top 10 por tópico no Mercado Livre, Shopee, Amazon e TikTok Shop, com foto, preço, vendidos e link." },
  { icon: BarChart3, title: "Histórico de preço", text: "Veja se o preço de cada produto está subindo ou caindo." },
  { icon: Calculator, title: "Lucro e preço recomendado", text: "Saiba quanto sobra em cada venda, já com as taxas de cada loja." },
  { icon: MessagesSquare, title: "Wise, sua assistente", text: "Pergunte o que vender, por quanto e onde. Ela usa os dados reais do site." },
];

/** Sem assinatura ativa, o app mostra os planos no lugar do conteúdo. */
export function Paywall({ plan, plans, introEligible, children }: { plan: string; plans: PlanInfo[]; introEligible: boolean; children: ReactNode }) {
  const path = usePathname();
  const { subscribe, busy } = useUpgrade();
  if (plan !== "free" || OPEN.some((p) => path?.startsWith(p))) return <>{children}</>;
  const options = visiblePlans(plans, introEligible);
  return (
    <div className="py-4">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[34px]">Escolha seu plano para começar</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
          {introEligible ? "Comece com o primeiro mês por R$ 9,90 e tenha acesso a tudo do Essencial por 30 dias." : "Assine para ter acesso a todas as ferramentas do Worthwise."}
        </p>
      </div>
      <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="card flex gap-3.5 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6]/12 text-brand-hi"><Icon size={19} /></span>
            <span><span className="block text-[14.5px] font-semibold">{title}</span><span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted">{text}</span></span>
          </li>
        ))}
      </ul>
      <div className="mx-auto mt-10 max-w-5xl"><PlanCards plans={options} currentPlan={plan} busy={busy} onPick={subscribe} /></div>
      <p className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 text-center text-[12.5px] leading-relaxed text-faint">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />Pagamento pelo checkout seguro da HeroPay (Pix, cartão ou boleto). O acesso é liberado assim que o pagamento é confirmado.
        {introEligible ? " O primeiro mês por R$ 9,90 vale uma vez por pessoa, aparelho e internet." : ""}
      </p>
    </div>
  );
}
