"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Ações de escrita do painel. Cada função do banco repete a checagem (dono + MFA) e grava auditoria;
 * aqui só validamos o formato. Movimentações financeiras continuam somente leitura.
 */
type Result = { ok: boolean; message?: string };

async function call(fn: string, args: Record<string, unknown>, okMsg: string): Promise<Result> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    const m = error.message;
    return { ok: false, message: /forbidden|mfa_required/.test(m) ? "Sem permissão (confirme o MFA novamente)." : /invalid|check constraint/.test(m) ? "Valores inválidos." : "Não foi possível salvar." };
  }
  revalidatePath("/control", "layout");
  return { ok: true, message: okMsg };
}

/* Pagamentos: marcar/desmarcar como teste (não altera o pagamento). */
export async function paymentMenu(actionId: string, rowId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(rowId).success) return { ok: false, message: "Pagamento inválido." };
  if (actionId === "flag-test") return call("control_flag_payment", { p_payment: rowId, p_test: true, p_note: "Marcado no painel" }, "Pagamento classificado como teste.");
  if (actionId === "unflag-test") return call("control_flag_payment", { p_payment: rowId, p_test: false, p_note: null }, "Classificação de teste removida.");
  return { ok: false };
}

/* Despesas externas */
const expenseSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(["ads", "tools", "hosting", "api", "ai", "services", "taxes", "other"]),
  description: z.string().trim().min(2).max(160),
  amount: z.string().trim().regex(/^\d{1,9}([.,]\d{1,2})?$/),
});
export async function addExpense(_prev: Result | null, form: FormData): Promise<Result> {
  const p = expenseSchema.safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return { ok: false, message: "Confira data, categoria, descrição e valor." };
  const cents = Math.round(Number(p.data.amount.replace(",", ".")) * 100);
  if (cents <= 0) return { ok: false, message: "O valor precisa ser maior que zero." };
  return call("control_add_expense", { p_day: p.data.day, p_category: p.data.category, p_description: p.data.description, p_amount_cents: cents }, "Despesa registrada.");
}
export async function expenseMenu(actionId: string, rowId: string): Promise<Result> {
  if (actionId !== "delete" || !z.string().uuid().safeParse(rowId).success) return { ok: false };
  return call("control_delete_expense", { p_id: rowId }, "Despesa removida.");
}

/* Incidentes */
export async function incidentMenu(actionId: string, rowId: string): Promise<Result> {
  const id = Number(rowId);
  if (!Number.isInteger(id) || !["acknowledge", "resolve", "confirm", "unconfirm"].includes(actionId)) return { ok: false };
  const msg: Record<string, string> = { acknowledge: "Incidente reconhecido.", resolve: "Incidente resolvido.", confirm: "Marcado como incidente confirmado.", unconfirm: "Confirmação removida." };
  return call("control_incident_action", { p_id: id, p_action: actionId }, msg[actionId]!);
}

/* Regras de alerta */
const ruleSchema = z.object({
  key: z.string().regex(/^[a-z_]{3,40}$/), enabled: z.enum(["on", "off"]), threshold: z.coerce.number().min(0).max(1e9),
  priority: z.enum(["P1", "P2", "P3", "P4"]), cooldown: z.coerce.number().int().min(10).max(10080),
});
export async function saveRule(_prev: Result | null, form: FormData): Promise<Result> {
  const p = ruleSchema.safeParse({ ...Object.fromEntries(form.entries()), enabled: form.get("enabled") === "on" ? "on" : "off" });
  if (!p.success) return { ok: false, message: "Valores inválidos." };
  return call("control_update_rule", { p_key: p.data.key, p_enabled: p.data.enabled === "on", p_threshold: p.data.threshold, p_priority: p.data.priority, p_cooldown: p.data.cooldown }, "Regra salva.");
}

