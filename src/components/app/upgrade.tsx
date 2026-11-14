"use client";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/hooks";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ openUpgrade: (reason?: string) => void; subscribe: (plan: string) => Promise<void>; busy: string | null } | null>(null);

export function useUpgrade() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUpgrade fora do UpgradeProvider");
  return c;
}

/** Modal de upgrade + início do checkout. O plano só muda quando o pagamento é confirmado por webhook. */
export function UpgradeProvider({ children, plans, currentPlan }: { children: ReactNode; plans: PlanInfo[]; currentPlan: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const paid = (plans.length ? plans : DEFAULT_PLANS).filter((p) => p.price_cents > 0);

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
          <div className="grid gap-4 sm:grid-cols-2">
            {paid.map((p) => (
              <div key={p.id} className={cn("flex flex-col rounded-2xl border p-5", p.id === "pro" ? "border-brand/50 bg-brand/6" : "border-line-strong bg-white/3")}>
                <div className="flex items-center gap-2 text-base font-semibold">{p.id === "pro" ? <Sparkles size={16} className="text-brand" /> : null}{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1"><span className="text-xs text-muted">R$</span>
                  <span className="tabular text-3xl font-semibold tracking-tight">{(p.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span><span className="text-xs text-muted">/mês</span></div>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-[#d0d0d0]">{p.features.slice(0, 5).map((f) => <li key={f} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand" />{f}</li>)}</ul>
                <button className={cn("btn mt-5", p.id === "pro" ? "btn-primary" : "btn-secondary")} disabled={Boolean(busy) || currentPlan === p.id} onClick={() => subscribe(p.id)}>
                  {busy === p.id ? <Loader2 size={16} className="animate-spin" /> : null}{currentPlan === p.id ? "Seu plano atual" : `Assinar ${p.name}`}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-faint">Cobrança mensal recorrente. Cancele quando quiser em Planos e configurações; o acesso continua até o fim do período pago. Não há cobrança sem a sua confirmação no checkout.</p>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
