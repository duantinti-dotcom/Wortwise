import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EasyProfit } from "@/components/easy-profit";
import { PageShell } from "@/components/marketing/page-shell";
import { SourceMark } from "@/components/source-mark";

/** Calculadoras por loja (páginas para o Google: "calculadora de lucro Shopee", "taxas do Mercado Livre"…). */
const PAGES: Record<string, { preset: string; mark: string; name: string; fees: string; tips: string[] }> = {
  "mercado-livre": { preset: "mercadolivre-classico", mark: "mercadolivre", name: "Mercado Livre",
    fees: "No anúncio Clássico a comissão de referência é de 12%, e no Premium de 17% (com parcelamento sem juros). Os valores mudam por categoria: confira a tabela do Mercado Livre.",
    tips: ["Compare Clássico e Premium: o Premium custa mais, mas costuma vender mais.", "Inclua o frete se você oferece frete grátis.", "Produtos baratos podem ter tarifa fixa por venda."] },
  shopee: { preset: "shopee", mark: "shopee", name: "Shopee",
    fees: "A referência usada é 20% de comissão mais R$ 4 por item vendido. A Shopee muda as taxas com frequência e por programa: confira a central do vendedor.",
    tips: ["A tarifa fixa por item pesa muito em produtos baratos.", "Cupons e frete grátis podem ter custo extra.", "Calcule o preço mínimo antes de entrar em promoções."] },
  amazon: { preset: "amazon", mark: "amazon", name: "Amazon",
    fees: "A referência usada é 15% de comissão. A Amazon cobra por categoria e, se você usar o FBA, há tarifas de armazenagem e envio.",
    tips: ["Some as tarifas do FBA se a Amazon cuidar da entrega.", "Categorias têm comissões diferentes.", "Nota alta e muitas avaliações ajudam a vender mais."] },
  "tiktok-shop": { preset: "tiktokshop", mark: "tiktokshop", name: "TikTok Shop",
    fees: "A referência usada é 6% de comissão, sem contar a comissão de afiliados (criadores que divulgam o seu produto).",
    tips: ["Se usar afiliados, some a comissão deles.", "Ofertas relâmpago reduzem a margem: calcule antes.", "Produtos que rendem bons vídeos vendem mais."] },
};

export function generateStaticParams() { return Object.keys(PAGES).map((loja) => ({ loja })); }

export async function generateMetadata({ params }: { params: Promise<{ loja: string }> }): Promise<Metadata> {
  const { loja } = await params;
  const p = PAGES[loja];
  if (!p) return {};
  return {
    title: `Calculadora de lucro ${p.name}: taxas, margem e preço ideal`,
    description: `Calcule grátis quanto sobra em cada venda no ${p.name}, já com a comissão, o frete e o imposto, e veja o preço recomendado para ter lucro.`,
    alternates: { canonical: `/calculadora-de-lucro/${loja}` },
  };
}

export default async function Page({ params }: { params: Promise<{ loja: string }> }) {
  const { loja } = await params;
  const p = PAGES[loja];
  if (!p) notFound();
  return (
    <PageShell eyebrow="Calculadora grátis" title={`Calculadora de lucro ${p.name}`} lead={`Descubra quanto sobra no seu bolso em cada venda no ${p.name}, já com as taxas, e qual o preço certo para vender.`}>
      <nav aria-label="Outras lojas" className="mb-8 flex flex-wrap justify-center gap-2">
        {Object.entries(PAGES).map(([slug, x]) => (
          <Link key={slug} href={`/calculadora-de-lucro/${slug}`} aria-current={slug === loja ? "page" : undefined} className="chip"><SourceMark source={x.mark} size={16} />{x.name}</Link>
        ))}
      </nav>
      <EasyProfit key={p.preset} initialPreset={p.preset} />
      <section className="prose-ww mx-auto mt-20 max-w-3xl">
        <h2>Taxas do {p.name}</h2>
        <p>{p.fees}</p>
        <h2>Dicas para ter lucro no {p.name}</h2>
        <ul>{p.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2>Descubra também o que vender</h2>
        <p>Veja os <Link href={`/mais-vendidos/${loja}`}>produtos mais vendidos no {p.name}</Link> com preço, vendidos e histórico de preço. No Worthwise você junta tudo isso com a calculadora e a Wise, a assistente de vendas. <Link href="/precos">Comece pelo primeiro mês por R$ 9,90</Link>.</p>
      </section>
    </PageShell>
  );
}
