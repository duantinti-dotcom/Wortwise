import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { DEFAULT_CATEGORY, loadTrending } from "@/lib/trending";
import { cn, formatMoney } from "@/lib/utils";


/** Faixa "Em alta agora" do painel: top 5 do ranking oficial (só aparece com a integração ativa). */
export async function HotStrip() {
  const data = await loadTrending(DEFAULT_CATEGORY);
  if (!data.state.ok || !data.products.length) return null;
  return (
    <section aria-label="Em alta agora" className="card !rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Flame size={18} className="text-brand" />Em alta agora <span className="hidden text-sm font-normal text-faint sm:inline">· {data.category.name}</span></h2>
        <Link href="/app/em-alta" className="btn btn-ghost btn-sm">Ver ranking <ArrowRight className="btn-arrow" size={14} /></Link>
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.products.slice(0, 5).map((p) => (
          <li key={p.externalId} className="w-[170px] shrink-0 snap-start sm:w-auto sm:flex-1">
            <Link href={`/app/produto/${p.source}/${p.externalId}`} className="group block">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-white p-3">
                <span className={cn("tabular absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold", p.rank === 1 ? "bg-brand text-[#FFFFFF]" : "bg-[#0B1120] text-white")}>#{p.rank}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105" /> : null}
              </div>
              <div className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug group-hover:text-brand-hi">{p.title}</div>
              <div className="tabular mt-1 text-[15px] font-semibold">{formatMoney(p.price, p.currency ?? "BRL")}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
