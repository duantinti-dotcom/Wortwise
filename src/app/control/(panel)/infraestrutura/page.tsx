import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, KV, Meter, Notice, Panel, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { bytes, dateTime, int, ms, pct, relative } from "@/lib/control/format";
import { checkIntegrations, workerStats } from "@/lib/control/sources";
import { LoadError, safe } from "../shared";

export const metadata: Metadata = { title: "Infraestrutura" };

interface Infra {
  db: { db_bytes: number; wal_bytes: number | null; index_bytes: number; tables: { table: string; total_bytes: number; rows: number }[] };
  quota_bytes: number;
  growth: { day: string; bytes: number }[];
  connections: { total: number; active: number; idle: number; idle_tx: number; max: number };
  cache_hit: number | null;
  tx: { commit: number; rollback: number; deadlocks: number; temp_bytes: number; stats_reset: string | null };
  statements: { query: string; calls: number; total_ms: number; mean_ms: number }[] | null;
  api_latency: { source: string; n: number; errors: number; p50: number | null; p95: number | null }[];
  maintenance: { task: string; started_at: string; finished_at: string | null; ok: boolean; rows_removed: number; error: string | null }[];
  sources: { id: string; name: string; status: string; detail: string | null; last_ok_at: string | null; last_error_at: string | null }[];
  retention: Record<string, number>;
  last_rollup: string | null;
  generated_at: string;
}

/** A Cloudflare informa o tempo de CPU em microssegundos. */
const cpu = (us: number | null | undefined) => (us == null ? null : us / 1000);

