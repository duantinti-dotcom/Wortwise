import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { searchAmazonPublic } from "@/lib/connectors/amazon-bestsellers";
import { searchCachedProducts } from "@/lib/connectors/gecko";
import type { ProductResult } from "@/lib/connectors/types";
import { apiError } from "@/lib/http";

/** Palavras que não ajudam a achar o mesmo produto em outra loja. */
const STOP = new Set(["com", "para", "sem", "kit", "de", "da", "do", "das", "dos", "e", "em", "a", "o", "original", "novo", "nova", "promoção", "oferta", "frete", "grátis", "gratis", "pronta", "entrega"]);

function keywords(title: string) {
  return title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).slice(0, 4);
}

/**
 * Onde comprar mais barato: ofertas reais mais baratas do mesmo produto (dos produtos já guardados das lojas
 * e da busca pública da Amazon) + links de busca já ordenados do menor preço em lojas e fornecedores.
 * Não gasta crédito da GeckoAPI.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return apiError("unauthenticated", "Entre na sua conta.");
  const u = new URL(req.url);
  const title = (u.searchParams.get("title") ?? "").slice(0, 200);
  const price = Number(u.searchParams.get("price")) || null;
  const self = u.searchParams.get("id") ?? "";
  const words = keywords(title);
  if (!words.length) return NextResponse.json({ offers: [], links: [] });
  const q = words.join(" ");
  const [cached, amazon] = await Promise.all([
    searchCachedProducts(q).catch(() => [] as ProductResult[]),
    searchAmazonPublic(q).catch(() => [] as ProductResult[]),
  ]);
  // Precisa ter pelo menos 2 das palavras no nome (para ser o mesmo tipo de produto).
  const match = (p: ProductResult) => { const t = p.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return words.filter((w) => t.includes(w)).length >= Math.min(2, words.length); };
  const seen = new Set<string>();
  const offers = [...cached, ...amazon.slice(0, 20)]
    .filter((p) => p.price != null && p.permalink && p.externalId !== self && match(p) && (price == null || p.price < price))
    .filter((p) => (seen.has(p.externalId) ? false : (seen.add(p.externalId), true)))
    .sort((a, b) => a.price! - b.price!)
    .slice(0, 8)
    .map((p) => ({ source: p.source, title: p.title, price: p.price, imageUrl: p.imageUrl, permalink: p.permalink, rating: p.rating, soldQuantity: p.soldQuantity ?? null }));
  const e = encodeURIComponent(q);
  const dash = encodeURIComponent(words.join("-"));
  // Buscas já ordenadas do menor preço em atacadistas e lojas baratas (só links; nada é consultado).
  const links = [
    { name: "AliExpress", note: "atacado da China", url: `https://pt.aliexpress.com/w/wholesale-${dash}.html?SortType=price_asc` },
    { name: "Alibaba", note: "fábricas e atacado", url: `https://www.alibaba.com/trade/search?SearchText=${e}&sortType=price_asc` },
    { name: "Temu", note: "preço baixo", url: `https://www.temu.com/br/search_result.html?search_key=${e}&sort_type=price_up` },
    { name: "Shopee", note: "menor preço", url: `https://shopee.com.br/search?keyword=${e}&order=asc&sortBy=price` },
    { name: "Mercado Livre", note: "atacado, menor preço", url: `https://lista.mercadolivre.com.br/${encodeURIComponent(`${words.join("-")}-atacado`)}_OrderId_PRICE_NoIndex_True` },
    { name: "Amazon", note: "menor preço", url: `https://www.amazon.com.br/s?k=${e}&s=price-asc-rank` },
    { name: "Atacadistas", note: "fornecedores no Brasil", url: `https://www.google.com/search?q=${encodeURIComponent(`${q} atacado fornecedor`)}` },
  ];
  return NextResponse.json({ query: q, offers, links });
}
