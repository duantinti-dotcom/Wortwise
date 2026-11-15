"use client";
import { ArrowUpRight, Calculator, RefreshCw, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sourceName } from "@/components/source-mark";
import { cn, formatMoney } from "@/lib/utils";

interface Idea { emoji: string; nome: string; descricao: string; por_que_vende: string; publico: string; preco_min: number; preco_max: number; dica: string; busca: string; link: string }
const CATS = [
  { id: "eletronicos", name: "Eletrônicos" }, { id: "casa", name: "Casa e cozinha" }, { id: "beleza", name: "Beleza" },
  { id: "moda", name: "Moda" }, { id: "esportes", name: "Esportes" }, { id: "pets", name: "Pets" },
  { id: "infantil", name: "Bebês e brinquedos" }, { id: "celular", name: "Celular" },
];
const PRESET: Record<string, string> = { mercadolivre: "mercadolivre-classico", shopee: "shopee", amazon: "amazon", tiktokshop: "tiktokshop" };

/** Ideias de produtos geradas pela IA para a loja escolhida (sugestões, não dados da loja). */
export function AiIdeas({ store }: { store: string }) {
  const [cat, setCat] = useState(CATS[0]!.id);
  const [state, setState] = useState<{ key: string; ideas: Idea[] | null; error: string | null }>({ key: "", ideas: null, error: null });
  const [nonce, setNonce] = useState(0);
  const key = `${store}:${cat}:${nonce}`;
  useEffect(() => {
    let alive = true;
    fetch(`/api/ideas?loja=${store}&categoria=${cat}`).then(async (r) => {
      const body = (await r.json().catch(() => null)) as { ideas?: Idea[]; error?: { message: string } } | null;
      if (!alive) return;
      if (!r.ok || !body?.ideas) setState({ key, ideas: null, error: body?.error?.message ?? "Não foi possível gerar as ideias agora." });
      else setState({ key, ideas: body.ideas, error: body.ideas.length ? null : "A IA não trouxe ideias desta vez. Tente de novo." });
    }).catch(() => { if (alive) setState({ key, ideas: null, error: "Sem conexão. Tente de novo." }); });
    return () => { alive = false; };
  }, [store, cat, key]);
  const loading = state.key !== key;
  const name = sourceName(store);

  return (
    <section aria-labelledby="ideias-ia">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ideias-ia" className="flex items-center gap-2 text-[19px] font-semibold tracking-tight"><Sparkles size={18} className="text-brand-hi" />Ideias da IA para vender em {name}</h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-faint">Sugestões geradas por inteligência artificial com base em conhecimento geral. Os preços são <b className="font-medium text-muted">estimativas</b>, não dados da loja. Toque em “Ver em {name}” para conferir os anúncios reais.</p>
        </div>
        <button type="button" onClick={() => setNonce((n) => n + 1)} disabled={loading} className="btn btn-secondary btn-sm"><RefreshCw size={14} className={cn(loading && "animate-spin")} /><span>Atualizar</span></button>
      </div>

      <div className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
          {CATS.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={c.id === cat}
              className={cn("chip whitespace-nowrap", c.id === cat && "!text-fg ring-2 ring-[#3B82F6]/60")}>{c.name}</button>
          ))}
        </div>
      </div>

      <div className="mt-6" aria-live="polite">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="card h-[260px] p-5"><div className="skeleton size-12 !rounded-2xl" /><div className="skeleton mt-5 h-4 w-3/4" /><div className="skeleton mt-3 h-3 w-full" /><div className="skeleton mt-2 h-3 w-5/6" /><div className="skeleton mt-6 h-6 w-1/2" /></div>)}
            <p className="col-span-full text-center text-[13.5px] text-muted">A IA está pensando nas melhores ideias…</p>
          </div>
        ) : state.error ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center"><p className="text-[15px] text-muted">{state.error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => setNonce((n) => n + 1)}><span>Tentar de novo</span></button></div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.ul key={key} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(state.ideas ?? []).map((it, i) => (
                <motion.li key={it.nome} initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 140, damping: 18, delay: i * 0.05 }} className="card card-hover flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="glass flex size-14 items-center justify-center rounded-2xl text-[30px] leading-none" aria-hidden>{it.emoji}</span>
                    <span className="badge !h-6 shrink-0">IA</span>
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold leading-snug">{it.nome}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{it.descricao}</p>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-soft"><b className="font-medium text-fg">Por que vende:</b> {it.por_que_vende}</p>
                  {it.publico ? <p className="mt-1.5 text-[13px] text-faint">Para: {it.publico}</p> : null}
                  <div className="mt-4">
                    <div className="text-[12px] text-faint">Preço de venda estimado</div>
                    <div className="tabular text-[19px] font-semibold tracking-tight">{formatMoney(it.preco_min)} a {formatMoney(it.preco_max)}</div>
                  </div>
                  {it.dica ? <p className="mt-3 rounded-xl bg-tint/[0.05] px-3 py-2.5 text-[13px] leading-relaxed text-soft">💡 {it.dica}</p> : null}
                  <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-5">
                    <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary btn-sm"><span>Ver em {name}</span><ArrowUpRight size={14} /></a>
                    <Link href={`/app/calculadora?canal=${PRESET[store] ?? ""}`} className="btn btn-secondary btn-sm !w-9 !px-0" aria-label="Calcular lucro" title="Calcular lucro"><Calculator size={15} /></Link>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
