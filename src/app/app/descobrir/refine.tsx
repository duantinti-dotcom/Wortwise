"use client";
import { RotateCcw, Search, Star, X } from "lucide-react";
import type { SearchFilters, SortKey } from "@/lib/search/filters";
import { cn, SOURCE_LABELS } from "@/lib/utils";

export const SORTS: { id: SortKey; label: string }[] = [
  { id: "relevance", label: "Relevância da fonte" },
  { id: "price_asc", label: "Menor preço" },
  { id: "price_desc", label: "Maior preço" },
  { id: "discount", label: "Maior desconto" },
  { id: "rating", label: "Melhor avaliação" },
  { id: "reviews", label: "Mais avaliações" },
  { id: "sales_rank", label: "Ranking de vendas" },
];

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Até R$ 50", min: null, max: 50 }, { label: "R$ 50–100", min: 50, max: 100 },
  { label: "R$ 100–200", min: 100, max: 200 }, { label: "Acima de R$ 200", min: 200, max: null },
];
const RATINGS = [null, 3.5, 4, 4.5];
const REVIEWS = [null, 10, 100, 1000];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-b border-line py-4 first:pt-0 last:border-0 last:pb-0"><div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-faint">{title}</div>{children}</div>;
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm">
      <span><span className={on ? "text-fg" : "text-soft"}>{label}</span>{hint ? <span className="block text-[11.5px] text-faint">{hint}</span> : null}</span>
      <span className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300", on ? "bg-brand" : "bg-tint/15")}>
        <span className={cn("absolute top-[3px] size-4 rounded-full bg-white shadow transition-[left] duration-300 [transition-timing-function:var(--ease-spring)]", on ? "left-[19px]" : "left-[3px]")} />
      </span>
    </button>
  );
}

const num = (v: string) => { const n = Number(v.replace(/\./g, "").replace(",", ".")); return v.trim() === "" || !Number.isFinite(n) ? null : n; };
const brl = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/** Painel de refinamento: tudo é aplicado na hora sobre os resultados já coletados (não consome pesquisa). */
export function RefinePanel({ f, set, counts, sourcesInResults }: {
  f: SearchFilters; set: (patch: Partial<SearchFilters>) => void; counts: Record<string, number>; sourcesInResults: string[];
}) {
  return (
    <div>
      <Group title="Contém no título">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input !h-10 !pl-9 text-sm" value={f.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder="Ex.: 5.3, preto, kit" aria-label="Palavras no título" />
        </div>
      </Group>
      <Group title="Preço">
        <div className="grid grid-cols-2 gap-2">
          <input className="input tabular !h-10 text-sm" inputMode="decimal" aria-label="Preço mínimo" placeholder="Mín. R$" value={brl(f.priceMin)} onChange={(e) => set({ priceMin: num(e.target.value.replace(/[^\d.,]/g, "")) })} />
          <input className="input tabular !h-10 text-sm" inputMode="decimal" aria-label="Preço máximo" placeholder="Máx. R$" value={brl(f.priceMax)} onChange={(e) => set({ priceMax: num(e.target.value.replace(/[^\d.,]/g, "")) })} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => {
            const on = f.priceMin === p.min && f.priceMax === p.max;
            return <button key={p.label} type="button" aria-pressed={on} onClick={() => set(on ? { priceMin: null, priceMax: null } : { priceMin: p.min, priceMax: p.max })}
              className={cn("chip !h-8 !px-3 !text-[12.5px]", on && "!bg-fg !text-ink")}>{p.label}</button>;
          })}
        </div>
      </Group>
      <Group title="Avaliação mínima">
        <div className="grid grid-cols-4 gap-1.5">
          {RATINGS.map((r) => (
            <button key={String(r)} type="button" aria-pressed={f.minRating === r} onClick={() => set({ minRating: r })}
              className={cn("chip !h-9 justify-center !px-0 !text-[12.5px]", f.minRating === r && "!bg-fg !text-ink")}>
              {r == null ? "Todas" : <><Star size={12} className="fill-brand text-brand" />{String(r).replace(".", ",")}+</>}
            </button>
          ))}
        </div>
        <div className="mt-3 text-[12px] text-faint">Mínimo de avaliações</div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {REVIEWS.map((r) => (
            <button key={String(r)} type="button" aria-pressed={f.minReviews === r} onClick={() => set({ minReviews: r })}
              className={cn("chip !h-8 justify-center !px-0 !text-[12px]", f.minReviews === r && "!bg-fg !text-ink")}>{r == null ? "Todas" : `${r >= 1000 ? `${r / 1000} mil` : r}+`}</button>
          ))}
        </div>
      </Group>
      <Group title="Entrega e oferta">
        <Toggle on={!!f.freeShipping} onChange={(v) => set({ freeShipping: v })} label="Frete grátis" />
        <Toggle on={!!f.discountOnly} onChange={(v) => set({ discountOnly: v })} label="Com desconto" hint="preço abaixo do valor de referência da fonte" />
        <Toggle on={!!f.fastDelivery} onChange={(v) => set({ fastDelivery: v })} label="Prime / entrega rápida" hint="quando a fonte informa" />
        <Toggle on={!!f.availableOnly} onChange={(v) => set({ availableOnly: v })} label="Só disponíveis" />
      </Group>
      <Group title="Condição">
        <div className="seg" role="tablist" aria-label="Condição">
          {([[null, "Todas"], ["new", "Novo"], ["used", "Usado"]] as const).map(([v, l]) => (
            <button key={l} type="button" role="tab" aria-selected={f.condition === v} onClick={() => set({ condition: v })}>{l}</button>
          ))}
        </div>
      </Group>
      {sourcesInResults.length > 1 ? (
        <Group title="Marketplace">
          {sourcesInResults.map((s) => {
            const on = !f.sources?.length || f.sources.includes(s);
            return (
              <label key={s} className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" className="size-4 accent-[#ff7900]" checked={on} onChange={() => {
                    const cur = f.sources?.length ? f.sources : sourcesInResults;
                    const next = on ? cur.filter((x) => x !== s) : [...cur, s];
                    set({ sources: next.length === sourcesInResults.length ? [] : next });
                  }} />{SOURCE_LABELS[s] ?? s}
                </span>
                <span className="tabular text-xs text-faint">{counts[s] ?? 0}</span>
              </label>
            );
          })}
        </Group>
      ) : null}
    </div>
  );
}

