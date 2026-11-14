"use client";
import { CreditCard, Loader2, ShieldAlert, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUpgrade } from "@/components/app/upgrade";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { Usage } from "@/lib/auth";
import { api } from "@/lib/hooks";
import { PERIOD_LABELS, RESOURCE_LABELS } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate, formatMoney } from "@/lib/utils";

interface Sub { plan_id: string; status: string; current_period_end: string; cancel_at_period_end: boolean; payment_method: string | null }
interface Pay { id: string; amount_cents: number | null; status: string; method: string | null; occurred_at: string | null; created_at: string; refused_message: string | null }

const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativa", cls: "badge-pos" }, past_due: { label: "Pagamento pendente", cls: "badge-neg" },
  canceled: { label: "Cancelada", cls: "" }, expired: { label: "Expirada", cls: "" },
};
const PAY_STATUS: Record<string, string> = { paid: "Pago", refused: "Recusado", refunded: "Estornado", chargeback: "Contestado", pending: "Pendente" };
const METHOD: Record<string, string> = { pix: "Pix", credit_card: "Cartão", bank_slip: "Boleto", boleto: "Boleto" };
const PLAN_NAMES: Record<string, string> = { free: "Grátis", pro: "Pro", business: "Business" };

function Card({ icon: Icon, title, children }: { icon: typeof UserRound; title: string; children: React.ReactNode }) {
  return <section className="card p-6"><h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold"><Icon size={17} className="text-brand" />{title}</h2>{children}</section>;
}

