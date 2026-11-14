import type { ProductResult } from "@/lib/connectors/types";

export interface SearchFilters {
  sources?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  freeShipping?: boolean;
  condition?: "new" | "used" | null;
  sort?: "relevance" | "price_asc" | "price_desc" | "rating";
}

export function applyFilters(items: ProductResult[], f: SearchFilters): ProductResult[] {
  let out = items.filter((p) => {
    if (f.priceMin != null && (p.price == null || p.price < f.priceMin)) return false;
    if (f.priceMax != null && (p.price == null || p.price > f.priceMax)) return false;
    if (f.minRating != null && (p.rating == null || p.rating < f.minRating)) return false;
    if (f.freeShipping && p.freeShipping !== true) return false;
    if (f.condition && p.condition !== f.condition) return false;
    return true;
  });
  const byPrice = (a: ProductResult, b: ProductResult) => (a.price ?? Infinity) - (b.price ?? Infinity);
  if (f.sort === "price_asc") out = [...out].sort(byPrice);
  if (f.sort === "price_desc") out = [...out].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
  if (f.sort === "rating") out = [...out].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  return out;
}

