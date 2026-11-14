import { ArrowRight, Bell, Calculator, Check, LineChart, MessagesSquare, Scale, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Faq } from "@/components/marketing/faq";
import { FeatureTile } from "@/components/marketing/feature-tile";
import { LiveTrending } from "@/components/marketing/live-trending";
import { QuestionMarquee } from "@/components/marketing/marquee";
import { Pricing } from "@/components/marketing/pricing";
import { ScrollFrame } from "@/components/marketing/scroll-frame";
import { TextRotator } from "@/components/marketing/text-rotator";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { Reveal, Stagger, StaggerItem } from "@/components/ui/reveal";
import { Spot } from "@/components/ui/spot";
import { publicEnv } from "@/lib/env";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

const QUESTIONS_A = ["O que vale a pena vender essa semana?", "Encontre produtos até R$ 50 com boa margem", "Qual fornecedor tem o menor custo total?", "Por quanto eu deveria vender?", "Vale a pena vender isso no Mercado Livre?"];
const QUESTIONS_B = ["Quanto sobra se eu vender 100 unidades?", "Compare este produto entre canais", "Quais são os riscos desse produto?", "O preço caiu nas últimas semanas?", "Qual o preço mínimo para não ter prejuízo?"];


const SOURCES = [
  { icon: Search, label: "API oficial do Mercado Livre" },
  { icon: ShieldCheck, label: "CNPJ via Receita Federal" },
  { icon: LineChart, label: "Histórico de preços próprio" },
  { icon: Sparkles, label: "IA que cita as fontes" },
];

