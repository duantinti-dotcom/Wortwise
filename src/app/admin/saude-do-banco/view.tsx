"use client";
import { AlertTriangle, Archive, Database, HardDrive, Loader2, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/hooks";
import { cn, formatDate } from "@/lib/utils";

interface Table { table: string; total_bytes: number; data_bytes: number; index_bytes: number; toast_bytes: number; rows: number }
interface Run { id: number; task: string; started_at: string; finished_at: string | null; ok: boolean; rows_removed: number; bytes_before: number | null; bytes_after: number | null; details: Record<string, unknown>; error: string | null }
export interface Health {
  db_bytes: number; wal_bytes: number | null; index_bytes: number; quota_bytes: number; percent: number; tables: Table[];
  growth: { day: string; db_bytes: number }[]; runs: Run[]; errors: { task: string; started_at: string; error: string }[];
  archive: { files: number; rows: number; bytes: number; last_at: string | null };
  last_run: { started_at: string; finished_at: string | null; ok: boolean; rows_removed: number } | null;
  settings: { enabled: boolean; tasks: Record<string, boolean>; retention_days: Record<string, number>; archive_after_days: number } | null;
}

const mb = (b: number | null | undefined) => (b == null ? "—" : `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: b < 10485760 ? 2 : 1 })} MB`);
const TASKS: [string, string, string][] = [
  ["expire_caches", "Caches e temporários vencidos", "Limites de requisição (1 dia) e checkouts abandonados (30 dias)"],
  ["purge_logs", "Logs técnicos", "Chamadas às APIs (30 dias), IPs de cadastro (90 dias), histórico desta rotina (180 dias)"],
  ["dedupe_prices", "Preços repetidos", "Remove observação igual à anterior com menos de 6 h. Nunca cria nem altera valores"],
  ["compact_searches", "Compactar pesquisas salvas", "Tira do cache a lista de atributos, que não é exibida. Preço, foto e título ficam"],
  ["archive_prices", "Arquivar histórico antigo no R2", "Preços com mais de 1 ano vão para o Cloudflare R2 (conferidos e restauráveis)"],
  ["analyze", "Atualizar estatísticas", "Mantém as consultas rápidas (operação leve)"],
];

export function DbHealthView({ initial, r2 }: { initial: Health; r2: boolean }) {
  const h = initial;
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(h.settings?.enabled !== false);
  const [tasks, setTasks] = useState<Record<string, boolean>>(h.settings?.tasks ?? {});
  const pct = Math.min(100, h.percent);
  const level = pct >= 95 ? "neg" : pct >= 85 ? "warn" : pct >= 70 ? "attention" : "ok";
  const growth = h.growth.length > 1 ? (h.growth.at(-1)!.db_bytes - h.growth[0]!.db_bytes) / Math.max(1, h.growth.length - 1) : null;
  const daysLeft = growth && growth > 0 ? Math.floor((h.quota_bytes - h.db_bytes) / growth) : null;

  async function save(nextEnabled: boolean, nextTasks: Record<string, boolean>) {
    setBusy("settings");
    const r = await api("/api/admin/maintenance", { method: "POST", json: { action: "settings", enabled: nextEnabled, tasks: nextTasks } });
    setBusy(null);
    if (!r.ok) { toast(r.error.message, "error"); return; }
    setEnabled(nextEnabled); setTasks(nextTasks); toast("Configuração salva");
  }
  async function run() {
    setBusy("run");
    const r = await api<{ db: { rows_removed?: number; error?: string }; archive: { status: string; rows?: number } }>("/api/admin/maintenance", { method: "POST", json: { action: "run" } });
    setBusy(null);
    if (!r.ok) { toast(r.error.message, "error"); return; }
    toast(r.data.db.error ? `Falhou: ${r.data.db.error}` : `Manutenção concluída: ${r.data.db.rows_removed ?? 0} registro(s) temporário(s) removido(s)`, r.data.db.error ? "error" : undefined);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Uso */}
      <section className="card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted">Espaço usado no banco</div>
            <div className="tabular mt-1 text-4xl font-semibold tracking-tight">{mb(h.db_bytes)} <span className="text-lg font-normal text-faint">de {mb(h.quota_bytes)}</span></div>
            <div className="mt-1 text-sm text-muted">{mb(h.quota_bytes - h.db_bytes)} livres · <b className="text-fg">{h.percent.toLocaleString("pt-BR")}%</b> consumido</div>
          </div>
          <span className={cn("badge !h-8 !px-3 !text-[13px]", level === "ok" ? "badge-pos" : level === "neg" ? "badge-neg" : "!border-amber-500/40 !bg-amber-500/10 !text-amber-500")}>
            {level === "ok" ? "Saudável" : level === "attention" ? "Atenção (70%)" : level === "warn" ? "Alto (85%)" : "Crítico (95%)"}
          </span>
        </div>
        <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-tint/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso da cota">
          <div className={cn("h-full rounded-full transition-[width] duration-700", level === "neg" ? "bg-neg" : level === "ok" ? "bg-gradient-to-r from-[#22D3EE] to-brand" : "bg-amber-500")} style={{ width: `${Math.max(pct, 1)}%` }} />
          {[70, 85, 95].map((m) => <span key={m} className="absolute top-0 h-full w-px bg-tint/40" style={{ left: `${m}%` }} title={`Alerta em ${m}%`} />)}
        </div>
        <div className="mt-1.5 flex justify-end gap-6 font-mono text-[10.5px] text-faint"><span>alertas em 70% · 85% · 95%</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Mini icon={Database} label="Índices" value={mb(h.index_bytes)} hint="parte do total, acelera as consultas" />
          <Mini icon={HardDrive} label="Disco físico (WAL)" value={h.wal_bytes == null ? "não disponível" : mb(h.wal_bytes)} hint={h.wal_bytes == null ? "o plano gratuito não expõe o WAL; acompanhe em Supabase → Reports" : "registro de transações do PostgreSQL"} />
          <Mini icon={RefreshCw} label="Crescimento diário" value={growth == null ? "medindo…" : `${growth >= 0 ? "+" : ""}${mb(growth)}`} hint={daysLeft != null ? `no ritmo atual, ~${daysLeft.toLocaleString("pt-BR")} dias até encher` : "precisa de 2 dias de medição"} />
          <Mini icon={Archive} label="Arquivado no R2" value={r2 ? `${h.archive.rows.toLocaleString("pt-BR")} preços` : "R2 não configurado"} hint={r2 ? `${h.archive.files} arquivo(s) · ${mb(h.archive.bytes)}` : "o histórico fica todo no banco até o R2 ser ativado"} />
        </div>
      </section>

      {/* Automação */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Limpeza automática</h2>
            <p className="mt-0.5 text-sm text-muted">Roda todo dia às 03:17 (horário de Brasília), em lotes pequenos para não pesar no banco.
              {h.last_run ? <> Última execução: <b className="text-fg">{formatDate(h.last_run.started_at, true)}</b> · {h.last_run.ok ? `${h.last_run.rows_removed} registro(s) temporário(s) removido(s)` : "falhou"}</> : " Ainda não executada."}</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch on={enabled} disabled={busy !== null} onChange={(v) => void save(v, tasks)} label="Rotina ligada" />
            <button className="btn btn-primary btn-sm" onClick={() => void run()} disabled={busy !== null}>{busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Executar agora</button>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-line">
          {TASKS.map(([k, t, d]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-3">
              <div><div className="text-sm font-medium">{t}</div><div className="text-xs text-muted">{d}{k === "archive_prices" && !r2 ? " · aguardando ativação do R2" : ""}</div></div>
              <Switch on={tasks[k] !== false} disabled={busy !== null || !enabled} onChange={(v) => void save(enabled, { ...tasks, [k]: v })} label={t} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-faint">Nunca são apagados: contas, assinaturas, pagamentos, eventos de pagamento, créditos, favoritos, coleções, simulações, relatórios, conversas e auditoria.</p>
      </section>

      {/* Maiores tabelas */}
      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4"><h2 className="text-base font-semibold">O que mais ocupa espaço</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint"><tr><th className="px-6 py-2.5 font-medium">Tabela</th><th className="px-3 py-2.5 text-right font-medium">Linhas</th><th className="px-3 py-2.5 text-right font-medium">Dados</th><th className="px-3 py-2.5 text-right font-medium">Índices</th><th className="px-6 py-2.5 text-right font-medium">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {h.tables.map((t) => (
                <tr key={t.table}><td className="px-6 py-2.5 font-mono text-[12.5px]">{t.table}</td><td className="tabular px-3 py-2.5 text-right text-muted">{t.rows.toLocaleString("pt-BR")}</td>
                  <td className="tabular px-3 py-2.5 text-right text-muted">{mb(t.data_bytes + t.toast_bytes)}</td><td className="tabular px-3 py-2.5 text-right text-muted">{mb(t.index_bytes)}</td><td className="tabular px-6 py-2.5 text-right font-medium">{mb(t.total_bytes)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Execuções e erros */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-base font-semibold">Últimas execuções</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {h.runs.length ? h.runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", r.ok ? "bg-pos" : "bg-neg")} />{r.task === "maintenance" ? "Limpeza" : r.task === "archive_prices" ? "Arquivamento" : r.task === "archive_restore" ? "Restauração" : r.task}</span>
                <span className="text-right text-xs text-muted">{formatDate(r.started_at, true)} · {r.rows_removed} removido(s){r.bytes_before && r.bytes_after ? ` · ${mb(r.bytes_before)} → ${mb(r.bytes_after)}` : ""}</span>
              </li>
            )) : <li className="py-3 text-muted">Nenhuma execução ainda.</li>}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle size={16} className={h.errors.length ? "text-neg" : "text-faint"} />Erros das automações</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {h.errors.length ? h.errors.map((e, i) => <li key={i} className="rounded-xl bg-neg/[0.07] px-3 py-2"><div className="text-xs text-muted">{formatDate(e.started_at, true)} · {e.task}</div><div className="text-danger">{e.error}</div></li>)
              : <li className="text-muted">Nenhum erro registrado. 🎉</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Mini({ icon: Icon, label, value, hint }: { icon: typeof Database; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-tint/[0.04] p-4">
      <div className="flex items-center gap-2 text-xs text-muted"><Icon size={14} className="text-brand" />{label}</div>
      <div className="tabular mt-1.5 text-lg font-semibold">{value}</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{hint}</div>
    </div>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-brand" : "bg-tint/20")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-300", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
