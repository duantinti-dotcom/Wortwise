"use client";
import { Bell, Bookmark, ExternalLink, ImageOff, Loader2, Star, Truck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { ProductResult } from "@/lib/connectors/types";
import { dbMessage } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime, SOURCE_LABELS } from "@/lib/utils";
import { useUpgrade } from "./upgrade";

export interface ProductRef { source: string; externalId: string; title: string; imageUrl: string | null; price: number | null; currency: string | null; permalink: string | null }

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={cn("flex flex-col items-center justify-center gap-2 bg-[linear-gradient(160deg,#1c1c1c,#111)] text-faint", className)} aria-label="Imagem não disponível"><ImageOff size={22} /><span className="text-[11px]">Imagem não disponível</span></div>;
  return (
    <div className={cn("flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#ffffff,#ececec)] p-4", className)}>
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
      className={cn("flex size-9 items-center justify-center rounded-full border border-line-strong bg-ink/70 backdrop-blur transition-colors hover:border-white/30", className)}>
      <motion.span key={String(on)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
        <Bookmark size={16} className={on ? "fill-brand text-brand" : "text-fg"} />
      </motion.span>
    </button>
  );
}

export function ProductCard({ p, favorite, onFavorite }: { p: ProductResult; favorite: boolean; onFavorite?: (v: boolean) => void }) {
  const discount = p.originalPrice && p.price && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : null;
  return (
    <Link href={`/app/produto/${p.source}/${p.externalId}`} className="card card-hover group relative flex flex-col overflow-hidden !rounded-2xl">
      <div className="relative m-2 overflow-hidden rounded-xl">
        <ProductImage src={p.imageUrl} alt={p.title} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <FavoriteButton key={String(favorite)} product={p} initial={favorite} onChange={onFavorite} className="absolute right-2.5 top-2.5" />
        <span className="badge absolute bottom-2.5 left-2.5 !border-black/10 !bg-ink/85 !text-fg backdrop-blur">{SOURCE_LABELS[p.source] ?? p.source}</span>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
        <h3 className="line-clamp-2 text-[14px] font-medium leading-snug group-hover:text-brand-hi">{p.title}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className={cn("tabular text-xl font-semibold tracking-tight", p.price == null && "text-sm font-normal text-faint")}>{formatMoney(p.price, p.currency ?? "BRL")}</span>
          {discount ? <span className="badge badge-pos !h-5 !px-1.5 !text-[11px]">−{discount}%</span> : null}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1"><Star size={12} className={p.rating != null ? "fill-brand text-brand" : "text-faint"} />
            {p.rating != null ? `${p.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${p.reviewsCount != null ? ` (${p.reviewsCount.toLocaleString("pt-BR")})` : ""}` : "Sem avaliação na fonte"}</span>
          {p.freeShipping ? <span className="flex items-center gap-1 text-pos"><Truck size={12} /> Frete grátis</span> : null}
        </div>
        <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-faint">
          <span className="truncate">{p.sellerName ?? (p.kind === "catalog_product" ? "Ficha de catálogo" : "Vendedor não informado")}</span>
          <span className="shrink-0">coletado {relativeTime(p.collectedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="skeleton aspect-[4/3] w-full !rounded-none" />
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
