import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { supabaseServer } from "@/lib/supabase/server";
import { SettingsEditor } from "./editor";

export const metadata: Metadata = { title: "Configurações" };

export default async function Page() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("app_settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]));
  return (
    <>
      <PageHeader title="Configurações" description="Política do teste gratuito, monitoramento e limites do assistente." />
      <SettingsEditor initial={map} />
    </>
  );
}
