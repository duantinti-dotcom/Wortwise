import { NextResponse } from "next/server";
import { DEFAULT_CATEGORY, loadTrending } from "@/lib/trending";

/**
 * Vitrine pública da página inicial: top 10 do ranking oficial de mais vendidos (categoria padrão).
 * Não exige login. Os dados vêm do cache de 30 min do servidor, então visitas não multiplicam
 * chamadas ao Mercado Livre. Devolve só o necessário para o cartão.
 */
export async function GET() {
  const data = await loadTrending(DEFAULT_CATEGORY);
  const products = data.state.ok ? data.products.slice(0, 10).map((p) => ({
    id: p.externalId, rank: p.rank, title: p.title, imageUrl: p.imageUrl, price: p.price, originalPrice: p.originalPrice,
    currency: p.currency, freeShipping: p.freeShipping, permalink: p.permalink,
  })) : [];
  return NextResponse.json(
    { configured: data.state.ok || data.state.reason !== "not_configured", category: data.category.name, updatedAt: data.updatedAt, products },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } },
  );
}
