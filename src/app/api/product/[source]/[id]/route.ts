import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSourceId, CONNECTORS } from "@/lib/connectors/registry";
import { ConnectorError, USER_MESSAGES } from "@/lib/connectors/types";
import { apiError } from "@/lib/http";
import { loadProduct } from "@/lib/product";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ source: string; id: string }> }) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta.");
  const { source, id } = await params;
  if (!isSourceId(source) || !/^[a-z]-[A-Za-z0-9]{4,40}$/.test(id)) return apiError("invalid_input", "Produto inválido.");
  const state = CONNECTORS[source].state();
  if (state.state !== "connected") return apiError("not_configured", state.detail, { source });

  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "product" });
  if (allowed === false) return apiError("rate_limited", "Muitas consultas em sequência. Aguarde um instante.");

  try {
    return NextResponse.json(await loadProduct(source, id));
  } catch (e) {
    if (e instanceof ConnectorError) {
      const code = e.code === "not_found" ? "not_found" : e.code === "timeout" ? "timeout" : e.code === "rate_limited" ? "rate_limited" : "source_unavailable";
      return apiError(code, USER_MESSAGES[e.code], { source });
    }
    console.error("[product]", e instanceof Error ? e.message : e);
    return apiError("internal", "Não foi possível carregar o produto.");
  }
}
