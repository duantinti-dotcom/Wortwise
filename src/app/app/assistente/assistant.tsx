"use client";
import { ArrowUp, FileText, MessagesSquare, Plus, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { ProductImage } from "@/components/app/product-bits";
import { useUpgrade } from "@/components/app/upgrade";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { AssistantBlock, AssistantEvent } from "@/lib/ai/agent";
import { dbMessage, useLoad } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate, formatMoney, formatPercent, relativeTime, SOURCE_LABELS } from "@/lib/utils";

const PriceHistoryChart = dynamic(() => import("@/components/charts").then((m) => m.PriceHistoryChart), { ssr: false, loading: () => <Skeleton className="h-[180px] w-full" /> });

interface Msg { id: string; role: "user" | "assistant"; content: string; blocks: AssistantBlock[]; error?: boolean }
interface Conv { id: string; title: string; updated_at: string }

const SUGGESTIONS = [
  "Como eu começo a vender na Shopee?",
  "Comprei um produto a R$ 18 e quero vender a R$ 49,90 no Mercado Livre. Quanto eu lucro em 100 unidades?",
  "Por quanto devo vender algo que me custa R$ 32 para ter 25% de margem?",
  "Preciso abrir MEI para vender online?",
  "Mercado Livre, Shopee ou TikTok Shop: onde começar?",
  "Como escolher um bom fornecedor?",
];

function Blocks({ blocks }: { blocks: AssistantBlock[] }) {
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === "products") return (
          <div key={i}>
            <div className="mb-2 text-xs text-faint">Resultados reais para “{b.query}” · coletados em {formatDate(b.collectedAt, true)}</div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {b.items.map((p) => (
                <Link key={p.externalId} href={`/app/produto/${p.source}/${p.externalId}`} className="card card-hover w-44 shrink-0 overflow-hidden">
                  <ProductImage src={p.imageUrl} alt={p.title} className="aspect-[4/3] w-full" />
                  <div className="p-3"><div className="line-clamp-2 text-xs font-medium leading-snug">{p.title}</div><div className="tabular mt-1.5 text-sm font-semibold">{formatMoney(p.price, p.currency ?? "BRL")}</div>
                    <div className="mt-1 text-[10px] text-faint">Fonte: {SOURCE_LABELS[p.source]}</div></div>
                </Link>
              ))}
            </div>
          </div>
        );
        if (b.kind === "profit") return (
          <div key={i} className="card grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
            {[["Lucro do lote", formatMoney(b.result.profit), b.result.profit >= 0 ? "text-pos" : "text-neg"], ["Por unidade", formatMoney(b.result.profitPerUnit), ""], ["Margem", formatPercent(b.result.marginPct), ""],
              ["Preço mínimo", formatMoney(b.result.minPrice), ""], ["Receita", formatMoney(b.result.grossRevenue), ""], ["Custo total", formatMoney(b.result.totalCost), ""],
              ["Equilíbrio", b.result.breakEvenUnits == null ? "—" : `${b.result.breakEvenUnits} un.`, ""], ...(b.targetPrice != null ? [["Preço p/ margem alvo", formatMoney(b.targetPrice), "text-brand-hi"]] : [])].map(([k, v, c]) => (
              <div key={k}><div className="text-xs text-faint">{k}</div><div className={cn("tabular mt-0.5 font-semibold", c)}>{v}</div></div>
            ))}
            <div className="col-span-full text-[11px] text-faint">Simulação calculada pelo Worthwise com os valores informados na conversa — não é previsão.</div>
          </div>
        );
        if (b.kind === "history") return <div key={i} className="card p-4"><div className="mb-2 text-xs text-muted">Observações reais de preço · {b.title}</div><PriceHistoryChart data={b.points} height={180} /></div>;
        return <div key={i} className="rounded-xl border border-line px-3.5 py-2.5 text-sm text-muted">{b.text}</div>;
      })}
    </div>
  );
}

