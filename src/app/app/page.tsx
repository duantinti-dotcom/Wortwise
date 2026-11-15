import { ArrowRight, BarChart3, Bell, BookOpen, Bookmark, Calculator, Clock, Flame, MessagesSquare, Search, Store, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HotStrip } from "./hot-strip";
import { getUsage, quotaOf, requireUser } from "@/lib/auth";
import { PERIOD_LABELS, RESOURCE_LABELS } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

const GLOSSARY: [string, string][] = [
  ["Lucro", "O que sobra depois de pagar o produto, as taxas, o frete e os impostos."],
  ["Margem", "Quanto do preço de venda fica com você. Margem de 20% = R$ 20 a cada R$ 100 vendidos."],
  ["Preço mínimo", "O menor preço de venda sem ter prejuízo. Abaixo dele, você perde dinheiro."],
  ["Custo final", "Preço do fornecedor + frete + impostos, dividido pela quantidade. É o custo real de cada unidade."],
  ["Worthwise Score", "Nota de 0 a 100 que resume se o produto parece valer a pena, sempre com o grau de confiança."],
  ["Mais vendidos", "A posição do produto no ranking oficial da loja. Quanto menor o número, mais ele vende."],
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
  const comparisons = [...new Set((quotes.data ?? []).map((q) => q.comparison_name as string))].slice(0, 4);
  const interests = ((profile.data?.categories as string[] | null) ?? []).slice(0, 4);
  const shown = usage.quotas.filter((q) => ["search", "ai_message", "watch"].includes(q.resource));
  const searchQuota = quotaOf(usage, "search");

  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const ICONS: Record<string, typeof Search> = { search: Search, ai_message: MessagesSquare, watch: Bell };

  return (
    <div className="space-y-6">
      <section className="relative text-center">
        <div className="text-sm text-muted first-letter:uppercase">{today}</div>
        <h1 className="display mt-2 text-[34px] md:text-[48px]">{greeting}{name ? `, ${name}` : ""}.</h1>
        <p className="mx-auto mt-2 max-w-2xl text-[15.5px] leading-relaxed text-muted">O Worthwise te ajuda a <b className="font-medium text-fg">escolher o que vender</b> e a saber <b className="font-medium text-fg">quanto você vai lucrar</b>. Escolha por onde começar:</p>
      </section>

      <section aria-label="Por onde começar" className="grid gap-4 lg:grid-cols-3">
        <Link href="/app/em-alta" className="card card-hover group relative flex flex-col items-center p-6 text-center">
          <div className="flex w-full items-center justify-center"><span className="tabular absolute left-5 top-5 flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-[#FFFFFF]">1</span><Flame size={20} className="text-brand" /></div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Veja o que está vendendo</h2>
          <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-muted">O ranking dos mais vendidos do Mercado Livre por categoria, com foto e preço. Ótimo para ter ideias.</p>
          <span className="btn btn-secondary btn-sm mt-5 w-fit">Ver mais vendidos <ArrowRight className="btn-arrow" size={14} /></span>
        </Link>
        <div className="card relative flex flex-col items-center p-6 text-center ring-1 ring-brand/30">
          <div className="flex w-full items-center justify-center"><span className="tabular absolute left-5 top-5 flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-[#FFFFFF]">2</span><Search size={20} className="text-brand" /></div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Pesquise um produto</h2>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">Digite o nome e veja preços, avaliações e quem vende.</p>
          <form action="/app/descobrir" role="search" className="mt-4 flex w-full gap-2">
            <label htmlFor="dash-q" className="sr-only">Pesquisar produto</label>
            <input id="dash-q" name="q" required minLength={2} maxLength={120} placeholder="Ex.: fone bluetooth" className="input !h-11 min-w-0 flex-1 !rounded-full" />
            <button className="btn btn-primary !h-11 shrink-0 !px-4" aria-label="Pesquisar"><Search size={16} /></button>
          </form>
          <div className="mt-3 text-xs text-faint">{searchQuota ? `${searchQuota.remaining} pesquisa${searchQuota.remaining === 1 ? "" : "s"} disponíve${searchQuota.remaining === 1 ? "l" : "is"} ${PERIOD_LABELS[searchQuota.period]}` : null}</div>
          {interests.length ? <div className="mt-2 flex flex-wrap justify-center gap-1.5">{interests.map((c) => <Link key={c} href={`/app/descobrir?q=${encodeURIComponent(c)}`} className="badge hover:!text-fg">{c}</Link>)}</div> : null}
        </div>
        <Link href="/app/calculadora" className="card card-hover group relative flex flex-col items-center p-6 text-center">
          <div className="flex w-full items-center justify-center"><span className="tabular absolute left-5 top-5 flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-[#FFFFFF]">3</span><Calculator size={20} className="text-brand" /></div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Calcule seu lucro</h2>
          <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-muted">Responda 6 perguntas simples e veja quanto sobra no seu bolso em cada venda.</p>
          <span className="btn btn-secondary btn-sm mt-5 w-fit">Abrir calculadora <ArrowRight className="btn-arrow" size={14} /></span>
        </Link>
      </section>

      <Suspense fallback={null}><HotStrip /></Suspense>

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

      <section aria-label="Palavras que você vai ver" className="card p-6">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><BookOpen size={14} className="text-brand-hi" /></span>Palavras que você vai ver</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {GLOSSARY.map(([t, d]) => <div key={t}><dt className="text-sm font-semibold">{t}</dt><dd className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{d}</dd></div>)}
        </dl>
      </section>

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
    <section className="card !rounded-2xl p-6">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><Icon size={14} className="text-brand-hi" /></span>{title}</h2>
        <Link href={href} className="flex items-center gap-1 text-xs text-muted hover:text-fg">Ver tudo <ArrowRight className="btn-arrow" size={12} /></Link></div>
      {items.length ? <ul className="mt-3 divide-y divide-tint/[0.06]">{items}</ul> : <p className="mt-5 rounded-xl border border-dashed border-tint/[0.08] px-4 py-5 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}
