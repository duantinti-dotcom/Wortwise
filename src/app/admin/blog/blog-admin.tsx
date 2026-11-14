"use client";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";

interface Post { id: string; slug: string; title: string; excerpt: string; content_md: string; category: string; status: "draft" | "published"; seo_title: string | null; seo_description: string | null; published_at: string | null }
const EMPTY: Omit<Post, "id" | "published_at"> = { slug: "", title: "", excerpt: "", content_md: "", category: "guias", status: "draft", seo_title: "", seo_description: "" };
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function BlogAdmin() {
  const toast = useToast();
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string; published_at?: string | null }) | null>(null);
  const d = useLoad<Post[]>(async () => {
    const { data, error } = await supabaseBrowser().from("blog_posts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os posts.");
    return (data ?? []) as Post[];
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const row = { slug: editing.slug || slugify(editing.title), title: editing.title.trim(), excerpt: editing.excerpt.trim(), content_md: editing.content_md, category: editing.category.trim() || "guias", status: editing.status,
      seo_title: editing.seo_title?.trim() || null, seo_description: editing.seo_description?.trim() || null, author_id: auth.user?.id, updated_at: new Date().toISOString(),
      published_at: editing.status === "published" ? editing.published_at ?? new Date().toISOString() : null };
    const { error } = editing.id ? await supabase.from("blog_posts").update(row).eq("id", editing.id) : await supabase.from("blog_posts").insert(row);
    if (error) { toast(dbMessage(error, "Não foi possível salvar (verifique o endereço do post)."), "error"); return; }
    await supabase.rpc("admin_log", { p_action: editing.id ? "blog.update" : "blog.create", p_target: row.slug, p_details: { status: row.status } });
    setEditing(null);
    toast("Post salvo");
    d.reload();
  }
  async function remove(p: Post) {
    if (!window.confirm(`Excluir “${p.title}”?`)) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("blog_posts").delete().eq("id", p.id);
    if (!error) await supabase.rpc("admin_log", { p_action: "blog.delete", p_target: p.slug, p_details: {} });
    toast(error ? "Não foi possível excluir." : "Post excluído", error ? "error" : "success");
    d.reload();
  }
  const set = <K extends keyof typeof EMPTY>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setEditing((p) => (p ? { ...p, [k]: e.target.value } : p));

  if (editing) {
    return (
      <form onSubmit={save} className="card grid gap-4 p-6 lg:grid-cols-2">
        <label className="lg:col-span-2"><span className="label">Título</span><input className="input" required maxLength={120} value={editing.title} onChange={set("title")} /></label>
        <label><span className="label">Endereço (slug)</span><input className="input" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder={slugify(editing.title) || "gerado-do-titulo"} value={editing.slug} onChange={set("slug")} /></label>
        <label><span className="label">Categoria</span><input className="input" value={editing.category} onChange={set("category")} maxLength={40} /></label>
        <label className="lg:col-span-2"><span className="label">Resumo (aparece na listagem e como descrição padrão)</span><textarea className="input" rows={2} required maxLength={300} value={editing.excerpt} onChange={set("excerpt")} /></label>
        <label className="lg:col-span-2"><span className="label">Conteúdo (Markdown: ## títulos, listas, **negrito**, [links](https://…))</span><textarea className="input font-mono !text-sm" rows={18} required value={editing.content_md} onChange={set("content_md")} /></label>
        <label><span className="label">Título para SEO (opcional)</span><input className="input" maxLength={70} value={editing.seo_title ?? ""} onChange={set("seo_title")} /></label>
        <label><span className="label">Descrição para SEO (opcional)</span><input className="input" maxLength={160} value={editing.seo_description ?? ""} onChange={set("seo_description")} /></label>
        <label><span className="label">Situação</span><select className="input" value={editing.status} onChange={set("status")}><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
        <div className="flex items-end gap-2"><button className="btn btn-primary flex-1">Salvar</button><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button></div>
      </form>
    );
  }
  return (
    <>
      <button className="btn btn-primary mb-4" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Novo post</button>
      {d.loading ? <Skeleton className="h-40 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : (
        <ul className="card divide-y divide-line">
          {d.data!.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}><span className="block truncate font-medium hover:text-brand-hi">{p.title}</span><span className="text-xs text-faint">/blog/{p.slug} · {p.published_at ? formatDate(p.published_at) : "não publicado"}</span></button>
              <span className={cn("badge", p.status === "published" && "badge-pos")}>{p.status === "published" ? "Publicado" : "Rascunho"}</span>
              {p.status === "published" ? <a className="btn btn-ghost btn-sm !px-2" href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" aria-label="Abrir post"><ExternalLink size={15} /></a> : null}
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => remove(p)} aria-label="Excluir"><Trash2 size={15} /></button>
            </li>
          ))}
          {!d.data!.length ? <li className="px-5 py-8 text-center text-sm text-muted">Nenhum post ainda.</li> : null}
        </ul>
      )}
    </>
  );
}