export default async function Page() {
  await requireControl("infra");
  const to = new Date();
  const from = new Date(to.getTime() - 14 * 86_400_000);
  const [res, live, workers] = await Promise.all([safe(controlRpc<Infra>("control_infra")), checkIntegrations(), workerStats(from, to)]);
  if (!res.ok) return <LoadError e={res.error} />;
  const i = res.data;
  const usedPct = (i.db.db_bytes / i.quota_bytes) * 100;
  // Projeção pelo crescimento médio dos últimos registros diários.
  const g = i.growth;
  const perDay = g.length >= 3 ? (g[g.length - 1]!.bytes - g[0]!.bytes) / Math.max(1, (Date.parse(g[g.length - 1]!.day) - Date.parse(g[0]!.day)) / 86_400_000) : null;
  const daysToLimit = perDay && perDay > 0 ? (i.quota_bytes - i.db.db_bytes) / perDay : null;
  const wReq = workers.ok ? workers.data.days.reduce((a, d) => a + d.requests, 0) : 0;
  const wErr = workers.ok ? workers.data.days.reduce((a, d) => a + d.errors, 0) : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Saúde da infraestrutura</h1>
        <p className="c-muted mt-1 text-[13.5px]">Cloudflare Workers (últimos 14 dias), banco Supabase e integrações. Consultado em {dateTime(i.generated_at)}.</p>
      </div>

      <h2 className="c-h2 mb-3">Cloudflare Workers</h2>
      {workers.ok ? (
        <>
          <Grid cols={4}>
            <Kpi label="Requisições (14 dias)" value={int(wReq)} basis="official" />
            <Kpi label="Erros de execução" value={int(wErr)} basis="official" goodWhen="down" sub={pct(wReq ? (wErr / wReq) * 100 : null, 2)} />
            <Kpi label="CPU p50 / p99" value={ms(cpu(workers.data.days.at(-1)?.cpuP50))} basis="official" sub={`p99 ${ms(cpu(workers.data.days.at(-1)?.cpuP99))} (último dia)`} />
            <Kpi label="Subrequisições" value={int(workers.data.days.reduce((a, d) => a + d.subrequests, 0))} basis="official" sub="chamadas externas do Worker" />
          </Grid>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Requisições e erros por dia"><TimeChart title="Requisições do Worker" x="date" data={workers.data.days}
              series={[{ key: "requests", label: "Requisições", color: 1, kind: "area" }, { key: "errors", label: "Erros", color: 2, kind: "bar" }]} /></Panel>
            <Panel title="Tempo de CPU por requisição" description="Percentis diários de tempo de CPU por requisição.">
              <TimeChart title="CPU do Worker" x="date" unit="ms" data={workers.data.days.map((d) => ({ date: d.date, p50: cpu(d.cpuP50), p99: cpu(d.cpuP99) }))}
                series={[{ key: "p50", label: "p50", color: 1, kind: "line" }, { key: "p99", label: "p99", color: 2, kind: "line" }]} />
            </Panel>
          </div>
          <p className="c-faint mt-2 text-[12px]">Limites do Workers Paid: 30 s de CPU por requisição (padrão), 1.000 subrequisições por requisição, 10 milhões de requisições/mês incluídas.</p>
        </>
      ) : <Notice tone="neutral" title="Métricas do Worker indisponíveis">{workers.reason} Erros e latência do Worker também ficam em Workers &amp; Pages → worthwise → Observability.</Notice>}

      <h2 className="c-h2 mb-3 mt-8">Supabase (PostgreSQL)</h2>
      <Grid cols={4}>
        <div className="c-card c-rise flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between"><span className="c-label">Tamanho do banco</span><span className="c-badge c-badge-neutral">Real</span></div>
          <div className="c-num text-[26px] font-semibold leading-none">{bytes(i.db.db_bytes)}</div>
          <Meter value={i.db.db_bytes} max={i.quota_bytes} label="Uso do banco" />
          <span className="c-muted text-[12px]">{pct(usedPct)} de {bytes(i.quota_bytes)} · livre {bytes(i.quota_bytes - i.db.db_bytes)}</span>
        </div>
        <Kpi label="Crescimento" value={perDay == null ? "—" : `${bytes(perDay)}/dia`} basis={perDay == null ? "unavailable" : "estimated"}
          sub={daysToLimit ? `limite em ~${Math.round(daysToLimit)} dias` : g.length < 3 ? "precisa de 3 fotos diárias" : "estável"} />
        <Kpi label="Conexões" value={`${int(i.connections.total)} / ${int(i.connections.max)}`} sub={`${i.connections.active} ativas · ${i.connections.idle_tx} presas em transação`} />
        <Kpi label="Cache hit do banco" value={pct(i.cache_hit)} sub={`${int(i.tx.deadlocks)} deadlocks · ${int(i.tx.rollback)} rollbacks`} hint={i.tx.stats_reset ? `Desde ${dateTime(i.tx.stats_reset)}` : undefined} />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Crescimento do banco" description="Foto diária feita pela manutenção automática.">
          {g.length >= 2 ? <TimeChart title="Tamanho do banco" x="day" unit="bytes" data={g} series={[{ key: "bytes", label: "Tamanho", color: 1, kind: "area" }]} />
            : <Notice tone="neutral">A manutenção diária registra uma foto por dia; o gráfico aparece a partir da segunda.</Notice>}
        </Panel>
        <Panel title="Limites do Supabase Free" description="Plano gratuito (consulte a página de preços do Supabase para mudanças).">
          <KV rows={[["Banco de dados", "500 MB"], ["Armazenamento de arquivos", "1 GB"], ["Tráfego de saída", "5 GB/mês"], ["Usuários ativos (MAU)", "50.000"],
            ["Pausa por inatividade", "após 1 semana"], ["Backups automáticos", "não incluídos"]]} />
          <p className="c-faint mt-2 text-[11.5px]">O painel guarda só agregados diários; eventos brutos têm retenção de 90–180 dias e o histórico de preços antigo vai para o R2.</p>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Maiores tabelas">
          <DataTable searchable={false} pageSize={8} columns={[{ key: "table", label: "Tabela" }, { key: "rows", label: "Linhas", align: "right" }, { key: "bytes", label: "Tamanho", align: "right" }]}
            rows={i.db.tables.map((t) => ({ id: t.table, values: { table: t.table, rows: t.rows, bytes: t.total_bytes }, cells: { table: <span className="c-mono">{t.table}</span>, rows: int(t.rows), bytes: bytes(t.total_bytes) } }))} />
        </Panel>
        <Panel title="Consultas mais pesadas" description="pg_stat_statements (tempo total acumulado).">
          {i.statements ? (
            <DataTable searchable={false} pageSize={8} columns={[{ key: "query", label: "Consulta" }, { key: "calls", label: "Chamadas", align: "right" }, { key: "mean", label: "Média", align: "right" }]}
              rows={i.statements.map((s, k) => ({ id: String(k), values: { query: s.query, calls: s.calls, mean: s.mean_ms }, cells: { query: <span className="c-mono block max-w-[360px] truncate" title={s.query}>{s.query}</span>, calls: int(s.calls), mean: ms(s.mean_ms) } }))} />
          ) : <Notice tone="neutral">pg_stat_statements não está acessível neste ambiente.</Notice>}
        </Panel>
      </div>

      <h2 className="c-h2 mb-3 mt-8">Integrações</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Verificação ao vivo">
          <ul className="c-divide text-[13px]">{live.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0"><div className="c-fg font-medium">{c.name}</div><div className="c-muted text-[12px]">{c.detail}</div></div>
              <Status tone={c.ok === null ? "neutral" : c.ok ? "good" : "crit"}>{c.ok === null ? "Não configurado" : c.ok ? `OK · ${c.ms} ms` : "Falha"}</Status>
            </li>))}</ul>
        </Panel>
        <Panel title="APIs externas (24 h)" description="Chamadas feitas pelo Worthwise.">
          <DataTable searchable={false} columns={[{ key: "source", label: "Fonte" }, { key: "n", label: "Chamadas", align: "right" }, { key: "errors", label: "Erros", align: "right" }, { key: "p50", label: "p50", align: "right" }, { key: "p95", label: "p95", align: "right", hideBelow: "sm" }]}
            rows={i.api_latency.map((a) => ({ id: a.source, values: { source: a.source, n: a.n, errors: a.errors, p50: a.p50, p95: a.p95 },
              cells: { errors: a.errors ? <Status tone="crit">{a.errors}</Status> : "0", p50: ms(a.p50), p95: ms(a.p95) } }))} empty="Nenhuma chamada nas últimas 24 horas." />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Manutenção automática" description="Rotina diária de limpeza e arquivamento.">
          <DataTable searchable={false} pageSize={6} columns={[{ key: "started", label: "Quando" }, { key: "task", label: "Tarefa" }, { key: "rows", label: "Removidas", align: "right" }, { key: "ok", label: "Resultado" }]}
            rows={i.maintenance.map((m, k) => ({ id: String(k), values: { started: m.started_at, task: m.task, rows: m.rows_removed, ok: m.ok ? "ok" : "erro" },
              cells: { started: relative(m.started_at), ok: m.ok ? <Status tone="good">OK</Status> : <span title={m.error ?? ""}><Status tone="crit">Erro</Status></span> } }))} />
        </Panel>
        <Panel title="Dados do painel e retenção" description={`Última consolidação ${relative(i.last_rollup)}.`}>
          <KV rows={[["Eventos de segurança (90 dias)", int(i.retention.control_events)], ["Uso de IA por requisição (180 dias)", int(i.retention.ai_usage_events)],
            ["Agregados diários (≈ 2 anos)", int(i.retention.metrics_daily)], ["Visitantes do dia (hash, 2 dias)", int(i.retention.visitor_days)], ["Logs de APIs (30 dias)", int(i.retention.api_usage_logs)]]} />
        </Panel>
      </div>
    </>
  );
}