/* Configurações (custos, GeckoAPI, limites de IA) */
const optNum = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number().min(0).max(1e9).nullable());
export async function saveCosts(_prev: Result | null, form: FormData): Promise<Result> {
  const g = (k: string) => form.get(k);
  const parse = (k: string) => optNum.safeParse(g(k));
  const fields = ["usd_brl", "cc", "pix", "slip", "gecko_price", "gecko_cpc"].map(parse);
  if (fields.some((f) => !f.success)) return { ok: false, message: "Use apenas números (vírgula ou ponto)." };
  const [usd, cc, pix, slip, gp, cpc] = fields.map((f) => (f.success ? f.data : null));
  const models = form.getAll("model").map(String);
  const pin = form.getAll("price_in").map(String);
  const pout = form.getAll("price_out").map(String);
  const prices: Record<string, { in: number | null; out: number | null }> = {};
  models.forEach((m, i) => {
    const name = m.trim().slice(0, 80);
    if (!name) return;
    const a = optNum.safeParse(pin[i]); const b = optNum.safeParse(pout[i]);
    prices[name] = { in: a.success ? a.data : null, out: b.success ? b.data : null };
  });
  const fixedNames = form.getAll("fixed_name").map(String);
  const fixedAmt = form.getAll("fixed_amount").map(String);
  const fixedCur = form.getAll("fixed_currency").map(String);
  const fixed = fixedNames.map((n, i) => ({ name: n.trim().slice(0, 60), amount: Number(String(fixedAmt[i] ?? "").replace(",", ".")), currency: fixedCur[i] === "USD" ? "USD" : "BRL" }))
    .filter((f) => f.name && Number.isFinite(f.amount) && f.amount >= 0);
  const value = {
    usd_brl: usd,
    heropay: { credit_card_pct: cc ?? 0, pix_pct: pix ?? 0, bank_slip_pct: slip ?? 0, source: "Configurado no painel" },
    gecko: { brl_per_credit: gp, credits_per_call: cpc ?? 1 },
    ai_prices_usd_per_mtok: prices,
    fixed_monthly: fixed,
  };
  return call("control_set_setting", { p_key: "costs", p_value: value }, "Custos salvos.");
}

export async function saveGeckoSettings(_prev: Result | null, form: FormData): Promise<Result> {
  const a = optNum.safeParse(form.get("low_balance_credits"));
  const b = optNum.safeParse(form.get("low_balance_days"));
  if (!a.success || !b.success) return { ok: false, message: "Valores inválidos." };
  return call("control_set_setting", { p_key: "gecko", p_value: { low_balance_credits: a.data ?? 200, low_balance_days: b.data ?? 7 } }, "Limites da GeckoAPI salvos.");
}

export async function saveAiLimits(_prev: Result | null, form: FormData): Promise<Result> {
  const a = optNum.safeParse(form.get("monthly_budget_usd"));
  const b = optNum.safeParse(form.get("per_user_daily_requests"));
  if (!a.success || !b.success) return { ok: false, message: "Valores inválidos." };
  return call("control_set_setting", { p_key: "ai_limits", p_value: { monthly_budget_usd: a.data, per_user_daily_requests: b.data == null ? null : Math.round(b.data), enforce: form.get("enforce") === "on" } }, "Limites de IA salvos.");
}

const userLimitSchema = z.object({ user: z.string().uuid(), daily: optNum, blocked: z.enum(["on", "off"]), note: z.string().max(200).optional() });
export async function saveUserAiLimit(_prev: Result | null, form: FormData): Promise<Result> {
  const p = userLimitSchema.safeParse({ user: form.get("user"), daily: form.get("daily"), blocked: form.get("blocked") === "on" ? "on" : "off", note: form.get("note") ?? undefined });
  if (!p.success) return { ok: false, message: "Valores inválidos." };
  return call("control_set_ai_user_limit", { p_user: p.data.user, p_daily: p.data.daily == null ? null : Math.round(p.data.daily), p_blocked: p.data.blocked === "on", p_note: p.data.note ?? null }, "Cota do usuário salva.");
}

export async function aiUserMenu(actionId: string, rowId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(rowId).success) return { ok: false };
  if (actionId === "block") return call("control_set_ai_user_limit", { p_user: rowId, p_daily: null, p_blocked: true, p_note: "Bloqueado no painel" }, "Usuário bloqueado na assistente.");
  if (actionId === "clear") return call("control_set_ai_user_limit", { p_user: rowId, p_daily: null, p_blocked: false, p_note: null }, "Limite removido.");
  if (actionId.startsWith("daily-")) {
    const n = Number(actionId.slice(6));
    if (!Number.isInteger(n) || n < 0) return { ok: false };
    return call("control_set_ai_user_limit", { p_user: rowId, p_daily: n, p_blocked: false, p_note: `Cota diária ${n}` }, `Cota diária de ${n} mensagens aplicada.`);
  }
  return { ok: false };
}
