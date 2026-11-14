"use client";
import { Download, FileText, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useUpgrade } from "@/components/app/upgrade";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface Report { id: string; title: string; kind: string; content: Record<string, unknown>; created_at: string }
const KIND: Record<string, string> = { product_analysis: "Análise de produto", supplier_comparison: "Comparação de fornecedores", simulation: "Simulação", assistant: "Análise do assistente" };

/** Achata o conteúdo em linhas chave/valor para leitura e exportação. */
function flatten(value: unknown, prefix = ""): [string, string][] {
  if (value === null || value === undefined) return [[prefix, "Não disponível"]];
  if (typeof value !== "object") return [[prefix, String(value)]];
  if (Array.isArray(value)) return value.flatMap((v, i) => flatten(v, `${prefix}[${i + 1}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}
const csvCell = (s: string) => `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;

export function Reports() {
  const toast = useToast();
  const { openUpgrade } = useUpgrade();
  const [open, setOpen] = useState<Report | null>(null);
  const d = useLoad<Report[]>(async () => {
    const { data, error } = await supabaseBrowser().from("reports").select("id, title, kind, content, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("Não foi possível carregar os relatórios.");
    return (data ?? []) as Report[];
  });

  async function exportCsv(r: Report) {
    const { data } = await supabaseBrowser().rpc("consume_quota", { p_resource: "export" });
    if (!(data as { allowed?: boolean } | null)?.allowed) { openUpgrade("Exportações fazem parte dos planos pagos"); return; }
    const rows = [["campo", "valor"], ["titulo", r.title], ["tipo", KIND[r.kind] ?? r.kind], ["criado_em", r.created_at], ...flatten(r.content)];
    const blob = new Blob(["﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `worthwise-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Exportação gerada");
  }
  async function remove(r: Report) {
    const { error } = await supabaseBrowser().from("reports").delete().eq("id", r.id);
    toast(error ? "Não foi possível excluir." : "Relatório excluído", error ? "error" : "success");
    if (!error) { setOpen(null); d.reload(); }
  }

  return (
    <>
      <PageHeader title="Relatórios" description="Tudo o que você salvou para ver depois: análises de produtos, comparações de fornecedores e respostas do assistente." />
      {d.loading ? <Skeleton className="h-48 !rounded-2xl" /> : d.error ? <ErrorNote onRetry={d.reload}>{d.error}</ErrorNote> : !d.data?.length ? (
        <EmptyState icon={FileText} title="Nenhum relatório salvo">Use “Salvar relatório” na página de um produto, no Worthwise Compare ou em uma resposta do assistente.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {d.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <button onClick={() => setOpen(r)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium hover:text-brand-hi">{r.title}</span>
                <span className="text-xs text-faint">{KIND[r.kind] ?? r.kind} · {formatDate(r.created_at, true)}</span></button>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCsv(r)}><Download size={14} /> CSV</button>
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => remove(r)} aria-label={`Excluir ${r.title}`}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        {open ? (
          <DialogContent wide title={open.title} description={`${KIND[open.kind] ?? open.kind} · salvo em ${formatDate(open.created_at, true)}`}>
            <dl className="divide-y divide-line text-sm">
              {flatten(open.content).slice(0, 200).map(([k, v], i) => (
                <div key={`${k}-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 py-2"><dt className="break-words font-mono text-xs text-faint">{k}</dt><dd className="break-words text-muted">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-5 flex gap-2"><button className="btn btn-secondary" onClick={() => window.print()}><Printer size={15} /> Imprimir</button>
              <button className="btn btn-primary" onClick={() => exportCsv(open)}><Download size={15} /> Exportar CSV</button></div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
