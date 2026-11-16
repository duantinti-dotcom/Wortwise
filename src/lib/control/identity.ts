/**
 * Identificadores sem dado pessoal:
 *  - origem (actor): HMAC do IP com o segredo do servidor, truncado — permite agrupar tentativas
 *    da mesma origem sem guardar o IP;
 *  - visitante: HMAC de dia + IP + navegador — o sal muda todo dia, então não dá para seguir
 *    a mesma pessoa entre dias (medição agregada, sem cookie).
 */
async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function actorHash(secret: string, ip: string): Promise<string> {
  return (await hmacHex(secret || "ww-dev", `actor:${ip}`)).slice(0, 16);
}

export async function visitorHash(secret: string, day: string, ip: string, userAgent: string): Promise<string> {
  return (await hmacHex(secret || "ww-dev", `visit:${day}:${ip}:${userAgent.slice(0, 200)}`)).slice(0, 32);
}

export function requestIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export function requestCountry(headers: Headers): string | null {
  const c = headers.get("cf-ipcountry");
  return c && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

/** Robôs declarados não contam como visitantes. */
export const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|headless|lighthouse|pingdom|uptime/i;

/** Caminhos típicos de varredura automática (o Worthwise não usa nenhum deles). */
export const SCANNER_PATH = /^\/(?:wp-|wordpress|\.env|\.git|\.aws|\.ssh|\.DS_Store|xmlrpc\.php|phpmyadmin|pma\b|myadmin|cgi-bin|vendor\/phpunit|actuator|boaform|server-status|config\.php|admin\.php|administrator|setup\.php|HNAP1|owa\/|ecp\/|autodiscover|solr\/|console\/|_ignition|telescope|debug\/|\.vscode|backup|db\.sql|dump\.sql)/i;
