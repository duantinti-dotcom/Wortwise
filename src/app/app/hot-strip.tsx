import { ArrowRight, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { DEFAULT_CATEGORY, loadTrending } from "@/lib/trending";
import { cn, formatMoney } from "@/lib/utils";

const RANK = ["from-[#ffd36b] to-[#f5a300] text-[#3a2500]", "from-[#f2f2f2] to-[#b9bec7] text-[#23262b]", "from-[#ffb98a] to-[#c8682e] text-[#3a1700]"];

/** Faixa "Em alta agora" do painel: top 5 do ranking oficial (só aparece com a integração ativa). */
export async function HotStrip() {
  const data = await loadTrending(DEFAULT_CATEGORY);
  if (!data.state.ok || !data.products.length) return null;
  return (
    <section aria-label="Em alta agora" className="card !rounded-3xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><Flame size={18} className="text-brand" />Em alta agora <span className="hidden text-sm font-normal text-faint sm:inline">· {data.category.name}</span></h2>
        <Link href="/app/em-alta" className="btn btn-ghost btn-sm">Ver ranking <ArrowRight className="btn-arrow" size={14} /></Link>
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.products.slice(0, 5).map((p) => (
          <li key={p.externalId} className="w-[170px] shrink-0 snap-start sm:w-auto sm:flex-1">
            <Link href={`/app/produto/${p.source}/${p.externalId}`} className="group block">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-white p-3">
                <span className={cn("absolute left-2 top-2 flex h-6 items-center gap-1 rounded-full bg-gradient-to-b px-2 text-[11px] font-extrabold", RANK[p.rank - 1] ?? "from-[#2a2a2e] to-[#121214] text-white")}><Trophy size={11} />{p.rank}º</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105" /> : null}
              </div>
              <div className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug group-hover:text-brand-hi">{p.title}</div>
              <div className="tabular mt-1 text-[15px] font-bold">{formatMoney(p.price, p.currency ?? "BRL")}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
