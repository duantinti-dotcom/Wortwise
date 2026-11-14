"use client";
import { Bookmark, FolderPlus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProductImage } from "@/components/app/product-bits";
import { useUpgrade } from "@/components/app/upgrade";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMoney, relativeTime, SOURCE_LABELS } from "@/lib/utils";

interface Fav { source: string; external_id: string; title: string; image_url: string | null; price: number | null; currency: string | null; snapshot_at: string }
interface Item { collection_id: string; source: string; external_id: string; title: string; image_url: string | null }
interface Col { id: string; name: string; description: string | null; collection_items: Item[] }

export function Favorites() {
  const toast = useToast();
  const { openUpgrade } = useUpgrade();
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const data = useLoad(async () => {
    const supabase = supabaseBrowser();
    const [f, c] = await Promise.all([
      supabase.from("favorites").select("source, external_id, title, image_url, price, currency, snapshot_at").order("created_at", { ascending: false }),
      supabase.from("collections").select("id, name, description, collection_items(collection_id, source, external_id, title, image_url)").order("created_at"),
    ]);
    if (f.error || c.error) throw new Error("Não foi possível carregar seus favoritos.");
    return { favs: (f.data ?? []) as Fav[], cols: (c.data ?? []) as Col[] };
  });

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("collections").insert({ user_id: auth.user?.id, name: name.trim(), description: desc.trim() || null });
    if (error?.message.includes("quota_exceeded")) { setCreating(false); openUpgrade("Você atingiu o limite de coleções do seu plano"); return; }
    if (error) { toast(dbMessage(error), "error"); return; }
    setCreating(false); setName(""); setDesc("");
    toast("Coleção criada");
    data.reload();
  }
  async function addTo(col: Col, f: Fav) {
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("collection_items").upsert({ collection_id: col.id, user_id: auth.user?.id, source: f.source, external_id: f.external_id, title: f.title, image_url: f.image_url });
    toast(error ? dbMessage(error) : `Adicionado a “${col.name}”`, error ? "error" : "success");
    if (!error) data.reload();
  }
  async function removeFav(f: Fav) {
    const { error } = await supabaseBrowser().from("favorites").delete().eq("source", f.source).eq("external_id", f.external_id);
    toast(error ? "Não foi possível remover." : "Removido dos favoritos", error ? "error" : "success");
    if (!error) data.reload();
  }
  async function removeItem(i: Item) {
    const { error } = await supabaseBrowser().from("collection_items").delete().eq("collection_id", i.collection_id).eq("source", i.source).eq("external_id", i.external_id);
    if (!error) data.reload();
  }
  async function removeCollection(c: Col) {
    if (!window.confirm(`Excluir a coleção “${c.name}”? Os produtos continuam nos favoritos.`)) return;
    const { error } = await supabaseBrowser().from("collections").delete().eq("id", c.id);
    toast(error ? "Não foi possível excluir." : "Coleção excluída", error ? "error" : "success");
    if (!error) { setActive(null); data.reload(); }
  }

  const cols = data.data?.cols ?? [];
  const current = cols.find((c) => c.id === active) ?? null;

  return (
    <>
      <PageHeader title="Salvos" description="Os produtos que você marcou com o ícone de salvar. Organize em listas, como “Para testar” ou “Para dezembro”."
        action={<button className="btn btn-secondary" onClick={() => setCreating(true)}><FolderPlus size={16} /> Nova coleção</button>} />
      {data.loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 !rounded-2xl" />)}</div>
        : data.error ? <ErrorNote onRetry={data.reload}>{data.error}</ErrorNote> : (
        <>
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist">
            <button role="tab" aria-selected={!active} onClick={() => setActive(null)} className={cn("badge !h-9 shrink-0 cursor-pointer !px-4 !text-sm", !active && "badge-brand")}>Todos os favoritos · {data.data!.favs.length}</button>
            {cols.map((c) => <button key={c.id} role="tab" aria-selected={active === c.id} onClick={() => setActive(c.id)} className={cn("badge !h-9 shrink-0 cursor-pointer !px-4 !text-sm", active === c.id && "badge-brand")}>{c.name} · {c.collection_items.length}</button>)}
          </div>

          {current ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-muted">{current.description ?? "Sem descrição."}</p>
                <button className="btn btn-ghost btn-sm" onClick={() => removeCollection(current)}><Trash2 size={14} /> Excluir coleção</button></div>
              {current.collection_items.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {current.collection_items.map((i) => (
                    <div key={`${i.source}:${i.external_id}`} className="card relative overflow-hidden">
                      <Link href={`/app/produto/${i.source}/${i.external_id}`}><ProductImage src={i.image_url} alt={i.title} className="aspect-[4/3] w-full" />
                        <div className="p-4 text-sm font-medium leading-snug"><span className="line-clamp-2">{i.title}</span></div></Link>
                      <button onClick={() => removeItem(i)} aria-label="Remover da coleção" className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full border border-line-strong bg-ink/80"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={FolderPlus} title="Coleção vazia">Abra “Todos os favoritos” e use o botão + para adicionar produtos a esta coleção.</EmptyState>}
            </>
          ) : data.data!.favs.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.data!.favs.map((f) => (
                <div key={`${f.source}:${f.external_id}`} className="card card-hover relative flex flex-col overflow-hidden">
                  <Link href={`/app/produto/${f.source}/${f.external_id}`} className="flex flex-1 flex-col">
                    <ProductImage src={f.image_url} alt={f.title} className="aspect-[4/3] w-full" />
                    <div className="flex flex-1 flex-col p-4"><span className="line-clamp-2 text-sm font-medium leading-snug">{f.title}</span>
                      <span className="tabular mt-2 text-base font-semibold">{formatMoney(f.price, f.currency ?? "BRL")}</span>
                      <span className="mt-auto pt-2 text-[11px] text-faint">{SOURCE_LABELS[f.source] ?? f.source} · preço salvo {relativeTime(f.snapshot_at)}</span></div>
                  </Link>
                  <div className="absolute right-2.5 top-2.5 flex gap-1.5">
                    <Menu><MenuTrigger aria-label="Adicionar a uma coleção" className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-ink/80 outline-none"><Plus size={15} /></MenuTrigger>
                      <MenuContent><MenuLabel>Adicionar à coleção</MenuLabel>
                        {cols.length ? cols.map((c) => <MenuItem key={c.id} onSelect={() => addTo(c, f)}>{c.name}</MenuItem>) : <MenuItem onSelect={() => setCreating(true)}><FolderPlus size={14} /> Criar coleção</MenuItem>}
                      </MenuContent></Menu>
                    <button onClick={() => removeFav(f)} aria-label="Remover dos favoritos" className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-ink/80"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Bookmark} title="Nenhum favorito ainda" action={<Link href="/app/descobrir" className="btn btn-primary">Descobrir produtos</Link>}>Toque no marcador de um produto para salvá-lo aqui.</EmptyState>}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Nova coleção" description="Coleções são privadas e visíveis apenas para você.">
          <form onSubmit={createCollection} className="space-y-4">
            <label className="block"><span className="label">Nome</span><input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Produtos para testar" autoFocus /></label>
            <label className="block"><span className="label">Descrição (opcional)</span><textarea className="input" rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <button className="btn btn-primary w-full" disabled={!name.trim()}>Criar coleção</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
