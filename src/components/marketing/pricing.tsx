"use client";
import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const price = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

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
    <div className="grid gap-5 lg:grid-cols-3">
      {plans.map((p) => {
        const featured = p.id === "pro";
        return (
          <div key={p.id} className={cn("card relative flex flex-col p-7", featured && "!border-brand/50 bg-[linear-gradient(180deg,rgba(255,121,0,0.07),transparent_40%)]")}>
            {featured ? <span className="badge badge-brand absolute right-6 top-6">Mais escolhido para começar</span> : null}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1 text-sm text-muted">{p.description}</p>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-sm text-muted">R$</span>
              <span className="tabular text-5xl font-semibold tracking-[-0.04em]">{price(p.price_cents)}</span>
              {p.price_cents > 0 ? <span className="text-sm text-muted">/mês</span> : null}
            </div>
            <Link href={p.price_cents > 0 ? `/cadastro?plano=${p.id}` : "/cadastro"} className={cn("btn btn-lg mt-7", featured ? "btn-primary" : "btn-secondary")}>
              {p.price_cents > 0 ? `Assinar ${p.name}` : "Começar grátis"}
            </Link>
            <ul className="mt-7 space-y-3 text-sm">
              {p.features.map((f) => <li key={f} className="flex gap-2.5 text-[#d0d0d0]"><Check size={16} className="mt-0.5 shrink-0 text-brand" />{f}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
