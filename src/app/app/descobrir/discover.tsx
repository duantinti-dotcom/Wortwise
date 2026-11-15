"use client";
import { CircleAlert, Clock, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import { SourceMark } from "@/components/source-mark";
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
  const [selected, setSelected] = useState<string[]>(() => { const l = params.get("loja"); return l ? [l] : []; });
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
    const blocked = selected.length === 1 ? sources.find((x) => x.id === selected[0] && x.state !== "connected") : null;
    if (blocked) { setResult(null); setError({ code: "not_configured", message: `${blocked.name} ainda não está conectado. Escolha outra loja ou "Todas".` }); return; }
    setLoading(true);
    setError(null);
    // Só a escolha de fontes vai para o servidor; o refinamento é feito na tela, sem custo.
    const r = await api<Result>("/api/search", { method: "POST", json: { query: term, filters: { sources: selected.length ? selected : undefined } } });
    setLoading(false);
    if (r.ok) { setResult(r.data); router.refresh(); return; }
    setResult(null);
    if (r.error.code === "quota_exceeded") openUpgrade(r.error.message);
    setError({ code: r.error.code, message: r.error.message, sources: r.error.sources as SourceReport[] | undefined });
  }, [selected, sources, openUpgrade, router]);

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

      <div role="tablist" aria-label="Lojas" className="-mx-5 mb-6 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 border-b border-tint/[0.08] lg:w-full">
          {[{ id: "", name: "Todas as lojas", state: "connected" }, ...sources.filter((x) => x.id !== "tiktokshop")].map((src) => {
            const on = src.id ? selected.length === 1 && selected[0] === src.id : selected.length !== 1;
            return (
              <button key={src.id || "all"} type="button" role="tab" aria-selected={on} title={"detail" in src ? (src as SourceInfo).detail : undefined}
                onClick={() => { setSelected(src.id ? [src.id] : []); setError(null); }}
                className={cn("-mb-px flex h-12 shrink-0 items-center gap-2.5 border-b-2 px-3 text-[15px] font-medium transition-colors", on ? "border-[#3B82F6] text-fg" : "border-transparent text-muted hover:text-fg")}>
                {src.id ? <SourceMark source={src.id} size={20} /> : null}{src.name}
                {src.state !== "connected" ? <span className="rounded-full bg-tint/[0.07] px-2 py-0.5 text-[11.5px] font-normal text-faint">em breve</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void run(query); }} className="flex flex-col gap-3 sm:flex-row" role="search">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} aria-label="Termo de pesquisa" placeholder="Ex.: fone bluetooth" enterKeyHint="search"
            className="input !h-12 !pl-11 !text-[16px]" />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-lg shrink-0">{loading ? "Pesquisando…" : "Pesquisar"}</button>
      </form>

      <div className="mt-10" aria-live="polite">
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
                    <button type="button" onClick={() => setSheet(true)} className="btn btn-secondary btn-sm lg:hidden"><SlidersHorizontal size={14} /> Filtros{nActive ? <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-[#FFFFFF]">{nActive}</span> : null}</button>
                    <label className="ml-auto flex items-center gap-2 text-sm text-muted"><span className="hidden sm:inline">Ordenar por</span>
                      <select className="input !h-9 !w-auto !rounded-full !py-0 !pl-3.5 text-sm" value={refine.sort ?? "relevance"} onChange={(e) => setRefine({ sort: e.target.value as SortKey })} aria-label="Ordenar por">
                        {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select></label>
                  </div>
                  <ActiveChips f={refine} set={setRefine} reset={resetRefine} />
                  {stats ? (
                    <div className="card mb-6 grid grid-cols-3 divide-x divide-tint/[0.08] text-center">
                      {[["Menor preço", stats.min], ["Mediana", stats.median], ["Maior preço", stats.max]].map(([l, v]) => (
                        <div key={l as string} className="px-3 py-4"><div className="text-[12.5px] text-faint">{l}</div><div className="tabular mt-1 text-[16px] font-semibold">{formatMoney(v as number)}</div></div>
                      ))}
                    </div>
                  ) : null}
                  {filtered.length ? (
                    <div className="grid grid-cols-2 gap-4 md:gap-5 md:grid-cols-3 2xl:grid-cols-4">
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
          <div className="space-y-10">
            <section>
              <h2 className="text-[16px] font-semibold tracking-tight">Ideias para começar</h2>
              <p className="mt-1.5 text-[14px] text-muted">Toque para preencher a busca. A pesquisa só acontece quando você confirmar.</p>
              <div className="mt-5 flex flex-wrap gap-2">{SUGGESTIONS.map((x) => (
                <button key={x} onClick={() => setQuery(x)} className="chip"><Search size={14} className="text-faint" />{x}</button>))}</div>
            </section>
            {recent.length ? (
              <section>
                <h2 className="text-[16px] font-semibold tracking-tight">Pesquisas recentes</h2>
                <p className="mt-1.5 text-[14px] text-muted">Abrir de novo não gasta pesquisa.</p>
                <ul className="card mt-5 divide-y divide-tint/[0.07] px-5">
                  {recent.map((r) => (
                    <li key={r.id}><button onClick={() => router.push(`/app/descobrir?s=${r.id}`)} className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-[14.5px] transition-colors hover:text-brand-hi">
                      <span className="flex min-w-0 items-center gap-3"><Clock size={15} className="shrink-0 text-faint" /><span className="truncate">{r.query}</span></span>
                      <span className="shrink-0 text-[13px] text-faint">{relativeTime(r.created_at)}</span></button></li>
                  ))}
                </ul>
              </section>
            ) : null}
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
