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
      const run = ai.run(model, { messages, tools: tools.length ? toOpenAiTools(tools) : undefined, max_tokens: maxTokens, temperature: 0.2 });
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new AiUnavailable("timeout")), TIMEOUT_MS));
      const out = (await Promise.race([run, timeout])) as {
        response?: unknown; tool_calls?: { id?: string; name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        content: typeof out.response === "string" ? out.response : "",
        toolCalls: (out.tool_calls ?? []).map((c, i) => ({
          id: c.id ?? `call_${i}`, name: c.name ?? c.function?.name ?? "", arguments: parseArgs(c.arguments ?? c.function?.arguments),
        })).filter((c) => c.name),
        tokensIn: out.usage?.prompt_tokens ?? null, tokensOut: out.usage?.completion_tokens ?? null,
      };
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
  return workersAi(e.aiModel);
}
