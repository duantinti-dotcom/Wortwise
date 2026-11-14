import { amazon } from "./amazon";
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
  amazon,
  tiktokshop: pending("tiktokshop", "TikTok Shop",
    "A API do TikTok Shop só dá acesso à loja que autorizou o aplicativo; a busca de produtos de outras lojas depende de aplicativo de afiliado aprovado pelo TikTok."),
};

export const SOURCE_IDS = Object.keys(CONNECTORS) as SourceId[];

export function isSourceId(v: string): v is SourceId {
  return v in CONNECTORS;
}

export function sourcesOverview() {
  return SOURCE_IDS.map((id) => ({ id, name: CONNECTORS[id].name, ...CONNECTORS[id].state(), capabilities: CONNECTORS[id].capabilities }));
}
