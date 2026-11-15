import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUser } from "@/lib/auth";

/**
 * Foto ilustrativa de um produto, gerada pela IA da Cloudflare (FLUX) a partir de uma descrição curta.
 * Cada foto é criada uma vez e fica no cache compartilhado por 30 dias.
 */
export async function GET(req: Request) {
  const desc = (new URL(req.url).searchParams.get("d") ?? "").replace(/[^\p{L}\p{N}\s,.'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  if (desc.length < 3) return new Response("descrição inválida", { status: 400 });
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://cache.worthwise.site/idea-img/v1/${encodeURIComponent(desc.toLowerCase())}`);
  const hit = await edge?.match(key).catch(() => undefined);
  if (hit) return hit;
  if (!(await getUser())) return new Response("não autenticado", { status: 401 });

  let ai: { run: (model: string, input: unknown) => Promise<unknown> } | undefined;
  try { ai = getCloudflareContext().env.AI as unknown as typeof ai; } catch { ai = undefined; }
  if (!ai) return new Response("IA indisponível", { status: 503 });
  try {
    const out = (await ai.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: `Professional e-commerce product photo of ${desc}, centered, isolated on pure white background, soft studio lighting, subtle shadow, high detail, no text, no logo, no brand name`,
      steps: 6,
    })) as { image?: string };
    if (!out.image) return new Response("sem imagem", { status: 502 });
    const bytes = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
    const res = new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=2592000, immutable" } });
    await edge?.put(key, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    console.error("[idea-img]", e instanceof Error ? e.message : e);
    return new Response("falha", { status: 502 });
  }
}
