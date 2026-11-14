import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { supabaseServer } from "@/lib/supabase/server";
import { PlansEditor } from "./editor";

export const metadata: Metadata = { title: "Planos e cotas" };

export default async function Page() {
  const supabase = await supabaseServer();
  const [{ data: plans }, { data: quotas }] = await Promise.all([
    supabase.from("plans").select("id, name, description, price_cents, features, active, provider_checkout_url").order("sort_order"),
    supabase.from("plan_quotas").select("plan_id, resource, limit_value, period").order("resource"),
  ]);
  return (
    <>
      <PageHeader title="Planos e cotas" description="Preços e limites valem imediatamente para todos os usuários. O valor efetivamente cobrado é o do link da HeroPay: ao mudar um preço, recrie o link em Integrações." />
      <PlansEditor plans={(plans ?? []) as never} quotas={(quotas ?? []) as never} />
    </>
  );
}
