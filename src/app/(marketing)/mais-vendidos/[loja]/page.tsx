import { ArrowRight, ArrowUpRight, Flame, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inStore, SourceMark } from "@/components/source-mark";
import { PageShell } from "@/components/marketing/page-shell";
import { publicEnv } from "@/lib/env";
import { loadStoreTrending, type StoreId } from "@/lib/trending";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Páginas públicas (para o Google) com os mais vendidos de cada loja, a partir dos dados já guardados. */
const PAGES: Record<string, { store: StoreId; name: string; title: string; lead: string; tips: string[]; faq: { q: string; a: string }[] }> = {
  "mercado-livre": {
    store: "mercadolivre", name: "Mercado Livre",
    title: "Produtos mais vendidos no Mercado Livre",
    lead: "Os produtos que mais vendem no Mercado Livre agora, na ordem do próprio ranking da loja, com preço, quantidade vendida e link direto.",
    tips: ["Produtos com selo FULL e frete grátis costumam vender mais.", "Some a tarifa do anúncio (Clássico ou Premium) e o frete antes de decidir o preço.", "Muitas vendas significa demanda, mas também concorrência: compare o seu custo com o preço dos primeiros colocados."],
    faq: [
      { q: "Como saber o que mais vende no Mercado Livre?", a: "O Mercado Livre tem um ranking oficial de mais vendidos por categoria. O Worthwise mostra esse ranking com preço, quantidade vendida informada pela loja e histórico de preço de cada produto." },
      { q: "Vale a pena vender os produtos mais vendidos?", a: "Eles mostram onde está a demanda, mas costumam ter muita concorrência. O ideal é calcular o lucro com as taxas do Mercado Livre e comparar com o seu custo de compra antes de decidir." },
    ],
  },
  shopee: {
    store: "shopee", name: "Shopee",
    title: "Produtos mais vendidos na Shopee",
    lead: "Os produtos que mais vendem na Shopee, na ordem “Mais vendidos” da própria Shopee, com preço, nota, número de avaliações e link direto.",
    tips: ["Na Shopee, preço baixo e frete grátis pesam muito na decisão de compra.", "Confira a comissão e a taxa de serviço da Shopee para não vender no prejuízo.", "Produtos com muitas avaliações boas mostram demanda constante."],
    faq: [
      { q: "O que vender na Shopee?", a: "Comece pelos produtos que já vendem muito na loja e que você consegue comprar barato. O Worthwise mostra os mais vendidos por tópico e calcula quanto sobra em cada venda, já com as taxas da Shopee." },
      { q: "Como ver os mais vendidos da Shopee?", a: "A Shopee permite ordenar a busca por “Mais vendidos”. O Worthwise organiza esses resultados por tópico e acompanha o preço de cada produto ao longo do tempo." },
    ],
  },
  "tiktok-shop": {
    store: "tiktokshop", name: "TikTok Shop",
    title: "Produtos mais vendidos no TikTok Shop",
    lead: "Os produtos que mais vendem no TikTok Shop Brasil, ordenados pela quantidade vendida que o próprio TikTok Shop informa, com preço, nota e link direto.",
    tips: ["No TikTok Shop, produtos que dão bons vídeos (antes e depois, demonstração) vendem mais.", "Fique de olho nas ofertas relâmpago: elas mexem muito no preço.", "Compare o preço do TikTok Shop com o de outras lojas antes de escolher onde vender."],
    faq: [
      { q: "O que mais vende no TikTok Shop?", a: "Casa e cozinha, beleza, moda e acessórios estão entre os tópicos com mais vendas. O Worthwise mostra os produtos com a quantidade vendida informada pelo próprio TikTok Shop." },
      { q: "Vale a pena vender no TikTok Shop?", a: "É um canal que cresce rápido e premia produtos que funcionam bem em vídeo. Calcule o lucro já com a comissão do TikTok Shop antes de começar." },
    ],
  },
  amazon: {
    store: "amazon", name: "Amazon",
    title: "Produtos mais vendidos na Amazon Brasil",
    lead: "Os mais vendidos da Amazon Brasil, na ordem da página oficial de mais vendidos da Amazon, com preço, nota e link direto.",
    tips: ["Na Amazon, nota alta e muitas avaliações fazem diferença na conversão.", "Considere a comissão por categoria e, se usar, a tarifa do FBA.", "Produtos Prime costumam vender mais pela entrega rápida."],
    faq: [
      { q: "Como ver os mais vendidos da Amazon?", a: "A Amazon publica uma página de mais vendidos por categoria, atualizada com frequência. O Worthwise mostra essa lista com preço, nota e histórico de preço." },
      { q: "Dá para revender produtos da lista de mais vendidos da Amazon?", a: "Dá, desde que você consiga um custo de compra que deixe margem depois das taxas. Use a calculadora de lucro do Worthwise para conferir." },
    ],
  },
};

