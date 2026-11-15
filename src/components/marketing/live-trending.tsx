"use client";
import { ExternalLink, Sparkles, Truck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

interface LiveProduct { id: string; rank: number; title: string; imageUrl: string | null; price: number | null; originalPrice: number | null; currency: string | null; freeShipping: boolean | null; permalink: string | null }
interface LiveData { configured: boolean; category: string; updatedAt: string | null; products: LiveProduct[] }


/** Itens ilustrativos (sem foto real) usados só quando a integração ainda não está ativa. */
const DEMO: { title: string; price: string; img: string }[] = [
  { title: "Fone Bluetooth TWS com estojo", price: "R$ 58,90", img: "fone" },
  { title: "Smartwatch esportivo à prova d'água", price: "R$ 129,00", img: "smartwatch" },
  { title: "Luminária de mesa LED recarregável", price: "R$ 74,50", img: "luminaria" },
  { title: "Kit elásticos de treino 5 níveis", price: "R$ 39,90", img: "elasticos" },
  { title: "Garrafa térmica inox 1 litro", price: "R$ 49,90", img: "garrafa" },
  { title: "Suporte de celular articulado", price: "R$ 29,90", img: "suporte" },
  { title: "Controle sem fio para PC e celular", price: "R$ 89,90", img: "controle" },
  { title: "Camiseta dry fit masculina", price: "R$ 34,90", img: "camiseta" },
  { title: "Mochila para notebook com divisórias", price: "R$ 119,90", img: "mochila" },
  { title: "Organizador de gavetas modular", price: "R$ 27,90", img: "organizador" },
];

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={cn("tabular absolute left-2.5 top-2.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] font-semibold shadow-sm", "bg-[#18181B]/85 text-white backdrop-blur")}>
      #{rank}
    </span>
  );
}

export function LiveTrending() {
  const [data, setData] = useState<LiveData | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    let alive = true;
    fetch("/api/trending").then((r) => (r.ok ? r.json() : null)).then((d: LiveData | null) => { if (alive) setData(d ?? { configured: false, category: "", updatedAt: null, products: [] }); })
      .catch(() => { if (alive) setData({ configured: false, category: "", updatedAt: null, products: [] }); });
    return () => { alive = false; };
  }, []);

  const live = Boolean(data?.products.length);
  const item = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 30, scale: 0.96 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: true, margin: "-40px" },
    transition: { type: "spring" as const, stiffness: 110, damping: 18, delay: (i % 5) * 0.05 },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[13px]">
        {data === null ? <span className="badge">carregando…</span> : live ? (
          <span className="badge badge-brand !h-auto !whitespace-normal py-1 text-center"><span className="live-dot !size-1.5 shrink-0" />Ao vivo · Mais vendidos em {data!.category} · atualizado {relativeTime(data!.updatedAt)}</span>
        ) : (
          <span className="badge !h-auto !whitespace-normal py-1 text-center"><span className="size-1.5 shrink-0 rounded-full bg-brand" />Produtos em alta · imagens ilustrativas e preços de referência</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {data === null ? Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={cn("card overflow-hidden !rounded-[14px]", i >= 4 && "max-md:hidden", i >= 8 && "max-lg:hidden")}><div className="skeleton m-2 aspect-square !rounded-[10px]" /><div className="space-y-2 p-4"><div className="skeleton h-4" /><div className="skeleton h-5 w-20" /></div></div>
        )) : live ? data!.products.map((p, i) => (
          <motion.a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noopener noreferrer nofollow" {...item(i)}
            className={cn("card card-hover group relative flex flex-col overflow-hidden !rounded-[14px]", i >= 4 && "max-md:hidden", i >= 8 && "max-lg:hidden")}>
            <div className="relative m-2 flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-white p-4">
              <RankBadge rank={p.rank} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl ? <img src={p.imageUrl} alt={p.title} loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain transition-transform duration-700 group-hover:scale-[1.06]" /> : null}
              {p.freeShipping ? <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-md bg-[#00a650] px-1.5 py-0.5 text-[10.5px] font-semibold text-white"><Truck size={11} />Frete grátis</span> : null}
            </div>
            <div className="flex flex-1 flex-col px-3.5 pb-4 pt-1.5">
              <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug group-hover:text-brand-hi">{p.title}</h3>
              <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                <span className="tabular text-[19px] font-semibold tracking-tight">{formatMoney(p.price, p.currency ?? "BRL")}</span>
                <ExternalLink size={14} className="mb-1 shrink-0 text-faint transition-colors group-hover:text-brand" />
              </div>
            </div>
          </motion.a>
        )) : DEMO.map((d, i) => (
          <motion.div key={i} {...item(i)} className={cn("card relative flex flex-col overflow-hidden !rounded-[14px]", i >= 4 && "max-md:hidden", i >= 8 && "max-lg:hidden")}>
            <div className="relative m-2 flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-white">
              <RankBadge rank={i + 1} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/demo/${d.img}.webp`} alt={d.title} loading="lazy" width={480} height={480} className="size-full object-cover transition-transform duration-700 hover:scale-[1.05]" />
            </div>
            <div className="px-3.5 pb-4 pt-1.5">
              <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{d.title}</h3>
              <div className="tabular mt-2.5 text-[19px] font-semibold tracking-tight">{d.price}</div>
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-faint"><Sparkles size={12} className="text-brand" />{live ? "Posição informada pelo Mercado Livre. O Worthwise não inventa vendas: mostra a fonte e a data de cada dado." : "Imagens ilustrativas e preços de referência. No app, veja o ranking completo de cada loja e categoria."}</p>
    </div>
  );
}
