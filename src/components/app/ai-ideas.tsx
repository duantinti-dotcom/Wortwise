"use client";
import { ArrowUpRight, Calculator, Lightbulb, MessagesSquare, Search, Tag, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn, formatMoney } from "@/lib/utils";

export interface EstimateItem { emoji: string; nome: string; descricao: string; por_que_vende: string; publico: string; preco_min: number; preco_max: number; dica: string; busca: string; imagem?: string; link: string }
const CATS = [
  { id: "eletronicos", name: "Eletrônicos" }, { id: "casa", name: "Casa e cozinha" }, { id: "beleza", name: "Beleza" },
  { id: "moda", name: "Moda" }, { id: "esportes", name: "Esportes" }, { id: "pets", name: "Pets" },
  { id: "infantil", name: "Bebês e brinquedos" }, { id: "celular", name: "Celular" },
];
const PRESET: Record<string, string> = { mercadolivre: "mercadolivre-classico", shopee: "shopee", amazon: "amazon", tiktokshop: "tiktokshop" };

function Photo({ item, big }: { item: EstimateItem; big?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const desc = item.imagem || item.busca;
  if (state === "failed" || !desc) return <span className={cn("leading-none", big ? "text-[96px]" : "text-[56px]")} aria-hidden>{item.emoji}</span>;
  return (
    <>
      {state === "loading" ? <span className="skeleton absolute inset-0 !rounded-none" aria-hidden /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/ideas/image?d=${encodeURIComponent(desc)}`} alt={item.nome} loading="lazy" onLoad={() => setState("ok")} onError={() => setState("failed")}
        className={cn("relative size-full object-cover transition-[transform,opacity] duration-700 group-hover:scale-[1.04]", state === "ok" ? "opacity-100" : "opacity-0")} />
    </>
  );
}

function Details({ item, store, rank, open, onOpenChange }: { item: EstimateItem; store: string; rank?: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const name = sourceName(store);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={item.nome} description={rank ? `${rank}º em ${name}` : name}>
        <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] bg-white"><Photo item={item} big /></div>
          <div>
            <div className="text-[12.5px] text-faint">Melhor preço estimado</div>
            <div className="tabular text-[30px] font-semibold leading-tight tracking-tight">{formatMoney(item.preco_min)}</div>
            <div className="mt-0.5 text-[14px] text-muted">Faixa comum: {formatMoney(item.preco_min)} a {formatMoney(item.preco_max)}</div>
            <p className="mt-4 text-[15px] leading-relaxed text-soft">{item.descricao}</p>
          </div>
        </div>
        <ul className="mt-6 space-y-3 text-[14.5px] leading-relaxed">
          <li className="flex gap-3"><Tag size={17} className="mt-0.5 shrink-0 text-brand-hi" /><span><b className="font-semibold">Por que vende:</b> <span className="text-muted">{item.por_que_vende}</span></span></li>
          {item.publico ? <li className="flex gap-3"><Users size={17} className="mt-0.5 shrink-0 text-brand-hi" /><span><b className="font-semibold">Para quem:</b> <span className="text-muted">{item.publico}</span></span></li> : null}
          {item.dica ? <li className="flex gap-3"><Lightbulb size={17} className="mt-0.5 shrink-0 text-brand-hi" /><span><b className="font-semibold">Dica para vender:</b> <span className="text-muted">{item.dica}</span></span></li> : null}
        </ul>
        <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
          <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary">Ver em {name}<ArrowUpRight size={16} /></a>
          <Link href={`/app/calculadora?canal=${PRESET[store] ?? ""}`} className="btn btn-secondary"><Calculator size={16} />Calcular lucro</Link>
          <Link href={`/app/assistente?q=${encodeURIComponent(`Vale a pena revender "${item.nome}" na ${name}? Como eu começo?`)}`} className="btn btn-secondary"><MessagesSquare size={16} />Perguntar à Wise</Link>
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-faint">Preço estimado e imagem ilustrativa. As ofertas do momento aparecem em “Ver em {name}”.</p>
      </DialogContent>
    </Dialog>
  );
}

function Card({ item, store, rank, index }: { item: EstimateItem; store: string; rank?: number; index: number }) {
  const [open, setOpen] = useState(false);
  const name = sourceName(store);
  return (
    <motion.li initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 18, delay: Math.min(index, 10) * 0.04 }} className="card card-hover group flex flex-col overflow-hidden">
      <button type="button" onClick={() => setOpen(true)} className="flex flex-1 flex-col text-left outline-none" aria-label={`Ver detalhes de ${item.nome}`}>
        <span className="relative m-2 flex aspect-square items-center justify-center overflow-hidden rounded-[12px] bg-white">
          <Photo item={item} />
          {rank ? <span className="tabular absolute left-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-[#18181B]/85 px-2 text-[12.5px] font-semibold text-white backdrop-blur">{rank}º</span> : null}
        </span>
        <span className="flex flex-1 flex-col px-4 pt-2">
          <span className="flex items-center gap-2 text-[12px] text-muted"><SourceMark source={store} size={16} />{name}</span>
          <span className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug group-hover:text-brand-hi">{item.nome}</span>
          <span className="mt-2 text-[11.5px] text-faint">preço estimado</span>
          <span className="tabular text-[19px] font-semibold leading-tight tracking-tight">{formatMoney(item.preco_min)}<span className="text-[14px] font-normal text-muted"> a {formatMoney(item.preco_max)}</span></span>
          <span className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{item.descricao}</span>
        </span>
      </button>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-4 pb-4 pt-4">
        <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary btn-sm">Ver em {name}<ArrowUpRight size={15} /></a>
        <Link href={`/app/calculadora?canal=${PRESET[store] ?? ""}`} className="btn btn-secondary btn-sm !w-10 !px-0" aria-label="Calcular lucro" title="Calcular lucro"><Calculator size={16} /></Link>
      </div>
      <Details item={item} store={store} rank={rank} open={open} onOpenChange={setOpen} />
    </motion.li>
  );
}

function Grid({ items, store, ranked, k }: { items: EstimateItem[]; store: string; ranked?: boolean; k: string }) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
      {items.map((it, i) => <Card key={`${k}:${it.nome}`} item={it} store={store} rank={ranked ? i + 1 : undefined} index={i} />)}
    </ul>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="card overflow-hidden"><div className="skeleton m-2 aspect-square !rounded-[12px]" /><div className="space-y-2.5 p-4"><div className="skeleton h-4" /><div className="skeleton h-4 w-2/3" /><div className="skeleton h-6 w-1/2" /></div></div>)}
      <p className="col-span-full text-center text-[13.5px] text-muted">{text}</p>
    </div>
  );
}

function useEstimates(url: string | null) {
  const [state, setState] = useState<{ url: string; items: EstimateItem[] | null; error: string | null }>({ url: "", items: null, error: null });
  const [nonce, setNonce] = useState(0);
  const k = `${url}#${nonce}`;
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url).then(async (r) => {
      const body = (await r.json().catch(() => null)) as { ideas?: EstimateItem[]; error?: { message: string } } | null;
      if (!alive) return;
      if (!r.ok || !body?.ideas) setState({ url: k, items: null, error: body?.error?.message ?? "Não foi possível carregar agora." });
      else setState({ url: k, items: body.ideas, error: body.ideas.length ? null : "Nada encontrado desta vez. Tente de novo." });
    }).catch(() => { if (alive) setState({ url: k, items: null, error: "Sem conexão. Tente de novo." }); });
    return () => { alive = false; };
  }, [url, k]);
  return { loading: Boolean(url) && state.url !== k, items: state.items, error: state.error, retry: () => setNonce((n) => n + 1), k };
}

