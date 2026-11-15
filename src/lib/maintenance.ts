import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { serverRpc, serverRpcSafe, supabaseAnon } from "@/lib/supabase/server";

/**
 * Manutenção do banco (chamada pelo Cloudflare Cron às 03:17 de Brasília, horário de pouco uso).
 *  1. No banco: caches vencidos, logs técnicos, duplicatas de preço, compactação, estatísticas,
 *     foto do tamanho e alertas de cota (função server_maintenance, em lotes).
 *  2. No Worker: histórico de preços com mais de N dias vai para o Cloudflare R2 — só quando o
 *     bucket está configurado. Cada lote é gravado, lido de volta e conferido (SHA-256) antes de
 *     sair do banco. Sem R2, nada é arquivado nem apagado.
 */
const BATCH = 5000;
const MAX_BATCHES = 6;

export function archiveBucket(): R2BucketLite | null {
  try {
    return getCloudflareContext().env.ARCHIVE ?? null;
  } catch {
    return null;
  }
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>) {
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(data: ArrayBuffer): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

interface ArchiveRow { id: number; product_id: string; collected_at: string; [k: string]: unknown }

export async function archivePrices(bucket: R2BucketLite) {
  let archived = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await serverRpc<ArchiveRow[]>("server_archive_candidates", { p_limit: BATCH });
    if (!rows.length) break;
    const first = rows[0]!.collected_at;
    const month = first.slice(0, 7).replace("-", "/");
    const key = `price-history/${month}/${first.slice(0, 10)}-${rows[0]!.id}-${rows.at(-1)!.id}.ndjson.gz`;
    const body = await gzip(rows.map((r) => JSON.stringify(r)).join("\n"));
    const sha = await sha256Hex(body);
    await bucket.put(key, body, { httpMetadata: { contentType: "application/x-ndjson", contentEncoding: "gzip" }, customMetadata: { sha256: sha, rows: String(rows.length) } });
    // Confere a cópia gravada antes de apagar qualquer coisa.
    const back = await bucket.get(key);
    if (!back) throw new Error(`Arquivo ${key} não encontrado após a gravação`);
    const copy = new Uint8Array(await back.arrayBuffer());
    if ((await sha256Hex(copy)) !== sha) throw new Error(`Checksum diferente em ${key}`);
    if ((await gunzip(copy.buffer as ArrayBuffer)).split("\n").length !== rows.length) throw new Error(`Contagem diferente em ${key}`);
    const r = await serverRpc<{ archived: number }>("server_archive_commit", { p_key: key, p_sha256: sha, p_bytes: body.byteLength, p_ids: rows.map((x) => x.id) });
    archived += r.archived;
    if (rows.length < BATCH) break;
  }
  return archived;
}

export async function runMaintenance() {
  const db = await serverRpc<Record<string, unknown>>("server_maintenance");
  const { data: cfg } = await supabaseAnon().from("app_settings").select("value").eq("key", "maintenance").maybeSingle();
  const settings = (cfg?.value ?? {}) as { enabled?: boolean; tasks?: { archive_prices?: boolean } };
  let archive: { status: string; rows?: number; error?: string } = { status: "skipped" };
  if (settings.enabled !== false && settings.tasks?.archive_prices !== false) {
    const bucket = archiveBucket();
    if (!bucket) archive = { status: "r2_not_configured" };
    else {
      try {
        archive = { status: "ok", rows: await archivePrices(bucket) };
      } catch (e) {
        archive = { status: "error", error: (e as Error).message };
        await serverRpcSafe("server_log_maintenance", { p_task: "archive_prices", p_ok: false, p_rows: 0, p_details: {}, p_error: archive.error });
      }
    }
  }
  return { db, archive };
}

/** Histórico arquivado de um produto (lê do R2 os arquivos indicados no manifesto). */
export async function loadArchivedHistory(productId: string): Promise<ArchiveRow[]> {
  const bucket = archiveBucket();
  if (!bucket) return [];
  try {
    const files = await serverRpc<{ key: string }[]>("server_archive_lookup", { p_product: productId });
    const out: ArchiveRow[] = [];
    for (const f of files.slice(0, 24)) {
      const obj = await bucket.get(f.key);
      if (!obj) continue;
      for (const line of (await gunzip(await obj.arrayBuffer())).split("\n")) {
        if (!line) continue;
        const row = JSON.parse(line) as ArchiveRow;
        if (row.product_id === productId) out.push(row);
      }
    }
    return out;
  } catch {
    return []; // histórico arquivado indisponível: mostra o que está no banco
  }
}
