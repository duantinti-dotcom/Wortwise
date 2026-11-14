import { ArrowRight, BarChart3, Bell, Bookmark, Calculator, Clock, MessagesSquare, Scale, Search, Store, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight md:text-[32px]">{greeting}{name ? `, ${name}` : ""}.</h1>
        <p className="mt-1.5 text-muted">{isNew ? "Sua conta está pronta. Comece pesquisando um produto que você pensa em vender." : "Aqui está o que mudou desde a sua última visita."}</p>
      </div>

      <form action="/app/descobrir" className="card relative overflow-hidden p-5 md:p-7" role="search">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_120%_at_100%_0%,rgba(255,121,0,0.10),transparent_70%)]" />
        <label htmlFor="dash-q" className="relative text-sm font-medium">O que vale a pena vender agora?</label>
        <div className="relative mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input id="dash-q" name="q" required minLength={2} maxLength={120} placeholder="Ex.: fone bluetooth para revender" className="input !h-13 !rounded-xl !pl-12 !text-base" style={{ height: 52 }} />
          </div>
          <button className="btn btn-primary btn-lg !h-[52px]">Pesquisar <ArrowRight size={17} /></button>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs text-faint">
          {searchQuota ? <span>{searchQuota.remaining} pesquisa{searchQuota.remaining === 1 ? "" : "s"} disponíve{searchQuota.remaining === 1 ? "l" : "is"} {PERIOD_LABELS[searchQuota.period]}</span> : null}
          {interests.map((c) => <Link key={c} href={`/app/descobrir?q=${encodeURIComponent(c)}`} className="badge hover:!text-fg">{c}</Link>)}
        </div>
      </form>

      <section aria-label="Uso do plano" className="grid gap-4 sm:grid-cols-3">
        {shown.map((q) => {
          const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : 0;
          return (
            <div key={q.resource} className="card p-4">
              <div className="flex items-baseline justify-between text-xs text-muted"><span>{RESOURCE_LABELS[q.resource]}</span><span>{PERIOD_LABELS[q.period]}</span></div>
              <div className="tabular mt-2 text-xl font-semibold tracking-tight">{q.used}<span className="text-sm font-normal text-faint"> / {q.limit}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-neg" : "bg-brand")} style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </section>

      {isNew ? (
        <section className="card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Primeiros passos</h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {[["1", "Pesquise um produto", "Veja ofertas reais, com fonte e data da coleta.", "/app/descobrir"], ["2", "Simule o lucro", "Inclua comissão, frete, impostos e publicidade.", "/app/calculadora"], ["3", "Compare fornecedores", "Cadastre cotações e veja o custo final por unidade.", "/app/comparar"]].map(([n, t, d, href]) => (
              <li key={n}><Link href={href!} className="group flex h-full gap-4 rounded-xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-white/3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 font-mono text-sm text-brand-hi">{n}</span>
                <span><span className="block text-sm font-medium group-hover:text-brand-hi">{t}</span><span className="mt-1 block text-sm text-muted">{d}</span></span></Link></li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Histórico de pesquisas" href="/app/descobrir" icon={Clock} empty="Nenhuma pesquisa ainda.">
          {(searches.data ?? []).map((s) => (
            <li key={s.id as string}><Link href={`/app/descobrir?s=${s.id}`} className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-brand-hi">
              <span className="truncate">{s.query as string}</span><span className="shrink-0 text-xs text-faint">{s.result_count as number} resultados · {relativeTime(s.created_at as string)}</span></Link></li>
          ))}
        </Panel>
        <Panel title="Alertas recentes" href="/app/monitoramento" icon={Bell} empty="Nenhum alerta. Monitore um produto para ser avisado de mudanças de preço.">
          {(alerts.data ?? []).map((a) => {
            const d = a.data as { previous?: number; current?: number } | null;
            const down = d?.previous != null && d.current != null && d.current < d.previous;
            return (
              <li key={a.id as string} className="flex items-start gap-3 py-3 text-sm">
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", down ? "bg-pos/12 text-pos" : "bg-brand/12 text-brand-hi")}>{down ? <TrendingDown size={14} /> : <TrendingUp size={14} />}</span>
                <span className="min-w-0"><span className={cn("block font-medium", a.read_at && "font-normal text-muted")}>{a.title as string}</span><span className="block truncate text-xs text-muted">{a.message as string}</span></span>
                <span className="ml-auto shrink-0 text-xs text-faint">{relativeTime(a.created_at as string)}</span>
              </li>
            );
          })}
        </Panel>
        <Panel title="Produtos monitorados" href="/app/monitoramento" icon={BarChart3} empty="Nenhum produto monitorado.">
          {(watches.data ?? []).map((w) => (
            <li key={w.id as string}><Link href={`/app/produto/${w.source}/${w.external_id}`} className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-brand-hi">
              <span className="truncate">{w.title as string}</span>
              <span className="shrink-0 text-right"><span className="tabular block font-medium text-fg">{formatMoney(w.last_price as number | null, (w.last_currency as string) ?? "BRL")}</span>
                <span className="text-xs text-faint">{w.last_checked_at ? `verificado ${relativeTime(w.last_checked_at as string)}` : "aguardando 1ª verificação"}</span></span></Link></li>
          ))}
        </Panel>
        <Panel title="Comparações e simulações salvas" href="/app/comparar" icon={Store} empty="Nenhuma comparação ou simulação salva.">
          {comparisons.map((c) => <li key={c}><Link href={`/app/comparar?c=${encodeURIComponent(c)}`} className="flex items-center justify-between py-3 text-sm hover:text-brand-hi"><span className="truncate">{c}</span><span className="badge">comparação</span></Link></li>)}
          {(sims.data ?? []).map((s) => {
            const profit = (s.results as { profit?: number } | null)?.profit;
            return <li key={s.id as string}><Link href="/app/calculadora" className="flex items-center justify-between gap-3 py-3 text-sm hover:text-brand-hi"><span className="truncate">{s.name as string}</span>
              <span className={cn("tabular shrink-0 font-medium", profit != null && profit < 0 ? "text-neg" : "text-pos")}>{formatMoney(profit ?? null)}</span></Link></li>;
          })}
        </Panel>
      </div>

      <section aria-label="Acesso rápido" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card card-hover flex items-center gap-3.5 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-brand-hi"><t.icon size={18} /></span>
            <span><span className="block text-sm font-medium">{t.title}</span><span className="block text-xs text-muted">{t.text}</span></span>
          </Link>
        ))}
      </section>
      <p className="flex items-center gap-2 text-xs text-faint"><Bookmark size={13} /> {favorites.count ?? 0} produto{favorites.count === 1 ? "" : "s"} nos favoritos · <Link href="/app/favoritos" className="underline underline-offset-2 hover:text-fg">ver favoritos e coleções</Link></p>
    </div>
  );
}

function Panel({ title, href, icon: Icon, empty, children }: { title: string; href: string; icon: typeof Clock; empty: string; children: React.ReactNode[] | React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon size={15} className="text-faint" /> {title}</h2>
        <Link href={href} className="text-xs text-muted hover:text-fg">Ver tudo</Link></div>
      {items.length ? <ul className="mt-2 divide-y divide-line">{items}</ul> : <p className="mt-4 rounded-lg bg-white/3 px-3.5 py-3 text-sm text-muted">{empty}</p>}
    </section>
  );
}