export function generateStaticParams() { return Object.keys(PAGES).map((loja) => ({ loja })); }

export async function generateMetadata({ params }: { params: Promise<{ loja: string }> }): Promise<Metadata> {
  const p = PAGES[(await params).loja];
  if (!p) return {};
  const desc = `${p.lead} Veja o que vender ${inStore(p.store)} e calcule o seu lucro.`.slice(0, 300);
  return { title: `${p.title} hoje`, description: desc, alternates: { canonical: `/mais-vendidos/${(await params).loja}` },
    openGraph: { title: `${p.title} · Worthwise`, description: desc, url: `/mais-vendidos/${(await params).loja}` } };
}

export default async function Page({ params }: { params: Promise<{ loja: string }> }) {
  const { loja } = await params;
  const p = PAGES[loja];
  if (!p) notFound();
  const data = await loadStoreTrending(p.store, p.store === "amazon" ? "electronics" : "geral").catch(() => null);
  const products = (data?.state.ok ? data.products : []).slice(0, 12);
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "ItemList", name: p.title, itemListElement: products.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.title, url: x.permalink ?? undefined })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Worthwise", item: publicEnv.appUrl },
      { "@type": "ListItem", position: 2, name: p.title, item: `${publicEnv.appUrl}/mais-vendidos/${loja}` }] },
  ];
  return (
    <PageShell eyebrow="Mais vendidos" title={p.title} lead={p.lead}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Outras lojas" className="mb-8 flex flex-wrap justify-center gap-2">
        {Object.entries(PAGES).map(([slug, x]) => (
          <Link key={slug} href={`/mais-vendidos/${slug}`} aria-current={slug === loja ? "page" : undefined} className="chip"><SourceMark source={x.store} size={16} />{x.name}</Link>
        ))}
      </nav>
      {products.length ? (
        <ol className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((x, i) => (
            <li key={x.externalId} className="card flex flex-col overflow-hidden">
              <div className="relative m-2 aspect-square overflow-hidden rounded-[10px] bg-white">
                {x.imageUrl ? <img src={x.imageUrl} alt={x.title} loading="lazy" className="size-full object-contain" /> : null}
                <span className="absolute left-2 top-2 rounded-md bg-[#18181B] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-white">{i + 1}º</span>
              </div>
              <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-2">
                <h2 className="line-clamp-2 text-[14px] font-medium leading-snug">{x.title}</h2>
                <p className="tabular mt-2 text-[18px] font-semibold">{formatMoney(x.price, x.currency ?? "BRL")}</p>
                {x.soldQuantity ? <p className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-pos"><Flame size={12} />{x.soldQuantity.toLocaleString("pt-BR")} vendidos</p> : null}
                {x.rating != null ? <p className="mt-1 flex items-center gap-1 text-[12.5px] text-muted"><Star size={12} className="fill-brand text-brand" />{x.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{x.reviewsCount ? ` (${x.reviewsCount.toLocaleString("pt-BR")})` : ""}</p> : null}
                {x.permalink ? <a href={x.permalink} target="_blank" rel="noopener noreferrer nofollow" className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-medium text-brand-hi hover:underline">Ver {inStore(p.store)}<ArrowUpRight size={13} /></a> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="text-center text-muted">A lista desta loja está sendo atualizada. Volte em breve.</p>}

      <div className="card mx-auto mt-12 max-w-3xl p-7 text-center">
        <h2 className="text-[22px] font-semibold tracking-tight">Veja o ranking completo, por tópico, e calcule o seu lucro</h2>
        <p className="mt-2 text-[15px] text-muted">No Worthwise você vê os mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop, o histórico de preço de cada produto, quanto sobra em cada venda e ainda conversa com a Wise, a assistente de vendas.</p>
        <Link href="/cadastro" className="btn btn-primary btn-lg mt-6">Começar por R$ 9,90 <ArrowRight size={16} /></Link>
      </div>

      <section className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-[22px] font-semibold tracking-tight">Dicas para vender {inStore(p.store)}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-[15.5px] leading-relaxed text-soft">{p.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2 className="mt-10 text-[22px] font-semibold tracking-tight">Perguntas frequentes</h2>
        <dl className="mt-4 space-y-5">{p.faq.map((f) => <div key={f.q}><dt className="font-semibold">{f.q}</dt><dd className="mt-1 text-[15px] leading-relaxed text-muted">{f.a}</dd></div>)}</dl>
        <p className="mt-10 text-[13px] text-faint">Dados das páginas públicas da loja, guardados pelo Worthwise e atualizados automaticamente a cada 3 dias. Preço, nota e vendidos são os informados pela loja no momento da coleta.</p>
      </section>
    </PageShell>
  );
}
