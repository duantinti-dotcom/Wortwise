import { z } from "zod";
import { NextResponse } from "next/server";
import { getUser, isAdmin } from "@/lib/auth";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { archiveBucket, archivePrices } from "@/lib/maintenance";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("settings"), enabled: z.boolean(), tasks: z.record(z.string().max(40), z.boolean()) }),
]);

/** Saúde do Banco: executar a manutenção agora ou ligar/desligar tarefas (somente administradores). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user || !(await isAdmin())) return apiError("forbidden", "Acesso restrito a administradores.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Ação inválida.");
  const supabase = await supabaseServer();

  if (body.action === "settings") {
    const { data, error } = await supabase.rpc("admin_set_maintenance", { p_enabled: body.enabled, p_tasks: body.tasks });
    if (error) return apiError("internal", "Não foi possível salvar.");
    return NextResponse.json({ settings: data });
  }

  const { data: db, error } = await supabase.rpc("admin_run_maintenance");
  if (error) return apiError("internal", "A manutenção falhou. Veja os erros abaixo.");
  const { data: cfg } = await supabase.from("app_settings").select("value").eq("key", "maintenance").maybeSingle();
  const archiveOn = (cfg?.value as { tasks?: { archive_prices?: boolean } } | null)?.tasks?.archive_prices !== false;
  const bucket = archiveBucket();
  let archive: { status: string; rows?: number; error?: string } = { status: !archiveOn ? "disabled" : bucket ? "ok" : "r2_not_configured" };
  if (archiveOn && bucket) {
    try { archive.rows = await archivePrices(bucket); } catch (e) { archive = { status: "error", error: (e as Error).message }; }
  }
  return NextResponse.json({ db, archive });
}
