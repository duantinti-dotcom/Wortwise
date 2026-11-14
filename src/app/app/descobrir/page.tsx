import type { Metadata } from "next";
import { Suspense } from "react";
import { sourcesOverview } from "@/lib/connectors/registry";
import { supabaseServer } from "@/lib/supabase/server";
import { Discover } from "./discover";

export const metadata: Metadata = { title: "Descobrir produtos" };

export default async function Page() {
  const supabase = await supabaseServer();
  const { data: recent } = await supabase.from("searches").select("id, query, result_count, created_at").order("last_opened_at", { ascending: false }).limit(8);
  return (
    <Suspense>
      <Discover sources={sourcesOverview().map((s) => ({ id: s.id, name: s.name, state: s.state, detail: s.detail }))}
        recent={(recent ?? []) as { id: string; query: string; result_count: number; created_at: string }[]} />
    </Suspense>
  );
}
