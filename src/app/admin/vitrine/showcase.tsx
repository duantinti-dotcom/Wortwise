"use client";
import { ExternalLink, Loader2, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { SourceMark, sourceName } from "@/components/source-mark";
import { useToast } from "@/components/ui/toast";
import { dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

interface Item { id: string; store: string; title: string; image_url: string | null; link: string; price: number | null; rating: number | null; reviews_count: number | null; sold_text: string | null; category: string | null; position: number; active: boolean; updated_at: string }
const STORES = ["mercadolivre", "shopee", "amazon", "tiktokshop"] as const;
const EMPTY = { store: "tiktokshop", title: "", image_url: "", link: "", price: "", rating: "", reviews_count: "", sold_text: "", category: "", position: "100" };

function guessStore(link: string) {
  if (/mercadoli(vre|bre)|meli\.la/i.test(link)) return "mercadolivre";
  if (/shopee|shp\.ee/i.test(link)) return "shopee";
  if (/amazon|amzn/i.test(link)) return "amazon";
  if (/tiktok/i.test(link)) return "tiktokshop";
  return null;
}
const toNum = (v: string) => { const n = Number(v.replace(/\./g, "").replace(",", ".")); return v.trim() && Number.isFinite(n) ? n : null; };
const https = (u: string) => u.trim().replace(/^http:\/\//i, "https://");

export function ShowcaseAdmin() {
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState<"" | "preview" | "save">("");
  const list = useLoad<Item[]>(async () => {
    const { data, error } = await supabaseBrowser().from("curated_products").select("*").order("store").order("position").order("created_at", { ascending: false });
    if (error) throw new Error(dbMessage(error));
    return (data ?? []) as Item[];
  });
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function preview() {
    if (!f.link.trim()) return;
    setBusy("preview");
    const r = await fetch(`/api/admin/vitrine?url=${encodeURIComponent(f.link.trim())}`);
    const j = (await r.json().catch(() => null)) as { ok?: boolean; link?: string; title?: string | null; image?: string | null; price?: number | null; rating?: number | null; reviews?: number | null; message?: string; error?: { message: string } } | null;
    setBusy("");
    if (!r.ok || !j) { toast(j?.error?.message ?? "Não foi possível ler o link.", "error"); return; }
    if (!j.ok) { toast(j.message ?? "Preencha os campos à mão.", "error"); return; }
    setF((x) => ({
      ...x, link: j.link ?? x.link, store: guessStore(j.link ?? x.link) ?? x.store,
      title: j.title ?? x.title, image_url: j.image ? https(j.image) : x.image_url,
      price: j.price != null ? String(j.price).replace(".", ",") : x.price,
      rating: j.rating != null ? String(j.rating).replace(".", ",") : x.rating,
      reviews_count: j.reviews != null ? String(Math.round(j.reviews)) : x.reviews_count,
    }));
    toast(j.title ? "Dados preenchidos. Confira antes de salvar." : "A loja não informou os dados nesse link. Preencha à mão.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https:\/\//i.test(f.link.trim())) { toast("O link precisa começar com https://", "error"); return; }
    setBusy("save");
    const { error } = await supabaseBrowser().from("curated_products").insert({
      store: f.store, title: f.title.trim(), link: f.link.trim(), image_url: f.image_url.trim() ? https(f.image_url) : null,
      price: toNum(f.price), rating: toNum(f.rating), reviews_count: toNum(f.reviews_count), sold_text: f.sold_text.trim() || null,
      category: f.category.trim() || null, position: Number(f.position) || 100,
    });
    setBusy("");
    if (error) { toast(dbMessage(error, "Não foi possível salvar. Confira os campos."), "error"); return; }
    toast("Produto adicionado à vitrine");
    setF({ ...EMPTY, store: f.store });
    list.reload();
  }

  async function update(id: string, patch: Partial<Item>) {
    const { error } = await supabaseBrowser().from("curated_products").update(patch).eq("id", id);
    if (error) toast(dbMessage(error), "error"); else { toast("Atualizado"); list.reload(); }
  }
  async function remove(id: string) {
    if (!window.confirm("Remover este produto da vitrine?")) return;
    const { error } = await supabaseBrowser().from("curated_products").delete().eq("id", id);
    if (error) toast(dbMessage(error), "error"); else list.reload();
  }

  return (
    <div className="space-y-10">
      <form onSubmit={save} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="v-link">Link do produto na loja</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="v-link" className="input" placeholder="https://..." value={f.link} onChange={set("link")} required />
            <button type="button" onClick={preview} disabled={!f.link.trim() || busy !== ""} className="btn btn-secondary shrink-0">{busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}Preencher pelo link</button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="label">Loja</span>
            <select className="input" value={f.store} onChange={set("store")}>{STORES.map((s) => <option key={s} value={s}>{sourceName(s)}</option>)}</select></label>
          <label className="block sm:col-span-1 lg:col-span-3"><span className="label">Nome do produto</span><input className="input" value={f.title} onChange={set("title")} required minLength={2} maxLength={300} /></label>
          <label className="block lg:col-span-2"><span className="label">Link da foto (https)</span><input className="input" value={f.image_url} onChange={set("image_url")} placeholder="Toque e segure a foto na loja → copiar endereço" /></label>
          <label className="block"><span className="label">Preço (R$)</span><input className="input" inputMode="decimal" value={f.price} onChange={set("price")} placeholder="49,90" /></label>
          <label className="block"><span className="label">Posição no ranking</span><input className="input" inputMode="numeric" value={f.position} onChange={set("position")} /></label>
          <label className="block"><span className="label">Avaliação (0 a 5)</span><input className="input" inputMode="decimal" value={f.rating} onChange={set("rating")} placeholder="4,8" /></label>
          <label className="block"><span className="label">Nº de avaliações</span><input className="input" inputMode="numeric" value={f.reviews_count} onChange={set("reviews_count")} /></label>
          <label className="block"><span className="label">Vendidos (como a loja mostra)</span><input className="input" value={f.sold_text} onChange={set("sold_text")} placeholder="+10 mil vendidos" maxLength={60} /></label>
          <label className="block"><span className="label">Categoria</span><input className="input" value={f.category} onChange={set("category")} placeholder="Casa" maxLength={60} /></label>
        </div>
        {f.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={https(f.image_url)} alt="" className="size-28 rounded-xl bg-white object-contain p-2" />
        ) : null}
        <button className="btn btn-primary" disabled={busy !== ""}>{busy === "save" ? <Loader2 size={16} className="animate-spin" /> : null}Adicionar à vitrine</button>
      </form>

      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">Produtos na vitrine ({list.data?.length ?? 0})</h2>
        <ul className="mt-4 space-y-3">
          {(list.data ?? []).map((it) => (
            <li key={it.id} className={cn("card flex flex-wrap items-center gap-4 p-4", !it.active && "opacity-60")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.image_url ? <img src={it.image_url} alt="" className="size-16 rounded-lg bg-white object-contain p-1" /> : <span className="size-16 rounded-lg bg-tint/10" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px] text-muted"><SourceMark source={it.store} size={16} />{sourceName(it.store)} · {it.position}º · atualizado {relativeTime(it.updated_at)}</div>
                <div className="truncate font-medium">{it.title}</div>
                <div className="text-[13px] text-muted">{formatMoney(it.price)}{it.rating ? ` · ★ ${it.rating}` : ""}{it.sold_text ? ` · ${it.sold_text}` : ""}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => { const v = window.prompt("Novo preço (R$)", it.price != null ? String(it.price).replace(".", ",") : ""); const n = v ? toNum(v) : null; if (n != null) void update(it.id, { price: n }); }}>Atualizar preço</button>
                <button className="btn btn-secondary btn-sm" onClick={() => void update(it.id, { active: !it.active })}>{it.active ? "Ocultar" : "Mostrar"}</button>
                <a href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm !w-10 !px-0" aria-label="Abrir na loja"><ExternalLink size={15} /></a>
                <button className="btn btn-secondary btn-sm !w-10 !px-0" onClick={() => void remove(it.id)} aria-label="Remover"><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
          {!list.loading && !list.data?.length ? <li className="text-[14px] text-muted">Nenhum produto ainda. Cole o primeiro link acima.</li> : null}
        </ul>
      </section>
    </div>
  );
}
