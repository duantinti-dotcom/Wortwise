import type { ProductResult } from "@/lib/connectors/types";

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizeTitle = (v: string) => norm(v).replace(/[^a-z0-9]+/g, " ").trim();

export type SortKey = "relevance" | "price_asc" | "price_desc" | "rating" | "discount" | "reviews" | "sales_rank";

export interface SearchFilters {
  sources?: string[];
  text?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  minReviews?: number | null;
  freeShipping?: boolean;
  discountOnly?: boolean;
  fastDelivery?: boolean;
  availableOnly?: boolean;
  condition?: "new" | "used" | null;
  sort?: SortKey;
}

export const discountPct = (p: ProductResult) =>
  p.originalPrice && p.price && p.originalPrice > p.price ? (1 - p.price / p.originalPrice) * 100 : 0;

/** Refinamento dos resultados já coletados. Campo ausente na fonte nunca "passa" num filtro que o exige. */
export function applyFilters(items: ProductResult[], f: SearchFilters): ProductResult[] {
  const words = f.text ? normalizeTitle(f.text).split(" ").filter(Boolean) : [];
  const sourceSet = f.sources?.length ? new Set(f.sources) : null;
  let out = items.filter((p) => {
    if (sourceSet && !sourceSet.has(p.source)) return false;
    if (words.length) { const t = normalizeTitle(p.title); if (!words.every((w) => t.includes(w))) return false; }
    if (f.priceMin != null && (p.price == null || p.price < f.priceMin)) return false;
    if (f.priceMax != null && (p.price == null || p.price > f.priceMax)) return false;
    if (f.minRating != null && (p.rating == null || p.rating < f.minRating)) return false;
    if (f.minReviews != null && (p.reviewsCount == null || p.reviewsCount < f.minReviews)) return false;
    if (f.freeShipping && p.freeShipping !== true) return false;
    if (f.discountOnly && discountPct(p) < 1) return false;
    if (f.fastDelivery && p.fastDelivery !== true) return false;
    if (f.availableOnly && p.available === false) return false;
    if (f.condition && p.condition !== f.condition) return false;
    return true;
  });
  const sorted = (cmp: (a: ProductResult, b: ProductResult) => number) => { out = [...out].sort(cmp); };
  switch (f.sort) {
    case "price_asc": sorted((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)); break;
    case "price_desc": sorted((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)); break;
    case "rating": sorted((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.reviewsCount ?? 0) - (a.reviewsCount ?? 0)); break;
    case "reviews": sorted((a, b) => (b.reviewsCount ?? -1) - (a.reviewsCount ?? -1)); break;
    case "discount": sorted((a, b) => discountPct(b) - discountPct(a)); break;
    case "sales_rank": sorted((a, b) => (a.salesRank?.rank ?? Infinity) - (b.salesRank?.rank ?? Infinity)); break;
  }
  return out;
}

/** Quantos filtros de refinamento estão ativos (para o contador do botão). */
export function activeCount(f: SearchFilters): number {
  return [f.text?.trim(), f.priceMin != null, f.priceMax != null, f.minRating != null, f.minReviews != null, f.freeShipping, f.discountOnly,
    f.fastDelivery, f.availableOnly, f.condition, f.sources?.length].filter(Boolean).length;
}
