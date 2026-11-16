import "server-only";
import { serverEnv } from "@/lib/env";
import { serverRpc, serverRpcSafe } from "@/lib/supabase/server";
import { actorHash } from "./identity";
import { checkIntegrations, geckoCredits, supabaseAuthFailures } from "./sources";
import { creditForecast } from "./finance";

interface Notify { id: number; rule_key: string; title: string; priority: string; value: number | null; first_seen: string; occurrences: number; first_time: boolean }

/**
 * Rotina do painel (Cron a cada 30 min, chamada por /api/cron/control):
 *  1. saldo oficial da GeckoAPI (no máximo 1 leitura por hora);
 *  2. falhas de autenticação do Supabase (se SUPABASE_ACCESS_TOKEN existir) → eventos de segurança;
 *  3. verificação das integrações;
 *  4. consolidação diária + retenção;
 *  5. avaliação das regras de alerta e envio das notificações (sem repetir o mesmo incidente).
 */
export async function runControlMonitor() {
  const out: Record<string, unknown> = {};
  const secret = serverEnv().serverSecret;

  // 1. GeckoAPI
  let gecko: { current_credits: number; days_left: number | null } | null = null;
  const credits = await geckoCredits();
  if (credits.ok) {
    const f = creditForecast(credits.data.currentCredits, credits.data.last7Days, credits.data.last24Hours);
    gecko = { current_credits: credits.data.currentCredits, days_left: f.daysLeft };
    const last = await serverRpc<string | null>("server_gecko_balance_last").catch(() => null);
    if (!last || Date.now() - Date.parse(last) > 55 * 60_000) {
      await serverRpcSafe("server_gecko_balance", { p_current: credits.data.currentCredits, p_24h: credits.data.last24Hours,
        p_7d: credits.data.last7Days, p_30d: credits.data.last30Days, p_plan: credits.data.planId });
    }
    out.gecko = gecko;
  } else out.gecko = credits.reason;

  // 2. Falhas de login no Supabase (última hora). O IP vira hash antes de ser gravado.
  const failures = await supabaseAuthFailures(1);
  if (failures.ok) {
    const byActor = new Map<string, { n: number; paths: Set<string>; statuses: Set<number> }>();
    for (const f of failures.data) {
      const a = await actorHash(secret, f.ip || "desconhecido");
      const cur = byActor.get(a) ?? { n: 0, paths: new Set(), statuses: new Set() };
      cur.n += f.n; cur.paths.add(f.path); cur.statuses.add(f.status);
      byActor.set(a, cur);
    }
    for (const [actor, v] of byActor) {
      const severity = v.n >= 20 ? "high" : v.n >= 5 ? "medium" : "low";
      // Um evento por origem e janela; o contador do evento recebe o total de falhas.
      await serverRpcSafe("server_control_event", { p_category: "security", p_kind: v.statuses.has(429) ? "auth_rate_limited" : "auth_failed",
        p_severity: severity, p_class: v.statuses.has(429) ? "blocked" : "suspicious", p_actor: actor, p_country: null,
        p_path: [...v.paths].join(",").slice(0, 100), p_detail: { failures: v.n, statuses: [...v.statuses] } });
    }
    out.authFailures = failures.data.length;
  } else out.authFailures = failures.reason;

  // 3. Integrações
  const checks = await checkIntegrations();
  out.integrations = checks.map((c) => ({ id: c.id, ok: c.ok }));

  // 4. Consolidação
  out.rollup = await serverRpc("server_control_rollup").catch((e) => String(e).slice(0, 200));

  // 5. Alertas
  const ev = await serverRpc<{ notify: Notify[]; open: number }>("server_control_evaluate", {
    p_ext: { gecko, integrations: checks.filter((c) => c.ok !== null).map((c) => ({ id: c.id, name: c.name, ok: c.ok, detail: c.detail })) },
  }).catch((e) => ({ notify: [] as Notify[], open: -1, error: String(e).slice(0, 200) }));
  out.alerts = { open: ev.open, notified: ev.notify.length };
  if (ev.notify.length) out.email = await sendAlertEmail(ev.notify);
  return out;
}

/** E-mail opcional (Resend): RESEND_API_KEY + CONTROL_ALERT_EMAIL. Sem eles, os alertas ficam no painel e no sino. */
async function sendAlertEmail(items: Notify[]): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTROL_ALERT_EMAIL;
  const from = process.env.CONTROL_ALERT_FROM ?? "Worthwise Control <alertas@worthwise.site>";
  if (!key || !to) return "not_configured";
  const sorted = [...items].sort((a, b) => a.priority.localeCompare(b.priority));
  const subject = `[${sorted[0]!.priority}] ${sorted.length === 1 ? sorted[0]!.title : `${sorted.length} alertas no Worthwise`}`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
    <p><strong>Worthwise Control</strong></p>
    <ul>${sorted.map((i) => `<li><strong>${i.priority}</strong> · ${esc(i.title)}${i.first_time ? "" : ` <em>(continua aberto, ${i.occurrences} verificações)</em>`}</li>`).join("")}</ul>
    <p><a href="https://${process.env.CONTROL_HOST ?? "admin.worthwise.site"}/alertas">Abrir alertas</a></p></div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()), subject, html }), signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "sent" : `error_${r.status}`;
  } catch {
    return "error";
  }
}
