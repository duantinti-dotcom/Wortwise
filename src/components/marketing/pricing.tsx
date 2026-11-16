"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spot } from "@/components/ui/spot";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const [int, dec] = [(c: number) => Math.floor(c / 100).toLocaleString("pt-BR"), (c: number) => String(c % 100).padStart(2, "0")];

/** Planos: renderiza os valores padrão e atualiza com os preços vigentes do banco (editáveis no admin). */
export function Pricing({ initial }: { initial?: PlanInfo[] }) {
  const [plans, setPlans] = useState<PlanInfo[]>(initial ?? DEFAULT_PLANS);
  const featuredRef = useRef<HTMLDivElement>(null);
  // No celular, o carrossel abre centralizado no plano mais escolhido (sem rolar a página).
  useEffect(() => {
    const el = featuredRef.current, row = el?.parentElement?.parentElement;
    if (!el || !row || !window.matchMedia("(max-width: 1023.98px)").matches) return;
    const item = el.parentElement!;
    row.scrollLeft = item.offsetLeft - (row.clientWidth - item.clientWidth) / 2;
  }, []);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    supabaseBrowser().from("plans").select("id, name, description, price_cents, features, sort_order").eq("active", true).gt("price_cents", 0).order("sort_order")
      .then(({ data }: { data: PlanInfo[] | null }) => { if (alive && data?.length) setPlans(data); });
    return () => { alive = false; };
  }, [initial]);

  return (
    <Stagger className="snap-row-lg items-stretch lg:grid lg:grid-cols-3 lg:gap-5">
      {plans.map((p) => {
        const featured = p.id === (plans.some((x) => x.id === "inicial") ? "inicial" : "pro");
        return (
          <StaggerItem key={p.id} className="flex">
          <Spot ref={featured ? featuredRef : undefined} className={cn("card relative flex flex-1 flex-col !overflow-visible p-7 md:p-8", featured && "mt-4 !border-[#3B82F6] lg:mt-0")}>
                        {featured ? <span className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white shadow-[0_0_0_4px_var(--bg)]">{p.id === "inicial" ? "Comece aqui" : "Mais escolhido"}</span> : null}
            <h3 className="text-center text-xl font-semibold tracking-tight">{p.name}</h3>
            <p className="mt-2 text-center text-sm text-muted">{p.description}</p>
            <div className="mt-8 flex items-end justify-center gap-2">
              <div className="flex items-start">
                <span className="mr-1 mt-1.5 text-base text-muted">R$</span>
                <span className="tabular text-[52px] font-semibold leading-none tracking-[-0.04em]">{int(p.price_cents)}</span>
                <span className="tabular mt-1 text-2xl font-semibold tracking-tight">,{dec(p.price_cents)}</span>
              </div>
              <span className="pb-1.5 text-sm text-muted">{p.id === "inicial" ? "no 1º mês" : "por mês"}</span>
            </div>
            <Link href={p.price_cents > 0 ? `/cadastro?plano=${p.id}` : "/cadastro"} className={cn("btn btn-lg mt-8 w-full", featured ? "btn-primary" : "btn-secondary")}>
              {p.id === "inicial" ? `Começar por R$ ${int(p.price_cents)},${dec(p.price_cents)}` : `Assinar ${p.name}`} <ArrowRight className="btn-arrow" size={16} />
            </Link>
            <div className="hairline my-8" />
            <ul className="space-y-3.5 text-[14.5px]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-3 text-soft"><span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", featured ? "bg-[#2563EB] text-white" : "bg-tint/10 text-fg")}><Check size={12} strokeWidth={3} /></span>{f}</li>
              ))}
            </ul>
          </Spot>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
