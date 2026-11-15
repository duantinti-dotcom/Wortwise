"use client";
import { ArrowUpRight, Calculator, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn, formatMoney } from "@/lib/utils";

interface Item { emoji: string; nome: string; descricao: string; por_que_vende: string; publico: string; preco_min: number; preco_max: number; dica: string; busca: string; imagem?: string; link: string }
const CATS = [
  { id: "eletronicos", name: "Eletrônicos" }, { id: "casa", name: "Casa e cozinha" }, { id: "beleza", name: "Beleza" },
  { id: "moda", name: "Moda" }, { id: "esportes", name: "Esportes" }, { id: "pets", name: "Pets" },
  { id: "infantil", name: "Bebês e brinquedos" }, { id: "celular", name: "Celular" },
];
const PRESET: Record<string, string> = { mercadolivre: "mercadolivre-classico", shopee: "shopee", amazon: "amazon", tiktokshop: "tiktokshop" };

function Photo({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  const desc = item.imagem || item.busca;
  if (failed || !desc) return <span className="text-[56px] leading-none" aria-hidden>{item.emoji}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/ideas/image?d=${encodeURIComponent(desc)}`} alt={item.nome} loading="lazy" onError={() => setFailed(true)}
    className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />;
}

/**
 * "Mais vendidos" montado pela IA enquanto a API oficial da loja não está conectada.
 * Mesmo formato do ranking oficial, com o selo de estimativa (não é o ranking da loja).
 */
export function AiIdeas({ store }: { store: string }) {
  const [cat, setCat] = useState(CATS[0]!.id);
  const [state, setState] = useState<{ key: string; items: Item[] | null; error: string | null }>({ key: "", items: null, error: null });
  const [nonce, setNonce] = useState(0);
  const key = `${store}:${cat}:${nonce}`;
  useEffect(() => {
    let alive = true;
    fetch(`/api/ideas?loja=${store}&categoria=${cat}`).then(async (r) => {
      const body = (await r.json().catch(() => null)) as { ideas?: Item[]; error?: { message: string } } | null;
      if (!alive) return;
      if (!r.ok || !body?.ideas) setState({ key, items: null, error: body?.error?.message ?? "Não foi possível montar o ranking agora." });
      else setState({ key, items: body.ideas, error: body.ideas.length ? null : "A IA não respondeu desta vez. Tente de novo." });
    }).catch(() => { if (alive) setState({ key, items: null, error: "Sem conexão. Tente de novo." }); });
    return () => { alive = false; };
  }, [store, cat, key]);
  const loading = state.key !== key;
  const name = sourceName(store);

  return (
    <section aria-label={`Mais vendidos em ${name}`}>
      <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
          {CATS.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={c.id === cat}
              className={cn("chip whitespace-nowrap", c.id === cat && "!bg-[#2563EB] !text-white !shadow-none")}>{c.name}</button>
          ))}
        </div>
      </div>

      <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-faint">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-hi" />
        <span>Ranking estimado pela IA enquanto a conexão oficial com {name} não está ativa. Fotos ilustrativas e preços aproximados: toque em “Ver em {name}” para ver os anúncios reais.</span>
      </p>

      <div className="mt-6" aria-live="polite">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="card overflow-hidden"><div className="skeleton m-2 aspect-square !rounded-[12px]" /><div className="space-y-2.5 p-4"><div className="skeleton h-4" /><div className="skeleton h-4 w-2/3" /><div className="skeleton h-6 w-1/2" /></div></div>)}
            <p className="col-span-full text-center text-[13.5px] text-muted">Montando o ranking de {name}…</p>
          </div>
        ) : state.error ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center"><p className="text-[15px] text-muted">{state.error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => setNonce((n) => n + 1)}>Tentar de novo</button></div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {(state.items ?? []).map((it, i) => (
              <motion.li key={`${key}:${it.nome}`} initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 140, damping: 18, delay: Math.min(i, 10) * 0.04 }} className="card card-hover group flex flex-col overflow-hidden">
                <div className="relative m-2 flex aspect-square items-center justify-center overflow-hidden rounded-[12px] bg-white">
                  <Photo item={it} />
                  <span className="tabular absolute left-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-[#18181B]/85 px-2 text-[12.5px] font-semibold text-white backdrop-blur">{i + 1}º</span>
                </div>
                <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
                  <div className="flex items-center gap-2 text-[12px] text-muted"><SourceMark source={store} size={16} />{name}<span className="ml-auto rounded-[6px] bg-tint/[0.07] px-1.5 py-0.5 text-[10.5px] font-medium text-faint">estimativa IA</span></div>
                  <h3 className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug">{it.nome}</h3>
                  <div className="tabular mt-2 text-[19px] font-semibold tracking-tight">{formatMoney(it.preco_min)}<span className="text-[14px] font-normal text-muted"> a {formatMoney(it.preco_max)}</span></div>
                  <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted">{it.por_que_vende}</p>
                  <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-4">
                    <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary btn-sm">Ver em {name}<ArrowUpRight size={15} /></a>
                    <Link href={`/app/calculadora?canal=${PRESET[store] ?? ""}`} className="btn btn-secondary btn-sm !w-10 !px-0" aria-label="Calcular lucro" title="Calcular lucro"><Calculator size={16} /></Link>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
