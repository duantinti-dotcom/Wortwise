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
  chat(messages: ChatMessage[], tools: ToolDef[], maxTokens: number, timeoutMs?: number): Promise<ChatResult>;
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
    async chat(messages, tools, maxTokens, timeoutMs = TIMEOUT_MS) {
      const run = ai.run(model, { messages, tools: tools.length ? toOpenAiTools(tools) : undefined, max_tokens: maxTokens, temperature: 0.3 });
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new AiUnavailable("timeout")), timeoutMs));
      const out = (await Promise.race([run, timeout]).catch((e: unknown) => {
        const m = e instanceof Error ? e.message : String(e);
        throw new AiUnavailable(/allocation|neurons|\b429\b/i.test(m) ? "quota" : m.slice(0, 200));
      })) as WorkersAiOutput;
      return parseWorkersAi(out);
    },
  };
}

/** Qualquer API compatível com OpenAI /chat/completions (inclusive um Ollama hospedado à parte). */
function openAiCompatible(baseUrl: string, apiKey: string, model: string): AiProvider {
  return {
    id: "openai-compatible", model,
    async chat(messages, tools, maxTokens, timeoutMs = TIMEOUT_MS) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model, messages, tools: tools.length ? toOpenAiTools(tools) : undefined, max_tokens: maxTokens, temperature: 0.2 }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new AiUnavailable("network");
      }
      if (!res.ok) throw new AiUnavailable(`status ${res.status}: ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160)}`);
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

/** Google Gemini pela API nativa (generateContent), com suporte a ferramentas. */
function geminiNative(apiKey: string, model: string): AiProvider {
  return {
    id: "gemini", model,
    async chat(messages, tools, maxTokens, timeoutMs = TIMEOUT_MS) {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const contents: unknown[] = [];
      for (const m of messages) {
        if (m.role === "system") continue;
        if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
        else if (m.role === "assistant") {
          const parts: unknown[] = [];
          if (m.content) parts.push({ text: m.content });
          for (const c of m.tool_calls ?? []) parts.push({ functionCall: { name: c.function.name, args: parseArgs(c.function.arguments) } });
          if (parts.length) contents.push({ role: "model", parts });
        } else if (m.role === "tool") {
          contents.push({ role: "user", parts: [{ functionResponse: { name: m.name ?? "ferramenta", response: { content: m.content } } }] });
        }
      }
      const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new AiUnavailable("network");
      }
      if (!res.ok) throw new AiUnavailable(`status ${res.status}: ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160)}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name: string; args?: unknown } }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return {
        content: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(""),
        toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `gemini_${i}_${Date.now()}`, name: p.functionCall!.name, arguments: parseArgs(p.functionCall!.args) })),
        tokensIn: data.usageMetadata?.promptTokenCount ?? null, tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
      };
    },
  };
}

/** Encadeia provedores: se um falhar (limite grátis, fora do ar, demora), tenta o próximo. */
function chain(list: AiProvider[]): AiProvider {
  return {
    id: list.map((p) => p.id).join(">"), model: list[0]!.model,
    async chat(messages, tools, maxTokens, timeoutMs) {
      let last: unknown;
      for (const p of list) {
        try { return await p.chat(messages, tools, maxTokens, Math.min(timeoutMs ?? TIMEOUT_MS, 50000)); } catch (err) {
          last = err;
          console.warn(`[ai] ${p.id}/${p.model} falhou, tentando o próximo:`, err instanceof Error ? err.message : err);
        }
      }
      const m = last instanceof Error ? last.message : String(last);
      throw new AiUnavailable(/quota|429|allocation|limit/i.test(m) ? "quota" : m || "unavailable");
    },
  };
}

/** Fila de IAs: Groq → Gemini → OpenRouter → Cloudflare (as que tiverem chave configurada). */
export function getAiProvider(): AiProvider | null {
  const e = serverEnv();
  const list: AiProvider[] = [];
  const named = (id: string, p: AiProvider): AiProvider => ({ ...p, id });
  if (e.groqKey) list.push(named("groq", openAiCompatible("https://api.groq.com/openai/v1", e.groqKey, e.groqModel)));
  if (e.geminiKey) list.push(geminiNative(e.geminiKey, e.geminiModel));
  if (e.openrouterKey) list.push(named("openrouter", openAiCompatible("https://openrouter.ai/api/v1", e.openrouterKey, e.openrouterModel)));
  if (e.aiProvider === "openai-compatible" && e.aiBaseUrl) list.push(openAiCompatible(e.aiBaseUrl, e.aiApiKey, e.aiModel));
  else {
    const main = workersAi(e.aiModel);
    if (main) list.push(main);
    const backup = e.aiFallbackModel && e.aiFallbackModel !== e.aiModel ? workersAi(e.aiFallbackModel) : null;
    if (backup) list.push(backup);
  }
  if (!list.length) return null;
  return list.length === 1 ? list[0]! : chain(list);
}

/** Lista os provedores configurados (para a página de saúde e testes). */
export function aiProviders(): { id: string; model: string; provider: AiProvider }[] {
  const e = serverEnv();
  const out: { id: string; model: string; provider: AiProvider }[] = [];
  if (e.groqKey) out.push({ id: "groq", model: e.groqModel, provider: openAiCompatible("https://api.groq.com/openai/v1", e.groqKey, e.groqModel) });
  if (e.geminiKey) out.push({ id: "gemini", model: e.geminiModel, provider: geminiNative(e.geminiKey, e.geminiModel) });
  if (e.openrouterKey) out.push({ id: "openrouter", model: e.openrouterModel, provider: openAiCompatible("https://openrouter.ai/api/v1", e.openrouterKey, e.openrouterModel) });
  const w = workersAi(e.aiModel);
  if (w) out.push({ id: "cloudflare", model: e.aiModel, provider: w });
  return out;
}
