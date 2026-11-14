"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/hooks";
import { formatMoney } from "@/lib/utils";

interface Plan { id: string; name: string; price_cents: number; provider_link_id: string | null; provider_checkout_url: string | null }

export function HeroPayActions({ ready, plans }: { ready: boolean; plans: Plan[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hooks, setHooks] = useState<{ trigger: string; ok: boolean; error?: string }[] | null>(null);
  const router = useRouter();
  const toast = useToast();
  async function run(key: string, body: object) {
    setBusy(key);
    const r = await api<{ url?: string; results?: { trigger: string; ok: boolean; error?: string }[] }>("/api/admin/heropay", { method: "POST", json: body });
    setBusy(null);
    if (!r.ok) { toast(r.error.message, "error"); return; }
    if (r.data.results) setHooks(r.data.results);
    toast(r.data.url ? "Link de assinatura criado" : "Cadastro de webhooks concluído");
    router.refresh();
  }
  return (
    <div className="card divide-y divide-line">
      {plans.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
          <div className="min-w-0"><div className="font-medium">{p.name} · {formatMoney(p.price_cents / 100)}/mês</div>
            <div className="truncate text-xs text-faint">{p.provider_checkout_url ?? "Sem link de checkout: os usuários ainda não conseguem assinar este plano."}</div></div>
          <button className="btn btn-secondary btn-sm" disabled={!ready || Boolean(busy)} onClick={() => {
            if (p.provider_checkout_url && !window.confirm("Já existe um link. Criar outro substitui o link usado nos novos checkouts (assinaturas existentes não mudam). Continuar?")) return;
            void run(p.id, { action: "create_link", plan: p.id });
          }}>{busy === p.id ? <Loader2 size={14} className="animate-spin" /> : null}{p.provider_checkout_url ? "Recriar link" : "Criar link na HeroPay"}</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
        <div><div className="font-medium">Webhooks</div><div className="text-xs text-faint">Cadastra os 7 gatilhos tratados apontando para /api/webhooks/heropay neste domínio. Execute uma vez por ambiente.</div></div>
        <button className="btn btn-secondary btn-sm" disabled={!ready || Boolean(busy)} onClick={() => run("hooks", { action: "register_webhooks" })}>{busy === "hooks" ? <Loader2 size={14} className="animate-spin" /> : null}Cadastrar webhooks</button>
      </div>
      {hooks ? <ul className="px-5 py-4 text-xs">{hooks.map((h) => <li key={h.trigger} className={h.ok ? "text-pos" : "text-danger"}>{h.trigger}: {h.ok ? "cadastrado" : h.error}</li>)}</ul> : null}
      {!ready ? <p className="px-5 py-4 text-xs text-faint">Configure HEROPAY_JWT_TOKEN para habilitar estas ações. Ao alterar o preço de um plano, recrie o link: o valor cobrado é o do link.</p> : null}
    </div>
  );
}
