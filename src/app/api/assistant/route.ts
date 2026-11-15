import { z } from "zod";
import { getUser } from "@/lib/auth";
import { runAgent, type AgentContext, type AssistantBlock, type AssistantEvent } from "@/lib/ai/agent";
import { sourcesOverview } from "@/lib/connectors/registry";
import { isSmallTalk } from "@/lib/ai/small-talk";
import { AiUnavailable, getAiProvider, type ChatMessage } from "@/lib/ai/provider";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { serverRpcSafe, supabaseAnon, supabaseServer } from "@/lib/supabase/server";

const schema = z.object({ conversationId: z.string().uuid().nullish(), message: z.string().trim().min(2).max(1500) });

interface AssistantSettings { max_output_tokens?: number; max_history_messages?: number; max_tool_rounds?: number }

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta para usar o assistente.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Escreva uma pergunta com até 1.500 caracteres.");

  const provider = getAiProvider();
  if (!provider) {
    return apiError("not_configured", "O assistente ainda não está disponível neste ambiente. As demais ferramentas continuam funcionando.");
  }

  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "assistant" });
  if (allowed === false) return apiError("rate_limited", "Muitas mensagens em sequência. Aguarde um minuto.");

  // Conversa (criada com a sessão do usuário; RLS garante a posse).
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!conv) return apiError("not_found", "Conversa não encontrada.");
  } else {
    const { data: conv, error } = await supabase.from("ai_conversations")
      .insert({ user_id: user.id, title: body.message.slice(0, 60) }).select("id").single();
    if (error || !conv) return apiError("internal", "Não foi possível iniciar a conversa.");
    conversationId = conv.id as string;
  }

  // Cumprimentos e agradecimentos curtos não gastam mensagens do plano.
  const smallTalk = isSmallTalk(body.message);
  let q: { allowed: boolean; remaining: number | null; plan: string } | null;
  if (smallTalk) {
    q = { allowed: true, remaining: null, plan: "" };
  } else {
    const { data: quota } = await supabase.rpc("consume_quota", { p_resource: "ai_message" });
    q = quota as { allowed: boolean; remaining: number; plan: string } | null;
    if (!q?.allowed) {
      return apiError("quota_exceeded", "Você atingiu o limite de mensagens da assistente no seu plano.", { plan: q?.plan ?? "free" });
    }
  }

  const [{ data: usage }, { data: profile }] = await Promise.all([
    supabase.rpc("my_usage"),
    supabase.from("profiles").select("full_name, categories").eq("id", user.id).maybeSingle(),
  ]);
  const u = usage as { plan?: string; quotas?: { resource: string; limit: number; used: number }[] } | null;
  const sq = u?.quotas?.find((x) => x.resource === "search");
  const context: AgentContext = {
    firstName: ((profile?.full_name as string | null) ?? user.name ?? "").split(" ")[0] || null,
    plan: ({ free: "Grátis", pro: "Pro", business: "Business" } as Record<string, string>)[u?.plan ?? "free"] ?? (u?.plan ?? "Grátis"),
    searchesLeft: sq ? Math.max(0, sq.limit - sq.used) : null,
    stores: sourcesOverview().map((x) => ({ name: x.name, connected: x.state === "connected" })),
    interests: ((profile?.categories as string[] | null) ?? []).slice(0, 6),
  };

  const { data: cfg } = await supabaseAnon().from("app_settings").select("value").eq("key", "assistant").maybeSingle();
  const settings = (cfg?.value ?? {}) as AssistantSettings;
  const { data: prior } = await supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(settings.max_history_messages ?? 12);
  const history: ChatMessage[] = [...(prior ?? [])].reverse().map((m) => ({ role: m.role as "user" | "assistant", content: (m.content as string).slice(0, 2000) }));
  history.push({ role: "user", content: body.message });

  const convId = conversationId;
  const save = (role: "user" | "assistant", content: string, blocks: AssistantBlock[], tin: number | null, tout: number | null) =>
    serverRpcSafe("server_save_ai_message", { p_conversation: convId, p_user: user.id, p_role: role, p_content: content, p_blocks: blocks,
      p_model: role === "assistant" ? provider.model : null, p_tokens_in: tin, p_tokens_out: tout });
  await save("user", body.message, [], null, null);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const blocks: AssistantBlock[] = [];
      const emit = (e: AssistantEvent) => {
        if (e.type === "block") blocks.push(e.block);
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        emit({ type: "status", text: "Pensando…" });
        const out = await runAgent(provider, history, emit, { maxRounds: settings.max_tool_rounds ?? 4, maxTokens: Math.max(settings.max_output_tokens ?? 0, 1600) }, context);
        emit({ type: "text", text: out.text });
        await save("assistant", out.text, blocks, out.tokensIn, out.tokensOut);
        await serverRpcSafe("server_set_source_status", { p_source: "assistant", p_status: "connected", p_detail: `Modelo ${provider.model}` });
        emit({ type: "done", remaining: q?.remaining ?? null, conversationId: convId });
      } catch (e) {
        console.error("[assistant]", e instanceof Error ? e.message : e);
        const timeout = e instanceof AiUnavailable && e.message === "timeout";
        emit({ type: "error", code: timeout ? "timeout" : "unavailable",
          message: timeout ? "O assistente demorou demais para responder. Tente novamente." : "O assistente está indisponível no momento. Tente novamente em instantes." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