const STEPS = [
  { title: "Pesquise", text: "Digite o que você pensa em vender ou veja os mais vendidos de cada categoria.", icon: Search },
  { title: "Analise", text: "Veja preço, avaliações, concorrência e os riscos — com a fonte de cada número.", icon: LineChart },
  { title: "Calcule", text: "Descubra quanto sobra em cada venda e qual fornecedor sai mais barato.", icon: Scale },
  { title: "Decida", text: "Uma resposta simples — vale a pena ou não — e alertas para comprar na hora certa.", icon: Check },
];

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("display text-[34px] sm:text-[46px] lg:text-[56px]", className)}>{children}</h2>;
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
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] [mask-image:radial-gradient(60%_60%_at_50%_0%,#000,transparent)]" />
        <div className="container-page relative text-center">
          <Reveal y={10}>
            <Link href="/cadastro" className="group mx-auto inline-flex items-center gap-2.5 rounded-full border border-tint/10 bg-tint/[0.03] py-1 pl-1 pr-3 text-[13px] text-muted backdrop-blur transition-colors hover:border-tint/25 hover:text-fg">
              <span className="rounded-full bg-tint/10 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-fg">Novo</span>
              Ranking de mais vendidos<span className="hidden sm:inline"> do Mercado Livre</span>
              <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <h1 className="display mx-auto mt-8 max-w-[1000px] text-[40px] sm:text-[64px] lg:text-[82px]">
            <span className="word block" style={{ animationDelay: "60ms" }}>Encontre o produto</span>
            <TextRotator className="pb-[0.08em] text-brand" phrases={["que mais vende.", "com a melhor margem.", "com o fornecedor certo.", "antes da concorrência."]} />
          </h1>
          <p className="animate-fade-up mx-auto mt-7 max-w-[620px] text-[17px] leading-relaxed text-muted [animation-delay:380ms] md:text-[19px]">
            Ranking oficial de mais vendidos com foto, preço e link direto. Fornecedores comparados pelo custo total e o lucro real de cada venda — com a fonte de cada número.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap justify-center gap-3 [animation-delay:480ms]">
            <Link href="/cadastro" className="btn btn-primary btn-xl">Começar grátis <ArrowRight className="btn-arrow" size={18} /></Link>
            <Link href="#em-alta" className="btn btn-secondary btn-xl">Ver o que está em alta</Link>
          </div>
          <ul className="animate-fade-up mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-faint [animation-delay:560ms]">
            {["3 pesquisas grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={14} className="text-brand" />{t}</li>)}
          </ul>
        </div>
        <div className="container-page !max-w-[1240px] mt-16 md:mt-20">
          <ScrollFrame><HeroPreview /></ScrollFrame>
        </div>
        <div className="container-page mt-14">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-tint/10 bg-tint/10 md:grid-cols-4">
            {SOURCES.map((s) => (
              <li key={s.label} className="flex items-center gap-3 bg-ink px-5 py-4 text-[13.5px] text-soft"><s.icon size={16} className="shrink-0 text-brand" />{s.label}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Em alta agora */}
      <section id="em-alta" aria-label="Produtos em alta" className="scroll-mt-24 pt-16 md:pt-36">
        <div className="container-page">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <span className="eyebrow">Em alta agora</span>
            <Title className="mt-5">O que está vendendo <span className="accent">agora</span></Title>
            <p className="mt-5 text-lg text-muted">O ranking de mais vendidos de cada categoria, com foto, preço e link direto para o anúncio. Dentro do app você filtra por categoria, analisa a margem e monitora o preço.</p>
          </Reveal>
          <LiveTrending />
          <div className="mt-8 flex justify-center"><Link href="/cadastro" className="btn btn-contrast btn-lg">Ver o ranking completo <ArrowRight className="btn-arrow" size={16} /></Link></div>
        </div>
      </section>

      {/* Números */}
      <section aria-label="Worthwise em números" className="pt-16 md:pt-36">
        <div className="container-page">
          <Stagger className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-tint/10 bg-tint/10 lg:grid-cols-4">
            {[["R$ 0", "para começar, sem cartão"], ["100%", "dos preços com fonte e data"], ["30 min", "atualização do ranking"], ["0", "números inventados"]].map(([big, small]) => (
              <StaggerItem key={small} className="bg-ink p-6 md:p-8">
                <div className="tabular text-[34px] font-semibold tracking-[-0.04em] md:text-[44px]">{big}</div>
                <div className="mt-1 font-mono text-[11.5px] uppercase tracking-wider text-faint">{small}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Princípios */}
      <section className="pt-16 md:pt-36">
        <div className="container-page">
          <Reveal>
            <p className="mx-auto max-w-4xl text-center text-[21px] font-medium leading-[1.32] tracking-[-0.03em] text-faint md:text-[36px]">
              Sem scraping, sem números inventados. <span className="text-fg">Cada preço tem fonte e data,</span> cada CNPJ é conferido na Receita e <span className="text-fg">todo custo entra na conta.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="scroll-mt-24 py-16 md:py-36">
        <div className="container-page">
          <Reveal className="mx-auto mb-8 max-w-3xl text-center md:mb-14">
            <span className="eyebrow">Funcionalidades</span>
            <Title className="mt-5">Tudo para decidir <span className="accent">o que vender</span></Title>
            <p className="mt-5 text-lg text-muted">Seis ferramentas que conversam entre si. Cada uma mostra de onde veio o dado.</p>
          </Reveal>
          <div className="snap-row md:grid md:grid-cols-2 md:gap-5">
            <FeatureTile tone="tile-sunset" icon={<Search />} title="Descubra o que vender" text="Digite um produto e veja preço, avaliações e quem vende — com foto e link para o anúncio."><VisualSearch /></FeatureTile>
            <FeatureTile tone="tile-berry" icon={<Scale />} title="Compare fornecedores" text="Some preço, frete e impostos e descubra quem sai mais barato de verdade. E confira se a empresa existe na Receita." flip><VisualCompare /></FeatureTile>
            <FeatureTile tone="tile-ocean" icon={<LineChart />} title="Entenda o preço" text="Veja se o preço está subindo ou caindo, o menor e o maior preço e quantos vendedores disputam o produto." flip><VisualChart id="ft" /></FeatureTile>
            <FeatureTile tone="tile-ember" icon={<Calculator />} title="Saiba quanto sobra" text="Responda 6 perguntas e veja quanto fica no seu bolso em cada venda — e o menor preço sem ter prejuízo."><VisualCalc /></FeatureTile>
            <FeatureTile tone="tile-mint" icon={<Bell />} title="Receba alertas" text="Escolha um preço e seja avisado quando o produto chegar nele. Bom para comprar na hora certa."><VisualWatch /></FeatureTile>
            <FeatureTile tone="tile-night" icon={<MessagesSquare />} title="Pergunte ao assistente" text="Pergunte em português, como para um amigo que entende de vendas. Ele faz as contas e mostra de onde tirou cada número." flip><VisualAssistant /></FeatureTile>
          </div>
          <p className="mt-1 text-center text-xs text-faint md:hidden">Deslize para o lado →</p>
          <div className="mt-6 flex justify-center"><DemoTag /></div>
        </div>
      </section>

      {/* Perguntas */}
      <section aria-label="Perguntas que o assistente responde" className="pb-16 md:pb-36">
        <Reveal className="container-page mb-10 text-center"><Title className="!text-[32px] sm:!text-[44px]">Pergunte como perguntaria a um <span className="accent">analista</span></Title></Reveal>
        <div className="space-y-3"><QuestionMarquee items={QUESTIONS_A} /><QuestionMarquee items={QUESTIONS_B} reverse /></div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 py-16 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-8 max-w-3xl text-center md:mb-14">
            <span className="eyebrow">Como funciona</span>
            <Title className="mt-5">Da dúvida à decisão em <span className="accent">quatro passos</span></Title>
          </Reveal>
          <Stagger as="ol" className="snap-row md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <StaggerItem as="li" key={s.title} className="h-full">
                <Spot className="lg card-hover flex h-full flex-col rounded-2xl p-6 md:p-7">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-[10px] border border-tint/10 bg-tint/[0.04] text-brand"><s.icon size={18} /></span>
                    <span className="font-mono text-[12px] text-faint">0{i + 1}</span>
                  </div>
                  <h3 className="mt-8 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.text}</p>
                </Spot>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-10 flex justify-center"><Link href="/cadastro" className="btn btn-primary btn-lg">Começar agora <ArrowRight className="btn-arrow" size={16} /></Link></div>
        </div>
      </section>

      {/* Calculadora */}
      <section id="demonstracao" className="scroll-mt-24 py-16 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-8 max-w-3xl text-center md:mb-14">
            <span className="eyebrow">Grátis, sem cadastro</span>
            <Title className="mt-5">Experimente a <span className="accent">calculadora de lucro</span></Title>
            <p className="mt-5 text-lg text-muted">Mexa nos números e veja o lucro, o preço mínimo e o caminho da receita até o que sobra.</p>
          </Reveal>
          <Reveal><ProfitCalculator compact /></Reveal>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-24 py-16 md:py-32">
        <div className="container-page">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center">
            <span className="eyebrow">Planos</span>
            <Title className="mt-5">Comece grátis. <span className="accent">Assine quando fizer sentido.</span></Title>
            <p className="mt-5 text-lg text-muted">Limites claros em todos os planos. Cancele quando quiser; o acesso vale até o fim do período pago.</p>
          </Reveal>
          <Pricing />
          <p className="mt-1 text-center text-xs text-faint lg:hidden">Deslize para ver os outros planos →</p>
          <p className="mt-8 text-center text-sm text-faint">Pagamento processado pela HeroPay (Pix, cartão ou boleto). O Worthwise não armazena dados de cartão.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="scroll-mt-24 py-16 md:py-32">
        <div className="container-page !max-w-3xl">
          <Reveal className="mb-12 text-center">
            <span className="eyebrow">Dúvidas</span>
            <Title className="mt-5">Perguntas <span className="accent">frequentes</span></Title>
            <p className="mt-5 text-muted">Quer os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e veja o estado das <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
          </Reveal>
          <Reveal delay={0.08}><div className="lg rounded-[24px] px-6 py-2 md:px-8"><Faq /></div></Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-28 pt-8 md:pb-36">
        <div className="container-page">
          <Reveal>
            <div className="tile relative px-6 py-20 text-center md:py-28">
              <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(var(--tint)/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--tint)/0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(60%_70%_at_50%_100%,#000,transparent)]" />
              <h2 className="display relative mx-auto max-w-3xl text-[38px] md:text-[60px]">Sua próxima compra merece dados melhores.</h2>
              <p className="tile-muted relative mx-auto mt-5 max-w-xl text-lg">Crie sua conta e faça três pesquisas completas por nossa conta.</p>
              <div className="relative mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/cadastro" className="btn btn-primary btn-xl">Começar grátis <ArrowRight className="btn-arrow" size={18} /></Link>
                <Link href="/precos" className="btn btn-secondary btn-xl">Ver planos</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
