import { ArrowRight, BarChart3, Bell, Bookmark, Calculator, Clock, MessagesSquare, Scale, Search, Store, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HotStrip } from "./hot-strip";
import { BorderBeam } from "@/components/ui/fx";
import { getUsage, quotaOf, requireUser } from "@/lib/auth";
import { PERIOD_LABELS, RESOURCE_LABELS } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

const TOOLS = [
  { href: "/app/descobrir", icon: Search, title: "Descobrir produtos", text: "Pesquise em fontes autorizadas" },
  { href: "/app/comparar", icon: Scale, title: "Comparar fornecedores", text: "Custo final por unidade" },
  { href: "/app/calculadora", icon: Calculator, title: "Calcular lucro", text: "Margem, equilíbrio e cenários" },
  { href: "/app/assistente", icon: MessagesSquare, title: "Perguntar ao assistente", text: "Análises com fontes" },
];

export default async function Dashboard() {
  const user = await requireUser();
  const supabase = await supabaseServer();
  const [usage, profile, searches, watches, alerts, favorites, quotes, sims] = await Promise.all([
    getUsage(),
    supabase.from("profiles").select("full_name, onboarded_at, categories, marketplaces").eq("id", user.id).maybeSingle(),
    supabase.from("searches").select("id, query, result_count, created_at").order("last_opened_at", { ascending: false }).limit(5),
    supabase.from("watches").select("id, title, source, external_id, last_price, last_currency, last_checked_at, rule_type, threshold, active").eq("active", true).order("created_at", { ascending: false }).limit(5),
    supabase.from("alerts").select("id, title, message, created_at, read_at, data").order("created_at", { ascending: false }).limit(5),
    supabase.from("favorites").select("source", { count: "exact", head: true }),
    supabase.from("supplier_quotes").select("comparison_name, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("simulations").select("id, name, results, created_at").order("created_at", { ascending: false }).limit(3),
  ]);
  const name = (profile.data?.full_name as string | null)?.split(" ")[0] ?? user.name?.split(" ")[0] ?? null;
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const isNew = !searches.data?.length && !watches.data?.length && !sims.data?.length && !quotes.data?.length;
  const comparisons = [...new Set((quotes.data ?? []).map((q) => q.comparison_name as string))].slice(0, 4);
  const interests = ((profile.data?.categories as string[] | null) ?? []).slice(0, 4);
  const shown = usage.quotas.filter((q) => ["search", "ai_message", "watch"].includes(q.resource));
  const searchQuota = quotaOf(usage, "search");

  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const ICONS: Record<string, typeof Search> = { search: Search, ai_message: MessagesSquare, watch: Bell };

  return (
    <div className="space-y-6">
      <section className="lg relative overflow-hidden rounded-[32px] p-6 md:p-10">
        <BorderBeam />
        <div aria-hidden className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_60%_80%_at_100%_0%,#000,transparent)]" />
        <div aria-hidden className="aurora -right-20 -top-24 h-72 w-72 bg-brand/25" />
        <div className="relative">
          <div className="text-sm text-muted first-letter:uppercase">{today}</div>
          <h1 className="display mt-2 text-[36px] md:text-[56px]">{greeting}{name ? <>, <span className="accent">{name}</span></> : ""}.</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">{isNew ? "Sua conta está pronta. Comece pesquisando um produto que você pensa em vender." : "O que vale a pena vender agora? Pesquise ou retome de onde parou."}</p>
          <form action="/app/descobrir" role="search" className="lg lg-refract mt-7 flex max-w-3xl flex-col gap-2 rounded-[22px] p-2 sm:flex-row">
            <label htmlFor="dash-q" className="sr-only">Pesquisar produto</label>
            <div className="relative flex-1">
              <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand" />
              <input id="dash-q" name="q" required minLength={2} maxLength={120} placeholder="Ex.: fone bluetooth para revender" className="h-[52px] w-full rounded-xl bg-transparent pl-12 pr-3 text-base outline-none placeholder:text-faint" />
            </div>
            <button className="btn btn-primary btn-lg !h-[52px] !px-6">Pesquisar <ArrowRight className="btn-arrow" size={17} /></button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            {searchQuota ? <span className="mr-1">{searchQuota.remaining} pesquisa{searchQuota.remaining === 1 ? "" : "s"} disponíve{searchQuota.remaining === 1 ? "l" : "is"} {PERIOD_LABELS[searchQuota.period]}</span> : null}
            {interests.map((c) => <Link key={c} href={`/app/descobrir?q=${encodeURIComponent(c)}`} className="badge hover:!border-tint/25 hover:!text-fg">{c}</Link>)}
          </div>
        </div>
      </section>

      <Suspense fallback={null}><HotStrip /></Suspense>

      <section aria-label="Acesso rápido" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card card-hover group flex flex-col items-start gap-3 !rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-gradient-to-b from-brand/20 to-brand/[0.03] text-brand-hi transition-transform duration-300 group-hover:scale-105"><t.icon size={19} /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold leading-snug">{t.title}</span><span className="mt-0.5 block text-xs leading-snug text-muted">{t.text}</span></span>
            <ArrowRight size={15} className="ml-auto hidden shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block" />
          </Link>
        ))}
      </section>

      <section aria-label="Uso do plano" className="grid gap-3 sm:grid-cols-3">
        {shown.map((q) => {
          const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : 0;
          const Icon = ICONS[q.resource] ?? Search;
          return (
            <div key={q.resource} className="card !rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted"><span className="flex items-center gap-2"><Icon size={14} className="text-faint" />{RESOURCE_LABELS[q.resource]}</span><span>{PERIOD_LABELS[q.period]}</span></div>
              <div className="tabular mt-3 text-[28px] font-semibold leading-none tracking-tight">{q.used}<span className="text-base font-normal text-faint"> / {q.limit}</span></div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-tint/[0.07]"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-neg" : "bg-gradient-to-r from-brand to-brand-hi")} style={{ width: `${Math.max(pct, 1.5)}%` }} /></div>
            </div>
          );
        })}
      </section>

      {isNew ? (
        <section className="card !rounded-3xl p-6 md:p-8">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Primeiros passos</h2><span className="text-xs text-muted">leva menos de 5 minutos</span></div>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {[["1", "Pesquise um produto", "Veja ofertas reais, com fonte e data da coleta.", "/app/descobrir", Search], ["2", "Simule o lucro", "Inclua comissão, frete, impostos e publicidade.", "/app/calculadora", Calculator], ["3", "Compare fornecedores", "Cadastre cotações e veja o custo final por unidade.", "/app/comparar", Scale]].map(([n, t, d, href, I]) => {
              const Icon = I as typeof Search;
              return (
                <li key={n as string}><Link href={href as string} className="group relative flex h-full flex-col rounded-2xl border border-tint/[0.07] bg-tint/[0.02] p-5 transition-all hover:border-tint/15 hover:bg-tint/[0.04]">
                  <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-tint/[0.06] text-brand-hi"><Icon size={18} /></span><span className="font-mono text-xs text-faint">0{n as string}</span></div>
                  <span className="mt-5 block font-semibold group-hover:text-brand-hi">{t as string}</span><span className="mt-1 block text-sm leading-relaxed text-muted">{d as string}</span></Link></li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Histórico de pesquisas" href="/app/descobrir" icon={Clock} empty="Nenhuma pesquisa ainda. Reabrir uma pesquisa já feita nunca consome crédito.">
          {(searches.data ?? []).map((s) => (
            <li key={s.id as string}><Link href={`/app/descobrir?s=${s.id}`} className="group flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tint/[0.05] text-faint"><Search size={14} /></span><span className="truncate group-hover:text-brand-hi">{s.query as string}</span></span>
              <span className="shrink-0 text-xs text-faint">{s.result_count as number} resultados · {relativeTime(s.created_at as string)}</span></Link></li>
          ))}
        </Panel>
        <Panel title="Alertas recentes" href="/app/monitoramento" icon={Bell} empty="Nenhum alerta. Monitore um produto para ser avisado de mudanças de preço.">
          {(alerts.data ?? []).map((a) => {
            const d = a.data as { previous?: number; current?: number } | null;
            const down = d?.previous != null && d.current != null && d.current < d.previous;
            return (
              <li key={a.id as string} className="flex items-start gap-3 py-3 text-sm">
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", down ? "bg-pos/12 text-pos" : "bg-brand/12 text-brand-hi")}>{down ? <TrendingDown size={14} /> : <TrendingUp size={14} />}</span>
                <span className="min-w-0"><span className={cn("block font-medium", a.read_at && "font-normal text-muted")}>{a.title as string}</span><span className="block truncate text-xs text-muted">{a.message as string}</span></span>
                <span className="ml-auto shrink-0 text-xs text-faint">{relativeTime(a.created_at as string)}</span>
              </li>
            );
          })}
        </Panel>
        <Panel title="Produtos monitorados" href="/app/monitoramento" icon={BarChart3} empty="Nenhum produto monitorado.">
          {(watches.data ?? []).map((w) => (
            <li key={w.id as string}><Link href={`/app/produto/${w.source}/${w.external_id}`} className="group flex items-center justify-between gap-3 py-3 text-sm">
              <span className="truncate group-hover:text-brand-hi">{w.title as string}</span>
              <span className="shrink-0 text-right"><span className="tabular block font-semibold text-fg">{formatMoney(w.last_price as number | null, (w.last_currency as string) ?? "BRL")}</span>
                <span className="text-xs text-faint">{w.last_checked_at ? `verificado ${relativeTime(w.last_checked_at as string)}` : "aguardando 1ª verificação"}</span></span></Link></li>
          ))}
        </Panel>
        <Panel title="Comparações e simulações salvas" href="/app/comparar" icon={Store} empty="Nenhuma comparação ou simulação salva.">
          {comparisons.map((c) => <li key={c}><Link href={`/app/comparar?c=${encodeURIComponent(c)}`} className="group flex items-center justify-between py-3 text-sm"><span className="truncate group-hover:text-brand-hi">{c}</span><span className="badge">comparação</span></Link></li>)}
          {(sims.data ?? []).map((s) => {
            const profit = (s.results as { profit?: number } | null)?.profit;
            return <li key={s.id as string}><Link href="/app/calculadora" className="group flex items-center justify-between gap-3 py-3 text-sm"><span className="truncate group-hover:text-brand-hi">{s.name as string}</span>
              <span className={cn("tabular shrink-0 font-semibold", profit != null && profit < 0 ? "text-neg" : "text-pos")}>{formatMoney(profit ?? null)}</span></Link></li>;
          })}
        </Panel>
      </div>
      <p className="flex items-center gap-2 text-xs text-faint"><Bookmark size={13} /> {favorites.count ?? 0} produto{favorites.count === 1 ? "" : "s"} nos favoritos · <Link href="/app/favoritos" className="underline underline-offset-2 hover:text-fg">ver favoritos e coleções</Link></p>
    </div>
  );
}

function Panel({ title, href, icon: Icon, empty, children }: { title: string; href: string; icon: typeof Clock; empty: string; children: React.ReactNode[] | React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section className="card !rounded-3xl p-6">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><Icon size={14} className="text-brand-hi" /></span>{title}</h2>
        <Link href={href} className="flex items-center gap-1 text-xs text-muted hover:text-fg">Ver tudo <ArrowRight className="btn-arrow" size={12} /></Link></div>
      {items.length ? <ul className="mt-3 divide-y divide-tint/[0.06]">{items}</ul> : <p className="mt-5 rounded-xl border border-dashed border-tint/[0.08] px-4 py-5 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}
