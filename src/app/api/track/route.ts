import { serverEnv } from "@/lib/env";
import { BOT_UA, requestCountry, requestIp, visitorHash } from "@/lib/control/identity";
import { spDay } from "@/lib/control/range";
import { serverRpcSafe } from "@/lib/supabase/server";

/**
 * Medição de visitas (Worthwise Control), compatível com a LGPD:
 *  - sem cookie: o código do visitante usa um sal diário e o segredo do servidor, sem revelar o IP;
 *  - guarda horário, página, país, tipo de aparelho e site de origem (só o domínio) por 30 dias;
 *  - respeita "Do Not Track" e Global Privacy Control; robôs declarados não contam.
 */
export async function POST(req: Request) {
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  const site = h.get("sec-fetch-site");
  const ok = ua && !BOT_UA.test(ua) && h.get("dnt") !== "1" && h.get("sec-gpc") !== "1" && (!site || site === "same-origin");
  if (ok && serverEnv().serverSecret) {
    let body: { p?: unknown; r?: unknown } = {};
    try { body = JSON.parse((await req.text()).slice(0, 2000)) as typeof body; } catch { /* sem corpo */ }
    const path = typeof body.p === "string" && body.p.startsWith("/") ? body.p.split("?")[0]!.slice(0, 160) : null;
    let referrer: string | null = null;
    try {
      const host = typeof body.r === "string" && body.r ? new URL(body.r).hostname.replace(/^www\./, "") : null;
      referrer = host && !host.endsWith("worthwise.site") ? host : null;
    } catch { /* origem inválida */ }
    const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
    const vhash = await visitorHash(serverEnv().serverSecret, spDay(new Date()), requestIp(h), ua);
    await serverRpcSafe("server_track_visit", { p_vhash: vhash, p_country: requestCountry(h), p_path: path, p_device: device, p_referrer: referrer });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