/** Etiquetas dos filtros ativos, com remoção individual. */
export function ActiveChips({ f, set, reset }: { f: SearchFilters; set: (patch: Partial<SearchFilters>) => void; reset: () => void }) {
  const money = (n: number) => `R$ ${String(n).replace(".", ",")}`;
  const chips: { label: string; clear: Partial<SearchFilters> }[] = [];
  if (f.text?.trim()) chips.push({ label: `“${f.text.trim()}”`, clear: { text: "" } });
  if (f.priceMin != null || f.priceMax != null) chips.push({ label: f.priceMin != null && f.priceMax != null ? `${money(f.priceMin)} – ${money(f.priceMax)}` : f.priceMin != null ? `A partir de ${money(f.priceMin)}` : `Até ${money(f.priceMax!)}`, clear: { priceMin: null, priceMax: null } });
  if (f.minRating != null) chips.push({ label: `${String(f.minRating).replace(".", ",")}+ estrelas`, clear: { minRating: null } });
  if (f.minReviews != null) chips.push({ label: `${f.minReviews}+ avaliações`, clear: { minReviews: null } });
  if (f.freeShipping) chips.push({ label: "Frete grátis", clear: { freeShipping: false } });
  if (f.discountOnly) chips.push({ label: "Com desconto", clear: { discountOnly: false } });
  if (f.fastDelivery) chips.push({ label: "Prime / entrega rápida", clear: { fastDelivery: false } });
  if (f.availableOnly) chips.push({ label: "Só disponíveis", clear: { availableOnly: false } });
  if (f.condition) chips.push({ label: f.condition === "new" ? "Novo" : "Usado", clear: { condition: null } });
  if (f.sources?.length) chips.push({ label: f.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", "), clear: { sources: [] } });
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={() => set(c.clear)} className="chip !h-8 !pr-2 !text-[12.5px]" aria-label={`Remover filtro ${c.label}`}>
          {c.label}<X size={13} className="text-faint" />
        </button>
      ))}
      <button type="button" onClick={reset} className="btn btn-ghost btn-sm"><RotateCcw size={13} /> Limpar filtros</button>
    </div>
  );
}
