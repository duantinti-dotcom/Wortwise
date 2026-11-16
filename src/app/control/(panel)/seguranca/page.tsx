import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { DataTable } from "@/components/control/table";
import { Empty, Grid, Kpi, KV, Notice, Panel, PRIORITY, RankBars, SEVERITY, Status, type Tone } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { dateTime, int, relative } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { firewallEvents, zoneDaily, zoneHourly } from "@/lib/control/sources";
import { incidentMenu } from "../actions";
import { ExportButton, LoadError, RangeMeta, safe, SinceNotice, type SP } from "../shared";

export const metadata: Metadata = { title: "Security Center" };

interface Sec {
  since: string | null;
  totals: { events: number; hits: number; suspicious: number; blocked: number; incident: number; high: number };
  by_kind: { kind: string; hits: number; events: number; severity: string }[];
  by_hour: { hour: number; hits: number }[];
  by_day: { day: string; suspicious: number | null; blocked: number | null; incident: number | null }[];
  countries: { country: string; hits: number }[];
  timeline: { id: number; at: string; last_at: string; kind: string; severity: string; class: string; actor: string | null; country: string | null; path: string | null; hits: number; detail: Record<string, unknown> }[];
  brute_force: { actor: string; hits: number; first: string; last: string }[];
  credit_abuse: { devices_multi: number; networks_multi: number; trial_denied: number; signups: number; top: { device: string; accounts: number; last: string }[] };
  incidents: { id: number; rule_key: string; title: string; priority: string; status: string; confirmed: boolean; first_seen: string; last_seen: string; occurrences: number }[];
  generated_at: string;
}

