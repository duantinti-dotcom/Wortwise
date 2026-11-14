"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { supabaseBrowser } from "@/lib/supabase/client";

type Values = Record<string, Record<string, unknown>>;
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

export function SettingsEditor({ initial }: { initial: Values }) {
  const toast = useToast();
  const [v, setV] = useState<Values>({
    trial_policy: { require_payment_method: false, require_verified_email: true, free_visible_results: 6, ...initial.trial_policy },
    monitoring: { min_interval_minutes: 360, batch_size: 40, ...initial.monitoring },
    assistant: { max_output_tokens: 900, max_history_messages: 12, max_tool_rounds: 4, ...initial.assistant },
  });
  const set = (group: string, key: string, value: unknown) => setV((p) => ({ ...p, [group]: { ...p[group], [key]: value } }));
  async function save(group: string) {
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({ key: group, value: v[group], updated_by: auth.user?.id, updated_at: new Date().toISOString() });
    if (!error) await supabase.rpc("admin_log", { p_action: "settings.update", p_target: group, p_details: v[group] });
    toast(error ? "Não foi possível salvar." : "Configuração salva", error ? "error" : "success");
  }
  // Função de renderização (não componente) para não remontar o campo a cada tecla.
  const N = ({ g, k, label, hint, min = 0 }: { g: string; k: string; label: string; hint?: string; min?: number }) => (
    <label className="block" key={`${g}.${k}`}><span className="label">{label}</span>
      <input className="input tabular" inputMode="numeric" value={String(num(v[g]?.[k], 0))} onChange={(e) => set(g, k, Math.max(min, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)))} />
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}</label>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card space-y-4 p-5"><h2 className="font-semibold">Teste gratuito</h2>
        <p className="text-xs leading-relaxed text-faint">A quantidade de pesquisas gratuitas é a cota “Pesquisas” do plano Grátis (em Planos e cotas).</p>
        {N({ g: "trial_policy", k: "free_visible_results", label: "Resultados visíveis por pesquisa (grátis)", min: 1 })}
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm opacity-70"><input type="checkbox" disabled checked={false} readOnly className="mt-0.5 size-4" />
          <span>Exigir meio de pagamento antes do teste<span className="mt-1 block text-xs leading-relaxed text-faint">Indisponível: a API v1 da HeroPay não oferece validação de cartão sem cobrança nem trial. A opção será habilitada quando houver um provedor que suporte tokenização sem cobrança.</span></span></label>
        <button className="btn btn-primary w-full" onClick={() => save("trial_policy")}>Salvar</button></section>
      <section className="card space-y-4 p-5"><h2 className="font-semibold">Monitoramento</h2>
        {N({ g: "monitoring", k: "min_interval_minutes", label: "Intervalo mínimo entre verificações (min)", hint: "Mínimo efetivo de 30 minutos. Intervalos maiores reduzem custo e uso das APIs.", min: 30 })}
        {N({ g: "monitoring", k: "batch_size", label: "Monitoramentos por execução do cron", hint: "Máximo de 100 por execução.", min: 1 })}
        <button className="btn btn-primary w-full" onClick={() => save("monitoring")}>Salvar</button></section>
      <section className="card space-y-4 p-5"><h2 className="font-semibold">Assistente</h2>
        {N({ g: "assistant", k: "max_output_tokens", label: "Tokens máximos por resposta", min: 200 })}
        {N({ g: "assistant", k: "max_history_messages", label: "Mensagens de histórico enviadas ao modelo", min: 2 })}
        {N({ g: "assistant", k: "max_tool_rounds", label: "Rodadas de ferramentas por pergunta", min: 1 })}
        <button className="btn btn-primary w-full" onClick={() => save("assistant")}>Salvar</button></section>
    </div>
  );
}
