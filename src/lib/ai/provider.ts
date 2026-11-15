import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { serverEnv } from "@/lib/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface AiProvider {
  id: string;
  model: string;
  chat(messages: ChatMessage[], tools: ToolDef[], maxTokens: number): Promise<ChatResult>;
}

export class AiUnavailable extends Error {}

const TIMEOUT_MS = 45000;

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

const toOpenAiTools = (tools: ToolDef[]) => tools.map((t) => ({ type: "function", function: t }));

type RawCall = { id?: string; name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } };
export interface WorkersAiOutput {
  /** Formato antigo dos modelos Workers AI. */
  response?: unknown; tool_calls?: RawCall[];
  /** Formato compatível com OpenAI (usado pelos modelos mais novos, como gpt-oss). */
  choices?: { message?: { content?: string | null; tool_calls?: RawCall[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Lê a resposta nos dois formatos que o Workers AI devolve. */
export function parseWorkersAi(out: WorkersAiOutput): ChatResult {
  const msg = out.choices?.[0]?.message;
  const content = typeof msg?.content === "string" ? msg.content : typeof out.response === "string" ? out.response : "";
  const calls = msg?.tool_calls?.length ? msg.tool_calls : out.tool_calls ?? [];
  return {
    content,
    toolCalls: calls.map((c, i) => ({
      id: c.id ?? `call_${i}`, name: c.function?.name ?? c.name ?? "", arguments: parseArgs(c.function?.arguments ?? c.arguments),
    })).filter((c) => c.name),
    tokensIn: out.usage?.prompt_tokens ?? null, tokensOut: out.usage?.completion_tokens ?? null,
  };
}

/** Cloudflare Workers AI via binding `AI` (sem chave de API; cobrado por uso na conta Cloudflare). */
function workersAi(model: string): AiProvider | null {
  let ai: CloudflareEnv["AI"];
  try {
    ai = getCloudflareContext().env.AI;
  } catch {
    return null;
  }
  if (!ai) return null;
  return {
    id: "workers-ai", model,
    async chat(messages, tools, maxTokens) {
      const run = ai.run(model, { messages, tools: tools.length ? toOpenAiTools(tools) : undefined, max_tokens: maxTokens, temperature: 0.3 });
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new AiUnavailable("timeout")), TIMEOUT_MS));
      const out = (await Promise.race([run, timeout])) as WorkersAiOutput;
      return parseWorkersAi(out);
    },
  };
}

/** Qualquer API compatível com OpenAI /chat/completions (inclusive um Ollama hospedado à parte). */
function openAiCompatible(baseUrl: string, apiKey: string, model: string): AiProvider {
  return {
    id: "openai-compatible", model,
    async chat(messages, tools, maxTokens) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model, messages, tools: tools.length ? toOpenAiTools(tools) : undefined, max_tokens: maxTokens, temperature: 0.2 }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new AiUnavailable("network");
      }
      if (!res.ok) throw new AiUnavailable(`status ${res.status}`);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      return {
        content: msg?.content ?? "",
        toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
        tokensIn: data.usage?.prompt_tokens ?? null, tokensOut: data.usage?.completion_tokens ?? null,
      };
    },
  };
}

/** Retorna o provedor configurado, ou null quando a IA não está disponível (a interface mostra o estado real). */
export function getAiProvider(): AiProvider | null {
  const e = serverEnv();
  if (e.aiProvider === "openai-compatible") {
    return e.aiBaseUrl ? openAiCompatible(e.aiBaseUrl, e.aiApiKey, e.aiModel) : null;
  }
  const main = workersAi(e.aiModel);
  if (!main) return null;
  const backup = e.aiFallbackModel && e.aiFallbackModel !== e.aiModel ? workersAi(e.aiFallbackModel) : null;
  if (!backup) return main;
  // Se o modelo principal falhar (fila cheia, instabilidade), tenta uma vez o modelo reserva.
  return {
    id: main.id, model: main.model,
    async chat(messages, tools, maxTokens) {
      try { return await main.chat(messages, tools, maxTokens); } catch (err) {
        console.warn("[ai] modelo principal falhou, usando reserva:", err instanceof Error ? err.message : err);
        return backup.chat(messages, tools, maxTokens);
      }
    },
  };
}
