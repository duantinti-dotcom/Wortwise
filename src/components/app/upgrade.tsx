"use client";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/hooks";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Planos que podem ser comprados agora (o primeiro mês só aparece para quem ainda pode usá-lo). */
export function visiblePlans(plans: PlanInfo[], introEligible: boolean) {
  return (plans.length ? plans : DEFAULT_PLANS).filter((p) => p.price_cents > 0 && (p.id !== "inicial" || introEligible));
}

export const priceUnit = (id: string) => (id === "inicial" ? "no 1º mês" : "/mês");

/** Cartões de plano com botão de assinar (usados no aviso de upgrade e na tela de assinatura). */
export function PlanCards({ plans, currentPlan, busy, onPick }: { plans: PlanInfo[]; currentPlan: string; busy: string | null; onPick: (id: string) => void }) {
  const highlight = plans.some((p) => p.id === "inicial") ? "inicial" : "pro";
  return (
    <div className={cn("grid gap-4", plans.length >= 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
      {plans.map((p) => {
        const hi = p.id === highlight;
        return (
          <div key={p.id} className={cn("relative flex flex-col rounded-2xl border p-5", hi ? "border-[#3B82F6]/60 bg-[#3B82F6]/[0.07]" : "border-line-strong bg-tint/3")}>
            {hi ? <span className="absolute -top-2.5 left-5 rounded-full bg-[#2563EB] px-2.5 py-0.5 text-[11px] font-semibold text-white">{p.id === "inicial" ? "Comece aqui" : "Mais escolhido"}</span> : null}
            <div className="flex items-center gap-2 text-base font-semibold">{hi ? <Sparkles size={16} className="text-brand" /> : null}{p.name}</div>
            <p className="mt-1 text-[13px] text-muted">{p.description}</p>
            <div className="mt-3 flex items-baseline gap-1"><span className="text-xs text-muted">R$</span>
              <span className="tabular text-3xl font-semibold tracking-tight">{(p.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span><span className="text-xs text-muted">{priceUnit(p.id)}</span></div>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-soft">{p.features.slice(0, 7).map((f) => <li key={f} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand" />{f}</li>)}</ul>
            <button className={cn("btn mt-5", hi ? "btn-primary" : "btn-secondary")} disabled={Boolean(busy) || currentPlan === p.id} onClick={() => onPick(p.id)}>
              {busy === p.id ? <Loader2 size={16} className="animate-spin" /> : null}
              {currentPlan === p.id ? "Seu plano atual" : p.id === "inicial" ? `Começar por R$ ${(p.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `Assinar ${p.name}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const Ctx = createContext<{ openUpgrade: (reason?: string) => void; subscribe: (plan: string) => Promise<void>; busy: string | null } | null>(null);

export function useUpgrade() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUpgrade fora do UpgradeProvider");
  return c;
}

/** Modal de upgrade + início do checkout. O plano só muda quando o pagamento é confirmado por webhook. */
export function UpgradeProvider({ children, plans, currentPlan, introEligible = false }: { children: ReactNode; plans: PlanInfo[]; currentPlan: string; introEligible?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const paid = visiblePlans(plans, introEligible);

  const subscribe = useCallback(async (plan: string) => {
    setBusy(plan);
    const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: { plan } });
    if (r.ok) { window.location.href = r.data.url; return; }
    setBusy(null);
    toast(r.error.message, "error");
  }, [toast]);

  const openUpgrade = useCallback((why?: string) => { setReason(why); setOpen(true); }, []);
  const value = useMemo(() => ({ openUpgrade, subscribe, busy }), [openUpgrade, subscribe, busy]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title={reason ?? "Continue analisando com um plano Worthwise"}
          description="Você será levado ao checkout seguro da HeroPay (Pix, cartão ou boleto). O plano é liberado assim que o pagamento for confirmado.">
          <PlanCards plans={paid} currentPlan={currentPlan} busy={busy} onPick={subscribe} />
          <p className="mt-4 text-xs leading-relaxed text-faint">Primeiro mês: pagamento único, sem renovação. Essencial e Profissional: cobrança mensal, cancele quando quiser em Planos e configurações (o acesso continua até o fim do período pago). Nada é cobrado sem a sua confirmação no checkout.</p>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
