import { ArrowRight, Bell, Calculator, Check, LineChart, MessagesSquare, Scale, Search } from "lucide-react";
import Link from "next/link";
import { Faq } from "@/components/marketing/faq";
import { FeatureTile } from "@/components/marketing/feature-tile";
import { LiveTrending } from "@/components/marketing/live-trending";
import { Pricing } from "@/components/marketing/pricing";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { SourceMark, sourceName } from "@/components/source-mark";
import { Reveal } from "@/components/ui/reveal";
import { publicEnv } from "@/lib/env";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Pesquise", text: "Digite o que você pensa em vender, ou veja os mais vendidos de cada loja.", icon: Search },
  { title: "Calcule", text: "Veja quanto sobra em cada venda depois de taxas, frete e impostos.", icon: Calculator },
  { title: "Decida", text: "Compare fornecedores e receba um aviso quando o preço ficar bom.", icon: Check },
];

const STORES = ["mercadolivre", "shopee", "amazon", "tiktokshop"] as const;

function SectionHead({ label, title, text, className }: { label?: string; title: string; text?: string; className?: string }) {
  return (
    <Reveal className={cn("mx-auto mb-12 max-w-2xl text-center md:mb-16", className)}>
      {label ? <p className="eyebrow">{label}</p> : null}
      <h2 className="display mt-3 text-[32px] sm:text-[42px] lg:text-[48px]">{title}</h2>
      {text ? <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">{text}</p> : null}
    </Reveal>
  );
}

export default function HomePage() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Worthwise", url: publicEnv.appUrl, logo: `${publicEnv.appUrl}/icon-512.png`, email: "contato@worthwise.site" },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Worthwise", url: publicEnv.appUrl, inLanguage: "pt-BR" },
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Worthwise", applicationCategory: "BusinessApplication", operatingSystem: "Web",
      description: "Descubra o que vender online: mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop, histórico de preço, calculadora de lucro e assistente de vendas com IA.",
      offers: { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: "9.90", highPrice: "39.90", offerCount: 3 } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ_ITEMS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Abertura */}
      <section id="produto" className="pt-32 md:pt-44">
        <div className="container-page text-center">
          <h1 className="display mx-auto max-w-[860px] text-[40px] sm:text-[58px] lg:text-[68px]">Descubra o que vender e quanto você vai lucrar.</h1>
          <p className="mx-auto mt-6 max-w-[580px] text-[17px] leading-relaxed text-muted md:text-[19px]">
            Veja os mais vendidos de cada loja, compare fornecedores e calcule o lucro real de cada venda. Tudo com a fonte de cada número.
          </p>
          <div className="mx-auto mt-10 grid max-w-[420px] gap-3 sm:grid-cols-2">
            <Link href="/cadastro" className="btn btn-primary btn-lg w-full">Começar por R$ 9,90</Link>
            <Link href="#em-alta" className="btn btn-secondary btn-lg w-full">Ver mais vendidos</Link>
          </div>
          <p className="mt-5 text-[13.5px] text-faint">Primeiro mês por R$ 9,90 · Depois R$ 19,90/mês · Cancele quando quiser</p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[14px] text-muted">
            <span className="text-faint">Lojas:</span>
            {STORES.map((s) => (
              <span key={s} className="inline-flex items-center gap-2"><SourceMark source={s} size={20} />{sourceName(s)}</span>
            ))}
          </div>
        </div>
        <div className="container-page mt-16 !max-w-[1160px] md:mt-20">
          <HeroPreview />
        </div>
      </section>

      {/* Mais vendidos */}
      <section id="em-alta" aria-label="Produtos em alta" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page">
          <SectionHead label="Mais vendidos" title="O que está vendendo agora" text="Os produtos que mais saem em cada loja, por categoria, com link direto para as ofertas." />
          <LiveTrending />
          <div className="mt-10 flex justify-center"><Link href="/cadastro" className="btn btn-secondary">Ver o ranking completo <ArrowRight className="btn-arrow" size={16} /></Link></div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page">
          <SectionHead label="Como funciona" title="Três passos, sem complicação" />
          <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-7 md:p-8">
                <div className="flex items-center gap-3">
                  <span className="tabular flex size-8 items-center justify-center rounded-full bg-tint/[0.07] text-[14px] font-semibold">{i + 1}</span>
                  <h3 className="text-[19px] font-semibold tracking-tight">{s.title}</h3>
                </div>
                <p className="mt-4 text-[15.5px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ferramentas */}
      <section id="funcionalidades" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page">
          <SectionHead label="Ferramentas" title="Tudo o que você precisa para decidir" text="Cada ferramenta mostra de onde veio o dado." />
          <div className="snap-row md:grid md:grid-cols-2 md:gap-6">
            <FeatureTile tone="" icon={<Search />} title="Pesquise produtos" text="Preço, avaliações e quem vende, com foto e link para o anúncio."><VisualSearch /></FeatureTile>
            <FeatureTile tone="" icon={<Scale />} title="Compare fornecedores" text="Some preço, frete e impostos e veja quem sai mais barato. E confira o CNPJ na Receita."><VisualCompare /></FeatureTile>
            <FeatureTile tone="" icon={<LineChart />} title="Entenda o preço" text="Veja se o preço está subindo ou caindo e quantos vendedores disputam o produto."><VisualChart id="ft" /></FeatureTile>
            <FeatureTile tone="" icon={<Calculator />} title="Calcule o lucro" text="Responda 6 perguntas e veja quanto fica no seu bolso, e o menor preço sem prejuízo."><VisualCalc /></FeatureTile>
            <FeatureTile tone="" icon={<Bell />} title="Receba alertas" text="Escolha um preço e seja avisado quando o produto chegar nele."><VisualWatch /></FeatureTile>
            <FeatureTile tone="" icon={<MessagesSquare />} title="Pergunte ao assistente" text="Tire dúvidas em português. Ele faz as contas e mostra de onde tirou cada número."><VisualAssistant /></FeatureTile>
          </div>
          <div className="mt-8 flex justify-center"><DemoTag /></div>
        </div>
      </section>

      {/* Calculadora */}
      <section id="demonstracao" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page">
          <SectionHead label="Grátis, sem cadastro" title="Experimente a calculadora de lucro" text="Mexa nos números e veja o lucro e o preço mínimo na hora." />
          <ProfitCalculator compact />
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page">
          <SectionHead label="Planos" title="Primeiro mês por R$ 9,90." text="Teste tudo por 30 dias. Depois escolha o plano que combina com você." />
          <Pricing />
          <p className="mt-10 text-center text-sm text-faint">Pagamento pela HeroPay (Pix, cartão ou boleto). O Worthwise não guarda dados de cartão.</p>
        </div>
      </section>

      {/* Dúvidas */}
      <section id="perguntas" className="scroll-mt-24 pt-28 md:pt-40">
        <div className="container-page !max-w-3xl">
          <SectionHead label="Dúvidas" title="Perguntas frequentes" />
          <div className="card px-6 py-2 md:px-8"><Faq /></div>
          <p className="mt-8 text-center text-[14.5px] text-muted">Quer os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e as <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
        </div>
      </section>

      {/* Chamada final */}
      <section className="pb-24 pt-28 md:pb-32 md:pt-40">
        <div className="container-page">
          <div className="card px-6 py-16 text-center md:py-24">
            <h2 className="display mx-auto max-w-2xl text-[32px] md:text-[48px]">Pronto para escolher melhor o que vender?</h2>
            <p className="mx-auto mt-5 max-w-md text-[17px] text-muted">Crie sua conta em menos de um minuto e comece pelo primeiro mês por R$ 9,90.</p>
            <div className="mx-auto mt-10 grid max-w-[420px] gap-3 sm:grid-cols-2">
              <Link href="/cadastro" className="btn btn-primary btn-lg w-full">Começar por R$ 9,90</Link>
              <Link href="/precos" className="btn btn-secondary btn-lg w-full">Ver planos</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
