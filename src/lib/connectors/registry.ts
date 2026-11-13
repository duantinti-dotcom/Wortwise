import { mercadoLivre } from "./mercadolivre";
import { ConnectorError, type Connector, type SourceId, type SourceState } from "./types";

/**
 * Marketplaces cujo acesso a dados depende de credenciamento. O conector existe para que o estado
 * real apareça na interface; ele NUNCA devolve produtos enquanto não houver integração autorizada.
 */
function pending(id: SourceId, name: string, detail: string): Connector {
  const fail = () => Promise.reject(new ConnectorError(id, "pending_approval", detail));
  return {
    id, name,
    capabilities: { search: false, details: false, offers: false, fees: false, bestsellers: false },
    state: () => ({ state: "pending_approval" as SourceState, detail }),
    search: fail,
    getProduct: fail,
  };
}

export const CONNECTORS: Record<SourceId, Connector> = {
  mercadolivre: mercadoLivre,
  shopee: pending("shopee", "Shopee",
    "A Shopee Open Platform libera dados apenas para parceiros credenciados e lojas que autorizam o aplicativo; a API de afiliados exige conta aprovada."),
  amazon: pending("amazon", "Amazon",
    "A Product Advertising API 5.0 exige conta de Associado Amazon aprovada, com vendas qualificadas para manter o acesso."),
  tiktokshop: pending("tiktokshop", "TikTok Shop",
    "A TikTok Shop Partner API exige aplicativo aprovado e autorização individual de cada loja; não há busca pública de catálogo."),
  shein: pending("shein", "SHEIN",
    "A SHEIN Open Platform é restrita a vendedores e parceiros aprovados; não existe API pública de catálogo."),
};

export const SOURCE_IDS = Object.keys(CONNECTORS) as SourceId[];

export function isSourceId(v: string): v is SourceId {
  return v in CONNECTORS;
}

export function sourcesOverview() {
  return SOURCE_IDS.map((id) => ({ id, name: CONNECTORS[id].name, ...CONNECTORS[id].state(), capabilities: CONNECTORS[id].capabilities }));
}
