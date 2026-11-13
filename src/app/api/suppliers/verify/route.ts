import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { isValidCnpj, lookupCnpj } from "@/lib/connectors/brasilapi";
import { apiError, parseBody, sameOrigin } from "@/lib/http";
import { serverRpc, supabaseServer } from "@/lib/supabase/server";

const schema = z.object({ supplierId: z.string().uuid() });

/** Verificação documental real: consulta o CNPJ na base pública da Receita Federal (via BrasilAPI). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Origem não permitida.");
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta.");
  const body = await parseBody(req, schema);
  if (!body) return apiError("invalid_input", "Fornecedor inválido.");

  const supabase = await supabaseServer();
  const { data: allowed } = await supabase.rpc("rate_limit_me", { p_bucket: "verify" });
  if (allowed === false) return apiError("rate_limited", "Muitas verificações. Aguarde alguns minutos.");

  // RLS: o usuário só enxerga fornecedores próprios ou do diretório.
  const { data: supplier } = await supabase.from("suppliers").select("id, cnpj, owner_id").eq("id", body.supplierId).maybeSingle();
  if (!supplier) return apiError("not_found", "Fornecedor não encontrado.");
  const { data: admin } = await supabase.rpc("is_admin");
  if (supplier.owner_id !== user.id && admin !== true) return apiError("forbidden", "Apenas administradores verificam o diretório.");
  if (!supplier.cnpj || !isValidCnpj(supplier.cnpj as string)) return apiError("invalid_input", "Cadastre um CNPJ válido para verificar.");

  const lookup = await lookupCnpj(supplier.cnpj as string);
  if (lookup.status === "unavailable") return apiError("source_unavailable", "A consulta de CNPJ está indisponível. Tente novamente mais tarde.");
  const r = lookup.record;
  try {
    await serverRpc("server_record_verification", {
      p_supplier: supplier.id, p_status: lookup.status, p_source: "brasilapi",
      p_result: { razao_social: r.razao_social ?? null, nome_fantasia: r.nome_fantasia ?? null, situacao: r.descricao_situacao_cadastral ?? null,
        inicio_atividade: r.data_inicio_atividade ?? null, atividade: r.cnae_fiscal_descricao ?? null, municipio: r.municipio ?? null, uf: r.uf ?? null, porte: r.porte ?? null },
    });
  } catch {
    return apiError("internal", "Consulta realizada, mas não foi possível registrar o resultado.");
  }
  return NextResponse.json({ status: lookup.status, situacao: r.descricao_situacao_cadastral ?? null, razaoSocial: r.razao_social ?? null });
}
