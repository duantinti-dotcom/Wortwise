import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental em R2 por enquanto: as páginas públicas são estáticas (servidas como assets)
// e as privadas são dinâmicas. Adicione r2IncrementalCache quando houver ISR.
export default defineCloudflareConfig({});
