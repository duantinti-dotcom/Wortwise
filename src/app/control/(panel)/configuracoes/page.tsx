import type { Metadata } from "next";
import { ActionForm, Field } from "@/components/control/forms";
import { KV, Notice, Panel, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import type { CostSettings } from "@/lib/control/finance";
import { serverEnv } from "@/lib/env";
import { cloudflareConfigured } from "@/lib/control/sources";
import { saveCosts, saveGeckoSettings } from "../actions";
import { LoadError, safe } from "../shared";

export const metadata: Metadata = { title: "Configurações" };

interface Settings { costs: CostSettings; gecko: { low_balance_credits?: number; low_balance_days?: number }; ai_limits: Record<string, unknown> }

const since90 = () => new Date(Date.now() - 90 * 86_400_000).toISOString();

export default async function Page() {
  await requireControl("settings");
  const [res, models] = await Promise.all([
    safe(controlRpc<Settings>("control_get_settings")),
    safe(controlRpc<{ by_model: { model: string }[] }>("control_ai", { p_from: since90(), p_to: new Date().toISOString() })),
  ]);
  if (!res.ok) return <LoadError e={res.error} />;
  const c = res.data.costs ?? {};
  const prices = c.ai_prices_usd_per_mtok ?? {};
  const seen = models.ok ? models.data.by_model.map((m) => m.model) : [];
  const allModels = [...new Set([...Object.keys(prices), ...seen])];
  const fixed = [...(c.fixed_monthly ?? []), { name: "", amount: 0, currency: "BRL" as const }];
  const e = serverEnv();
  const cf = cloudflareConfigured();
  const env: [string, boolean, string][] = [
    ["CONTROL_HOST", Boolean(process.env.CONTROL_HOST), "subdomínio exclusivo do painel"],
    ["WW_SERVER_SECRET", Boolean(e.serverSecret), "funções de servidor e hashes"],
    ["CRON_SECRET", Boolean(e.cronSecret), "monitoramento a cada 30 min"],
    ["GECKO_API_KEY", Boolean(e.geckoToken), "saldo e consumo da GeckoAPI"],
    ["HEROPAY_JWT_TOKEN", Boolean(e.heropayToken), "verificação da HeroPay"],
    ["CLOUDFLARE_API_TOKEN + ZONE_ID", cf.zone, "tráfego, ameaças, erros 4xx, países"],
    ["CLOUDFLARE_ACCOUNT_ID", cf.account, "métricas do Worker"],
    ["SUPABASE_ACCESS_TOKEN", Boolean(process.env.SUPABASE_ACCESS_TOKEN), "falhas de login do site (opcional)"],
    ["RESEND_API_KEY + CONTROL_ALERT_EMAIL", Boolean(process.env.RESEND_API_KEY && process.env.CONTROL_ALERT_EMAIL), "alertas por e-mail (opcional)"],
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="c-h1">Configurações</h1>
        <p className="c-muted mt-1 max-w-[75ch] text-[13.5px] leading-relaxed">Hipóteses usadas nas estimativas de custo e lucro. Campos vazios ficam como &quot;não informado&quot; e o painel não calcula o item correspondente. Toda alteração vai para a auditoria.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Custos e tarifas">
          <ActionForm action={saveCosts} submit="Salvar custos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Cotação do dólar (R$)" hint="Converte custos em US$ (IA, Cloudflare)."><input name="usd_brl" inputMode="decimal" className="c-input c-num" defaultValue={c.usd_brl ?? ""} placeholder="ex.: 5,40" /></Field>
              <Field label="Preço do crédito GeckoAPI (R$)"><input name="gecko_price" inputMode="decimal" className="c-input c-num" defaultValue={c.gecko?.brl_per_credit ?? ""} placeholder="não informado" /></Field>
              <Field label="Créditos por consulta" hint="Usado quando a API oficial não cobre o período."><input name="gecko_cpc" inputMode="decimal" className="c-input c-num" defaultValue={c.gecko?.credits_per_call ?? 1} /></Field>
            </div>
            <div className="c-label mt-2">Tarifas da HeroPay (%) — usadas só quando o webhook não informa o valor líquido</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cartão"><input name="cc" inputMode="decimal" className="c-input c-num" defaultValue={c.heropay?.credit_card_pct ?? 3.49} /></Field>
              <Field label="Pix"><input name="pix" inputMode="decimal" className="c-input c-num" defaultValue={c.heropay?.pix_pct ?? 0} /></Field>
              <Field label="Boleto"><input name="slip" inputMode="decimal" className="c-input c-num" defaultValue={c.heropay?.bank_slip_pct ?? 0} /></Field>
            </div>
            <div className="c-label mt-2">Preço da IA por modelo (US$ por milhão de tokens)</div>
            <div className="flex flex-col gap-2">
              {[...allModels, ""].map((m, i) => (
                <div key={m || `new-${i}`} className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-2">
                  <input name="model" className="c-input c-mono" defaultValue={m} placeholder="novo modelo (ex.: openai/gpt-oss-120b)" aria-label="Modelo" />
                  <input name="price_in" inputMode="decimal" className="c-input c-num" defaultValue={m ? prices[m]?.in ?? "" : ""} placeholder="entrada" aria-label="Preço de entrada" />
                  <input name="price_out" inputMode="decimal" className="c-input c-num" defaultValue={m ? prices[m]?.out ?? "" : ""} placeholder="saída" aria-label="Preço de saída" />
                </div>
              ))}
              <p className="c-faint text-[11.5px]">Modelos usados nos últimos 90 dias aparecem automaticamente. Planos gratuitos dos provedores podem ser cadastrados com preço 0.</p>
            </div>
            <div className="c-label mt-2">Custos fixos mensais (proporcionais ao período)</div>
            <div className="flex flex-col gap-2">
              {fixed.map((f, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_84px] gap-2">
                  <input name="fixed_name" className="c-input" defaultValue={f.name} placeholder="novo custo (ex.: domínio)" aria-label="Nome do custo" />
                  <input name="fixed_amount" inputMode="decimal" className="c-input c-num" defaultValue={f.name ? f.amount : ""} placeholder="valor" aria-label="Valor mensal" />
                  <select name="fixed_currency" className="c-select" defaultValue={f.currency} aria-label="Moeda"><option>BRL</option><option>USD</option></select>
                </div>
              ))}
              <p className="c-faint text-[11.5px]">Deixe o nome vazio para remover uma linha.</p>
            </div>
          </ActionForm>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Alerta de créditos da GeckoAPI">
            <ActionForm action={saveGeckoSettings} submit="Salvar">
              <Field label="Avisar abaixo de (créditos)"><input name="low_balance_credits" inputMode="numeric" className="c-input c-num" defaultValue={res.data.gecko?.low_balance_credits ?? 200} /></Field>
              <Field label="ou quando faltarem menos de (dias)"><input name="low_balance_days" inputMode="numeric" className="c-input c-num" defaultValue={res.data.gecko?.low_balance_days ?? 7} /></Field>
            </ActionForm>
            <p className="c-faint mt-3 text-[11.5px]">O limite em créditos da regra também pode ser ajustado em Alertas.</p>
          </Panel>
          <Panel title="Segurança do acesso">
            <KV rows={[["Quem acessa", "somente os proprietários"], ["Segundo fator (MFA)", <Status key="m" tone="good">Obrigatório</Status>], ["Validade da verificação", "12 horas"],
              ["Tentativas de login", "5 por origem a cada 15 min"], ["Domínio", process.env.CONTROL_HOST ?? "local (/control)"]]} />
            <p className="c-faint mt-3 text-[11.5px] leading-relaxed">Para uma camada extra, ative o Cloudflare Access (Zero Trust) no subdomínio — veja docs/CONTROL.md.</p>
          </Panel>
          <Panel title="Integrações configuradas" description="Só indica se o segredo existe; valores nunca são exibidos.">
            <ul className="c-divide text-[12.5px]">{env.map(([k, ok, what]) => (
              <li key={k} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="c-mono c-fg truncate">{k}</div><div className="c-faint">{what}</div></div>
                <Status tone={ok ? "good" : "neutral"}>{ok ? "Definido" : "Ausente"}</Status></li>))}</ul>
          </Panel>
        </div>
      </div>
      {!c.usd_brl && <Notice tone="warn" className="mt-4" title="Cotação do dólar não informada">Sem ela, custos de IA e da Cloudflare (cobrados em dólar) ficam fora da estimativa de custo e lucro.</Notice>}
    </>
  );
}
