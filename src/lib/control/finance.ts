/**
 * Cálculos financeiros do painel (funções puras).
 * Regra: se falta um dado ou uma hipótese, o valor não é calculado e o motivo é informado.
 */
export interface CostSettings {
  usd_brl?: number | null;
  heropay?: { credit_card_pct?: number; pix_pct?: number; bank_slip_pct?: number; source?: string };
  gecko?: { brl_per_credit?: number | null; credits_per_call?: number | null };
  ai_prices_usd_per_mtok?: Record<string, { in?: number | null; out?: number | null }>;
  fixed_monthly?: { name: string; amount: number; currency: "BRL" | "USD" }[];
}

export interface CostLine {
  key: string;
  label: string;
  /** Valor em centavos de real; null quando não é possível calcular. */
  cents: number | null;
  basis: "measured" | "estimated" | "missing";
  note: string;
}

export interface CostInput {
  days: number;
  /** Tarifas reais da HeroPay (bruto − líquido) no período, em centavos. */
  feesCents: number;
  /** Parte das tarifas que foi estimada (sem líquido informado pelo provedor). */
  feesEstimated: boolean;
  geckoCalls: number;
  /** Créditos efetivamente consumidos, se a API oficial informou para o período. */
  geckoCreditsOfficial?: number | null;
  aiTokens: Record<string, { in: number; out: number }>;
  expensesCents: number;
}

const usdToCents = (usd: number, rate: number) => Math.round(usd * rate * 100);

export function computeCosts(s: CostSettings, x: CostInput): { lines: CostLine[]; totalCents: number; complete: boolean } {
  const lines: CostLine[] = [];
  const rate = s.usd_brl ?? null;

  lines.push({ key: "fees", label: "Tarifas de pagamento (HeroPay)", cents: x.feesCents, basis: x.feesEstimated ? "estimated" : "measured",
    note: x.feesEstimated ? "Parte calculada com as tarifas publicadas (o provedor não informou o líquido de todos os pagamentos)." : "Diferença entre o valor pago e o líquido informado pela HeroPay." });

  const credits = x.geckoCreditsOfficial ?? x.geckoCalls * (s.gecko?.credits_per_call ?? 1);
  const price = s.gecko?.brl_per_credit;
  lines.push({ key: "gecko", label: "GeckoAPI", cents: price != null ? Math.round(credits * price * 100) : null,
    basis: price == null ? "missing" : x.geckoCreditsOfficial != null ? "measured" : "estimated",
    note: price == null ? "Informe o preço por crédito em Configurações para calcular." : `${credits.toLocaleString("pt-BR")} créditos × R$ ${price.toLocaleString("pt-BR")}` });

  let aiUsd = 0;
  const unpriced: string[] = [];
  for (const [model, t] of Object.entries(x.aiTokens)) {
    const p = s.ai_prices_usd_per_mtok?.[model];
    if (!p || p.in == null || p.out == null) { if (t.in + t.out > 0) unpriced.push(model); continue; }
    aiUsd += (t.in / 1e6) * p.in + (t.out / 1e6) * p.out;
  }
  const anyAi = Object.values(x.aiTokens).some((t) => t.in + t.out > 0);
  lines.push({ key: "ai", label: "Inteligência artificial", cents: !anyAi ? 0 : rate == null ? null : usdToCents(aiUsd, rate),
    basis: !anyAi ? "measured" : rate == null || unpriced.length ? (rate == null ? "missing" : "estimated") : "estimated",
    note: !anyAi ? "Sem uso no período." : rate == null ? "Informe a cotação do dólar em Configurações."
      : unpriced.length ? `Sem preço cadastrado para: ${unpriced.slice(0, 3).join(", ")}${unpriced.length > 3 ? "…" : ""} (não somados).` : "Tokens medidos × preço cadastrado por modelo." });

  for (const f of s.fixed_monthly ?? []) {
    const monthly = f.currency === "USD" ? (rate == null ? null : usdToCents(f.amount, rate)) : Math.round(f.amount * 100);
    lines.push({ key: `fixed:${f.name}`, label: f.name, cents: monthly == null ? null : Math.round((monthly * x.days) / 30),
      basis: monthly == null ? "missing" : "estimated", note: monthly == null ? "Informe a cotação do dólar." : `Mensalidade proporcional a ${x.days} dia(s).` });
  }

  lines.push({ key: "expenses", label: "Despesas registradas", cents: x.expensesCents, basis: "measured", note: "Lançadas manualmente (anúncios, ferramentas etc.)." });

  const totalCents = lines.reduce((a, l) => a + (l.cents ?? 0), 0);
  return { lines, totalCents, complete: lines.every((l) => l.cents != null) };
}

export interface UnitInput {
  adsCents: number;
  newCustomers: number;
  historyDays: number | null;
  paid90dCents: number;
  paying90d: number;
  canceled90d: number;
}

export type Metric = { value: number; note: string } | { value: null; reason: string };

/** CAC: gasto com anúncios ÷ novos clientes pagantes do período. */
export function cac(x: UnitInput): Metric {
  if (x.adsCents <= 0) return { value: null, reason: "Nenhuma despesa de anúncios registrada no período." };
  if (x.newCustomers < 5) return { value: null, reason: `Poucos clientes novos no período (${x.newCustomers}); mínimo de 5 para uma média útil.` };
  return { value: Math.round(x.adsCents / x.newCustomers), note: `Anúncios ÷ ${x.newCustomers} clientes novos. Não inclui aquisição orgânica separadamente.` };
}

/** LTV: receita média mensal por cliente ÷ churn mensal, com base nos últimos 90 dias. */
export function ltv(x: UnitInput): Metric {
  if (x.historyDays == null || x.historyDays < 60) return { value: null, reason: "Menos de 60 dias de pagamentos: ainda não há histórico para estimar permanência." };
  if (x.paying90d < 10) return { value: null, reason: `Poucos clientes pagantes nos últimos 90 dias (${x.paying90d}); mínimo de 10.` };
  if (x.canceled90d === 0) return { value: null, reason: "Nenhum cancelamento em 90 dias: o churn é zero e o LTV ficaria infinito." };
  const arpuMonth = x.paid90dCents / 3 / x.paying90d;
  const churnMonth = x.canceled90d / 3 / x.paying90d;
  return { value: Math.round(arpuMonth / churnMonth), note: `Receita mensal média por cliente ÷ churn mensal (${(churnMonth * 100).toFixed(1)}%), últimos 90 dias.` };
}

/** Previsão de esgotamento de créditos pelo ritmo observado. */
export function creditForecast(current: number | null | undefined, consumed7d: number | null | undefined, consumed24h?: number | null): {
  perDay: number | null; daysLeft: number | null; basis: string } {
  if (current == null) return { perDay: null, daysLeft: null, basis: "Saldo não disponível." };
  const perDay = consumed7d != null && consumed7d > 0 ? consumed7d / 7 : consumed24h != null && consumed24h > 0 ? consumed24h : null;
  if (perDay == null) return { perDay: 0, daysLeft: null, basis: "Sem consumo nos últimos 7 dias: não há ritmo para projetar." };
  return { perDay, daysLeft: current / perDay, basis: consumed7d ? "Média diária dos últimos 7 dias (API oficial)." : "Consumo das últimas 24 horas." };
}
