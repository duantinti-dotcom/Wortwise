"use client";
import { ExternalLink, Loader2, Plus, Search, ShieldCheck, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { VerificationBadge } from "@/components/app/supplier-status";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";

export interface Supplier { id: string; owner_id: string | null; name: string; legal_name: string | null; cnpj: string | null; website: string | null; city: string | null; state: string | null; country: string;
  categories: string[]; contact_email: string | null; contact_phone: string | null; notes: string | null; verification_status: string; verified_at: string | null }

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function Suppliers() {
  const toast = useToast();
  const [tab, setTab] = useState<"mine" | "directory">("mine");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", cnpj: "", website: "", city: "", state: "", categories: "", contact_email: "", contact_phone: "", notes: "" });
  const d = useLoad(async () => {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error("Não foi possível carregar os fornecedores.");
    return (data ?? []) as Supplier[];
  });
  const list = useMemo(() => (d.data ?? []).filter((s) => (tab === "mine" ? s.owner_id !== null : s.owner_id === null))
    .filter((s) => !q.trim() || `${s.name} ${s.legal_name ?? ""} ${s.categories.join(" ")} ${s.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [d.data, tab, q]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) { toast("CNPJ deve ter 14 dígitos.", "error"); return; }
    if (form.website && !safeUrl(form.website)) { toast("O site deve começar com http:// ou https://", "error"); return; }
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("suppliers").insert({
      owner_id: auth.user?.id, name: form.name.trim(), cnpj: cnpj || null, website: form.website.trim() || null, city: form.city.trim() || null, state: form.state.trim().toUpperCase().slice(0, 2) || null,
      categories: form.categories.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 8), contact_email: form.contact_email.trim() || null, contact_phone: form.contact_phone.trim() || null, notes: form.notes.trim() || null,
    });
    if (error) { toast(dbMessage(error), "error"); return; }
    setOpen(false);
    setForm({ name: "", cnpj: "", website: "", city: "", state: "", categories: "", contact_email: "", contact_phone: "", notes: "" });
    toast("Fornecedor cadastrado");
    d.reload();
  }
  async function verify(s: Supplier) {
    setVerifying(s.id);
    const r = await api<{ status: string; situacao: string | null }>("/api/suppliers/verify", { method: "POST", json: { supplierId: s.id } });
    setVerifying(null);
    if (!r.ok) { toast(r.error.message, "error"); return; }
    toast(r.data.status === "passed" ? "CNPJ ativo confirmado na Receita Federal" : `Situação cadastral: ${r.data.situacao ?? "não confirmada"}`, r.data.status === "passed" ? "success" : "info");
    d.reload();
  }
  async function remove(s: Supplier) {
    if (!window.confirm(`Excluir o fornecedor “${s.name}”?`)) return;
    const { error } = await supabaseBrowser().from("suppliers").delete().eq("id", s.id);
    toast(error ? "Não foi possível excluir." : "Fornecedor excluído", error ? "error" : "success");
    if (!error) d.reload();
  }
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <>
      <PageHeader title="Meus fornecedores" description="Guarde os contatos de quem te vende e confira na Receita Federal se a empresa existe e está ativa." help={{ id: "fornecedores", steps: ["Toque em Adicionar fornecedor e preencha nome e CNPJ", "Toque em Verificar CNPJ para consultar a Receita Federal", "Use em Comparar fornecedores para ver quem sai mais barato"] }}
        action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Adicionar fornecedor</button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
          {([["mine", "Meus fornecedores"], ["directory", "Diretório Worthwise"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{label}</button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input !pl-10" placeholder="Buscar por nome, categoria ou cidade" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar fornecedores" /></div>
      </div>

      {d.loading ? <Skeleton className="h-48 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : list.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((s) => (
            <article key={s.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate text-base font-semibold">{s.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted">{s.legal_name ?? "Razão social não disponível"}{s.city ? ` · ${s.city}${s.state ? `/${s.state}` : ""}` : ""}</p></div>
                <VerificationBadge status={s.verification_status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div><dt className="text-xs text-faint">CNPJ</dt><dd className={cn("tabular", !s.cnpj && "text-faint")}>{s.cnpj ? fmtCnpj(s.cnpj) : "Não informado"}</dd></div>
                <div><dt className="text-xs text-faint">Verificado em</dt><dd className={cn(!s.verified_at && "text-faint")}>{s.verified_at ? formatDate(s.verified_at) : "—"}</dd></div>
                <div><dt className="text-xs text-faint">Contato</dt><dd className={cn("truncate", !s.contact_email && !s.contact_phone && "text-faint")}>{s.contact_email ?? s.contact_phone ?? "Não informado"}</dd></div>
                <div><dt className="text-xs text-faint">Categorias</dt><dd className={cn("truncate", !s.categories.length && "text-faint")}>{s.categories.join(", ") || "Não informado"}</dd></div>
              </dl>
              {s.notes ? <p className="mt-3 line-clamp-2 text-sm text-muted">{s.notes}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {s.owner_id ? <button className="btn btn-secondary btn-sm" disabled={!s.cnpj || verifying === s.id} onClick={() => verify(s)} title={s.cnpj ? undefined : "Cadastre o CNPJ para verificar"}>
                  {verifying === s.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verificar CNPJ</button> : null}
                {safeUrl(s.website) ? <a href={safeUrl(s.website)!} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-ghost btn-sm">Site oficial <ExternalLink size={13} /></a> : null}
                {s.owner_id ? <button className="btn btn-ghost btn-sm ml-auto !px-2" onClick={() => remove(s)} aria-label={`Excluir ${s.name}`}><Trash2 size={15} /></button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : tab === "mine" ? (
        <EmptyState icon={Store} title="Você ainda não cadastrou fornecedores" action={<button className="btn btn-primary" onClick={() => setOpen(true)}>Adicionar fornecedor</button>}>
          Cadastre os fornecedores com quem você negocia para verificar o CNPJ e comparar cotações pelo custo total.</EmptyState>
      ) : (
        <EmptyState icon={Store} title="O diretório ainda não tem fornecedores publicados">
          O diretório é curado pela equipe Worthwise e só recebe fornecedores com verificação documental. Não listamos empresas sem autorização nem dados inventados.</EmptyState>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title="Adicionar fornecedor" description="Os dados ficam privados na sua conta. Informe apenas contatos comerciais.">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Nome comercial *</span><input className="input" required minLength={2} maxLength={160} {...f("name")} /></label>
            <label><span className="label">CNPJ</span><input className="input tabular" inputMode="numeric" placeholder="00.000.000/0000-00" maxLength={18} {...f("cnpj")} /></label>
            <label><span className="label">Site oficial</span><input className="input" type="url" placeholder="https://" maxLength={200} {...f("website")} /></label>
            <label><span className="label">Cidade</span><input className="input" maxLength={80} {...f("city")} /></label>
            <label><span className="label">UF</span><input className="input" maxLength={2} placeholder="SP" {...f("state")} /></label>
            <label><span className="label">E-mail comercial</span><input className="input" type="email" maxLength={120} {...f("contact_email")} /></label>
            <label><span className="label">Telefone comercial</span><input className="input" maxLength={30} {...f("contact_phone")} /></label>
            <label className="sm:col-span-2"><span className="label">Categorias (separadas por vírgula)</span><input className="input" maxLength={200} placeholder="Eletrônicos, Acessórios" {...f("categories")} /></label>
            <label className="sm:col-span-2"><span className="label">Observações</span><textarea className="input" rows={2} maxLength={500} {...f("notes")} /></label>
            <button className="btn btn-primary sm:col-span-2">Salvar fornecedor</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
