import { serverEnv } from "@/lib/env";

/**
 * Integração HeroPay (API v1) — https://docs.heropay.tech
 *  - Base: https://api.heropay.tech (produção) | https://api.beta.heropay.tech (sandbox)
 *  - Headers: Authorization: Bearer <JWT> e Accept: application/vnd.herospark.com; version=1
 *  - Assinatura = link de pagamento com `period`. O checkout é hospedado pela HeroPay
 *    (o Worthwise nunca vê dados de cartão).
 *  - Webhooks assinados com HMAC SHA-256 do corpo bruto no header X-HeroPay-Signature.
 *
 * Limitações da v1 (documentadas pela HeroPay): não há trial sem cobrança, não há verificação de
 * cartão sem cobrança e não há troca de plano com pró-rata (cancela-se e assina-se o novo plano).
 */
export const HEROPAY_TRIGGERS = [
  "spark_payment_confirmed", "payment_pix_created", "spark_payment_boleto_created", "payment_credit_cart_refused",
  "refunded", "chargeback_request", "subscription_activate", "subscription_update", "subscription_cancel",
] as const;
export type HeroPayTrigger = (typeof HEROPAY_TRIGGERS)[number];

/** Gatilhos que alteram acesso ou histórico de cobrança. */
export const HANDLED_TRIGGERS: HeroPayTrigger[] = [
  "spark_payment_confirmed", "payment_credit_cart_refused", "refunded", "chargeback_request",
  "subscription_activate", "subscription_update", "subscription_cancel",
];

export class HeroPayError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const heropayConfigured = () => Boolean(serverEnv().heropayToken);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const e = serverEnv();
  if (!e.heropayToken) throw new HeroPayError("HEROPAY_JWT_TOKEN não configurado");
  let res: Response;
  try {
    res = await fetch(`${e.heropayUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${e.heropayToken}`,
        accept: "application/vnd.herospark.com; version=1",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HeroPayError("HeroPay indisponível ou tempo esgotado");
  }
  const text = await res.text();
  if (!res.ok) throw new HeroPayError(`HeroPay respondeu ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`, res.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HeroPayError("Resposta inesperada da HeroPay");
  }
}

export interface PaymentLink { id: number; url: string }

/** Cria o link de pagamento de um plano: assinatura mensal ou, no "Primeiro mês", pagamento único (sem "period"). */
export async function createSubscriptionLink(plan: { id: string; name: string; description: string | null; price_cents: number }): Promise<PaymentLink> {
  const once = plan.id === "inicial";
  const r = await call<{ data?: { id?: number; offer?: { url?: string } } }>("POST", "/payment_links", {
    payment_link: {
      name: `Worthwise ${plan.name}`,
      description: plan.description ?? (once ? `Plano ${plan.name}` : `Assinatura mensal do plano ${plan.name}`),
      price_cents: plan.price_cents,
      absorbs_fees: true,
      // Sem "period" o link é de pagamento único (documentação HeroPay).
      ...(once ? {} : { period: "monthly", frequency_type: "unlimited" }),
      payment_methods: ["credit_card", "pix", "bank_slip"],
      src: `plan-${plan.id}`,
    },
  });
  if (!r.data?.id || !r.data.offer?.url) throw new HeroPayError("A HeroPay não retornou a URL do checkout");
  return { id: r.data.id, url: r.data.offer.url };
}

/** Checkout do usuário: mesma URL do plano, com `src` = token de intenção (volta em cart.src no webhook). */
export function checkoutUrlFor(planCheckoutUrl: string, intentToken: string): string {
  const u = new URL(planCheckoutUrl);
  u.searchParams.set("src", intentToken);
  return u.toString();
}

export async function cancelRecurring(recurringPaymentId: string): Promise<void> {
  const id = Number(recurringPaymentId);
  await call("POST", "/recurring_payment/cancel", {
    recurring_payment: { recurring_payment_id: Number.isFinite(id) ? id : recurringPaymentId },
  });
}

/** Cadastra o webhook de um gatilho. A URL carrega o gatilho, pois o payload não o informa. */
export async function registerWebhook(trigger: string, webhookUrl: string): Promise<{ trigger: string; ok: boolean; error?: string; secret?: string | null }> {
  try {
    const r = await call<Record<string, unknown>>("POST", "/webhook", { webhook: { trigger, webhook_url: webhookUrl, request_method: "post" } });
    // Algumas contas devolvem o segredo de assinatura no cadastro: guardamos para configurar a verificação.
    const flat = JSON.stringify(r);
    const m = /"(?:secret|signature_secret|webhook_secret|token|signing_secret)"\s*:\s*"([^"]{8,})"/i.exec(flat);
    return { trigger, ok: true, secret: m?.[1] ?? null };
  } catch (e) {
    return { trigger, ok: false, error: e instanceof Error ? e.message : "erro" };
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valida X-HeroPay-Signature: HMAC SHA-256 do corpo bruto, aceito em hexadecimal ou base64. */
export async function verifySignature(rawBody: string, received: string | null, secret: string): Promise<boolean> {
  if (!received || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...mac));
  const sig = received.trim().replace(/^sha256=/i, "");
  return timingSafeEqual(sig.toLowerCase(), hex) || timingSafeEqual(sig, b64);
}

/** O payload não traz ID de evento: a chave de deduplicação é gatilho + pagamento + assinatura + status. */
export function dedupeKey(trigger: string, payload: Record<string, unknown>): string {
  const get = (a: string, b: string) => {
    const o = payload[a];
    const v = o && typeof o === "object" ? (o as Record<string, unknown>)[b] : null;
    return v == null || v === "" ? "-" : String(v);
  };
  return [trigger, get("payment", "id"), get("subscription", "id"), get("subscription", "status"), get("payment", "status")].join(":").slice(0, 200);
}

/** Lê um link de pagamento (para conferir se ficou como assinatura mensal). */
export async function getPaymentLink(id: number): Promise<unknown> {
  return call("GET", `/payment_links/${id}`);
}

/** Lista os avisos (webhooks) cadastrados na conta. */
export async function listWebhooks(): Promise<{ id: number; name: string; url: string }[]> {
  const r = await call<{ data?: { actions?: { id: number; name?: string; configurations?: { url?: string } }[] } }>("GET", "/webhook");
  return (r.data?.actions ?? []).map((a) => ({ id: a.id, name: a.name ?? "", url: a.configurations?.url ?? "" }));
}

/** Remove um aviso cadastrado (usado ao recadastrar com a senha secreta). */
export async function deleteWebhook(id: number): Promise<{ ok: boolean; status?: number }> {
  try { await call("DELETE", `/webhook/${id}`); return { ok: true }; } catch (e) { return { ok: false, status: e instanceof HeroPayError ? e.status : undefined }; }
}
