import { ArrowUpRight, Calculator, Star } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "@/components/app/product-bits";
import { inStore, SourceMark, sourceName } from "@/components/source-mark";
import type { CuratedItem } from "@/lib/curated";
import { formatMoney, relativeTime } from "@/lib/utils";

const PRESET: Record<string, string> = { mercadolivre: "mercadolivre-classico", shopee: "shopee", amazon: "amazon", tiktokshop: "tiktokshop" };

/** Ranking da vitrine: foto, preço, avaliação, vendidos, gráfico de preço e link direto para o anúncio. */
export function CuratedGrid({ items, showStore }: { items: CuratedItem[]; showStore?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
      {items.map((it, i) => (
        <li key={it.id} className="card card-hover group flex flex-col overflow-hidden">
          <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="relative m-2 flex aspect-square items-center justify-center overflow-hidden rounded-[12px] bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {it.image_url ? <img src={it.image_url} alt={it.title} loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain transition-transform duration-700 group-hover:scale-[1.05]" /> : null}
            <span className="tabular absolute left-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-[#18181B]/85 px-2 text-[12.5px] font-semibold text-white backdrop-blur">{i + 1}º</span>
          </a>
          <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
            <div className="flex items-center gap-2 text-[12px] text-muted"><SourceMark source={it.store} size={16} />{showStore ? sourceName(it.store) : it.category ?? sourceName(it.store)}</div>
            <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 line-clamp-2 text-[14.5px] font-semibold leading-snug hover:text-brand-hi">{it.title}</a>
            <div className="tabular mt-2 text-[20px] font-semibold tracking-tight">{formatMoney(it.price)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
              {it.rating ? <span className="flex items-center gap-1"><Star size={12} className="fill-[#F59E0B] text-[#F59E0B]" />{it.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{it.reviews_count ? ` (${it.reviews_count.toLocaleString("pt-BR")})` : ""}</span> : null}
              {it.sold_text ? <span className="font-medium text-soft">{it.sold_text}</span> : null}
            </div>
            <div className="mt-3">
              <div className="text-[11.5px] text-faint">Preço nos últimos dias</div>
              {it.history.length >= 2 ? <Sparkline points={it.history} /> : <div className="text-[12.5px] text-muted">Acompanhando desde {relativeTime(it.updated_at)}</div>}
            </div>
            <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-4">
              <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary btn-sm">Ver {inStore(it.store).replace(/^n[oa] /, "")}<ArrowUpRight size={15} /></a>
              <Link href={`/app/calculadora?canal=${PRESET[it.store] ?? ""}${it.price ? `&preco=${it.price}` : ""}`} className="btn btn-secondary btn-sm !w-10 !px-0" aria-label="Calcular lucro e preço recomendado" title="Calcular lucro e preço recomendado"><Calculator size={16} /></Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
