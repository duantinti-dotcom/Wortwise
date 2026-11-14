"use client";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon", "TikTok Shop", "Loja própria"];
const CATEGORIES = ["Eletrônicos", "Casa e decoração", "Moda", "Beleza", "Esportes", "Pet", "Brinquedos", "Ferramentas", "Papelaria", "Automotivo"];
const BUDGETS = ["Até R$ 500", "R$ 500 a R$ 2.000", "R$ 2.000 a R$ 10.000", "Acima de R$ 10.000"];

function Chips({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (o: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} type="button" aria-pressed={on} onClick={() => onToggle(o)}
          className={cn("flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm transition-all duration-150 active:scale-[0.97]", on ? "border-brand bg-brand/12 text-fg" : "border-line-strong text-muted hover:border-tint/25 hover:text-fg")}>
          {on ? <Check size={14} className="text-brand" /> : null}{o}</button>;
      })}
    </div>
  );
}

export function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState<"starting" | "selling" | null>(null);
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (o: string) => set((v) => (v.includes(o) ? v.filter((x) => x !== o) : [...v, o]));

  async function finish(skip: boolean) {
    setBusy(true);
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update(skip ? { onboarded_at: new Date().toISOString() }
      : { seller_stage: stage, marketplaces, categories, budget_range: budget, onboarded_at: new Date().toISOString() }).eq("id", auth.user?.id ?? "");
    if (error) { setBusy(false); toast("Não foi possível salvar suas preferências. Você pode ajustá-las depois.", "error"); }
    router.replace("/app");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-[28px] font-semibold tracking-tight">Vamos personalizar seu painel</h1>
      <p className="mt-2 text-muted">Quatro perguntas rápidas e opcionais. Leva menos de um minuto.</p>
      <div className="mt-8 space-y-8">
        <fieldset><legend className="mb-3 text-sm font-medium">Você já vende ou está começando?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["starting", "Estou começando", "Quero descobrir o que vender"], ["selling", "Já vendo", "Quero ampliar e melhorar a margem"]] as const).map(([id, t, d]) => (
              <button key={id} type="button" aria-pressed={stage === id} onClick={() => setStage(id)}
                className={cn("rounded-xl border p-4 text-left transition-all duration-150 active:scale-[0.98]", stage === id ? "border-brand bg-brand/10" : "border-line-strong hover:border-tint/25")}>
                <span className="block text-sm font-medium">{t}</span><span className="mt-0.5 block text-sm text-muted">{d}</span></button>
            ))}
          </div></fieldset>
        <fieldset><legend className="mb-3 text-sm font-medium">Em quais canais você quer atuar?</legend><Chips options={MARKETPLACES} value={marketplaces} onToggle={toggle(setMarketplaces)} /></fieldset>
        <fieldset><legend className="mb-3 text-sm font-medium">Quais categorias mais interessam?</legend><Chips options={CATEGORIES} value={categories} onToggle={toggle(setCategories)} /></fieldset>
        <fieldset><legend className="mb-3 text-sm font-medium">Qual faixa de investimento pretende usar?</legend><Chips options={BUDGETS} value={budget ? [budget] : []} onToggle={(o) => setBudget((b) => (b === o ? null : o))} /></fieldset>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => finish(false)}>{busy ? <Loader2 size={17} className="animate-spin" /> : null}Concluir <ArrowRight className="btn-arrow" size={17} /></button>
        <button className="btn btn-ghost btn-lg" disabled={busy} onClick={() => finish(true)}>Pular por enquanto</button>
      </div>
    </div>
  );
}
