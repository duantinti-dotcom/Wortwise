export type SourceId = "mercadolivre" | "shopee" | "amazon" | "tiktokshop" | "shein";

export type SourceState = "connected" | "not_configured" | "pending_approval" | "error";

/** Resultado normalizado de qualquer marketplace. Campo ausente na fonte = null (nunca inventado). */
export interface ProductResult {
  source: SourceId;
  externalId: string;
  kind: "catalog_product" | "listing";
  title: string;
  imageUrl: string | null;
  permalink: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  rating: number | null;
  reviewsCount: number | null;
  sellerId: string | null;
  sellerName: string | null;
  available: boolean | null;
  freeShipping: boolean | null;
  condition: string | null;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  categoryId: string | null;
  offersCount: number | null;
  attributes: { name: string; value: string }[];
  collectedAt: string;
  sourceUpdatedAt: string | null;
}

/** Produto do ranking oficial de mais vendidos de uma categoria (posição informada pela fonte). */
export interface RankedProduct extends ProductResult { rank: number }

/** Termo de busca em alta informado pela fonte. */
export interface TrendKeyword { keyword: string; url: string | null }

export interface Category { id: string; name: string }

export interface Offer {
  externalId: string;
  sellerId: string | null;
  sellerName: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  condition: string | null;
  freeShipping: boolean | null;
  listingType: string | null;
  officialStore: boolean | null;
  permalink: string | null;
}

export interface ProductDetail extends ProductResult {
  description: string | null;
  features: string[];
  images: string[];
  offers: Offer[];
  offersTotal: number | null;
}

export interface FeeQuote {
  listingType: string;
  listingTypeName: string;
  saleFeeAmount: number | null;
  percentageFee: number | null;
  fixedFee: number | null;
}

export interface SearchParams {
  query: string;
  categoryId?: string;
  limit: number;
  offset: number;
}

export interface ApiCallLog {
  source: string;
  endpoint: string;
  status: number | null;
  ok: boolean;
  ms: number;
  error: string | null;
}

export interface ConnectorContext {
  logs: ApiCallLog[];
}

export type ConnectorErrorCode = "not_configured" | "pending_approval" | "unauthorized" | "rate_limited" | "unavailable" | "timeout" | "not_found" | "bad_response";

export class ConnectorError extends Error {
  constructor(public source: SourceId, public code: ConnectorErrorCode, message: string, public httpStatus?: number) {
    super(message);
    this.name = "ConnectorError";
  }
}

export interface Connector {
  id: SourceId;
  name: string;
  /** Estado real de configuração — não faz chamada externa. */
  state(): { state: SourceState; detail: string };
  capabilities: { search: boolean; details: boolean; offers: boolean; fees: boolean; bestsellers: boolean };
  search(params: SearchParams, ctx: ConnectorContext): Promise<ProductResult[]>;
  getProduct(externalId: string, ctx: ConnectorContext): Promise<ProductDetail>;
  getFees?(price: number, categoryId: string | null, ctx: ConnectorContext): Promise<FeeQuote[]>;
  getBestsellerRank?(categoryId: string, externalId: string, ctx: ConnectorContext): Promise<number | null>;
  getBestsellers?(categoryId: string, ctx: ConnectorContext): Promise<RankedProduct[]>;
  getTrends?(categoryId: string | null, ctx: ConnectorContext): Promise<TrendKeyword[]>;
  getCategories?(ctx: ConnectorContext): Promise<Category[]>;
}

export const USER_MESSAGES: Record<ConnectorErrorCode, string> = {
  not_configured: "Fonte ainda não configurada.",
  pending_approval: "Integração aguardando credenciamento junto ao marketplace.",
  unauthorized: "A fonte recusou as credenciais configuradas.",
  rate_limited: "A fonte limitou temporariamente as consultas. Tente novamente em instantes.",
  unavailable: "A fonte está indisponível no momento.",
  timeout: "A fonte demorou demais para responder.",
  not_found: "Produto não encontrado na fonte.",
  bad_response: "A fonte respondeu em formato inesperado.",
};
