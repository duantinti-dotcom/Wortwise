import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { getUsage, isAdmin, quotaOf, requireUser } from "@/lib/auth";
import { DEFAULT_PLANS, type PlanInfo } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Worthwise" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await supabaseServer();
  const [usage, admin, plansRes, alertsRes, introRes] = await Promise.all([
    getUsage(), isAdmin(),
    supabase.from("plans").select("id, name, description, price_cents, features, sort_order").eq("active", true).order("sort_order"),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("my_intro_eligible"),
  ]);
  const plans = ((plansRes.data as PlanInfo[] | null)?.length ? (plansRes.data as PlanInfo[]) : DEFAULT_PLANS);
  const search = quotaOf(usage, "search");
  return (
    <AppShell
      user={{ email: user.email, name: user.name, avatarUrl: user.avatarUrl }}
      plan={usage.plan} planName={usage.plan === "ilimitado" ? "Ilimitado" : plans.find((p) => p.id === usage.plan)?.name ?? "Sem plano"}
      search={search && usage.plan !== "ilimitado" && usage.plan !== "free" ? { used: search.used, limit: search.limit, period: search.period } : null}
      unreadAlerts={alertsRes.count ?? 0} admin={admin} plans={plans} introEligible={introRes.data === true}
    >
      {children}
    </AppShell>
  );
}
