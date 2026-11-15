// Tipos mínimos dos bindings usados. Regere com `npm run cf-typegen` após alterar wrangler.jsonc.
interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
/** Subconjunto do binding R2 usado pelo arquivamento. */
interface R2ObjectBodyLite { arrayBuffer(): Promise<ArrayBuffer>; size: number }
interface R2BucketLite {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLite | null>;
}
interface CloudflareEnv {
  ARCHIVE?: R2BucketLite;
  AI?: WorkersAiBinding;
  ASSETS?: { fetch: typeof fetch };
}
