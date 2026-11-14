"use client";
import { ArrowUpLeft, CircleAlert, Clock, Database, Lock, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { activeCount, applyFilters, type SearchFilters, type SortKey } from "@/lib/search/filters";
import { ActiveChips, RefinePanel, SORTS } from "./refine";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductCard, ProductCardSkeleton } from "@/components/app/product-bits";
import { useUpgrade } from "@/components/app/upgrade";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import type { ProductResult } from "@/lib/connectors/types";
import { api } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

interface SourceInfo { id: string; name: string; state: string; detail: string }
interface SourceReport { source: string; name: string; status: string; count: number; message: string | null }
interface Result { status: "ok" | "empty"; results?: ProductResult[]; lockedCount?: number; sources: SourceReport[]; remaining: number | null; cached?: boolean; charged?: boolean; plan: string; collectedAt?: string }

const SUGGESTIONS = ["fone bluetooth", "garrafa térmica", "organizador de gavetas", "luminária de mesa", "capa para celular", "mochila notebook"];

export function Discover({ sources, recent }: { sources: SourceInfo[]; recent: { id: string; query: string; result_count: number; created_at: string }[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { openUpgrade } = useUpgrade();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [refine, setRefineState] = useState<SearchFilters>({ sort: "relevance" });
  const setRefine = useCallback((patch: Partial<SearchFilters>) => setRefineState((f) => ({ ...f, ...patch })), []);
  const resetRefine = useCallback(() => setRefineState((f) => ({ sort: f.sort })), []);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string; message: string; sources?: SourceReport[] } | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const ran = useRef<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from("favorites").select("source, external_id").then(({ data }: { data: { source: string; external_id: string }[] | null }) => {
      setFavs(new Set((data ?? []).map((f) => `${f.source}:${f.external_id}`)));
    });
  }, []);

  const run = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 2) { setError({ code: "invalid_input", message: "Digite pelo menos 2 caracteres." }); return; }
    setLoading(true);
    setError(null);
    // Só a escolha de fontes vai para o servidor; o refinamento é feito na tela, sem custo.
    const r = await api<Result>("/api/search", { method: "POST", json: { query: term, filters: { sources: selected.length ? selected : undefined } } });
    setLoading(false);
    if (r.ok) { setResult(r.data); router.refresh(); return; }
    setResult(null);
    if (r.error.code === "quota_exceeded") openUpgrade(r.error.message);
    setError({ code: r.error.code, message: r.error.message, sources: r.error.sources as SourceReport[] | undefined });
  }, [selected, openUpgrade, router]);

  // Abertura por URL: ?q= executa a pesquisa (repetir a mesma pesquisa não consome crédito); ?s= reabre uma salva.
  useEffect(() => {
    const q = params.get("q");
    const s = params.get("s");
    const key = s ? `s:${s}` : q ? `q:${q}` : null;
    if (!key || ran.current === key) return;
    ran.current = key;
    if (s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento disparado pela URL
      setLoading(true);
      api<{ query: string; results: ProductResult[]; locked: number; sources: SourceReport[]; remaining: number | null; plan: string; created_at: string }>(`/api/search/${s}`).then((r) => {
        setLoading(false);
        if (!r.ok) { setError(r.error); return; }
        setQuery(r.data.query);
        setResult({ status: "ok", results: r.data.results, lockedCount: r.data.locked, sources: r.data.sources, remaining: r.data.remaining, plan: r.data.plan, cached: true, collectedAt: r.data.created_at });
      });
    } else if (q) void run(q);
  }, [params, run]);

  const items = useMemo(() => result?.results ?? [], [result]);
  const filtered = useMemo(() => applyFilters(items, refine), [items, refine]);
  const nActive = activeCount(refine);
  const counts = useMemo(() => items.reduce<Record<string, number>>((m, p) => { m[p.source] = (m[p.source] ?? 0) + 1; return m; }, {}), [items]);
  const sourcesInResults = Object.keys(counts);
  const stats = useMemo(() => {
    const ps = filtered.map((p) => p.price).filter((v): v is number => v != null).sort((a, b) => a - b);
    return ps.length ? { min: ps[0]!, max: ps.at(-1)!, median: ps[Math.floor(ps.length / 2)]! } : null;
  }, [filtered]);

  return (
    <>
      <PageHeader title="Pesquisar produtos" description="Digite o nome de um produto e veja preço, avaliações e quem vende — com foto e link para o anúncio." help={{ id: "pesquisar", steps: ["Digite o produto, por exemplo “fone bluetooth”, e toque em Pesquisar", "Use os filtros para ficar só com os melhores (preço, nota, frete grátis)", "Toque em Analisar para saber se vale a pena e quanto você lucra"] }} />

      <form onSubmit={(e) => { e.preventDefault(); void run(query); }} className="glass relative z-10 rounded-[22px] p-2" role="search">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} aria-label="Termo de pesquisa" placeholder="O que você quer vender?" enterKeyHint="search"
              className="h-12 w-full rounded-xl bg-transparent pl-12 pr-3 text-base outline-none placeholder:text-faint" />
          </div>
          <button type="submit" disabled={loading} aria-label="Pesquisar" className="btn btn-primary !h-12 !px-4 sm:!px-5"><Search size={17} className="sm:hidden" /><span className="hidden sm:inline">{loading ? "Pesquisando…" : "Pesquisar"}</span></button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-tint/8 px-2 pb-1 pt-2.5 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden">
          <span className="mr-1 shrink-0 text-[12px] text-faint">Pesquisar em</span>
          {sources.map((src) => {
            const on = selected.length === 0 ? src.state === "connected" : selected.includes(src.id);
            const ready = src.state === "connected";
            return (
              <button key={src.id} type="button" title={src.detail} aria-pressed={on} disabled={!ready}
                onClick={() => setSelected((x) => { const base = x.length ? x : sources.filter((q) => q.state === "connected").map((q) => q.id); const next = base.includes(src.id) ? base.filter((i) => i !== src.id) : [...base, src.id]; return next; })}
                className={cn("chip !h-8 shrink-0 !px-3 !text-[12.5px] disabled:cursor-not-allowed disabled:opacity-55", on && ready && "!bg-fg !text-ink")}>
                <span className={cn("size-1.5 rounded-full", ready ? "bg-pos" : "bg-faint")} />{src.name}
                {!ready ? <span className="text-faint">· {src.state === "pending_approval" ? "em credenciamento" : "aguardando credenciais"}</span> : null}
              </button>
            );
          })}
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {error && error.code !== "quota_exceeded" ? (
          <div role="alert" className="card flex flex-col gap-3 border-neg/25 p-5">
            <div className="flex items-start gap-3"><CircleAlert size={18} className="mt-0.5 shrink-0 text-neg" /><div><p className="font-medium">{error.message}</p>
              {error.code === "not_configured" ? <p className="mt-1 text-sm text-muted">Veja abaixo a situação real de cada fonte. Assim que uma fonte estiver conectada, a pesquisa passa a funcionar.</p> : null}</div></div>
            {error.sources ? <SourceList sources={error.sources} /> : null}
            {["timeout", "offline", "internal", "source_unavailable", "rate_limited"].includes(error.code) ? <button onClick={() => void run(query)} className="btn btn-secondary btn-sm w-fit">Tentar novamente</button> : null}
          </div>
        ) : null}
        {error?.code === "quota_exceeded" ? (
          <EmptyState icon={Lock} title={error.message} action={<button className="btn btn-primary" onClick={() => openUpgrade()}>Ver planos</button>}>
            Suas pesquisas anteriores continuam disponíveis no histórico, sem custo.
          </EmptyState>
        ) : null}

        {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</div> : null}

        {!loading && result ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {result.status === "empty" ? "Nenhum produto encontrado." : <><span className="font-medium text-fg">{filtered.length}</span>{filtered.length !== items.length ? <> de {items.length}</> : null} resultado{items.length === 1 ? "" : "s"}{result.cached ? " · pesquisa salva (sem custo)" : result.charged ? " · 1 pesquisa utilizada" : ""}</>}
                {result.remaining != null ? <> · {result.remaining} pesquisa{result.remaining === 1 ? "" : "s"} restante{result.remaining === 1 ? "" : "s"}</> : null}
              </p>
              <SourceList sources={result.sources} compact />
            </div>
            {result.status === "empty" || (items.length === 0 && !result.lockedCount) ? (
              <EmptyState icon={Search} title="Nenhum resultado para esta pesquisa">Tente termos mais gerais. Pesquisas sem resultado não consomem crédito.</EmptyState>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="hidden lg:block" aria-label="Filtros">
                  <div className="card sticky top-[88px] max-h-[calc(100dvh-104px)] overflow-y-auto p-5" data-lenis-prevent>
                    <div className="mb-4 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={15} className="text-brand" />Filtros</span>
                      {nActive ? <button type="button" onClick={resetRefine} className="text-xs text-brand-hi hover:underline">Limpar ({nActive})</button> : null}</div>
                    <RefinePanel f={refine} set={setRefine} counts={counts} sourcesInResults={sourcesInResults} />
                  </div>
                </aside>
                <div className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setSheet(true)} className="btn btn-secondary btn-sm lg:hidden"><SlidersHorizontal size={14} /> Filtros{nActive ? <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-[#160800]">{nActive}</span> : null}</button>
                    <label className="ml-auto flex items-center gap-2 text-sm text-muted"><span className="hidden sm:inline">Ordenar por</span>
                      <select className="input !h-9 !w-auto !rounded-full !py-0 !pl-3.5 text-sm" value={refine.sort ?? "relevance"} onChange={(e) => setRefine({ sort: e.target.value as SortKey })} aria-label="Ordenar por">
                        {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select></label>
                  </div>
                  <ActiveChips f={refine} set={setRefine} reset={resetRefine} />
                  {stats ? (
                    <div className="glass-cells mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line text-center">
                      {[["Menor preço", stats.min], ["Mediana", stats.median], ["Maior preço", stats.max]].map(([l, v]) => (
                        <div key={l as string} className="px-3 py-2.5"><div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{l}</div><div className="tabular mt-0.5 text-[15px] font-semibold">{formatMoney(v as number)}</div></div>
                      ))}
                    </div>
                  ) : null}
                  {filtered.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-4">
                      {filtered.map((p) => <ProductCard key={`${p.source}:${p.externalId}`} p={p} favorite={favs.has(`${p.source}:${p.externalId}`)} />)}
                    </div>
                  ) : (
                    <EmptyState icon={SlidersHorizontal} title="Nenhum produto com esses filtros" action={<button className="btn btn-secondary" onClick={resetRefine}>Limpar filtros</button>}>
                      Os filtros são aplicados sobre os {items.length} resultados desta pesquisa, sem consumir crédito.
                    </EmptyState>
                  )}
                </div>
              </div>
            )}
            {result.lockedCount ? (
              <div className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3"><Lock size={18} className="text-brand" /><p className="text-sm"><span className="font-medium">+{result.lockedCount} resultados</span> desta pesquisa estão disponíveis nos planos pagos.</p></div>
                <button className="btn btn-primary btn-sm" onClick={() => openUpgrade("Veja todos os resultados das suas pesquisas")}>Desbloquear</button>
              </div>
            ) : null}
            <Dialog open={sheet} onOpenChange={setSheet}>
              <DialogContent title="Filtros" description={`${filtered.length} de ${items.length} resultados`}>
                <RefinePanel f={refine} set={setRefine} counts={counts} sourcesInResults={sourcesInResults} />
                <div className="sticky -bottom-[max(24px,env(safe-area-inset-bottom))] -mx-6 mt-4 grid grid-cols-2 gap-2 border-t border-line bg-surface/90 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
                  <button type="button" className="btn btn-secondary" onClick={resetRefine}>Limpar</button>
                  <button type="button" className="btn btn-primary" onClick={() => setSheet(false)}>Ver {filtered.length}</button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : null}

        {!loading && !result && !error ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="card !rounded-2xl p-6 lg:col-span-2">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><Sparkles size={14} className="text-brand-hi" /></span>Sugestões para começar</h2>
              <p className="mt-2 text-sm text-muted">Clique para preencher a busca — a pesquisa só acontece quando você confirmar.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setQuery(s)} className="group flex items-center justify-between gap-2 rounded-xl border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3 text-left text-sm transition-all hover:border-brand/40 hover:bg-brand/[0.05]">
                  <span className="flex items-center gap-2.5"><Search size={14} className="text-faint group-hover:text-brand" />{s}</span><ArrowUpLeft size={14} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" /></button>))}</div>
            </div>
            <div className="card !rounded-2xl p-6">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><Database size={14} className="text-brand-hi" /></span>Fontes de dados</h2>
              <ul className="mt-4 space-y-2.5">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-sm" title={s.detail}>
                    <span className="flex items-center gap-2.5"><span className={cn("size-2 rounded-full", s.state === "connected" ? "bg-pos animate-pulse-ring" : s.state === "pending_approval" ? "bg-tint/25" : "bg-brand")} />{s.name}</span>
                    <span className="text-xs text-faint">{s.state === "connected" ? "conectada" : s.state === "pending_approval" ? "em credenciamento" : "não configurada"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card !rounded-2xl p-6 lg:col-span-3">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-tint/[0.06]"><Clock size={14} className="text-brand-hi" /></span>Pesquisas recentes</h2>
              {recent.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {recent.map((r) => (
                    <li key={r.id}><button onClick={() => router.push(`/app/descobrir?s=${r.id}`)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:text-brand-hi">
                      <span className="flex min-w-0 items-center gap-2.5"><Clock size={14} className="shrink-0 text-faint" /><span className="truncate">{r.query}</span></span>
                      <span className="shrink-0 text-xs text-faint">{r.result_count} resultados · {relativeTime(r.created_at)}</span></button></li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-muted">Suas pesquisas aparecerão aqui. Reabrir uma pesquisa já feita não consome crédito.</p>}
            </div>
          </div>
        ) : null}
      </div>
      {query && !loading ? <button onClick={() => { setQuery(""); setResult(null); setError(null); router.replace("/app/descobrir"); }} className="btn btn-ghost btn-sm mt-6"><X size={14} /> Limpar pesquisa</button> : null}
    </>
  );
}

function SourceList({ sources, compact }: { sources: SourceReport[]; compact?: boolean }) {
  const label: Record<string, string> = { ok: "respondeu", empty: "sem resultados", not_configured: "não configurado", pending_approval: "em credenciamento", error: "indisponível", skipped: "não consultado" };
  return (
    <ul className={cn("flex flex-wrap gap-2", !compact && "pl-7")}>
      {sources.map((s) => (
        <li key={s.source} title={s.message ?? undefined} className="badge">
          <span className={cn("size-1.5 rounded-full", s.status === "ok" ? "bg-pos" : s.status === "error" ? "bg-neg" : "bg-faint")} />
          {s.name} · {s.status === "ok" ? `${s.count}` : label[s.status] ?? s.status}
        </li>
      ))}
    </ul>
  );
}