export function Assistant({ available, remaining: initialRemaining, initialQuestion }: { available: boolean; remaining: number | null; initialQuestion?: string }) {
  const toast = useToast();
  const { openUpgrade } = useUpgrade();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState((initialQuestion ?? "").slice(0, 1500));
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const endRef = useRef<HTMLDivElement>(null);
  const convs = useLoad<Conv[]>(async () => {
    const { data } = await supabaseBrowser().from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30);
    return (data ?? []) as Conv[];
  });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, status]);

  async function openConversation(id: string) {
    const { data, error } = await supabaseBrowser().from("ai_messages").select("id, role, content, blocks").eq("conversation_id", id).order("created_at");
    if (error) { toast("Não foi possível abrir a conversa.", "error"); return; }
    setConversationId(id);
    setMessages((data ?? []) as Msg[]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || status) return;
    setInput("");
    const draftId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message, blocks: [] }, { id: draftId, role: "assistant", content: "", blocks: [] }]);
    setStatus("Enviando…");
    const patch = (fn: (m: Msg) => Msg) => setMessages((ms) => ms.map((m) => (m.id === draftId ? fn(m) : m)));
    const fail = (msg: string) => patch((m) => ({ ...m, content: msg, error: true }));
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, message }), signal: AbortSignal.timeout(120000) });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
        if (body?.error?.code === "quota_exceeded") openUpgrade(body.error.message);
        fail(body?.error?.message ?? "O assistente está indisponível no momento.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AssistantEvent;
          if (ev.type === "status") setStatus(ev.text);
          else if (ev.type === "block") patch((m) => ({ ...m, blocks: [...m.blocks, ev.block] }));
          else if (ev.type === "text") patch((m) => ({ ...m, content: ev.text }));
          else if (ev.type === "error") { fail(ev.message); finished = true; }
          else if (ev.type === "done") { setRemaining(ev.remaining); setConversationId(ev.conversationId); finished = true; convs.reload(); }
        }
      }
      if (!finished) fail("A resposta foi interrompida. Tente novamente.");
    } catch (e) {
      fail((e as Error)?.name === "TimeoutError" ? "O assistente demorou demais para responder. Tente novamente." : "Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setStatus(null);
    }
  }

  async function saveAnalysis(m: Msg) {
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({ user_id: auth.user?.id, title: m.content.slice(0, 80) || "Análise do assistente", kind: "assistant", content: { text: m.content, blocks: m.blocks } });
    toast(error ? dbMessage(error) : "Análise salva em Relatórios", error ? "error" : "success");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <button className="btn btn-secondary w-full" onClick={() => { setConversationId(null); setMessages([]); }}><Plus size={15} /> Nova conversa</button>
        <div className="mt-4 text-xs font-medium text-faint">Conversas</div>
        <ul className="mt-2 space-y-0.5">
          {(convs.data ?? []).map((c) => (
            <li key={c.id}><button onClick={() => openConversation(c.id)} className={cn("w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-tint/5", c.id === conversationId ? "bg-tint/8 text-fg" : "text-muted")}>
              <span className="block truncate">{c.title}</span><span className="text-[11px] text-faint">{relativeTime(c.updated_at)}</span></button></li>
          ))}
          {!convs.loading && !convs.data?.length ? <li className="px-2.5 py-2 text-xs text-faint">Nenhuma conversa ainda.</li> : null}
        </ul>
      </aside>

      <section className="flex min-h-[calc(100dvh-220px)] flex-col lg:min-h-[calc(100dvh-140px)]">
        <div className="flex-1">
          {!messages.length ? (
            <div className="mx-auto max-w-2xl pt-4 md:pt-10">
              <span className="flex size-12 items-center justify-center rounded-xl bg-tint/[0.06] text-brand-hi"><Sparkles size={22} /></span>
              <h1 className="display mt-6 text-[30px] md:text-[38px]">Oi! Eu sou a Wise.</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-muted">Sou sua consultora de vendas online. Pergunte qualquer coisa sobre vender no Mercado Livre, Shopee, Amazon ou TikTok Shop: preço, lucro, taxas, fornecedores, MEI e como começar.</p>
              {!available ? <div role="status" className="mt-6 rounded-xl border border-tint/10 bg-tint/[0.04] px-4 py-3 text-[14px] text-muted">A assistente ainda não está disponível neste ambiente. As outras ferramentas funcionam normalmente.</div> : null}
              <h2 className="mt-10 text-[14px] font-medium text-muted">Experimente perguntar</h2>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((x) => (
                  <button key={x} disabled={!available} onClick={() => send(x)} className="card card-hover p-4 text-left text-[14.5px] leading-relaxed text-soft hover:text-fg disabled:cursor-not-allowed disabled:opacity-60">{x}</button>
                ))}
              </div>
              <p className="mt-6 text-[13px] text-faint">Cumprimentos não gastam mensagens. Pesquisas de produtos feitas pela Wise usam as pesquisas do seu plano.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 pb-6">
              {messages.map((m) => m.role === "user" ? (
                <div key={m.id} className="ml-auto w-fit max-w-[85%] animate-fade-up rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[15px] leading-relaxed">{m.content}</div>
              ) : (
                <div key={m.id} className="animate-fade-up">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-brand-hi"><Sparkles size={13} /> Wise</div>
                  {m.blocks.length ? <Blocks blocks={m.blocks} /> : null}
                  {m.content ? (m.error
                    ? <div className="mt-3 rounded-xl border border-neg/30 bg-neg/8 px-3.5 py-3 text-[15px] text-danger">{m.content}</div>
                    : <div className="prose-ww chat-md mt-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />)
                    : <div className="mt-2 flex items-center gap-2.5 text-sm text-muted"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-brand" style={{ animationDelay: `${i * 160}ms` }} />)}</span>{status}</div>}
                  {m.content && !m.error ? <button onClick={() => saveAnalysis(m)} className="btn btn-ghost btn-sm -ml-2 mt-2"><FileText size={14} /> Salvar análise</button> : null}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="card sticky bottom-24 mx-auto mt-4 w-full max-w-3xl p-2 lg:bottom-6">
          <div className="flex items-end gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={1500} disabled={!available} aria-label="Mensagem para o assistente"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder={available ? "Escreva sua pergunta…" : "Assistente indisponível"}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-faint" />
            <button type="submit" disabled={!available || !input.trim() || Boolean(status)} className="btn btn-primary !size-11 shrink-0 !rounded-xl !p-0" aria-label="Enviar"><ArrowUp size={19} /></button>
          </div>
          <div className="flex items-center justify-between px-3 pb-1 pt-0.5 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><MessagesSquare size={11} />{remaining == null ? "Cota do plano" : `${remaining} mensagens restantes`}</span>
          </div>
        </form>
      </section>
    </div>
  );
}
