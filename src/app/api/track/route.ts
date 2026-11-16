import { serverEnv } from "@/lib/env";
import { BOT_UA, requestCountry, requestIp, visitorHash } from "@/lib/control/identity";
import { spDay } from "@/lib/control/range";
import { serverRpcSafe } from "@/lib/supabase/server";

/**
 * Medição agregada de visitantes (Worthwise Control), compatível com a LGPD:
 *  - sem cookie e sem identificador persistente: o hash usa um sal diário e o segredo do servidor,
 *    então não liga visitas de dias diferentes nem revela o IP;
 *  - respeita "Do Not Track" e Global Privacy Control;
 *  - robôs declarados não contam.
 * Só grava a contagem do dia (visitantes únicos e páginas vistas) e o país informado pela Cloudflare.
 */
export async function POST(req: Request) {
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  const site = h.get("sec-fetch-site");
  const ok = ua && !BOT_UA.test(ua) && h.get("dnt") !== "1" && h.get("sec-gpc") !== "1" && (!site || site === "same-origin");
  if (ok && serverEnv().serverSecret) {
    const vhash = await visitorHash(serverEnv().serverSecret, spDay(new Date()), requestIp(h), ua);
    await serverRpcSafe("server_track_visit", { p_vhash: vhash, p_country: requestCountry(h) });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
