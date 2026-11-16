"use client";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ContextMenu, DropdownMenu } from "radix-ui";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, MoreHorizontal, Search } from "lucide-react";
import { toCsv } from "@/lib/control/csv";
import { cn } from "@/lib/utils";

export interface Column { key: string; label: string; align?: "left" | "right"; width?: string; hideBelow?: "sm" | "md" | "lg" }
export interface Row {
  id: string;
  /** Valores crus: busca, ordenação e CSV. */
  values: Record<string, string | number | boolean | null>;
  /** Conteúdo exibido (opcional; padrão = valor cru). */
  cells?: Record<string, ReactNode>;
  /** Ações do menu disponíveis para esta linha. */
  menu?: string[];
}
export interface MenuItem { id: string; label: string; danger?: boolean; confirm?: string }
export type MenuAction = (actionId: string, rowId: string) => Promise<{ ok: boolean; message?: string }>;

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable({ columns, rows, pageSize = 25, searchable = true, csvName, menu, onMenu, filters, empty = "Nenhum registro no período.", initialSort }: {
  columns: Column[]; rows: Row[]; pageSize?: number; searchable?: boolean; csvName?: string;
  menu?: MenuItem[]; onMenu?: MenuAction; filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  empty?: string; initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => Object.entries(active).every(([k, v]) => !v || String(r.values[k] ?? "") === v));
    if (needle) out = out.filter((r) => Object.values(r.values).some((v) => v != null && String(v).toLowerCase().includes(needle)));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = a.values[sort.key];
        const y = b.values[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * dir;
      });
    }
    return out;
  }, [rows, q, sort, active]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const view = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  function exportCsv() {
    const csv = toCsv(filtered.map((r) => Object.fromEntries(columns.map((c) => [c.label, r.values[c.key]]))), columns.map((c) => c.label));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${csvName ?? "worthwise"}-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function run(item: MenuItem, rowId: string) {
    if (item.id === "copy-id") { void navigator.clipboard?.writeText(rowId); setMsg("ID copiado."); return; }
    if (!onMenu) return;
    if (item.confirm && !window.confirm(item.confirm)) return;
    start(async () => {
      const r = await onMenu(item.id, rowId);
      setMsg(r.message ?? (r.ok ? "Feito." : "Não foi possível concluir."));
      if (r.ok) router.refresh();
    });
  }

  const items = (r: Row) => (menu ?? []).filter((m) => m.id === "copy-id" || r.menu?.includes(m.id));
  const hasMenu = Boolean(menu?.length);

  const MenuList = ({ r, Kind }: { r: Row; Kind: typeof DropdownMenu | typeof ContextMenu }) => (
    <Kind.Portal>
      <Kind.Content className="c-menu" {...(Kind === DropdownMenu ? { align: "end" as const, sideOffset: 4 } : {})}>
        {items(r).map((m, i) => (
          <div key={m.id}>
            {m.danger && i > 0 && <Kind.Separator className="c-menu-sep" />}
            <Kind.Item className={cn("c-menu-item", m.danger && "c-neg")} onSelect={() => run(m, r.id)} disabled={pending}>{m.label}</Kind.Item>
          </div>
        ))}
      </Kind.Content>
    </Kind.Portal>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {(searchable || filters?.length || csvName) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <label className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
              <Search size={14} className="c-faint pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input className="c-input pl-8" placeholder="Buscar…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Buscar na tabela" />
            </label>
          )}
          {filters?.map((f) => (
            <select key={f.key} className="c-select w-auto" value={active[f.key] ?? ""} aria-label={f.label}
              onChange={(e) => { setActive((a) => ({ ...a, [f.key]: e.target.value })); setPage(0); }}>
              <option value="">{f.label}: todos</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          <span className="c-faint c-num ml-auto text-[12px]">{filtered.length.toLocaleString("pt-BR")} registro(s)</span>
          {csvName && <button type="button" className="c-btn" onClick={exportCsv} disabled={!filtered.length}><Download size={14} />CSV</button>}
        </div>
      )}
      {msg && <div role="status" className="c-badge c-badge-info self-start">{msg}</div>}
      <div className="c-scroll -mx-4 overflow-x-auto sm:-mx-5">
        <table className="c-table min-w-[560px]">
          <thead>
            <tr>
              {columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} className={cn(c.align === "right" && "r", c.hideBelow && HIDE[c.hideBelow], "first:pl-4 sm:first:pl-5")} style={{ width: c.width }}
                    aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className={cn("inline-flex items-center gap-1 hover:text-[var(--c-fg)]", on && "c-fg")}
                      onClick={() => setSort(on && sort!.dir === "desc" ? { key: c.key, dir: "asc" } : { key: c.key, dir: "desc" })}>
                      {c.label}{on && (sort!.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                );
              })}
              {hasMenu && <th className="w-10 pr-4 sm:pr-5"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {view.length ? view.map((r) => {
              const tr = (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn(c.align === "right" && "r", c.hideBelow && HIDE[c.hideBelow], "first:pl-4 sm:first:pl-5")}>
                      {r.cells?.[c.key] ?? (r.values[c.key] == null ? <span className="c-faint">—</span> : String(r.values[c.key]))}
                    </td>
                  ))}
                  {hasMenu && (
                    <td className="pr-3 sm:pr-4">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger className="c-btn c-btn-ghost c-btn-icon h-7 w-7" aria-label="Ações"><MoreHorizontal size={15} /></DropdownMenu.Trigger>
                        <MenuList r={r} Kind={DropdownMenu} />
                      </DropdownMenu.Root>
                    </td>
                  )}
                </tr>
              );
              return hasMenu ? (
                <ContextMenu.Root key={r.id}>
                  <ContextMenu.Trigger asChild>{tr}</ContextMenu.Trigger>
                  <MenuList r={r} Kind={ContextMenu} />
                </ContextMenu.Root>
              ) : tr;
            }) : (
              <tr><td colSpan={columns.length + (hasMenu ? 1 : 0)} className="c-muted py-10 text-center">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-[12px]">
          <span className="c-muted c-num">Página {cur + 1} de {pages}</span>
          <button type="button" className="c-btn c-btn-icon h-7 w-7" onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label="Página anterior"><ChevronLeft size={14} /></button>
          <button type="button" className="c-btn c-btn-icon h-7 w-7" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label="Próxima página"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
