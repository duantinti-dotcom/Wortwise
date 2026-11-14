import type { Metadata } from "next";
import { Suspense } from "react";
import { getUsage, requireUser } from "@/lib/auth";
import { heropayConfigured } from "@/lib/billing/heropay";
import { supabaseServer } from "@/lib/supabase/server";
import { Settings } from "./settings";

export const metadata: Metadata = { title: "Planos e configurações" };

export default async function Page() {
  const user = await requireUser();
  const supabase = await supabaseServer();
  const [usage, profile, sub, payments, policy] = await Promise.all([
    getUsage(),
    supabase.from("profiles").select("full_name, seller_stage, marketplaces, categories, budget_range").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("plan_id, status, current_period_end, cancel_at_period_end, payment_method, provider_subscription_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("payments").select("id, amount_cents, status, method, occurred_at, created_at, refused_message").order("created_at", { ascending: false }).limit(24),
    supabase.from("app_settings").select("value").eq("key", "trial_policy").maybeSingle(),
  ]);
  return (
    <Suspense>
      <Settings email={user.email} emailVerified={user.emailVerified} usage={usage}
        profile={{ full_name: (profile.data?.full_name as string | null) ?? "" }}
        subscription={(sub.data as never) ?? null} payments={(payments.data ?? []) as never}
        billingReady={heropayConfigured()} requireCard={Boolean((policy.data?.value as { require_payment_method?: boolean } | null)?.require_payment_method)} />
    </Suspense>
  );
}
