import { amazon } from "./amazon";
import { geckoConfigured, geckoMercadoLivre, geckoShopee, geckoTikTok } from "./gecko";
import { mercadoLivre } from "./mercadolivre";
import { shopee } from "./shopee";
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

/** Usa a API oficial da loja quando ela está configurada; senão, a GeckoAPI (se GECKO_API_KEY existir). */
function preferOfficial(official: Connector, gecko: Connector): Connector {
  const pick = () => (official.state().state !== "connected" && geckoConfigured() ? gecko : official);
  return new Proxy(official, { get: (_t, prop) => Reflect.get(pick(), prop) });
}

const tiktokPending = pending("tiktokshop", "TikTok Shop",
    "A API do TikTok Shop só dá acesso à loja que autorizou o aplicativo; a busca de produtos de outras lojas depende de aplicativo de afiliado aprovado pelo TikTok.");

export const CONNECTORS: Record<SourceId, Connector> = {
  mercadolivre: preferOfficial(mercadoLivre, geckoMercadoLivre),
  shopee: preferOfficial(shopee, geckoShopee),
  amazon,
  tiktokshop: preferOfficial(tiktokPending, geckoTikTok),
};

/** Loja servida pela GeckoAPI (cada consulta nova gasta crédito). */
export const geckoBacked = (id: SourceId) => CONNECTORS[id].state().detail.includes("GeckoAPI");

export const SOURCE_IDS = Object.keys(CONNECTORS) as SourceId[];

export function isSourceId(v: string): v is SourceId {
  return v in CONNECTORS;
}

export function sourcesOverview() {
  return SOURCE_IDS.map((id) => ({ id, name: CONNECTORS[id].name, ...CONNECTORS[id].state(), capabilities: CONNECTORS[id].capabilities }));
}