function ErrorBox({ text, retry }: { text: string; retry: () => void }) {
  return <div className="card flex flex-col items-center gap-4 p-8 text-center"><p className="text-[15px] text-muted">{text}</p><button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Tentar de novo</button></div>;
}

/** Ranking de mais vendidos por loja e categoria. */
export function AiIdeas({ store }: { store: string }) {
  const [cat, setCat] = useState(CATS[0]!.id);
  const r = useEstimates(`/api/ideas?loja=${store}&categoria=${cat}`);
  const name = sourceName(store);
  return (
    <section aria-label={`Mais vendidos em ${name}`}>
      <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
          {CATS.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={c.id === cat}
              className={cn("chip whitespace-nowrap", c.id === cat && "!bg-none !bg-[#2563EB] !text-white !shadow-none")}>{c.name}</button>
          ))}
        </div>
      </div>
      <div className="mt-7" aria-live="polite">
        {r.loading ? <Loading text={`Carregando os mais vendidos de ${name}…`} /> : r.error ? <ErrorBox text={r.error} retry={r.retry} /> : <Grid items={r.items ?? []} store={store} ranked k={r.k} />}
      </div>
      <p className="mt-6 text-[12px] text-faint">Preços estimados e imagens ilustrativas. Toque em um produto para ver os detalhes.</p>
    </section>
  );
}

/** Resultados de pesquisa por loja. */
export function AiSearchResults({ query, store }: { query: string; store: string | null }) {
  const shown = store ?? "mercadolivre";
  const r = useEstimates(query.trim().length >= 2 ? `/api/ideas/search?q=${encodeURIComponent(query.trim())}${store ? `&loja=${store}` : ""}` : null);
  if (!query.trim()) return null;
  return (
    <section aria-label="Resultados" aria-live="polite">
      <div className="mb-5 flex items-center gap-2 text-[14px] text-muted"><Search size={15} />Resultados para <b className="font-semibold text-fg">“{query.trim()}”</b>{store ? <> em {sourceName(store)}</> : null}</div>
      {r.loading ? <Loading text="Buscando os produtos…" /> : r.error ? <ErrorBox text={r.error} retry={r.retry} /> : <Grid items={r.items ?? []} store={shown} k={r.k} />}
      <p className="mt-6 text-[12px] text-faint">Preços estimados e imagens ilustrativas. Toque em um produto para ver os detalhes.</p>
    </section>
  );
}