export function Settings({ email, emailVerified, usage, profile, subscription, payments, billingReady, requireCard }: {
  email: string; emailVerified: boolean; usage: Usage; profile: { full_name: string }; subscription: Sub | null; payments: Pay[]; billingReady: boolean; requireCard: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { openUpgrade, subscribe, busy } = useUpgrade();
  const [name, setName] = useState(profile.full_name);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const auto = useRef(false);
  const live = subscription && subscription.status !== "expired" && new Date(subscription.current_period_end) > new Date();

  // Vindo da página de preços (/cadastro?plano=pro): abre o checkout do plano escolhido.
  useEffect(() => {
    const plan = params.get("assinar");
    if (auto.current || !plan || !["pro", "business"].includes(plan) || usage.plan !== "free") return;
    auto.current = true;
    openUpgrade(`Assinar o plano ${PLAN_NAMES[plan]}`);
  }, [params, usage.plan, openUpgrade]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ full_name: name.trim().slice(0, 80) || null }).eq("id", auth.user?.id ?? "");
    setSaving(false);
    toast(error ? "Não foi possível salvar." : "Perfil atualizado", error ? "error" : "success");
    if (!error) router.refresh();
  }
  async function cancel() {
    setWorking(true);
    const r = await api<{ accessUntil: string }>("/api/billing/cancel", { method: "POST" });
    setWorking(false);
    if (!r.ok) { toast(r.error.message, "error"); return; }
    setCancelOpen(false);
    toast(`Assinatura cancelada. Acesso até ${formatDate(r.data.accessUntil)}.`);
    router.refresh();
  }
  async function deleteAccount() {
    setWorking(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setWorking(false);
      toast(error.message.includes("active_subscription") ? "Cancele sua assinatura antes de excluir a conta." : "Não foi possível excluir a conta.", "error");
      return;
    }
    await supabase.auth.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional: limpa todo o estado após excluir a conta
    window.location.href = "/";
  }

  return (
    <>
      <PageHeader title="Planos e configurações" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card icon={CreditCard} title="Assinatura">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-2xl font-semibold tracking-tight">Plano {PLAN_NAMES[usage.plan] ?? usage.plan}</div>
              {live ? <p className="mt-1 text-sm text-muted">{subscription!.cancel_at_period_end || subscription!.status === "canceled" ? `Cancelada — acesso até ${formatDate(subscription!.current_period_end)}` : `Próxima renovação prevista para ${formatDate(subscription!.current_period_end)}`}
                {subscription!.payment_method ? ` · ${METHOD[subscription!.payment_method] ?? subscription!.payment_method}` : ""}</p>
                : <p className="mt-1 text-sm text-muted">Três pesquisas gratuitas no total{requireCard ? "" : ", sem cartão"}.</p>}</div>
            {live ? <span className={cn("badge", SUB_STATUS[subscription!.status]?.cls)}>{SUB_STATUS[subscription!.status]?.label ?? subscription!.status}</span> : null}
          </div>
          {subscription?.status === "past_due" ? <p className="mt-4 rounded-xl border border-neg/30 bg-neg/8 px-3.5 py-3 text-sm text-[#ffb3b1]">A última cobrança foi recusada. A HeroPay tentará novamente; você pode atualizar o meio de pagamento pelo link enviado ao seu e-mail.</p> : null}
          <ul className="mt-5 space-y-3">
            {usage.quotas.map((q) => {
              const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : q.used > 0 ? 100 : 0;
              return (
                <li key={q.resource}><div className="flex justify-between text-sm"><span className="text-muted">{RESOURCE_LABELS[q.resource] ?? q.resource}</span>
                  <span className="tabular">{q.used} / {q.limit} <span className="text-faint">{PERIOD_LABELS[q.period]}</span></span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-neg" : "bg-brand")} style={{ width: `${pct}%` }} /></div></li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            {usage.plan === "free" || !live ? (<>
              <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => subscribe("pro")}>{busy === "pro" ? <Loader2 size={15} className="animate-spin" /> : null}Assinar Pro</button>
              <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => subscribe("business")}>{busy === "business" ? <Loader2 size={15} className="animate-spin" /> : null}Assinar Business</button>
            </>) : subscription!.status === "active" || subscription!.status === "past_due" ? <button className="btn btn-danger" onClick={() => setCancelOpen(true)}>Cancelar assinatura</button>
              : <button className="btn btn-primary" onClick={() => openUpgrade("Reative sua assinatura")}>Assinar novamente</button>}
          </div>
          {!billingReady ? <p className="mt-3 text-xs text-faint">O pagamento ainda não está habilitado neste ambiente.</p> : null}
          <p className="mt-3 text-xs leading-relaxed text-faint">Troca de plano: a HeroPay não oferece mudança com cobrança proporcional. Para trocar, cancele o plano atual (o acesso segue até o fim do período pago) e assine o novo.</p>
        </Card>

        <Card icon={UserRound} title="Perfil">
          <form onSubmit={saveProfile} className="space-y-4">
            <label className="block"><span className="label">Nome</span><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block"><span className="label">E-mail</span><input className="input" value={email} disabled readOnly />
              <span className="mt-1 block text-xs text-faint">{emailVerified ? "E-mail verificado" : "E-mail ainda não verificado"}</span></label>
            <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null}Salvar</button>
              <a className="btn btn-secondary" href="/app/boas-vindas">Refazer preferências</a></div>
          </form>
        </Card>

        <Card icon={CreditCard} title="Histórico de pagamentos">
          {payments.length ? (
            <div className="-mx-2 overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs text-faint"><th className="px-2 py-2 font-normal">Data</th><th className="px-2 py-2 font-normal">Valor</th><th className="px-2 py-2 font-normal">Meio</th><th className="px-2 py-2 font-normal">Situação</th></tr></thead>
              <tbody className="divide-y divide-line">{payments.map((p) => (
                <tr key={p.id}><td className="px-2 py-2.5 text-muted">{formatDate(p.occurred_at ?? p.created_at)}</td><td className="tabular px-2 py-2.5">{p.amount_cents != null ? formatMoney(p.amount_cents / 100) : "—"}</td>
                  <td className="px-2 py-2.5 text-muted">{METHOD[p.method ?? ""] ?? "—"}</td>
                  <td className="px-2 py-2.5"><span className={cn("badge", p.status === "paid" ? "badge-pos" : p.status === "pending" ? "" : "badge-neg")} title={p.refused_message ?? undefined}>{PAY_STATUS[p.status] ?? p.status}</span></td></tr>
              ))}</tbody></table></div>
          ) : <p className="text-sm text-muted">Nenhum pagamento registrado.</p>}
        </Card>

        <Card icon={ShieldAlert} title="Privacidade e conta">
          <p className="text-sm leading-relaxed text-muted">Seus favoritos, simulações, cotações e conversas são privados. Para prevenir abuso do teste gratuito guardamos um identificador derivado do IP do cadastro por até 90 dias. Detalhes na <a className="text-brand-hi underline underline-offset-2" href="/privacidade">Política de privacidade</a>.</p>
          <button className="btn btn-danger mt-5" onClick={() => setDeleteOpen(true)}>Excluir minha conta</button>
        </Card>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent title="Cancelar assinatura?" description={live ? `Não haverá novas cobranças. Você mantém o plano ${PLAN_NAMES[usage.plan]} até ${formatDate(subscription!.current_period_end)}; depois a conta volta ao plano grátis. O cancelamento é definitivo: para voltar, será preciso assinar de novo.` : undefined}>
          <div className="flex gap-2"><button className="btn btn-secondary flex-1" onClick={() => setCancelOpen(false)}>Manter assinatura</button>
            <button className="btn btn-danger flex-1" disabled={working} onClick={cancel}>{working ? <Loader2 size={15} className="animate-spin" /> : null}Confirmar cancelamento</button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Excluir conta" description="Todos os seus dados (pesquisas, favoritos, simulações, cotações, conversas e relatórios) serão apagados de forma permanente. Esta ação não pode ser desfeita.">
          <label className="block"><span className="label">Digite EXCLUIR para confirmar</span><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></label>
          <button className="btn btn-danger mt-4 w-full" disabled={confirmText !== "EXCLUIR" || working} onClick={deleteAccount}>{working ? <Loader2 size={15} className="animate-spin" /> : null}Excluir definitivamente</button>
        </DialogContent>
      </Dialog>
    </>
  );
}
