import { ArrowRight, BadgeCheck, Bell, Calculator, Check, ChevronsRight, Database, LineChart, MessagesSquare, Receipt, Scale, Search, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { CurvyArrow, Sparkle, Squiggle, Underline } from "@/components/marketing/doodles";
import { Faq } from "@/components/marketing/faq";
import { FactsMarquee } from "@/components/marketing/facts";
import { FeatureTile } from "@/components/marketing/feature-tile";
import { HeroWidget } from "@/components/marketing/hero-widget";
import { QuestionMarquee } from "@/components/marketing/marquee";
import { Pricing } from "@/components/marketing/pricing";
import { WordRotator } from "@/components/marketing/rotator";
import { ScrollFrame } from "@/components/marketing/scroll-frame";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { Reveal, Stagger, StaggerItem } from "@/components/ui/reveal";
import { Spot } from "@/components/ui/spot";
import { BorderBeam } from "@/components/ui/fx";
import { publicEnv } from "@/lib/env";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

const QUESTIONS_A = ["O que vale a pena vender essa semana?", "Encontre produtos até R$ 50 com boa margem", "Qual fornecedor tem o menor custo total?", "Por quanto eu deveria vender?", "Vale a pena vender isso no Mercado Livre?"];
const QUESTIONS_B = ["Quanto sobra se eu vender 100 unidades?", "Compare este produto entre canais", "Quais são os riscos desse produto?", "O preço caiu nas últimas semanas?", "Qual o preço mínimo para não ter prejuízo?"];

const ROTATOR = [
  { word: "dados reais", icon: <Database />, tone: "bg-gradient-to-br from-[#ffb15c] to-[#ff6a00]" },
  { word: "lucro real", icon: <TrendingUp />, tone: "bg-gradient-to-br from-[#3ee0a0] to-[#0e8f86]" },
  { word: "preço certo", icon: <Receipt />, tone: "bg-gradient-to-br from-[#7ad7ff] to-[#4b3cff]" },
  { word: "fonte e data", icon: <BadgeCheck />, tone: "bg-gradient-to-br from-[#ff7ab2] to-[#a12cff]" },
];

const SOURCES = [
  { icon: Search, label: "API oficial do Mercado Livre" },
  { icon: ShieldCheck, label: "CNPJ via Receita Federal" },
  { icon: LineChart, label: "Histórico de preços próprio" },
  { icon: Sparkles, label: "IA que cita as fontes" },
];

const STEPS = [
  { title: "Pesquise", text: "Digite o que você pensa em vender. O Worthwise consulta as fontes autorizadas e mostra o que cada uma retornou.", icon: Search },
  { title: "Analise", text: "Preço, concorrência, sinais de demanda e riscos — com a origem e a data de cada dado.", icon: LineChart },
  { title: "Compare", text: "Fornecedores e canais lado a lado pelo custo total e pela margem, não pelo preço anunciado.", icon: Scale },
  { title: "Decida", text: "Score com grau de confiança, cenários de lucro e alertas para acompanhar a oportunidade.", icon: Check },
];

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("display text-[40px] sm:text-[52px] lg:text-[64px]", className)}>{children}</h2>;
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
      <section id="produto" className="relative overflow-x-clip pt-32 md:pt-44">
        <Squiggle className="absolute -left-10 top-56 hidden w-[230px] text-fg/70 md:block lg:left-0 xl:left-8" />
        <Sparkle className="absolute right-[6%] top-40 hidden w-16 text-fg/80 md:block" />
        <Sparkle className="absolute right-[13%] top-[340px] hidden w-7 text-brand md:block" delay={1.2} />
        <div className="container-page relative text-center">
          <Reveal y={12}>
            <Link href="/cadastro" className="group mx-auto inline-flex items-center gap-2 rounded-full border border-tint/12 bg-tint/[0.04] py-1 pl-1 pr-3.5 text-[13px] font-medium text-soft backdrop-blur transition-colors hover:border-brand/40">
              <span className="rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-bold text-[#1a0900]">Novo</span>
              Assistente com IA que faz as contas e cita as fontes
              <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <h1 className="display mx-auto mt-7 max-w-[1000px] text-[44px] sm:text-[68px] lg:text-[88px]">
            <span className="word" style={{ animationDelay: "60ms" }}>Descubra o que</span>{" "}
            <span className="word relative inline-block" style={{ animationDelay: "140ms" }}>vale a pena<Underline className="text-brand/70" /></span>{" "}
            <span className="word" style={{ animationDelay: "220ms" }}>vender com</span>{" "}
            <span className="word whitespace-nowrap" style={{ animationDelay: "320ms" }}><WordRotator items={ROTATOR} /></span>
          </h1>
          <p className="animate-fade-up mx-auto mt-7 max-w-[640px] text-[17px] leading-relaxed text-muted [animation-delay:450ms] md:text-xl">
            O Worthwise encontra oportunidades, compara fornecedores pelo custo total, acompanha preços e mostra quanto você realmente lucra — com a fonte de cada número.
          </p>
          <div className="animate-fade-up mt-9 flex justify-center [animation-delay:560ms]">
            <div className="relative flex flex-wrap justify-center gap-3">
              <CurvyArrow className="absolute -left-32 -top-6 hidden w-24 -scale-x-100 rotate-[20deg] text-brand lg:block" />
              <Link href="/cadastro" className="btn btn-contrast btn-xl">Começar grátis <ChevronsRight className="btn-arrow" size={20} /></Link>
              <Link href="#demonstracao" className="btn btn-secondary btn-xl">Testar a calculadora</Link>
            </div>
          </div>
          <ul className="animate-fade-up mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted [animation-delay:650ms]">
            {["3 pesquisas grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={15} strokeWidth={3} className="text-brand" />{t}</li>)}
          </ul>
          <Stagger className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
            {SOURCES.map((s) => (
              <StaggerItem key={s.label}><span className="inline-flex h-9 items-center gap-2 rounded-full border border-tint/10 bg-tint/[0.04] px-3.5 text-[13px] text-soft"><s.icon size={14} className="text-brand" />{s.label}</span></StaggerItem>
            ))}
          </Stagger>
        </div>
        <div className="container-page !max-w-[1280px] mt-16 md:mt-20">
          <ScrollFrame><HeroPreview /></ScrollFrame>
        </div>
      </section>

      {/* Fatos */}
      <section aria-label="Worthwise em números" className="pt-24 md:pt-32">
        <Reveal className="container-page mb-10 text-center"><Title className="!text-[34px] sm:!text-[44px]">Feito para quem vende online <span className="accent">no Brasil</span></Title></Reveal>
        <FactsMarquee />
      </section>

      {/* Princípios */}
      <section className="pt-28 md:pt-36">
        <div className="container-page">
          <Reveal>
            <p className="mx-auto max-w-4xl text-center text-[26px] font-semibold leading-[1.25] tracking-[-0.035em] text-faint md:text-[40px]">
              Sem scraping, sem números inventados. <span className="text-fg">Cada preço tem fonte e data,</span> cada CNPJ é conferido na Receita e <span className="accent">todo custo entra na conta.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="scroll-mt-24 py-28 md:py-36">
        <div className="container-page">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <span className="eyebrow">Funcionalidades</span>
            <Title className="mt-5">Tudo para decidir <span className="accent">o que vender</span></Title>
            <p className="mt-5 text-lg text-muted">Seis ferramentas que conversam entre si. Cada uma mostra de onde veio o dado.</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            <FeatureTile tone="tile-sunset" icon={<Search />} title="Descubra o que vender" text="Pesquise e veja ofertas reais com preço, vendedor, avaliação, fonte e o momento exato da coleta."><VisualSearch /></FeatureTile>
            <FeatureTile tone="tile-berry" icon={<Scale />} title="Compare fornecedores" text="Custo final por unidade — preço, frete e impostos rateados — e quem tem CNPJ verificado na Receita." flip><VisualCompare /></FeatureTile>
            <FeatureTile tone="tile-ocean" icon={<LineChart />} title="Entenda o mercado" text="Evolução de preço observada, ofertas comparáveis e concorrência, separando dado confirmado de estimativa." flip><VisualChart id="ft" /></FeatureTile>
            <FeatureTile tone="tile-ember" icon={<Calculator />} title="Saiba quanto sobra" text="Comissão, frete, impostos, anúncios e devoluções na mesma conta, com preço mínimo e cenários."><VisualCalc /></FeatureTile>
            <FeatureTile tone="tile-mint" icon={<Bell />} title="Receba alertas" text="Defina um preço-alvo e seja avisado quando ele for atingido, a partir de observações reais."><VisualWatch /></FeatureTile>
            <FeatureTile tone="tile-night" icon={<MessagesSquare />} title="Pergunte ao assistente" text="Um analista comercial que consulta os dados, faz as contas e cita as fontes. Nunca inventa números." flip><VisualAssistant /></FeatureTile>
          </div>
          <div className="mt-6 flex justify-center"><DemoTag /></div>
        </div>
      </section>

      {/* Perguntas */}
      <section aria-label="Perguntas que o assistente responde" className="pb-28 md:pb-36">
        <Reveal className="container-page mb-10 text-center"><Title className="!text-[32px] sm:!text-[44px]">Pergunte como perguntaria a um <span className="accent">analista</span></Title></Reveal>
        <div className="space-y-3"><QuestionMarquee items={QUESTIONS_A} /><QuestionMarquee items={QUESTIONS_B} reverse /></div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mb-14 flex flex-wrap items-end justify-between gap-6">
            <div><span className="eyebrow">Como funciona</span><Title className="mt-5 max-w-2xl">Da dúvida à decisão em <span className="accent">quatro passos</span></Title></div>
            <Link href="/cadastro" className="btn btn-contrast btn-lg">Começar agora <ChevronsRight className="btn-arrow" size={18} /></Link>
          </Reveal>
          <Stagger as="ol" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <StaggerItem as="li" key={s.title} className="h-full">
                <Spot className="lg card-hover flex h-full flex-col rounded-[28px] p-6 md:p-7">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffb15c] to-brand text-[#1a0900] shadow-[0_10px_24px_-10px_rgba(255,121,0,0.8)]"><s.icon size={22} strokeWidth={2.4} /></span>
                    <span className="text-[56px] font-bold leading-none tracking-[-0.06em] text-tint/[0.08]">0{i + 1}</span>
                  </div>
                  <h3 className="mt-8 text-2xl font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.text}</p>
                </Spot>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Calculadora */}
      <section id="demonstracao" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <span className="eyebrow">Grátis, sem cadastro</span>
            <Title className="mt-5">Experimente a <span className="accent">calculadora de lucro</span></Title>
            <p className="mt-5 text-lg text-muted">Mexa nos números e veja o lucro, o preço mínimo e o caminho da receita até o que sobra.</p>
          </Reveal>
          <div className="mb-8 flex justify-center lg:hidden"><HeroWidget /></div>
          <Reveal><ProfitCalculator compact /></Reveal>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center">
            <span className="eyebrow">Planos</span>
            <Title className="mt-5">Comece grátis. <span className="accent">Assine quando fizer sentido.</span></Title>
            <p className="mt-5 text-lg text-muted">Limites claros em todos os planos. Cancele quando quiser; o acesso vale até o fim do período pago.</p>
          </Reveal>
          <Pricing />
          <p className="mt-8 text-center text-sm text-faint">Pagamento processado pela HeroPay (Pix, cartão ou boleto). O Worthwise não armazena dados de cartão.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <span className="eyebrow">Dúvidas</span>
            <Title className="mt-5 !text-[40px] md:!text-[52px]">Perguntas <span className="accent">frequentes</span></Title>
            <p className="mt-6 text-muted">Quer os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e veja o estado das <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
          </Reveal>
          <Reveal delay={0.08}><div className="lg rounded-[28px] px-6 py-2 md:px-8"><Faq /></div></Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-28 pt-8 md:pb-36">
        <div className="container-page">
          <Reveal scale={0.96}>
            <div className="tile tile-sunset anim-gradient relative px-6 py-20 text-center md:py-28">
              <BorderBeam />
              <Squiggle className="absolute -left-6 bottom-0 hidden w-48 text-white/60 md:block" />
              <Sparkle className="absolute right-10 top-10 w-12 text-white/80" />
              <h2 className="display relative mx-auto max-w-4xl text-[42px] text-white md:text-[72px]">Sua próxima compra merece dados melhores</h2>
              <p className="tile-muted relative mx-auto mt-6 max-w-xl text-lg">Crie sua conta e faça três pesquisas completas por nossa conta.</p>
              <div className="relative mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/cadastro" className="btn btn-xl bg-white text-[#1a0900] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]">Começar grátis <ChevronsRight className="btn-arrow" size={20} /></Link>
                <Link href="/precos" className="btn btn-xl border-white/40 text-white hover:bg-white/10">Ver planos</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
