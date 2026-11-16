import type { Metadata } from "next";
import { DataTable } from "@/components/control/table";
import { Panel } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { dateTime, int } from "@/lib/control/format";
import { LoadError, safe, type SP } from "../shared";

export const metadata: Metadata = { title: "Auditoria" };

interface Audit { rows: { id: number; at: string; admin: string | null; action: string; target: string | null; details: Record<string, unknown> }[]; total: number }

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("audit");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const res = await safe(controlRpc<Audit>("control_audit_log", { p_search: q || null, p_limit: 500, p_offset: 0 }));
  if (!res.ok) return <LoadError e={res.error} />;
  const a = res.data;
  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Trilha de auditoria</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Ações administrativas do Worthwise e do painel: logins, exportações, despesas, classificações de pagamento, regras, incidentes e configurações. Registros não podem ser editados nem apagados pela interface.</p>
      </div>
      <Panel title={`Últimos ${int(a.rows.length)} de ${int(a.total)} registros`}>
        <form className="mb-3 flex gap-2" role="search">
          <input name="q" defaultValue={q} className="c-input max-w-[320px]" placeholder="Filtrar por ação ou alvo no servidor (ex.: export, expense)" aria-label="Filtrar auditoria" />
          <button className="c-btn" type="submit">Filtrar</button>
        </form>
        <DataTable csvName="auditoria" pageSize={30}
          columns={[{ key: "at", label: "Quando" }, { key: "admin", label: "Administrador", hideBelow: "md" }, { key: "action", label: "Ação" }, { key: "target", label: "Alvo", hideBelow: "sm" }, { key: "details", label: "Detalhes", hideBelow: "lg" }]}
          rows={a.rows.map((r) => ({ id: String(r.id), values: { at: r.at, admin: r.admin, action: r.action, target: r.target, details: JSON.stringify(r.details) },
            cells: { at: <span className="c-num whitespace-nowrap">{dateTime(r.at)}</span>, action: <span className="c-mono c-fg">{r.action}</span>,
              details: <span className="c-mono c-muted block max-w-[360px] truncate" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</span> } }))} />
      </Panel>
    </>
  );
}
