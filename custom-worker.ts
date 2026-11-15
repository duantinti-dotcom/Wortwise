// Worker de entrada: reutiliza o handler gerado pelo OpenNext e adiciona o Cron Trigger.
// @ts-ignore `.open-next/worker.js` é gerado no build
import { default as handler } from "./.open-next/worker.js";

interface Env { CRON_SECRET?: string; APP_URL?: string }

const worker = {
  fetch: handler.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // O cron chama a própria aplicação por dentro, autenticado pelo segredo do cron.
    const base = env.APP_URL ?? "https://worthwise.internal";
    const daily = event.cron === "17 6 * * *";
    // Diário: manutenção do banco. (O preparo das ideias da IA fica em /api/cron/ideas, para rodar sob demanda.)
    const tasks = daily ? ["purge"] : ["monitor"];
    for (const task of tasks) {
      const req = new Request(`${base}/api/cron/${task}`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
      });
      ctx.waitUntil(handler.fetch(req, env, ctx));
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;
