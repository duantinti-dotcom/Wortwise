"use client";
import { ArrowUpLeft, CircleAlert, Clock, Database, Lock, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductCard, ProductCardSkeleton } from "@/components/app/product-bits";
import { useUpgrade } from "@/components/app/upgrade";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import type { ProductResult } from "@/lib/connectors/types";
import { api } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, relativeTime } from "@/lib/utils";

interface SourceInfo { id: string; name: string; state: string; detail: string }
interface SourceReport { source: string; name: string; status: string; count: number; message: string | null }
interface Result { status: "ok" | "empty"; results?: ProductResult[]; lockedCount?: number; sources: SourceReport[]; remaining: number | null; cached?: boolean; charged?: boolean; plan: string; collectedAt?: string }
type Sort = "relevance" | "price_asc" | "price_desc" | "rating";

const SUGGESTIONS = ["fone bluetooth", "garrafa térmica", "organizador de gavetas", "luminária de mesa", "capa para celular", "mochila notebook"];

export function Discover({ sources, recent }: { sources: SourceInfo[]; recent: { id: string; query: string; result_count: number; created_at: string }[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { openUpgrade } = useUpgrade();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  const [minRating, setMinRating] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [showFilters, setShowFilters] = useState(false);
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
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const r = await api<Result>("/api/search", { method: "POST", json: { query: term, filters: {
      sources: selected.length ? selected : undefined, priceMin: num(priceMin), priceMax: num(priceMax), freeShipping, minRating: num(minRating), sort } } });
    setLoading(false);
    if (r.ok) { setResult(r.data); router.refresh(); return; }
    setResult(null);
    if (r.error.code === "quota_exceeded") openUpgrade(r.error.message);
    setError({ code: r.error.code, message: r.error.message, sources: r.error.sources as SourceReport[] | undefined });
  }, [selected, priceMin, priceMax, freeShipping, minRating, sort, openUpgrade, router]);

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
  const activeFilters = [priceMin, priceMax, minRating].filter(Boolean).length + (freeShipping ? 1 : 0) + selected.length;

  return (
    <>
      <PageHeader title="Descobrir produtos" description="Pesquise em fontes autorizadas. Cada resultado mostra a origem e o momento da coleta; campos que a fonte não informa aparecem como “não disponível”." />

      <form onSubmit={(e) => { e.preventDefault(); void run(query); }} className="glass sticky top-[68px] z-10 rounded-2xl p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,1),0_0_0_1px_rgba(255,121,0,0.08)] lg:top-20" role="search">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} aria-label="Termo de pesquisa" placeholder="O que você quer vender? Ex.: fone bluetooth" enterKeyHint="search"
              className="h-12 w-full rounded-xl bg-transparent pl-12 pr-3 text-base outline-none placeholder:text-faint" />
          </div>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className={cn("btn btn-secondary relative !h-12 !px-3.5", showFilters && "!border-brand/60")} aria-label="Filtros">
            <SlidersHorizontal size={17} /><span className="hidden sm:inline">Filtros</span>
            {activeFilters ? <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-black">{activeFilters}</span> : null}
          </button>
          <button type="submit" disabled={loading} aria-label="Pesquisar" className="btn btn-primary !h-12 !px-4 sm:!px-5"><Search size={17} className="sm:hidden" /><span className="hidden sm:inline">{loading ? "Pesquisando…" : "Pesquisar"}</span></button>
        </div>
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", showFilters ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="overflow-hidden">
            <div className="grid gap-4 border-t border-white/8 p-3 pt-4 md:grid-cols-[1.6fr_1fr_1fr]">
              <div>
                <div className="label">Marketplaces</div>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => {
                    const on = selected.includes(s.id);
                    const ready = s.state === "connected";
                    return (
                      <button key={s.id} type="button" title={s.detail} aria-pressed={on} onClick={() => setSelected((x) => (on ? x.filter((i) => i !== s.id) : [...x, s.id]))}
                        className={cn("badge !h-8 cursor-pointer !px-3 transition-colors", on && "badge-brand", !ready && "opacity-70")}>
                        <span className={cn("size-1.5 rounded-full", ready ? "bg-pos" : s.state === "pending_approval" ? "bg-faint" : "bg-brand")} />{s.name}
                        {!ready ? <span className="text-faint">· {s.state === "pending_approval" ? "em credenciamento" : "não configurado"}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label><span className="label">Preço mín.</span><input className="input tabular" inputMode="decimal" value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="R$" /></label>
                <label><span className="label">Preço máx.</span><input className="input tabular" inputMode="decimal" value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="R$" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label><span className="label">Avaliação mín.</span>
                  <select className="input" value={minRating} onChange={(e) => setMinRating(e.target.value)}><option value="">Qualquer</option><option value="4">4,0+</option><option value="4.5">4,5+</option></select></label>
                <label><span className="label">Ordenar</span>
                  <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="relevance">Relevância da fonte</option><option value="price_asc">Menor preço</option><option value="price_desc">Maior preço</option><option value="rating">Avaliação</option></select></label>
                <label className="col-span-2 flex cursor-pointer items-center gap-2.5 text-sm text-muted"><input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} className="size-4 accent-[#ff7900]" /> Somente com frete grátis</label>
              </div>
            </div>
          </div>
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
                {result.status === "empty" ? "Nenhum produto encontrado." : <><span className="font-medium text-fg">{items.length}</span> resultado{items.length === 1 ? "" : "s"}{result.cached ? " · pesquisa salva (sem custo)" : result.charged ? " · 1 pesquisa utilizada" : ""}</>}
                {result.remaining != null ? <> · {result.remaining} pesquisa{result.remaining === 1 ? "" : "s"} restante{result.remaining === 1 ? "" : "s"}</> : null}
              </p>
              <SourceList sources={result.sources} compact />
            </div>
            {result.status === "empty" || (items.length === 0 && !result.lockedCount) ? (
              <EmptyState icon={Search} title="Nenhum resultado para esta pesquisa">Tente termos mais gerais ou remova filtros. Pesquisas sem resultado não consomem crédito.</EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((p) => <ProductCard key={`${p.source}:${p.externalId}`} p={p} favorite={favs.has(`${p.source}:${p.externalId}`)} />)}
              </div>
            )}
            {result.lockedCount ? (
              <div className="card mt-5 flex flex-wrap items-center justify-between gap-4 border-brand/30 bg-brand/5 p-5">
                <div className="flex items-center gap-3"><Lock size={18} className="text-brand" /><p className="text-sm"><span className="font-medium">+{result.lockedCount} resultados</span> desta pesquisa estão disponíveis nos planos pagos.</p></div>
                <button className="btn btn-primary btn-sm" onClick={() => openUpgrade("Veja todos os resultados das suas pesquisas")}>Desbloquear</button>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !result && !error ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="card !rounded-3xl p-6 lg:col-span-2">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06]"><Sparkles size={14} className="text-brand-hi" /></span>Sugestões para começar</h2>
              <p className="mt-2 text-sm text-muted">Clique para preencher a busca — a pesquisa só acontece quando você confirmar.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setQuery(s)} className="group flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left text-sm transition-all hover:border-brand/40 hover:bg-brand/[0.05]">
                  <span className="flex items-center gap-2.5"><Search size={14} className="text-faint group-hover:text-brand" />{s}</span><ArrowUpLeft size={14} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" /></button>))}</div>
            </div>
            <div className="card !rounded-3xl p-6">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06]"><Database size={14} className="text-brand-hi" /></span>Fontes de dados</h2>
              <ul className="mt-4 space-y-2.5">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-sm" title={s.detail}>
                    <span className="flex items-center gap-2.5"><span className={cn("size-2 rounded-full", s.state === "connected" ? "bg-pos animate-pulse-ring" : s.state === "pending_approval" ? "bg-white/25" : "bg-brand")} />{s.name}</span>
                    <span className="text-xs text-faint">{s.state === "connected" ? "conectada" : s.state === "pending_approval" ? "em credenciamento" : "não configurada"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card !rounded-3xl p-6 lg:col-span-3">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06]"><Clock size={14} className="text-brand-hi" /></span>Pesquisas recentes</h2>
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
