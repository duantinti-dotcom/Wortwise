import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { BlockButton } from "./block-button";

export const metadata: Metadata = { title: "Usuários" };
interface Row { id: string; email: string; full_name: string | null; created_at: string; plan: string; risk_flag: string | null; blocked_at: string | null; searches: number; is_admin: boolean }

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q, p } = await searchParams;
  const page = Math.max(0, Number(p) || 0);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_list_users", { p_search: q ?? "", p_limit: 50, p_offset: page * 50 });
  const rows = (data ?? []) as Row[];
  return (
    <>
      <PageHeader title="Usuários" description="Contas, planos e sinais de abuso. Bloquear impede pesquisas; a ação fica registrada na auditoria." />
      <form className="mb-4 flex max-w-md gap-2"><input name="q" defaultValue={q} className="input" placeholder="Buscar por e-mail ou nome" aria-label="Buscar usuários" /><button className="btn btn-secondary">Buscar</button></form>
      {error ? <p role="alert" className="card p-5 text-sm text-danger">Não foi possível carregar os usuários.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-faint">{["Usuário", "Plano", "Pesquisas", "Cadastro", "Sinal", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id}><td className="px-4 py-3"><div className="font-medium">{u.email}{u.is_admin ? <span className="badge badge-brand ml-2 !h-5 !text-[10px]">admin</span> : null}</div><div className="text-xs text-faint">{u.full_name ?? "—"}</div></td>
                  <td className="px-4 py-3">{u.plan}</td><td className="tabular px-4 py-3">{u.searches}</td><td className="px-4 py-3 text-muted">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">{u.blocked_at ? <span className="badge badge-neg">bloqueado</span> : u.risk_flag ? <span className="badge" title="Muitas contas criadas na mesma rede em 7 dias. É um sinal, não uma prova.">revisar</span> : <span className="text-faint">—</span>}</td>
                  <td className="px-4 py-3 text-right">{u.is_admin ? null : <BlockButton id={u.id} blocked={Boolean(u.blocked_at)} />}</td></tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum usuário encontrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {page > 0 ? <a className="btn btn-secondary btn-sm" href={`?q=${encodeURIComponent(q ?? "")}&p=${page - 1}`}>Anterior</a> : null}
        {rows.length === 50 ? <a className="btn btn-secondary btn-sm" href={`?q=${encodeURIComponent(q ?? "")}&p=${page + 1}`}>Próxima</a> : null}
      </div>
    </>
  );
}
