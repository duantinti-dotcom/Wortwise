// Tipos mínimos dos bindings usados. Regere com `npm run cf-typegen` após alterar wrangler.jsonc.
interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
interface CloudflareEnv {
  AI?: WorkersAiBinding;
  ASSETS?: { fetch: typeof fetch };
}
