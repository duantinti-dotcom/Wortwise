import "server-only";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Fontes externas do painel. Cada função devolve { ok: true, data } ou { ok: false, reason }:
 * o painel mostra a limitação, nunca um número inventado. Respostas ficam 2–5 min em memória
 * por instância para não multiplicar chamadas.
 */
export type SourceResult<T> = { ok: true; data: T; fetchedAt: string } | { ok: false; reason: string; configured: boolean };

const memo = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return value;
}

function cfEnv() {
  const e = process.env;
  return { token: e.CLOUDFLARE_API_TOKEN ?? "", zoneId: e.CLOUDFLARE_ZONE_ID ?? "", accountId: e.CLOUDFLARE_ACCOUNT_ID ?? "", script: e.CLOUDFLARE_WORKER_NAME ?? "worthwise" };
}

/* ─────────────────────────── GeckoAPI ─────────────────────────── */
export interface GeckoCredits { currentCredits: number; planId: string | null; updatedAt: string | null; last24Hours: number | null; last7Days: number | null; last30Days: number | null }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export function parseGeckoCredits(json: unknown): GeckoCredits | null {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const body = (o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>;
  const current = num(body.currentCredits);
  if (current == null) return null;
  const c = (body.creditsConsumed && typeof body.creditsConsumed === "object" ? body.creditsConsumed : {}) as Record<string, unknown>;
  return {
    currentCredits: current, planId: typeof body.planId === "string" ? body.planId : null,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    last24Hours: num(c.last24Hours), last7Days: num(c.last7Days), last30Days: num(c.last30Days),
  };
}

/** Endpoint oficial: GET https://api.geckoapi.com.br/v1/me/credits (não consome créditos). */
export function geckoCredits(): Promise<SourceResult<GeckoCredits>> {
  const token = serverEnv().geckoToken;
  if (!token) return Promise.resolve({ ok: false, reason: "GECKO_API_KEY não configurada no Worker.", configured: false });
  return cached("gecko-credits", 120_000, async () => {
    try {
      const res = await fetch("https://api.geckoapi.com.br/v1/me/credits", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { ok: false, reason: `GeckoAPI respondeu ${res.status} na consulta de créditos.`, configured: true } as const;
      const parsed = parseGeckoCredits(await res.json());
      if (!parsed) return { ok: false, reason: "Resposta da GeckoAPI sem o campo currentCredits.", configured: true } as const;
      return { ok: true, data: parsed, fetchedAt: new Date().toISOString() } as const;
    } catch {
      return { ok: false, reason: "GeckoAPI indisponível ou tempo esgotado.", configured: true } as const;
    }
  });
}

/* ─────────────────────────── Cloudflare GraphQL Analytics ─────────────────────────── */
async function cfGraphql<T>(query: string, variables: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { token } = cfEnv();
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
    if (!res.ok) return { data: null, error: `Cloudflare respondeu ${res.status}${json?.errors?.[0] ? `: ${json.errors[0].message}` : ""}` };
    if (json?.errors?.length) return { data: json.data ?? null, error: json.errors.map((e) => e.message).join("; ").slice(0, 300) };
    return { data: json?.data ?? null, error: null };
  } catch {
    return { data: null, error: "Cloudflare indisponível ou tempo esgotado." };
  }
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export interface ZoneDaily {
  days: { date: string; requests: number; cached: number; threats: number; uniques: number; pageViews: number; bytes: number }[];
  statuses: Record<string, number>;
  countries: { country: string; requests: number; threats: number }[];
}

/** Tráfego diário da zona (httpRequests1dGroups — disponível em todos os planos). */
export function zoneDaily(from: Date, to: Date): Promise<SourceResult<ZoneDaily>> {
  const { token, zoneId } = cfEnv();
  if (!token || !zoneId) return Promise.resolve({ ok: false, reason: "Defina CLOUDFLARE_API_TOKEN (Analytics: Read) e CLOUDFLARE_ZONE_ID para ver o tráfego da Cloudflare.", configured: false });
  const q = `query($zone: String!, $from: Date!, $to: Date!) { viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1dGroups(limit: 400, filter: { date_geq: $from, date_leq: $to }, orderBy: [date_ASC]) {
      dimensions { date }
      sum { requests cachedRequests threats pageViews bytes
        responseStatusMap { edgeResponseStatus requests }
        countryMap { clientCountryName requests threats } }
      uniq { uniques } } } } }`;
  return cached(`cf-daily:${isoDate(from)}:${isoDate(to)}`, 300_000, async () => {
    type R = { viewer: { zones: { httpRequests1dGroups: { dimensions: { date: string }; uniq: { uniques: number };
      sum: { requests: number; cachedRequests: number; threats: number; pageViews: number; bytes: number;
        responseStatusMap: { edgeResponseStatus: number; requests: number }[]; countryMap: { clientCountryName: string; requests: number; threats: number }[] } }[] }[] } };
    const { data, error } = await cfGraphql<R>(q, { zone: zoneId, from: isoDate(from), to: isoDate(to) });
    const groups = data?.viewer?.zones?.[0]?.httpRequests1dGroups;
    if (!groups) return { ok: false, reason: error ?? "A Cloudflare não retornou dados para a zona.", configured: true } as const;
    const statuses: Record<string, number> = {};
    const countries = new Map<string, { requests: number; threats: number }>();
    for (const g of groups) {
      for (const s of g.sum.responseStatusMap ?? []) statuses[String(s.edgeResponseStatus)] = (statuses[String(s.edgeResponseStatus)] ?? 0) + s.requests;
      for (const c of g.sum.countryMap ?? []) {
        const cur = countries.get(c.clientCountryName) ?? { requests: 0, threats: 0 };
        countries.set(c.clientCountryName, { requests: cur.requests + c.requests, threats: cur.threats + c.threats });
      }
    }
    return { ok: true, fetchedAt: new Date().toISOString(), data: {
      days: groups.map((g) => ({ date: g.dimensions.date, requests: g.sum.requests, cached: g.sum.cachedRequests, threats: g.sum.threats,
        uniques: g.uniq.uniques, pageViews: g.sum.pageViews, bytes: g.sum.bytes })),
      statuses,
      countries: [...countries.entries()].map(([country, v]) => ({ country, ...v })).sort((a, b) => b.requests - a.requests).slice(0, 25),
    } } as const;
  });
}

export interface ZoneHourly { hours: { hour: string; requests: number; threats: number }[] }

/** Requisições por hora (httpRequests1hGroups; a janela disponível depende do plano). */
export function zoneHourly(hoursBack: number): Promise<SourceResult<ZoneHourly>> {
  const { token, zoneId } = cfEnv();
  if (!token || !zoneId) return Promise.resolve({ ok: false, reason: "Cloudflare não configurada.", configured: false });
  const to = new Date();
  const from = new Date(to.getTime() - hoursBack * 3_600_000);
  const q = `query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1hGroups(limit: 200, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [datetime_ASC]) {
      dimensions { datetime } sum { requests threats } } } } }`;
  return cached(`cf-hourly:${hoursBack}`, 300_000, async () => {
    type R = { viewer: { zones: { httpRequests1hGroups: { dimensions: { datetime: string }; sum: { requests: number; threats: number } }[] }[] } };
    const { data, error } = await cfGraphql<R>(q, { zone: zoneId, from: from.toISOString(), to: to.toISOString() });
    const g = data?.viewer?.zones?.[0]?.httpRequests1hGroups;
    if (!g) return { ok: false, reason: error ?? "Sem dados por hora para esta zona/plano.", configured: true } as const;
    return { ok: true, fetchedAt: new Date().toISOString(), data: { hours: g.map((x) => ({ hour: x.dimensions.datetime, requests: x.sum.requests, threats: x.sum.threats })) } } as const;
  });
}

export interface FirewallSummary {
  byAction: { action: string; count: number }[];
  bySource: { source: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byHour: { hour: string; count: number }[];
  topPaths: { path: string; count: number }[];
}

/** Eventos de firewall (bloqueios/desafios). Planos gratuitos têm janela e campos limitados. */
export function firewallEvents(from: Date, to: Date): Promise<SourceResult<FirewallSummary>> {
  const { token, zoneId } = cfEnv();
  if (!token || !zoneId) return Promise.resolve({ ok: false, reason: "Cloudflare não configurada.", configured: false });
  const q = `query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: { zoneTag: $zone }) {
    byAction: firewallEventsAdaptiveGroups(limit: 20, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [count_DESC]) { count dimensions { action } }
    bySource: firewallEventsAdaptiveGroups(limit: 20, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [count_DESC]) { count dimensions { source } }
    byCountry: firewallEventsAdaptiveGroups(limit: 20, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [count_DESC]) { count dimensions { clientCountryName } }
    byHour: firewallEventsAdaptiveGroups(limit: 200, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [datetimeHour_ASC]) { count dimensions { datetimeHour } }
    byPath: firewallEventsAdaptiveGroups(limit: 15, filter: { datetime_geq: $from, datetime_lt: $to }, orderBy: [count_DESC]) { count dimensions { clientRequestPath } }
  } } }`;
  // A Cloudflare limita a janela dos eventos de firewall (no plano gratuito, poucos dias): usamos no máximo 7 dias.
  const start = new Date(Math.max(from.getTime(), to.getTime() - 7 * 86_400_000));
  return cached(`cf-fw:${start.toISOString().slice(0, 13)}:${to.toISOString().slice(0, 13)}`, 300_000, async () => {
    type G<K extends string> = { count: number; dimensions: Record<K, string> }[];
    type R = { viewer: { zones: { byAction: G<"action">; bySource: G<"source">; byCountry: G<"clientCountryName">; byHour: G<"datetimeHour">; byPath: G<"clientRequestPath"> }[] } };
    const { data, error } = await cfGraphql<R>(q, { zone: zoneId, from: start.toISOString(), to: to.toISOString() });
    const z = data?.viewer?.zones?.[0];
    if (!z) return { ok: false, reason: error ?? "Eventos de firewall indisponíveis para este plano.", configured: true } as const;
    return { ok: true, fetchedAt: new Date().toISOString(), data: {
      byAction: (z.byAction ?? []).map((x) => ({ action: x.dimensions.action, count: x.count })),
      bySource: (z.bySource ?? []).map((x) => ({ source: x.dimensions.source, count: x.count })),
      byCountry: (z.byCountry ?? []).map((x) => ({ country: x.dimensions.clientCountryName, count: x.count })),
      byHour: (z.byHour ?? []).map((x) => ({ hour: x.dimensions.datetimeHour, count: x.count })),
      topPaths: (z.byPath ?? []).map((x) => ({ path: x.dimensions.clientRequestPath, count: x.count })),
    } } as const;
  });
}

export interface WorkerStats {
  days: { date: string; requests: number; errors: number; subrequests: number; cpuP50: number | null; cpuP99: number | null; durP50: number | null; durP99: number | null }[];
  statuses: { status: string; requests: number }[];
}

/** Métricas do Worker (workersInvocationsAdaptive). */
export function workerStats(from: Date, to: Date): Promise<SourceResult<WorkerStats>> {
  const { token, accountId, script } = cfEnv();
  if (!token || !accountId) return Promise.resolve({ ok: false, reason: "Defina CLOUDFLARE_API_TOKEN (Account Analytics: Read) e CLOUDFLARE_ACCOUNT_ID para ver as métricas do Worker.", configured: false });
  const start = new Date(Math.max(from.getTime(), to.getTime() - 31 * 86_400_000));
  const q = `query($acc: String!, $script: String!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $acc }) {
    daily: workersInvocationsAdaptive(limit: 100, filter: { scriptName: $script, datetime_geq: $from, datetime_lt: $to }, orderBy: [date_ASC]) {
      dimensions { date } sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 durationP50 durationP99 } }
    status: workersInvocationsAdaptive(limit: 20, filter: { scriptName: $script, datetime_geq: $from, datetime_lt: $to }, orderBy: [sum_requests_DESC]) {
      dimensions { status } sum { requests } } } } }`;
  return cached(`cf-workers:${start.toISOString().slice(0, 13)}:${to.toISOString().slice(0, 13)}`, 300_000, async () => {
    type R = { viewer: { accounts: { daily: { dimensions: { date: string }; sum: { requests: number; errors: number; subrequests: number };
      quantiles: { cpuTimeP50: number; cpuTimeP99: number; durationP50: number; durationP99: number } }[]; status: { dimensions: { status: string }; sum: { requests: number } }[] }[] } };
    const { data, error } = await cfGraphql<R>(q, { acc: accountId, script, from: start.toISOString(), to: to.toISOString() });
    const a = data?.viewer?.accounts?.[0];
    if (!a?.daily) return { ok: false, reason: error ?? "Métricas do Worker indisponíveis.", configured: true } as const;
    return { ok: true, fetchedAt: new Date().toISOString(), data: {
      days: a.daily.map((d) => ({ date: d.dimensions.date, requests: d.sum.requests, errors: d.sum.errors, subrequests: d.sum.subrequests,
        cpuP50: d.quantiles?.cpuTimeP50 ?? null, cpuP99: d.quantiles?.cpuTimeP99 ?? null,
        // durationP* vem em GB-s em alguns planos; exibimos só o tempo de CPU como métrica principal.
        durP50: d.quantiles?.durationP50 ?? null, durP99: d.quantiles?.durationP99 ?? null })),
      statuses: (a.status ?? []).map((s) => ({ status: s.dimensions.status, requests: s.sum.requests })),
    } } as const;
  });
}

export const cloudflareConfigured = () => { const c = cfEnv(); return { zone: Boolean(c.token && c.zoneId), account: Boolean(c.token && c.accountId) }; };

/* ─────────────────────────── Supabase (logs de autenticação) ─────────────────────────── */
export interface AuthFailure { hour: string; path: string; status: number; ip: string; n: number }

/**
 * Falhas de login/cadastro/MFA (status ≥ 400) via Management API de logs (janela máxima de 24 h).
 * Requer SUPABASE_ACCESS_TOKEN — opcional; sem ele, o painel usa só os eventos registrados pelo próprio Worthwise.
 */
export function supabaseAuthFailures(hoursBack = 1): Promise<SourceResult<AuthFailure[]>> {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(publicEnv.supabaseUrl)?.[1];
  if (!token || !ref) return Promise.resolve({ ok: false, reason: "SUPABASE_ACCESS_TOKEN não configurado: falhas de login do site principal não são importadas.", configured: false });
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(24, hoursBack) * 3_600_000);
  const sql = `select toStartOfHour(timestamp) as hour, JSONExtractString(event_message, 'path') as path, JSONExtractInt(event_message, 'status') as status,
    JSONExtractString(event_message, 'remote_addr') as ip, count() as n from logs where source = 'auth_logs'
    and JSONExtractString(event_message, 'path') in ('/token', '/signup', '/recover', '/otp', '/verify', '/factors')
    and JSONExtractInt(event_message, 'status') >= 400 group by hour, path, status, ip order by n desc limit 500`;
  return cached(`sb-auth:${hoursBack}:${end.toISOString().slice(0, 15)}`, 120_000, async () => {
    try {
      const u = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
      u.searchParams.set("sql", sql);
      u.searchParams.set("iso_timestamp_start", start.toISOString());
      u.searchParams.set("iso_timestamp_end", end.toISOString());
      const res = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => null)) as { result?: AuthFailure[]; error?: string } | null;
      if (!res.ok || !json?.result) return { ok: false, reason: json?.error ?? `Supabase respondeu ${res.status}.`, configured: true } as const;
      return { ok: true, fetchedAt: new Date().toISOString(), data: json.result.map((r) => ({ ...r, status: Number(r.status), n: Number(r.n) })) } as const;
    } catch {
      return { ok: false, reason: "Supabase Management API indisponível.", configured: true } as const;
    }
  });
}

