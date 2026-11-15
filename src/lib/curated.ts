import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface CuratedItem {
  id: string; store: string; title: string; image_url: string | null; link: string; price: number | null;
  rating: number | null; reviews_count: number | null; sold_text: string | null; category: string | null; position: number; updated_at: string;
  history: { date: string; price: number }[];
}

/** Produtos da vitrine do dono (por loja ou todas), com o histórico de preço de cada um. */
export async function loadCurated(store?: string): Promise<CuratedItem[]> {
  const supabase = await supabaseServer();
  let q = supabase.from("curated_products").select("id, store, title, image_url, link, price, rating, reviews_count, sold_text, category, position, updated_at").eq("active", true);
  if (store) q = q.eq("store", store);
  const { data } = await q.order("position").order("updated_at", { ascending: false }).limit(store ? 10 : 40);
  const items = (data ?? []) as Omit<CuratedItem, "history">[];
  if (!items.length) return [];
  const { data: hist } = await supabase.from("curated_price_history").select("product_id, price, recorded_at")
    .in("product_id", items.map((i) => i.id)).order("recorded_at", { ascending: true }).limit(2000);
  const by = new Map<string, { date: string; price: number }[]>();
  for (const h of hist ?? []) (by.get(h.product_id as string) ?? by.set(h.product_id as string, []).get(h.product_id as string)!).push({ date: h.recorded_at as string, price: Number(h.price) });
  return items.map((i) => ({ ...i, price: i.price == null ? null : Number(i.price), rating: i.rating == null ? null : Number(i.rating), history: by.get(i.id) ?? [] }));
}
