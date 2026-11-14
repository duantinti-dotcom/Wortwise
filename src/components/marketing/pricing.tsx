"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Spot } from "@/components/ui/spot";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const [int, dec] = [(c: number) => Math.floor(c / 100).toLocaleString("pt-BR"), (c: number) => String(c % 100).padStart(2, "0")];

/** Planos: renderiza os valores padrão e atualiza com os preços vigentes do banco (editáveis no admin). */
export function Pricing({ initial }: { initial?: PlanInfo[] }) {
  const [plans, setPlans] = useState<PlanInfo[]>(initial ?? DEFAULT_PLANS);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    supabaseBrowser().from("plans").select("id, name, description, price_cents, features, sort_order").eq("active", true).order("sort_order")
      .then(({ data }: { data: PlanInfo[] | null }) => { if (alive && data?.length) setPlans(data); });
    return () => { alive = false; };
  }, [initial]);

  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-3">
      {plans.map((p) => {
        const featured = p.id === "pro";
        return (
          <Spot key={p.id} className={cn("lg card-hover relative flex flex-col rounded-[32px] p-8", featured && "edge-brand lg:-my-4 lg:py-12")}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
              {featured ? <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-black">Mais escolhido</span> : null}
            </div>
            <p className="mt-2 text-sm text-muted">{p.description}</p>
            <div className="mt-8 flex items-end gap-2">
              <div className="flex items-start">
                <span className="mr-1 mt-1.5 text-base text-muted">R$</span>
                <span className="tabular text-6xl font-semibold leading-none tracking-[-0.05em]">{int(p.price_cents)}</span>
                <span className="tabular mt-1 text-2xl font-semibold tracking-tight">,{dec(p.price_cents)}</span>
              </div>
              <span className="pb-1.5 text-sm text-muted">{p.price_cents > 0 ? "por mês" : "para sempre"}</span>
            </div>
            <Link href={p.price_cents > 0 ? `/cadastro?plano=${p.id}` : "/cadastro"} className={cn("btn btn-lg mt-8 w-full", featured ? "btn-primary" : "btn-secondary")}>
              {p.price_cents > 0 ? `Assinar ${p.name}` : "Começar grátis"} <ArrowRight size={16} />
            </Link>
            <div className="hairline my-8" />
            <ul className="space-y-3.5 text-[14.5px]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-3 text-[#d6d6d6]"><span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", featured ? "bg-brand text-black" : "bg-white/10 text-fg")}><Check size={12} strokeWidth={3} /></span>{f}</li>
              ))}
            </ul>
          </Spot>
        );
      })}
    </div>
  );
}
