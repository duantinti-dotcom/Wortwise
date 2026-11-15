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

  const recentEmpty = !(searches.data?.length || alerts.data?.length || watches.data?.length || comparisons.length || sims.data?.length);
  void ICONS;

  return (
    <div className="space-y-12 md:space-y-16">
      <section>
        <p className="text-[14px] text-muted first-letter:uppercase">{today}</p>
        <h1 className="display mt-2 text-[30px] md:text-[40px]">{greeting}{name ? `, ${name}` : ""}.</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted">O que você quer fazer hoje?</p>
        {usage.plan === "free" && usage.trial_denied ? (
          <div role="note" className="card mt-8 flex flex-col gap-4 border-[#3B82F6]/40 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15.5px] font-semibold">Esta conta não tem pesquisas grátis</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-muted">O teste grátis vale para uma conta por aparelho e por internet, e já foi usado {usage.trial_denied === "same_device" ? "neste aparelho" : "nesta rede"}. Para continuar, assine um plano. A calculadora de lucro continua liberada.</p>
            </div>
            <Link href="/app/configuracoes" className="btn btn-primary shrink-0">Ver planos</Link>
          </div>
        ) : null}

        <form action="/app/descobrir" role="search" className="card mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <label htmlFor="dash-q" className="sr-only">Pesquisar produto</label>
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input id="dash-q" name="q" required minLength={2} maxLength={120} placeholder="Ex.: fone bluetooth" className="input !h-12 !rounded-full !pl-11 !text-[16px]" />
          </div>
          <button className="btn btn-primary btn-lg shrink-0">Pesquisar</button>
        </form>
        <p className="mt-3 text-[13.5px] text-faint">
          {searchQuota ? `${searchQuota.remaining} pesquisa${searchQuota.remaining === 1 ? "" : "s"} disponíve${searchQuota.remaining === 1 ? "l" : "is"} ${PERIOD_LABELS[searchQuota.period]}.` : null}
          {interests.length ? <> Sugestões: {interests.map((c, i) => <span key={c}>{i ? ", " : ""}<Link href={`/app/descobrir?q=${encodeURIComponent(c)}`} className="text-brand-hi hover:underline">{c}</Link></span>)}</> : null}
        </p>
      </section>

      <section aria-labelledby="atalhos">
        <h2 id="atalhos" className="text-[18px] font-semibold tracking-tight">Por onde começar</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {([
            ["/app/em-alta", Flame, "Ver os mais vendidos", "O ranking de cada loja, com foto e preço. Ótimo para ter ideias."],
            ["/app/calculadora", Calculator, "Calcular meu lucro", "Responda 6 perguntas e veja quanto sobra em cada venda."],
            ["/app/comparar", Store, "Comparar fornecedores", "Descubra quem sai mais barato somando frete e impostos."],
          ] as const).map(([href, Icon, title, text]) => (
            <Link key={href} href={href} className="card card-hover group flex items-start gap-4 p-5 md:flex-col md:gap-0 md:p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint/[0.08] text-brand-hi"><Icon size={19} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16.5px] font-semibold tracking-tight md:mt-5 md:text-[17px]">{title}</span>
                <span className="mt-1.5 text-[14.5px] leading-relaxed text-muted md:mt-2">{text}</span>
                <span className="mt-4 hidden items-center gap-1.5 text-[14px] font-medium text-brand-hi md:inline-flex">Abrir <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
              </span>
              <ArrowRight size={17} className="mt-3 shrink-0 text-faint md:hidden" />
            </Link>
          ))}
        </div>
      </section>

      <Suspense fallback={null}><HotStrip /></Suspense>

      <section aria-labelledby="uso">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="uso" className="text-[18px] font-semibold tracking-tight">Seu plano</h2>
          <Link href="/app/configuracoes" className="text-[14px] text-brand-hi hover:underline">Ver planos</Link>
        </div>
        {usage.plan === "ilimitado" ? <div className="card mt-5 p-6 text-[15px]"><span className="font-semibold">Plano Ilimitado</span><span className="text-muted"> · você é o dono do Worthwise: pesquisas, mensagens e monitoramentos sem limite.</span></div> : null}
        <div className={cn("card mt-5 grid divide-y divide-tint/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0", usage.plan === "ilimitado" && "hidden")}>
          {shown.map((q) => {
            const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : 0;
            return (
              <div key={q.resource} className="p-6">
                <div className="text-[14px] text-muted">{RESOURCE_LABELS[q.resource]}</div>
                <div className="tabular mt-2 text-[26px] font-semibold leading-none tracking-tight">{q.used}<span className="text-[15px] font-normal text-faint"> de {q.limit}</span></div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-tint/[0.08]"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-neg" : "bg-brand")} style={{ width: `${Math.max(pct, 1.5)}%` }} /></div>
                <div className="mt-2 text-[12.5px] text-faint">{PERIOD_LABELS[q.period]}</div>
              </div>
            );
          })}
        </div>
      </section>

      {recentEmpty ? null : (
        <section aria-labelledby="recentes">
          <h2 id="recentes" className="text-[18px] font-semibold tracking-tight">Atividade recente</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {searches.data?.length ? (
              <Panel title="Pesquisas" href="/app/descobrir" icon={Clock} empty="">
                {(searches.data ?? []).map((s) => (
                  <li key={s.id as string}><Link href={`/app/descobrir?s=${s.id}`} className="group flex items-center justify-between gap-3 py-3.5 text-[14.5px]">
                    <span className="truncate group-hover:text-brand-hi">{s.query as string}</span>
                    <span className="shrink-0 text-[13px] text-faint">{relativeTime(s.created_at as string)}</span></Link></li>
                ))}
              </Panel>
            ) : null}
            {alerts.data?.length ? (
              <Panel title="Alertas" href="/app/monitoramento" icon={Bell} empty="">
                {(alerts.data ?? []).map((a) => {
                  const d = a.data as { previous?: number; current?: number } | null;
                  const down = d?.previous != null && d.current != null && d.current < d.previous;
                  return (
                    <li key={a.id as string} className="flex items-start gap-3 py-3.5 text-[14.5px]">
                      {down ? <TrendingDown size={16} className="mt-0.5 shrink-0 text-pos" /> : <TrendingUp size={16} className="mt-0.5 shrink-0 text-brand-hi" />}
                      <span className="min-w-0"><span className={cn("block font-medium", a.read_at && "font-normal text-muted")}>{a.title as string}</span><span className="block truncate text-[13px] text-muted">{a.message as string}</span></span>
                      <span className="ml-auto shrink-0 text-[13px] text-faint">{relativeTime(a.created_at as string)}</span>
                    </li>
                  );
                })}
              </Panel>
            ) : null}
            {watches.data?.length ? (
              <Panel title="Produtos monitorados" href="/app/monitoramento" icon={BarChart3} empty="">
                {(watches.data ?? []).map((w) => (
                  <li key={w.id as string}><Link href={`/app/produto/${w.source}/${w.external_id}`} className="group flex items-center justify-between gap-3 py-3.5 text-[14.5px]">
                    <span className="truncate group-hover:text-brand-hi">{w.title as string}</span>
                    <span className="tabular shrink-0 font-semibold">{formatMoney(w.last_price as number | null, (w.last_currency as string) ?? "BRL")}</span></Link></li>
                ))}
              </Panel>
            ) : null}
            {comparisons.length || sims.data?.length ? (
              <Panel title="Comparações e cálculos salvos" href="/app/comparar" icon={Store} empty="">
                {comparisons.map((c) => <li key={c}><Link href={`/app/comparar?c=${encodeURIComponent(c)}`} className="group flex items-center justify-between py-3.5 text-[14.5px]"><span className="truncate group-hover:text-brand-hi">{c}</span><span className="badge">comparação</span></Link></li>)}
                {(sims.data ?? []).map((s) => {
                  const profit = (s.results as { profit?: number } | null)?.profit;
                  return <li key={s.id as string}><Link href="/app/calculadora" className="group flex items-center justify-between gap-3 py-3.5 text-[14.5px]"><span className="truncate group-hover:text-brand-hi">{s.name as string}</span>
                    <span className={cn("tabular shrink-0 font-semibold", profit != null && profit < 0 ? "text-neg" : "text-pos")}>{formatMoney(profit ?? null)}</span></Link></li>;
                })}
              </Panel>
            ) : null}
          </div>
          <p className="mt-5 flex items-center gap-2 text-[13.5px] text-faint"><Bookmark size={14} /> {favorites.count ?? 0} produto{favorites.count === 1 ? "" : "s"} salvo{favorites.count === 1 ? "" : "s"} · <Link href="/app/favoritos" className="text-brand-hi hover:underline">ver salvos</Link></p>
        </section>
      )}

      <details className="card group p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold tracking-tight">
          <span className="flex items-center gap-2.5"><BookOpen size={17} className="text-brand-hi" />O que significa cada palavra?</span>
          <span className="text-[13px] font-normal text-muted group-open:hidden">Mostrar</span><span className="hidden text-[13px] font-normal text-muted group-open:inline">Esconder</span>
        </summary>
        <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {GLOSSARY.map(([t, d]) => <div key={t}><dt className="text-[14.5px] font-semibold">{t}</dt><dd className="mt-1 text-[14px] leading-relaxed text-muted">{d}</dd></div>)}
        </dl>
      </details>
    </div>
  );
}

function Panel({ title, href, icon: Icon, empty, children }: { title: string; href: string; icon: typeof Clock; empty: string; children: React.ReactNode[] | React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"><Icon size={16} className="text-brand-hi" />{title}</h2>
        <Link href={href} className="flex items-center gap-1 text-xs text-muted hover:text-fg">Ver tudo <ArrowRight className="btn-arrow" size={12} /></Link></div>
      {items.length ? <ul className="mt-3 divide-y divide-tint/[0.06]">{items}</ul> : <p className="mt-5 rounded-xl border border-dashed border-tint/[0.08] px-4 py-5 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}
