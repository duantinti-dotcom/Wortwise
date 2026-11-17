"use client";
import { Bell, Bookmark, ExternalLink, Flame, ImageOff, Loader2, Lock, Star, Truck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { ProductResult } from "@/lib/connectors/types";
import { dbMessage } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime, SOURCE_LABELS } from "@/lib/utils";
import { useUpgrade } from "./upgrade";
import { SourceMark } from "@/components/source-mark";

export interface ProductRef { source: string; externalId: string; title: string; imageUrl: string | null; price: number | null; currency: string | null; permalink: string | null }

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={cn("flex flex-col items-center justify-center gap-2 bg-surface-2 text-faint", className)} aria-label="Imagem não disponível"><ImageOff size={22} /><span className="text-[11px]">Imagem não disponível</span></div>;
  return (
    <div className={cn("flex items-center justify-center bg-white p-5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain mix-blend-multiply" />
    </div>
  );
}

export function FavoriteButton({ product, initial, onChange, className }: { product: ProductRef; initial: boolean; onChange?: (v: boolean) => void; className?: string }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next); // resposta imediata; desfaz se o servidor recusar
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const { error } = !uid ? { error: { message: "sessão" } } : next
      ? await supabase.from("favorites").upsert({ user_id: uid, source: product.source, external_id: product.externalId, title: product.title.slice(0, 300), image_url: product.imageUrl, price: product.price, currency: product.currency, permalink: product.permalink })
      : await supabase.from("favorites").delete().eq("source", product.source).eq("external_id", product.externalId);
    setBusy(false);
    if (error) { setOn(!next); toast(dbMessage(error, "Não foi possível atualizar os favoritos."), "error"); return; }
    onChange?.(next);
    toast(next ? "Salvo nos favoritos" : "Removido dos favoritos");
  }
  return (
    <button onClick={toggle} aria-pressed={on} aria-label={on ? "Remover dos favoritos" : "Salvar nos favoritos"}
      className={cn("flex size-9 items-center justify-center rounded-full border border-line-strong bg-ink/70 backdrop-blur transition-colors hover:border-tint/30", className)}>
      <motion.span key={String(on)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
        <Bookmark size={16} className={on ? "fill-brand text-brand" : "text-fg"} />
      </motion.span>
    </button>
  );
}


/**
 * Cartão de produto: foto grande, preço, sinais da fonte e acesso direto ao anúncio.
 * O cartão inteiro abre a análise no Worthwise; o botão da fonte abre o anúncio original em nova aba.
 */
/** Mini gráfico do preço (observações reais guardadas pelo Worthwise). */
export function Sparkline({ points }: { points: { date: string; price: number }[] }) {
  const ps = points.map((x) => x.price);
  const min = Math.min(...ps), max = Math.max(...ps), span = max - min || 1;
  const w = 120, h = 32;
  const d = ps.map((v, i) => `${i ? "L" : "M"}${((i / (ps.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`).join(" ");
  const first = ps[0]!, last = ps.at(-1)!;
  const pct = first ? ((last - first) / first) * 100 : 0;
  const up = pct > 0.5, down = pct < -0.5;
  const color = up ? "#F87171" : down ? "#4ADE80" : "#A1A1AA";
  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="h-8 w-full max-w-[120px]" aria-hidden><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className={cn("tabular shrink-0 text-[12.5px] font-semibold", up ? "text-neg" : down ? "text-pos" : "text-muted")} title={`Desde ${relativeTime(points[0]!.date)}`}>
        {up ? "▲" : down ? "▼" : "="} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </span>
    </div>
  );
}