/* ─────────────────────────── Verificação das integrações ─────────────────────────── */
export interface IntegrationCheck { id: string; name: string; ok: boolean | null; detail: string; ms: number | null }

async function timed(id: string, name: string, fn: () => Promise<{ ok: boolean | null; detail: string }>): Promise<IntegrationCheck> {
  const t = Date.now();
  try { const r = await fn(); return { id, name, ...r, ms: Date.now() - t }; } catch (e) { return { id, name, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "erro", ms: Date.now() - t }; }
}

export async function checkIntegrations(): Promise<IntegrationCheck[]> {
  const e = serverEnv();
  return Promise.all([
    timed("supabase", "Supabase", async () => {
      const r = await fetch(`${publicEnv.supabaseUrl}/auth/v1/health`, { headers: { apikey: publicEnv.supabaseKey }, signal: AbortSignal.timeout(8000) });
      return { ok: r.ok, detail: r.ok ? "Autenticação e API respondendo." : `Respondeu ${r.status}.` };
    }),
    timed("geckoapi", "GeckoAPI", async () => {
      const r = await geckoCredits();
      return r.ok ? { ok: true, detail: `Saldo: ${r.data.currentCredits} créditos.` } : { ok: r.configured ? false : null, detail: r.reason };
    }),
    timed("heropay", "HeroPay", async () => {
      if (!e.heropayToken) return { ok: null, detail: "HEROPAY_JWT_TOKEN não configurado." };
      const r = await fetch(`${e.heropayUrl}/webhook`, { headers: { authorization: `Bearer ${e.heropayToken}`, accept: "application/vnd.herospark.com; version=1" }, signal: AbortSignal.timeout(10000) });
      return { ok: r.ok, detail: r.ok ? `API respondendo${e.heropayUrl.includes("beta") ? " (sandbox)" : ""}.` : `Respondeu ${r.status}.` };
    }),
    timed("cloudflare", "Cloudflare Analytics", async () => {
      const c = cloudflareConfigured();
      if (!c.zone && !c.account) return { ok: null, detail: "Token da Cloudflare não configurado." };
      const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(8000) });
      return { ok: r.ok, detail: r.ok ? "Token válido." : `Token recusado (${r.status}).` };
    }),
  ]);
}
