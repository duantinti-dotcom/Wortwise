import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { HeroWidget } from "@/components/marketing/hero-widget";
import { Faq } from "@/components/marketing/faq";
import { QuestionMarquee } from "@/components/marketing/marquee";
import { Pricing } from "@/components/marketing/pricing";
import { Showcase } from "@/components/marketing/showcase";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { Reveal } from "@/components/ui/reveal";
import { Spot } from "@/components/ui/spot";
import { Tilt } from "@/components/ui/tilt";
import { Words } from "@/components/ui/words";
import { BorderBeam } from "@/components/ui/fx";
import { publicEnv } from "@/lib/env";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

const QUESTIONS_A = ["O que vale a pena vender essa semana?", "Encontre produtos até R$ 50 com boa margem", "Qual fornecedor tem o menor custo total?", "Por quanto eu deveria vender?", "Vale a pena vender isso no Mercado Livre?"];
const QUESTIONS_B = ["Quanto sobra se eu vender 100 unidades?", "Compare este produto entre canais", "Quais são os riscos desse produto?", "O preço caiu nas últimas semanas?", "Qual o preço mínimo para não ter prejuízo?"];

const SHOWCASE = [
  { id: "descobrir", title: "Descubra o que vender", text: "Pesquise e veja ofertas reais com preço, vendedor, avaliação, fonte e o momento exato da coleta.", visual: <VisualSearch /> },
  { id: "comparar", title: "Compare fornecedores", text: "Custo final por unidade — preço, frete e impostos rateados — e quem tem CNPJ verificado na Receita.", visual: <VisualCompare /> },
  { id: "mercado", title: "Entenda o mercado", text: "Evolução de preço observada, ofertas comparáveis e concorrência, separando dado confirmado de estimativa.", visual: <VisualChart id="sc" /> },
  { id: "lucro", title: "Saiba quanto sobra", text: "Comissão, frete, impostos, anúncios e devoluções na mesma conta, com preço mínimo e cenários.", visual: <VisualCalc /> },
  { id: "alertas", title: "Receba alertas", text: "Defina um preço-alvo e seja avisado quando ele for atingido, a partir de observações reais.", visual: <VisualWatch /> },
  { id: "assistente", title: "Pergunte ao assistente", text: "Um analista comercial que consulta os dados, faz as contas e cita as fontes. Nunca inventa números.", visual: <VisualAssistant /> },
];

const STEPS = [
  { title: "Pesquise", text: "Digite o que você pensa em vender. O Worthwise consulta as fontes autorizadas e mostra o que cada uma retornou." },
  { title: "Analise", text: "Preço, concorrência, sinais de demanda e riscos — com a origem e a data de cada dado." },
  { title: "Compare", text: "Fornecedores e canais lado a lado pelo custo total e pela margem, não pelo preço anunciado." },
  { title: "Decida", text: "Score com grau de confiança, cenários de lucro e alertas para acompanhar a oportunidade." },
];

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("display text-[40px] md:text-[60px] lg:text-[68px]", className)}>{children}</h2>;
}

