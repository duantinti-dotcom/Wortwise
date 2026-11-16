import { Download } from "lucide-react";
import { BasisBadge, Notice } from "@/components/control/ui";
import { ControlRpcError } from "@/lib/control/auth";
import { rangeQuery, type Range } from "@/lib/control/range";
import { dateTime } from "@/lib/control/format";

export type SP = Promise<Record<string, string | string[] | undefined>>;

/** Botão de exportação CSV (respeita o período atual). */
export function ExportButton({ base, dataset, params, label = "Exportar CSV" }: { base: string; dataset: string; params: Record<string, string | string[] | undefined>; label?: string }) {
  const q = rangeQuery(params, { dataset });
  return <a className="c-btn" href={`${base}/api/export${q}`} download><Download size={14} />{label}</a>;
}

export function RangeMeta({ range, generatedAt }: { range: Range; generatedAt?: string }) {
  return (
    <>
      <span className="c-badge c-badge-neutral">{range.label}</span>
      {range.compare && <span className="c-badge c-badge-neutral">vs. período anterior</span>}
      {generatedAt && <span className="c-faint text-[12px]">Consultado em {dateTime(generatedAt)}</span>}
    </>
  );
}

/** Coleta iniciada depois do começo do período: avisa e não inventa os dias anteriores. */
export function SinceNotice({ since, range, what }: { since: string | null | undefined; range: Range; what: string }) {
  if (!since) return <Notice tone="neutral" title={`Ainda não há dados de ${what}.`}>A coleta começa automaticamente; os gráficos aparecem a partir do primeiro registro.</Notice>;
  const sinceDate = new Date(since.length === 10 ? `${since}T03:00:00Z` : since);
  if (sinceDate <= range.from) return null;
  return <Notice tone="neutral">Dados de {what} disponíveis desde {sinceDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Períodos anteriores não são exibidos nem estimados.</Notice>;
}

export function LoadError({ e }: { e: unknown }) {
  const msg = e instanceof ControlRpcError ? e.message : "Não foi possível carregar os dados.";
  return <Notice tone="crit" title="Fonte indisponível">{msg} Os demais painéis continuam funcionando.</Notice>;
}

export { BasisBadge };

/** Executa uma consulta do painel sem derrubar a página inteira. */
export async function safe<T>(p: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
  try { return { ok: true, data: await p }; } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    return { ok: false, error };
  }
}
