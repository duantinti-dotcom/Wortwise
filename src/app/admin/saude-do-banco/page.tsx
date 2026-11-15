import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { archiveBucket } from "@/lib/maintenance";
import { supabaseServer } from "@/lib/supabase/server";
import { DbHealthView, type Health } from "./view";

export const metadata: Metadata = { title: "Saúde do Banco" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_db_health");
  return (
    <>
      <PageHeader title="Saúde do Banco" description="Espaço usado no Supabase (plano gratuito: 500 MB), o que mais ocupa e a limpeza automática diária. Nada importante é apagado: contas, assinaturas, pagamentos, favoritos e dados dos usuários ficam sempre." />
      {error || !data ? <p role="alert" className="card p-5 text-sm text-danger">Não foi possível carregar a saúde do banco.</p>
        : <DbHealthView initial={data as Health} r2={Boolean(archiveBucket())} />}
    </>
  );
}