export default function HomePage() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Worthwise", url: publicEnv.appUrl, logo: `${publicEnv.appUrl}/icon-512.png` },
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Worthwise", applicationCategory: "BusinessApplication", operatingSystem: "Web",
      description: "Plataforma brasileira de inteligência comercial para vendedores online.", offers: { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: "0", highPrice: "99.90", offerCount: 3 } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ_ITEMS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Hero */}
      <section id="produto" className="relative pt-36 md:pt-48">
        <div className="container-page text-center">
          <h1 className="display mx-auto max-w-5xl text-[52px] sm:text-[80px] lg:text-[112px]">
            <Words parts={["Descubra produtos que", { text: "realmente", className: "accent" }, "valem a pena."]} />
          </h1>
          <p className="animate-fade-up mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#cfcfcf] [animation-delay:550ms] md:text-xl">
            Encontre oportunidades, compare fornecedores, acompanhe preços e descubra quanto você pode lucrar — tudo em um só lugar.
          </p>
          <div className="animate-fade-up mt-10 flex flex-wrap justify-center gap-3 [animation-delay:650ms]">
            <Link href="/cadastro" className="btn btn-primary btn-lg !h-14 !rounded-2xl !px-8 !text-base">Começar grátis <ArrowRight size={18} /></Link>
            <Link href="#demonstracao" className="btn btn-glass btn-lg !h-14 !rounded-2xl !px-8 !text-base">Ver demonstração</Link>
          </div>
          <ul className="animate-fade-up mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted [animation-delay:750ms]">
            {["3 pesquisas grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-brand" />{t}</li>)}
          </ul>
        </div>
        <div className="container-page !max-w-[1240px] mt-20 md:mt-24">
          <Tilt max={5}><HeroPreview widget={<HeroWidget />} /></Tilt>
        </div>
      </section>

      {/* Princípios */}
      <section className="pt-44 md:pt-52">
        <div className="container-page">
          <Reveal>
            <p className="mx-auto max-w-4xl text-center text-[28px] font-medium leading-[1.25] tracking-[-0.03em] text-muted md:text-[40px]">
              Sem scraping, sem números inventados. <span className="text-fg">Cada preço tem fonte e data,</span> cada CNPJ é conferido na Receita e <span className="serif text-fg">todo custo entra na conta.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Vitrine */}
      <section id="funcionalidades" className="scroll-mt-24 py-28 md:py-36">
        <div className="container-page">
          <Reveal className="mb-14 max-w-3xl"><Title>Tudo para decidir <span className="accent">o que vender.</span></Title></Reveal>
          <Reveal><Showcase items={SHOWCASE} /></Reveal>
          <div className="mt-6 flex justify-end"><DemoTag /></div>
        </div>
      </section>

      {/* Perguntas */}
      <section aria-label="Perguntas que o assistente responde" className="pb-28 md:pb-36">
        <Reveal className="container-page mb-10 text-center"><p className="text-lg text-muted">Pergunte como perguntaria a um <span className="serif text-fg">analista comercial</span></p></Reveal>
        <div className="space-y-3"><QuestionMarquee items={QUESTIONS_A} /><QuestionMarquee items={QUESTIONS_B} reverse /></div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mb-14 flex flex-wrap items-end justify-between gap-6">
            <Title className="max-w-2xl">Da dúvida à decisão, <span className="accent">em quatro passos.</span></Title>
            <Link href="/cadastro" className="btn btn-glass btn-lg !rounded-2xl">Começar agora <ArrowRight size={16} /></Link>
          </Reveal>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.07} className="h-full">
                <Spot as="li" className="lg card-hover flex h-full flex-col rounded-[28px] p-6 md:p-7">
                  <span className="serif text-[48px] leading-none text-brand-hi md:text-[64px]">{i + 1}</span>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight md:mt-8">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.text}</p>
                </Spot>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Calculadora */}
      <section id="demonstracao" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Title>Experimente a <span className="accent">calculadora de lucro.</span></Title>
            <p className="mt-6 text-lg text-muted">Funciona agora, sem cadastro. Mexa nos números e veja o lucro, o preço mínimo e o caminho da receita até o que sobra.</p>
          </Reveal>
          <Reveal><ProfitCalculator compact /></Reveal>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center">
            <Title>Comece grátis. <span className="accent">Assine quando fizer sentido.</span></Title>
            <p className="mt-6 text-lg text-muted">Limites claros em todos os planos. Cancele quando quiser; o acesso vale até o fim do período pago.</p>
          </Reveal>
          <Reveal><Pricing /></Reveal>
          <p className="mt-8 text-center text-sm text-faint">Pagamento processado pela HeroPay (Pix, cartão ou boleto). O Worthwise não armazena dados de cartão.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <Title className="!text-[40px] md:!text-[52px]">Perguntas <span className="accent">frequentes.</span></Title>
            <p className="mt-6 text-muted">Quer os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e veja o estado das <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
          </Reveal>
          <Reveal delay={0.08}><div className="lg rounded-[28px] px-6 py-2 md:px-8"><Faq /></div></Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-28 pt-8 md:pb-36">
        <div className="container-page">
          <Reveal>
            <div className="lg lg-refract relative overflow-hidden rounded-[40px] px-6 py-20 text-center md:py-32">
              <BorderBeam />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(60%_80%_at_50%_120%,rgba(255,121,0,0.45),transparent_70%)]" />
              <h2 className="display relative mx-auto max-w-4xl text-[44px] md:text-[76px]">Sua próxima compra merece <span className="accent">dados melhores.</span></h2>
              <p className="relative mx-auto mt-6 max-w-xl text-lg text-[#cfcfcf]">Crie sua conta e faça três pesquisas completas por nossa conta.</p>
              <div className="relative mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/cadastro" className="btn btn-primary btn-lg !h-14 !rounded-2xl !px-8 !text-base">Começar grátis <ArrowRight size={18} /></Link>
                <Link href="/precos" className="btn btn-glass btn-lg !h-14 !rounded-2xl !px-8 !text-base">Ver planos</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
