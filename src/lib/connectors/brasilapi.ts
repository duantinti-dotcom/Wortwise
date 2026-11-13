import { z } from "zod";

/** Consulta cadastral de CNPJ na BrasilAPI (dados públicos da Receita Federal). */
const schema = z.object({
  cnpj: z.string(), razao_social: z.string().nullish(), nome_fantasia: z.string().nullish(),
  descricao_situacao_cadastral: z.string().nullish(), data_inicio_atividade: z.string().nullish(),
  cnae_fiscal_descricao: z.string().nullish(), municipio: z.string().nullish(), uf: z.string().nullish(),
  porte: z.string().nullish(), natureza_juridica: z.string().nullish(),
}).loose();

export type CnpjRecord = z.infer<typeof schema>;

export function isValidCnpj(raw: string): boolean {
  const c = raw.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(c[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export type CnpjLookup =
  | { status: "passed" | "failed"; record: CnpjRecord }
  | { status: "unavailable"; reason: string };

export async function lookupCnpj(cnpj: string): Promise<CnpjLookup> {
  const clean = cnpj.replace(/\D/g, "");
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: { accept: "application/json", "user-agent": "worthwise-app" }, signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { status: "failed", record: { cnpj: clean, descricao_situacao_cadastral: "NÃO ENCONTRADO" } };
    if (!res.ok) return { status: "unavailable", reason: `BrasilAPI respondeu ${res.status}` };
    const record = schema.parse(await res.json());
    const active = (record.descricao_situacao_cadastral ?? "").toUpperCase() === "ATIVA";
    return { status: active ? "passed" : "failed", record };
  } catch {
    return { status: "unavailable", reason: "Consulta indisponível no momento" };
  }
}
