/** Variáveis públicas (embutidas no build). */
export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
};

/** Segredos e configuração do servidor. Nunca importe em componentes de cliente. */
export function serverEnv() {
  const e = process.env;
  return {
    serverSecret: e.WW_SERVER_SECRET ?? "",
    cronSecret: e.CRON_SECRET ?? "",
    meliClientId: e.MELI_CLIENT_ID ?? "",
    meliClientSecret: e.MELI_CLIENT_SECRET ?? "",
    amazonAccessKey: e.AMAZON_PAAPI_ACCESS_KEY ?? "",
    amazonSecretKey: e.AMAZON_PAAPI_SECRET_KEY ?? "",
    amazonPartnerTag: e.AMAZON_PARTNER_TAG ?? "",
    amazonHost: e.AMAZON_PAAPI_HOST ?? "webservices.amazon.com.br",
    amazonMarketplace: e.AMAZON_MARKETPLACE ?? "www.amazon.com.br",
    geckoToken: e.GECKO_API_KEY ?? e.GECKO_API_TOKEN ?? "",
    apifyToken: e.APIFY_TOKEN ?? "",
    shopeeAppId: e.SHOPEE_AFFILIATE_APP_ID ?? "",
    shopeeSecret: e.SHOPEE_AFFILIATE_SECRET ?? "",
    heropayUrl: (e.HEROPAY_API_URL ?? "https://api.beta.heropay.tech").replace(/\/$/, ""),
    heropayToken: e.HEROPAY_JWT_TOKEN ?? "",
    heropayWebhookSecret: e.HEROPAY_WEBHOOK_SECRET ?? "",
    turnstileSecret: e.TURNSTILE_SECRET_KEY ?? "",
    aiProvider: (e.AI_PROVIDER ?? "workers-ai") as "workers-ai" | "openai-compatible",
    aiModel: e.AI_MODEL ?? "@cf/openai/gpt-oss-120b",
    aiFallbackModel: e.AI_FALLBACK_MODEL ?? "@cf/meta/llama-4-scout-17b-16e-instruct",
    aiBaseUrl: (e.AI_BASE_URL ?? "").replace(/\/$/, ""),
    aiApiKey: e.AI_API_KEY ?? "",
    geminiKey: e.GEMINI_API_KEY ?? "",
    geminiModel: e.GEMINI_MODEL ?? "gemini-3.5-flash",
    groqKey: e.GROQ_API_KEY ?? "",
    groqModel: e.GROQ_MODEL ?? "openai/gpt-oss-120b",
    openrouterKey: e.OPENROUTER_API_KEY ?? "",
    openrouterModel: e.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free",
  };
}

export const isSupabaseConfigured = () => Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);

/** E-mail de contato/encarregado de dados exibido nas páginas legais (defina antes do lançamento). */
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contato@worthwise.site";
