import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

/** Reabre uma pesquisa já entregue (sem consumir crédito). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError("invalid_input", "Identificador inválido.");
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("open_search", { p_id: id });
  if (error) return apiError("internal", "Não foi possível abrir a pesquisa.");
  if (!data) return apiError("not_found", "Pesquisa não encontrada.");
  return NextResponse.json(data);
}