const KIND_LABEL: Record<string, string> = {
  scanner_probe: "Varredura automática", rate_limited: "Excesso de requisições", control_login_failed: "Falha de login no painel", control_login_rate_limited: "Login do painel bloqueado",
  control_denied: "Acesso ao painel negado", control_unauthenticated: "Painel sem login", control_wrong_host: "Painel fora do subdomínio", admin_denied: "Admin negado (logado)",
  admin_unauthenticated: "Admin sem login", mfa_failed: "Código MFA inválido", auth_failed: "Falha de login (site)", auth_rate_limited: "Login do site limitado",
  webhook_invalid_signature: "Webhook com assinatura inválida",
};
const CLASS: Record<string, { tone: Tone; label: string }> = {
  suspicious: { tone: "warn", label: "Suspeito" }, blocked: { tone: "neutral", label: "Bloqueado" }, incident: { tone: "crit", label: "Incidente" }, info: { tone: "info", label: "Info" },
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ");
const CF_ACTION: Record<string, string> = { block: "Bloqueado", challenge: "Desafio", managed_challenge: "Desafio gerenciado", jschallenge: "Desafio JS", log: "Registrado", skip: "Ignorado", allow: "Permitido" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const session = await requireControl("security");
  const params = await searchParams;
  const range = parseRange(params);
  const [res, cf, fw, hourly] = await Promise.all([
    safe(controlRpc<Sec>("control_security", { p_from: range.from.toISOString(), p_to: range.to.toISOString() })),
    zoneDaily(range.from, range.to),
    firewallEvents(range.from, range.to),
    zoneHourly(72),
  ]);
  if (!res.ok) return <LoadError e={res.error} />;
  const s = res.data;
  const st = cf.ok ? cf.data.statuses : null;
  const codes = ["401", "403", "404", "429"] as const;
  const totalReq = cf.ok ? cf.data.days.reduce((a, d) => a + d.requests, 0) : 0;
  const threats = cf.ok ? cf.data.days.reduce((a, d) => a + d.threats, 0) : 0;

  // Picos: horas acima de média + 3 desvios (últimas 72 h, Cloudflare).
  let spikes: { hour: string; requests: number }[] = [];
  let hours: { hour: string; requests: number; threats: number; spike: number | null }[] = [];
  if (hourly.ok && hourly.data.hours.length >= 12) {
    const v = hourly.data.hours.map((h) => h.requests);
    const mean = v.reduce((a, x) => a + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length);
    const lim = mean + 3 * sd;
    hours = hourly.data.hours.map((h) => ({ ...h, spike: h.requests > lim && h.requests > 50 ? h.requests : null }));
    spikes = hours.filter((h) => h.spike != null).map((h) => ({ hour: h.hour, requests: h.requests }));
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="c-h1">Security Center</h1>
          <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Eventos registrados pelo Worthwise (IPs só como hash) e métricas da Cloudflare disponíveis no seu plano. <strong className="c-soft">Suspeito</strong> = comportamento anormal; <strong className="c-soft">bloqueado</strong> = a proteção barrou; <strong className="c-soft">incidente</strong> = confirmado por você.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={s.generated_at} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton base={session.base} dataset="security_events" params={params} label="Eventos (CSV)" />
          <ExportButton base={session.base} dataset="incidents" params={params} label="Incidentes (CSV)" />
        </div>
      </div>
      <SinceNotice since={s.since} range={range} what="eventos de segurança" />

      <Grid cols={4} className="mt-4">
        <Kpi label="Ocorrências suspeitas" value={int(s.totals.suspicious)} goodWhen="none" sub={`${int(s.totals.events)} eventos agrupados`} />
        <Kpi label="Solicitações bloqueadas" value={int(s.totals.blocked + (fw.ok ? fw.data.byAction.filter((a) => a.action !== "log" && a.action !== "skip" && a.action !== "allow").reduce((x, a) => x + a.count, 0) : 0))}
          goodWhen="none" basis={fw.ok ? "real" : "partial"} sub={fw.ok ? "aplicação + firewall Cloudflare" : "só aplicação (firewall indisponível)"} />
        <Kpi label="Incidentes confirmados" value={int(s.incidents.filter((i) => i.confirmed).length)} goodWhen="down" sub={`${s.incidents.filter((i) => i.status !== "resolved").length} abertos`} />
        <Kpi label="Gravidade alta/crítica" value={int(s.totals.high)} goodWhen="down" sub="ocorrências no período" />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Eventos por dia" description="Separados por classe.">
          <TimeChart title="Eventos de segurança por dia" x="day" data={s.by_day}
            series={[{ key: "suspicious", label: "Suspeitos", color: 4, kind: "bar", stack: "c" }, { key: "blocked", label: "Bloqueados", color: 1, kind: "bar", stack: "c" }, { key: "incident", label: "Incidentes", color: 2, kind: "bar", stack: "c" }]} />
        </Panel>
        <Panel title="Por horário" description="Hora do dia (Brasília), somando o período.">
          <TimeChart title="Eventos por hora do dia" x="hour" mode="hour" height={200} data={s.by_hour} series={[{ key: "hits", label: "Ocorrências", color: 1, kind: "bar" }]} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Tipos de evento" description="Ocorrências por tipo.">
          <RankBars rows={s.by_kind.map((k) => ({ label: kindLabel(k.kind), value: k.hits }))} empty="Nenhum evento no período." />
        </Panel>
        <Panel title="Possível força bruta" description="Origens (hash) com 5+ falhas de login no período.">
          {s.brute_force.length ? (
            <ul className="c-divide text-[13px]">{s.brute_force.map((b) => (
              <li key={b.actor} className="flex items-center justify-between gap-3 py-2">
                <span className="c-mono c-soft">{b.actor}…</span><span className="c-muted text-[12px]">{relative(b.last)}</span><Status tone={b.hits >= 20 ? "crit" : "serious"}>{int(b.hits)} falhas</Status>
              </li>))}</ul>
          ) : <Empty title="Nenhuma origem com falhas repetidas." />}
          <p className="c-faint mt-3 text-[11.5px] leading-relaxed">Login do painel: 5 tentativas por origem a cada 15 min. Falhas do site principal entram aqui quando SUPABASE_ACCESS_TOKEN está configurado.</p>
        </Panel>
        <Panel title="Abuso do acesso gratuito" description="Contas criadas no período a partir do mesmo aparelho ou rede.">
          <KV rows={[
            ["Cadastros no período", int(s.credit_abuse.signups)],
            ["Aparelhos com 2+ contas", s.credit_abuse.devices_multi ? <Status tone="warn">{int(s.credit_abuse.devices_multi)}</Status> : "0"],
            ["Redes com 3+ contas", s.credit_abuse.networks_multi ? <Status tone="warn">{int(s.credit_abuse.networks_multi)}</Status> : "0"],
            ["Contas sem cotas grátis (bloqueio automático)", int(s.credit_abuse.trial_denied)],
          ]} />
          {s.credit_abuse.top.length > 0 && <p className="c-faint mt-2 text-[11.5px]">Maior concentração: {s.credit_abuse.top[0]!.accounts} contas no mesmo aparelho ({s.credit_abuse.top[0]!.device}…).</p>}
        </Panel>
      </div>

      {/* Cloudflare */}
      <div className="mt-6 mb-3 flex items-center gap-2"><h2 className="c-h2">Cloudflare</h2>{cf.ok ? <Status tone="good">Conectada</Status> : <Status tone="neutral">Indisponível</Status>}</div>
      {!cf.ok ? (
        <Notice tone="neutral" title="Métricas da Cloudflare não disponíveis">{cf.reason} Erros 401/403/404/429, ameaças, países e picos de tráfego dependem dessa integração; nada é estimado no lugar.</Notice>
      ) : (
        <>
          <Grid cols={4}>
            <Kpi label="Requisições" value={int(totalReq)} sub={`${int(cf.data.days.reduce((a, d) => a + d.cached, 0))} do cache`} basis="official" />
            <Kpi label="Ameaças (Cloudflare)" value={int(threats)} goodWhen="down" basis="official" sub="classificadas pela Cloudflare" />
            {codes.slice(0, 2).map((c) => <Kpi key={c} label={`Erros ${c}`} value={int(st?.[c] ?? 0)} basis="official" goodWhen="down" sub={c === "401" ? "não autenticado" : "proibido"} />)}
          </Grid>
          <Grid cols={4} className="mt-3">
            {codes.slice(2).map((c) => <Kpi key={c} label={`Erros ${c}`} value={int(st?.[c] ?? 0)} basis="official" goodWhen="down" sub={c === "404" ? "não encontrado (varreduras)" : "limite de requisições"} />)}
            <Kpi label="Picos anormais (72 h)" value={hourly.ok ? int(spikes.length) : "—"} basis={hourly.ok ? "official" : "unavailable"} goodWhen="down"
              sub={hourly.ok ? "horas acima de média + 3σ" : hourly.reason} />
            <Kpi label="Países de origem" value={int(cf.data.countries.length)} basis="official" sub={cf.data.countries[0] ? `mais tráfego: ${cf.data.countries[0].country}` : ""} />
          </Grid>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Tráfego por hora (72 h)" description="Requisições e ameaças; picos destacados.">
              {hourly.ok ? <TimeChart title="Tráfego por hora" x="hour" mode="hour" data={hours}
                series={[{ key: "requests", label: "Requisições", color: 1, kind: "area" }, { key: "threats", label: "Ameaças", color: 2, kind: "line" }, { key: "spike", label: "Pico anormal", color: 4, kind: "bar" }]} />
                : <Notice tone="neutral">{hourly.reason}</Notice>}
            </Panel>
            <Panel title="Países" description="Requisições e ameaças por país.">
              <RankBars rows={cf.data.countries.slice(0, 10).map((c) => ({ label: c.country, value: c.requests, hint: c.threats ? `${int(c.threats)} amea.` : undefined }))} />
            </Panel>
          </div>
          <Panel className="mt-4" title="Firewall (bloqueios e desafios)" description="Eventos de firewall da Cloudflare (no máximo os últimos 7 dias; o plano gratuito pode ter janela menor).">
            {fw.ok ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div><div className="c-label mb-2">Por ação</div><RankBars rows={fw.data.byAction.map((a) => ({ label: CF_ACTION[a.action] ?? a.action, value: a.count }))} empty="Nenhum evento de firewall." /></div>
                <div><div className="c-label mb-2">Por origem da regra</div><RankBars rows={fw.data.bySource.map((a) => ({ label: a.source, value: a.count }))} empty="—" /></div>
                <div><div className="c-label mb-2">Caminhos mais atingidos</div><RankBars rows={fw.data.topPaths.map((a) => ({ label: <span className="c-mono">{a.path}</span>, value: a.count }))} empty="—" /></div>
              </div>
            ) : <Notice tone="neutral" title="Eventos de firewall indisponíveis">{fw.reason}</Notice>}
          </Panel>
        </>
      )}

      <Panel className="mt-6" title="Linha do tempo" description="Eventos agrupados por origem e tipo (10 min). Filtre por gravidade, classe ou tipo.">
        <DataTable csvName="eventos-seguranca" pageSize={25} initialSort={{ key: "last_at", dir: "desc" }}
          filters={[
            { key: "severity", label: "Gravidade", options: Object.entries(SEVERITY).map(([v, x]) => ({ value: v, label: x.label })) },
            { key: "class", label: "Classe", options: Object.entries(CLASS).map(([v, x]) => ({ value: v, label: x.label })) },
            { key: "kind", label: "Tipo", options: [...new Set(s.timeline.map((e) => e.kind))].map((k) => ({ value: k, label: kindLabel(k) })) },
          ]}
          columns={[{ key: "last_at", label: "Último" }, { key: "kind", label: "Evento" }, { key: "severity", label: "Gravidade" }, { key: "class", label: "Classe", hideBelow: "sm" },
            { key: "path", label: "Caminho", hideBelow: "md" }, { key: "country", label: "País", hideBelow: "lg" }, { key: "actor", label: "Origem", hideBelow: "lg" }, { key: "hits", label: "Ocorr.", align: "right" }]}
          rows={s.timeline.map((e) => ({ id: String(e.id), values: { last_at: e.last_at, kind: e.kind, severity: e.severity, class: e.class, path: e.path, country: e.country, actor: e.actor, hits: e.hits },
            cells: {
              last_at: <span className="c-num whitespace-nowrap" title={`Primeiro: ${dateTime(e.at)}`}>{dateTime(e.last_at)}</span>,
              kind: <span className="c-fg">{kindLabel(e.kind)}</span>,
              severity: <Status tone={SEVERITY[e.severity]?.tone ?? "neutral"}>{SEVERITY[e.severity]?.label ?? e.severity}</Status>,
              class: <Status tone={CLASS[e.class]?.tone ?? "neutral"}>{CLASS[e.class]?.label ?? e.class}</Status>,
              path: e.path ? <span className="c-mono">{e.path}</span> : undefined, actor: e.actor ? <span className="c-mono">{e.actor}</span> : undefined,
            } }))} />
      </Panel>

      <Panel className="mt-4" title="Histórico de incidentes" description="Alertas de segurança e incidentes confirmados. Use o menu para reconhecer, confirmar ou resolver.">
        <DataTable csvName="incidentes" pageSize={10} searchable={s.incidents.length > 10} empty="Nenhum incidente registrado."
          menu={[{ id: "acknowledge", label: "Reconhecer" }, { id: "confirm", label: "Confirmar como incidente" }, { id: "unconfirm", label: "Remover confirmação" }, { id: "resolve", label: "Resolver" }]}
          onMenu={incidentMenu}
          columns={[{ key: "last_seen", label: "Último" }, { key: "title", label: "Incidente" }, { key: "priority", label: "Prioridade" }, { key: "status", label: "Status" }, { key: "occurrences", label: "Verif.", align: "right", hideBelow: "sm" }]}
          rows={s.incidents.map((i) => ({ id: String(i.id), menu: [i.status === "open" ? "acknowledge" : "", i.confirmed ? "unconfirm" : "confirm", i.status !== "resolved" ? "resolve" : ""].filter(Boolean),
            values: { last_seen: i.last_seen, title: i.title, priority: i.priority, status: i.status, occurrences: i.occurrences },
            cells: { last_seen: <span className="c-num whitespace-nowrap">{dateTime(i.last_seen)}</span>, priority: <Status tone={PRIORITY[i.priority] ?? "warn"}>{i.priority}</Status>,
              status: <span className="flex flex-wrap gap-1">{i.confirmed && <Status tone="crit">Confirmado</Status>}<Status tone={i.status === "resolved" ? "good" : i.status === "acknowledged" ? "info" : "warn"}>{i.status === "resolved" ? "Resolvido" : i.status === "acknowledged" ? "Reconhecido" : "Aberto"}</Status></span> } }))} />
      </Panel>
    </>
  );
}
