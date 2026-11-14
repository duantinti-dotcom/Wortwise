/**
 * Assinatura AWS Signature Version 4 (usada pela Product Advertising API da Amazon).
 * Implementada com Web Crypto, que existe tanto no Node quanto no Cloudflare Workers.
 * Referência: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */
const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
async function sha256Hex(data: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(data))); }
async function hmac(key: ArrayBuffer | Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

export interface SignInput {
  method: "POST" | "GET";
  host: string;
  path: string;
  region: string;
  service: string;
  headers: Record<string, string>; // sem host e x-amz-date (são adicionados aqui)
  body: string;
  accessKey: string;
  secretKey: string;
  now?: Date;
}

/** Devolve os cabeçalhos completos (incluindo Authorization) para a requisição assinada. */
export async function signV4(i: SignInput): Promise<Record<string, string>> {
  const now = i.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // AAAAMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: i.host, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [i.method, i.path, "", canonicalHeaders, signedHeaders, await sha256Hex(i.body)].join("\n");
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kDate = await hmac(enc.encode(`AWS4${i.secretKey}`), date);
  const kRegion = await hmac(kDate, i.region);
  const kService = await hmac(kRegion, i.service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}
