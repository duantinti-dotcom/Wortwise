"use client";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { VerificationBadge } from "@/components/app/supplier-status";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Row { id: string; name: string; cnpj: string | null; website: string | null; city: string | null; state: string | null; categories: string[]; verification_status: string }

export function DirectoryAdmin() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const d = useLoad<Row[]>(async () => {
    const { data, error } = await supabaseBrowser().from("suppliers").select("id, name, cnpj, website, city, state, categories, verification_status").is("owner_id", null).order("name");
    if (error) throw new Error("Não foi possível carregar o diretório.");
    return (data ?? []) as Row[];
  });
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cnpj = String(f.get("cnpj")).replace(/\D/g, "");
    if (cnpj.length !== 14) { toast("CNPJ com 14 dígitos é obrigatório no diretório.", "error"); return; }
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("suppliers").insert({ owner_id: null, name: String(f.get("name")).trim(), cnpj, website: String(f.get("website")).trim() || null,
      city: String(f.get("city")).trim() || null, state: String(f.get("state")).trim().toUpperCase().slice(0, 2) || null, categories: String(f.get("categories")).split(",").map((c) => c.trim()).filter(Boolean) });
    if (error) { toast(dbMessage(error), "error"); return; }
    await supabase.rpc("admin_log", { p_action: "supplier.publish", p_target: cnpj, p_details: {} });
    (e.target as HTMLFormElement).reset();
    toast("Fornecedor publicado (ainda não verificado)");
    d.reload();
  }
  async function verify(id: string) {
    setBusy(id);
    const r = await api<{ status: string; situacao: string | null }>("/api/suppliers/verify", { method: "POST", json: { supplierId: id } });
    setBusy(null);
    toast(r.ok ? `Situação cadastral: ${r.data.situacao ?? "não confirmada"}` : r.error.message, r.ok && r.data.status === "passed" ? "success" : "info");
    d.reload();
  }
  async function remove(r: Row) {
    if (!window.confirm(`Remover “${r.name}” do diretório?`)) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("suppliers").delete().eq("id", r.id);
    if (!error) await supabase.rpc("admin_log", { p_action: "supplier.remove", p_target: r.cnpj ?? r.id, p_details: {} });
    toast(error ? "Não foi possível remover." : "Removido do diretório", error ? "error" : "success");
    d.reload();
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={add} className="card h-fit space-y-4 p-5">
        <h2 className="font-semibold">Publicar fornecedor</h2>
        <label className="block"><span className="label">Nome comercial</span><input name="name" className="input" required minLength={2} maxLength={160} /></label>
        <label className="block"><span className="label">CNPJ</span><input name="cnpj" className="input tabular" required inputMode="numeric" maxLength={18} /></label>
        <label className="block"><span className="label">Site oficial</span><input name="website" className="input" type="url" placeholder="https://" /></label>
        <div className="grid grid-cols-[1fr_80px] gap-3"><label><span className="label">Cidade</span><input name="city" className="input" /></label><label><span className="label">UF</span><input name="state" className="input" maxLength={2} /></label></div>
        <label className="block"><span className="label">Categorias (vírgula)</span><input name="categories" className="input" /></label>
        <button className="btn btn-primary w-full">Publicar</button>
      </form>
      {d.loading ? <Skeleton className="h-48 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : (
        <ul className="card h-fit divide-y divide-line">
          {d.data!.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <div className="min-w-0 flex-1"><div className="font-medium">{r.name}</div><div className="text-xs text-faint">{r.cnpj} · {r.city ?? "—"}{r.state ? `/${r.state}` : ""} · {r.categories.join(", ") || "sem categorias"}</div></div>
              <VerificationBadge status={r.verification_status} />
              <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => verify(r.id)}>{busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verificar</button>
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => remove(r)} aria-label="Remover"><Trash2 size={15} /></button>
            </li>
          ))}
          {!d.data!.length ? <li className="px-5 py-8 text-center text-sm text-muted">Nenhum fornecedor publicado no diretório.</li> : null}
        </ul>
      )}
    </div>
  );
}