/** 16042 → "16 mil", 250000 → "250 mil", 1200000 → "1,2 mi". */
function compactNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.floor(n / 1000).toLocaleString("pt-BR")} mil`;
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR");
}

const CALC_PRESET: Record<string, string> = { mercadolivre: "mercadolivre-classico", shopee: "shopee", amazon: "amazon", tiktokshop: "tiktokshop" };

interface Alt { source: string; title: string; price: number | null; imageUrl: string | null; permalink: string | null; rating: number | null; soldQuantity: number | null }

/** Janela do produto: anúncio na loja, cálculo de lucro e onde comprar mais barato (sem gastar crédito). */
function ProductSheet({ p, open, onOpenChange, analyzeHref }: { p: ProductResult; open: boolean; onOpenChange: (v: boolean) => void; analyzeHref: string | null }) {
  const [data, setData] = useState<{ offers: Alt[]; links: { name: string; note: string; url: string }[] } | null>(null);
  const source = SOURCE_LABELS[p.source] ?? p.source;
  const loading = open && !data;
  useEffect(() => {
    if (!open || data) return;
    let alive = true;
    const qs = new URLSearchParams({ title: p.title, id: p.externalId, ...(p.price != null ? { price: String(p.price) } : {}) });
    fetch(`/api/alternatives?${qs}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setData(d ?? { offers: [], links: [] }); })
      .catch(() => { if (alive) setData({ offers: [], links: [] }); });
    return () => { alive = false; };
  }, [open, data, p.title, p.externalId, p.price]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={p.title} description={source}>
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <div className="overflow-hidden rounded-[14px] bg-white"><ProductImage src={p.imageUrl} alt={p.title} className="aspect-square w-full" /></div>
          <div>
            <div className="tabular text-[28px] font-semibold tracking-tight">{formatMoney(p.price, p.currency ?? "BRL")}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
              {p.soldQuantity ? <span className="flex items-center gap-1 font-semibold text-pos"><Flame size={14} />{p.soldQuantity.toLocaleString("pt-BR")} vendidos</span> : null}
              {p.rating != null ? <span className="flex items-center gap-1"><Star size={13} className="fill-brand text-brand" />{p.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{p.reviewsCount ? ` (${p.reviewsCount.toLocaleString("pt-BR")})` : ""}</span> : null}
              {p.sellerName ? <span>{p.sellerName}</span> : null}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary">Ver anúncio na loja<ExternalLink size={15} /></a> : null}
              {p.price != null ? <Link href={`/app/calculadora?canal=${CALC_PRESET[p.source] ?? ""}&preco=${p.price}`} className="btn btn-secondary">Calcular lucro</Link> : null}
              {analyzeHref ? <Link href={analyzeHref} className="btn btn-secondary sm:col-span-2">Análise completa e histórico</Link> : null}
            </div>
          </div>
        </div>

        <h3 className="mt-8 text-[17px] font-semibold">Onde comprar mais barato para revender</h3>
        {loading || !data ? <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div> : (
          <>
            {data.offers.length ? (
              <ul className="mt-3 space-y-2">
                {data.offers.map((o) => (
                  <li key={o.permalink}>
                    <a href={o.permalink ?? "#"} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-xl border border-tint/[0.08] bg-tint/[0.03] p-2.5 transition-colors hover:bg-tint/[0.07]">
                      <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-white"><ProductImage src={o.imageUrl} alt="" className="size-12" /></span>
                      <span className="min-w-0 flex-1"><span className="line-clamp-1 text-[13.5px]">{o.title}</span><span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted"><SourceMark source={o.source} size={14} />{SOURCE_LABELS[o.source] ?? o.source}{o.soldQuantity ? ` · ${o.soldQuantity.toLocaleString("pt-BR")} vendidos` : ""}</span></span>
                      <span className="text-right"><span className="tabular block text-[15px] font-semibold text-pos">{formatMoney(o.price)}</span>{p.price && o.price ? <span className="text-[11.5px] text-muted">{Math.round((1 - o.price / p.price) * 100)}% mais barato</span> : null}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[14px] text-muted">Não achamos o mesmo produto mais barato entre os produtos que acompanhamos. Use as buscas abaixo, já ordenadas do menor preço.</p>}
            {data.links.length ? (
              <>
                <p className="mt-5 text-[13px] font-semibold text-muted">Buscar fornecedores (do menor preço)</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {data.links.map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center justify-between gap-2 rounded-xl border border-tint/[0.08] px-3.5 py-2.5 text-[13.5px] hover:bg-tint/[0.06]">
                      <span><b className="font-semibold">{l.name}</b> <span className="text-muted">· {l.note}</span></span><ExternalLink size={14} className="shrink-0 text-muted" />
                    </a>
                  ))}
                </div>
              </>
            ) : null}
            <p className="mt-4 text-[11.5px] text-faint">Preços das lojas no momento da coleta. Confira frete, prazo e reputação do vendedor antes de comprar.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProductCard({ p, favorite, onFavorite, rank, history }: { p: ProductResult; favorite: boolean; onFavorite?: (v: boolean) => void; rank?: number; history?: { date: string; price: number }[] }) {
  const discount = p.originalPrice && p.price && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : null;
  const source = SOURCE_LABELS[p.source] ?? p.source;
  // Amazon, Shopee e TikTok Shop: o botão abre o produto direto na loja (sem gastar crédito de consulta).
  const external = (p.source === "amazon" || (p.provider === "geckoapi" && p.source !== "mercadolivre")) && Boolean(p.permalink);
  const analyzeHref = external ? p.permalink! : `/app/produto/${p.source}/${p.externalId}`;
  const [open, setOpen] = useState(false);
  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden">
      <ProductSheet p={p} open={open} onOpenChange={setOpen} analyzeHref={external ? null : analyzeHref} />
      <div className="relative m-2 overflow-hidden rounded-[10px]">
        <ProductImage src={p.imageUrl} alt={p.title} className="aspect-square w-full transition-transform duration-700 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.05]" />
        {rank != null ? (
          <span className={cn("tabular absolute left-2.5 top-2.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] font-semibold shadow-sm",
            "bg-[#18181B] text-white")}>{rank}º</span>
        ) : discount ? <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-pos px-1.5 py-0.5 text-[11.5px] font-semibold text-white">−{discount}%</span> : null}
        <FavoriteButton key={String(favorite)} product={p} initial={favorite} onChange={onFavorite} className="absolute right-2.5 top-2.5 z-10" />
        {p.fastDelivery ? <span className="absolute bottom-2.5 right-2.5 z-10 rounded-md bg-[#00a8e1] px-1.5 py-0.5 text-[11px] font-semibold text-white">Prime</span> : null}
        {p.freeShipping ? <span className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1 rounded-md bg-[#00a650] px-1.5 py-0.5 text-[11px] font-semibold text-white"><Truck size={12} /> Frete grátis</span> : null}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <SourceMark source={p.source} size={16} /><span>{source}</span>
          {p.salesRank ? <span className="ml-auto text-brand-hi" title={p.salesRank.category ? `Ranking de vendas em ${p.salesRank.category}` : "Ranking de vendas"}>#{p.salesRank.rank.toLocaleString("pt-BR")} em vendas</span> : null}
        </div>
        <h3 className="mt-2.5 line-clamp-2 text-[14.5px] font-medium leading-snug">
          <button type="button" onClick={() => setOpen(true)} className="text-left outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-brand-hi">{p.title}</button>
        </h3>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("tabular text-[20px] font-semibold tracking-tight", p.price == null && "text-sm font-normal text-faint")}>{formatMoney(p.price, p.currency ?? "BRL")}</span>
          {p.originalPrice && discount ? <span className="tabular text-xs text-faint line-through">{formatMoney(p.originalPrice, p.currency ?? "BRL")}</span> : null}
          {rank != null && discount ? <span className="badge badge-pos !h-5 !px-1.5 !text-[11px]">−{discount}%</span> : null}
        </div>
        {p.soldLabel ? <div className="mt-1.5 text-[13px] font-medium text-pos">{p.soldLabel}</div>
          : p.soldQuantity ? <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-pos"><Flame size={13} />{p.source === "mercadolivre" ? "+" : ""}{compactNumber(p.soldQuantity)} vendidos</div> : null}
        {history ? (
          <div className="mt-3">
            <div className="text-[11.5px] text-faint">Preço nos últimos dias</div>
            {history.length >= 2 ? <Sparkline points={history} /> : <div className="text-[12.5px] text-muted">Acompanhando desde hoje</div>}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {p.rating != null ? <span className="flex items-center gap-1"><Star size={12} className="fill-brand text-brand" />{p.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{p.reviewsCount != null ? ` (${p.reviewsCount.toLocaleString("pt-BR")})` : ""}</span> : null}
          {p.sellerName ? <span className="truncate">{p.sellerName}</span> : null}
        </div>
        <div className="relative z-10 mt-auto grid grid-cols-[1fr_auto] gap-2 pt-4">
          <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm">Ver detalhes</button>
          {p.permalink ? (
            <a href={p.permalink} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm !w-9 !px-0" aria-label={`Abrir anúncio no ${source}`} title={`Abrir anúncio no ${source}`}>
              <ExternalLink size={15} />
            </a>
          ) : null}
        </div>
        {p.price != null ? <Link href={`/app/calculadora?canal=${CALC_PRESET[p.source] ?? ""}&preco=${p.price}`} className="relative z-10 mt-2.5 text-[12.5px] font-medium text-brand-hi hover:underline">Calcular lucro e preço recomendado</Link> : null}
      </div>
    </article>
  );
}

/** Espaço de um produto bloqueado pelo plano (o dado não é enviado ao navegador). */
export function LockedCard({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button type="button" onClick={onUnlock} className="card group relative flex flex-col overflow-hidden !rounded-[14px] text-left">
      <div className="m-2 aspect-square rounded-[10px] bg-[repeating-linear-gradient(135deg,rgb(var(--tint)/0.04)_0_10px,transparent_10px_20px)]" />
      <div className="space-y-2.5 px-4 pb-5 pt-2" aria-hidden><div className="h-3 w-24 rounded-full bg-tint/10" /><div className="h-4 w-full rounded-full bg-tint/10" /><div className="h-6 w-28 rounded-full bg-tint/10" /></div>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/40 text-center backdrop-blur-[3px]">
        <span className="flex size-10 items-center justify-center rounded-[10px] border border-tint/15 bg-surface text-brand shadow-sm"><Lock size={17} /></span>
        <span className="text-sm font-semibold">Disponível no Pro</span>
      </span>
    </button>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden !rounded-[14px]" aria-hidden="true">
      <div className="skeleton m-2 aspect-square !rounded-[10px]" />
      <div className="space-y-3 p-4"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-2/3" /><div className="skeleton h-6 w-24" /><div className="skeleton h-3 w-40" /></div>
    </div>
  );
}

/** Criação de monitoramento (Worthwise Watch). A cota do plano é validada no banco. */
export function WatchDialog({ product, open, onOpenChange }: { product: ProductRef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rule, setRule] = useState<"price_below" | "price_drop_pct" | "any_change">("price_below");
  const [threshold, setThreshold] = useState(product.price ? String(Math.floor(product.price * 0.9)) : "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { openUpgrade } = useUpgrade();
  async function save() {
    setBusy(true);
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const value = Number(threshold.replace(",", "."));
    if (rule !== "any_change" && !(value > 0)) { setBusy(false); toast("Informe um valor maior que zero.", "error"); return; }
    const { error } = await supabase.from("watches").insert({
      user_id: auth.user?.id, source: product.source, external_id: product.externalId, title: product.title.slice(0, 300), image_url: product.imageUrl,
      permalink: product.permalink, rule_type: rule, threshold: rule === "any_change" ? null : value, last_price: product.price, last_currency: product.currency,
    });
    setBusy(false);
    if (error) {
      if (error.message.includes("quota_exceeded")) { onOpenChange(false); openUpgrade("Monitoramento faz parte dos planos pagos"); return; }
      toast(dbMessage(error, "Não foi possível criar o monitoramento."), "error");
      return;
    }
    onOpenChange(false);
    toast("Monitoramento criado");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Monitorar este produto" description="O Worthwise consulta a fonte periodicamente e avisa quando a regra for atendida.">
        <div className="space-y-4">
          <label className="block"><span className="label">Avise-me quando</span>
            <select className="input" value={rule} onChange={(e) => setRule(e.target.value as typeof rule)}>
              <option value="price_below">o preço ficar abaixo de um valor</option>
              <option value="price_drop_pct">o preço cair um percentual</option>
              <option value="any_change">o preço mudar</option>
            </select></label>
          {rule !== "any_change" ? (
            <label className="block"><span className="label">{rule === "price_below" ? "Valor alvo (R$)" : "Queda mínima (%)"}</span>
              <input className="input tabular" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={rule === "price_below" ? "40,00" : "10"} /></label>
          ) : null}
          <p className="text-xs leading-relaxed text-faint">Preço atual observado: {formatMoney(product.price, product.currency ?? "BRL")}. As verificações respeitam os limites da fonte e podem levar algumas horas.</p>
          <button className="btn btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />} Criar monitoramento</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SourceLink({ href }: { href: string | null }) {
  if (!href) return <span className="text-sm text-faint">Link original não disponível</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm">Ver anúncio original <ExternalLink size={13} /></a>;
}
