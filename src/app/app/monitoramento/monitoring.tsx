"use client";
import { Bell, BellOff, CheckCheck, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useUpgrade } from "@/components/app/upgrade";
import { dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime, SOURCE_LABELS } from "@/lib/utils";

interface Watch { id: string; source: string; external_id: string; title: string; rule_type: string; threshold: number | null; active: boolean; last_price: number | null; last_currency: string | null; last_checked_at: string | null; last_error: string | null }
interface Alert { id: string; title: string; message: string; created_at: string; read_at: string | null; data: { previous?: number; current?: number; source?: string; external_id?: string } }

const rule = (w: Watch) => w.rule_type === "price_below" ? `Avisar abaixo de ${formatMoney(w.threshold)}` : w.rule_type === "price_drop_pct" ? `Avisar se cair ${w.threshold}% ou mais` : "Avisar em qualquer mudança de preço";

export function Monitoring() {
  const toast = useToast();
  const router = useRouter();
  const { openUpgrade } = useUpgrade();
  const d = useLoad(async () => {
    const supabase = supabaseBrowser();
    const [w, a] = await Promise.all([
      supabase.from("watches").select("id, source, external_id, title, rule_type, threshold, active, last_price, last_currency, last_checked_at, last_error").order("created_at", { ascending: false }),
      supabase.from("alerts").select("id, title, message, created_at, read_at, data").order("created_at", { ascending: false }).limit(50),
    ]);
    if (w.error || a.error) throw new Error("Não foi possível carregar o monitoramento.");
    return { watches: (w.data ?? []) as Watch[], alerts: (a.data ?? []) as Alert[] };
  });

  async function toggle(w: Watch) {
    const { error } = await supabaseBrowser().from("watches").update({ active: !w.active }).eq("id", w.id);
    if (error?.message.includes("quota_exceeded")) { openUpgrade("Você atingiu o limite de produtos monitorados do seu plano"); return; }
    toast(error ? dbMessage(error) : w.active ? "Monitoramento pausado" : "Monitoramento reativado", error ? "error" : "success");
    if (!error) d.reload();
  }
  async function remove(w: Watch) {
    const { error } = await supabaseBrowser().from("watches").delete().eq("id", w.id);
    toast(error ? "Não foi possível excluir." : "Monitoramento excluído", error ? "error" : "success");
    if (!error) d.reload();
  }
  async function markAll() {
    const { error } = await supabaseBrowser().from("alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (!error) { d.reload(); router.refresh(); }
  }

  const unread = (d.data?.alerts ?? []).filter((a) => !a.read_at).length;
  return (
    <>
      <PageHeader title="Monitoramento" description="Worthwise Watch: o sistema consulta as fontes periodicamente, registra observações reais de preço e cria alertas quando suas regras são atendidas." />
      {d.loading ? <Skeleton className="h-64 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Produtos monitorados ({d.data!.watches.length})</h2>
            {d.data!.watches.length ? (
              <ul className="card divide-y divide-line">
                {d.data!.watches.map((w) => (
                  <li key={w.id} className={cn("flex flex-wrap items-center gap-3 p-4", !w.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/produto/${w.source}/${w.external_id}`} className="block truncate text-sm font-medium hover:text-brand-hi">{w.title}</Link>
                      <div className="mt-1 text-xs text-muted">{rule(w)} · {SOURCE_LABELS[w.source] ?? w.source}</div>
                      <div className="mt-1 text-xs text-faint">{w.last_error ? <span className="text-[#ffb3b1]">Última verificação falhou: {w.last_error}</span> : w.last_checked_at ? `Verificado ${relativeTime(w.last_checked_at)}` : "Aguardando a primeira verificação"}</div>
                    </div>
                    <span className="tabular text-sm font-semibold">{formatMoney(w.last_price, w.last_currency ?? "BRL")}</span>
                    <button onClick={() => toggle(w)} className="btn btn-secondary btn-sm" aria-pressed={w.active}>{w.active ? <><BellOff size={14} /> Pausar</> : <><Bell size={14} /> Reativar</>}</button>
                    <button onClick={() => remove(w)} className="btn btn-ghost btn-sm !px-2" aria-label="Excluir monitoramento"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Bell} title="Nenhum produto monitorado" action={<Link href="/app/descobrir" className="btn btn-primary">Encontrar um produto</Link>}>Abra um produto e clique em “Monitorar preço” para definir uma regra, como “avise quando cair abaixo de R$ 40”.</EmptyState>}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Histórico de alertas{unread ? ` · ${unread} não lido${unread > 1 ? "s" : ""}` : ""}</h2>
              {unread ? <button onClick={markAll} className="btn btn-ghost btn-sm"><CheckCheck size={14} /> Marcar como lidos</button> : null}</div>
            {d.data!.alerts.length ? (
              <ul className="card divide-y divide-line">
                {d.data!.alerts.map((a) => {
                  const down = a.data.previous != null && a.data.current != null && a.data.current < a.data.previous;
                  return (
                    <li key={a.id} className="flex items-start gap-3 p-4">
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", down ? "bg-pos/12 text-pos" : "bg-brand/12 text-brand-hi")}>{down ? <TrendingDown size={15} /> : <TrendingUp size={15} />}</span>
                      <div className="min-w-0 flex-1"><div className={cn("text-sm", a.read_at ? "text-muted" : "font-medium")}>{a.title}</div><p className="mt-0.5 text-xs leading-relaxed text-muted">{a.message}</p>
                        <div className="mt-1 text-[11px] text-faint">{relativeTime(a.created_at)}</div></div>
                      {!a.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-label="Não lido" /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="card p-5 text-sm text-muted">Nenhum alerta até agora. Alertas só são criados a partir de mudanças realmente observadas.</p>}
          </section>
        </div>
      )}
    </>
  );
}
