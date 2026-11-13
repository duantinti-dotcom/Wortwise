import { ArrowRight, BarChart3, Bell, Calculator, Layers, MessagesSquare, Scale, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Carousel } from "@/components/marketing/carousel";
import { Faq } from "@/components/marketing/faq";
import { FAQ_ITEMS } from "@/lib/faq";
import { Pricing } from "@/components/marketing/pricing";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { Reveal } from "@/components/ui/reveal";
import { publicEnv } from "@/lib/env";

const FEATURES = [
  { icon: Search, title: "Descoberta inteligente", text: "Pesquise por produto, palavra-chave ou categoria e veja ofertas reais, com preço, vendedor, avaliação, fonte e data da coleta." },
  { icon: Scale, title: "Comparação de fornecedores", text: "Compare pelo custo final por unidade — preço, frete e impostos rateados — e veja quem tem verificação documental." },
  { icon: BarChart3, title: "Análise de mercado", text: "Evolução de preços observada, ofertas concorrentes e sinais de demanda, sempre separando dado confirmado de estimativa." },
  { icon: Calculator, title: "Calculadora de lucro", text: "Comissão, frete, impostos, publicidade, devoluções e perdas: saiba quanto sobra de verdade e qual é o preço mínimo." },
  { icon: Bell, title: "Monitoramento", text: "Defina regras como “avise quando cair abaixo de R$ 40” e receba alertas gerados a partir de observações reais." },
  { icon: MessagesSquare, title: "Assistente Worthwise", text: "Pergunte em português. O assistente consulta os dados da plataforma, faz as contas e cita fontes — sem inventar números." },
];

const STEPS = [
  { n: "01", title: "Pesquisar", text: "Digite o que você pensa em vender. O Worthwise consulta as fontes autorizadas e mostra o que cada uma retornou." },
  { n: "02", title: "Analisar", text: "Abra um produto para ver preços, concorrência, sinais de demanda e os riscos — com a origem de cada dado." },
  { n: "03", title: "Comparar", text: "Coloque fornecedores e canais lado a lado pelo custo total e pela margem, não só pelo preço anunciado." },
  { n: "04", title: "Decidir", text: "Simule cenários, veja o Score com seu grau de confiança e salve a análise para acompanhar." },
];

const SCREENS = [
  { title: "Descobrir produtos", node: <VisualSearch /> },
  { title: "Worthwise Compare", node: <VisualCompare /> },
  { title: "Análise de mercado", node: <VisualChart /> },
  { title: "Worthwise Simulator", node: <VisualCalc /> },
  { title: "Worthwise Watch", node: <VisualWatch /> },
  { title: "Assistente Worthwise", node: <VisualAssistant /> },
];

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold leading-[1.1] md:text-[44px]">{title}</h2>
      {text ? <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">{text}</p> : null}
    </Reveal>
  );
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section id="produto" className="relative overflow-hidden pb-24 pt-32 md:pb-32 md:pt-44">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(60%_50%_at_75%_0%,rgba(255,121,0,0.10),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]" />
        <div className="container-page grid items-center gap-16 lg:grid-cols-[1.02fr_1fr] lg:gap-10">
          <div className="animate-fade-up">
            <span className="badge badge-brand"><ShieldCheck size={13} /> Dados com fonte. Sem números inventados.</span>
            <h1 className="mt-6 text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[68px]">
              Descubra produtos que <span className="text-brand">realmente</span> valem a pena.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Encontre oportunidades de venda, compare fornecedores, acompanhe preços e descubra quanto você pode lucrar — tudo em um só lugar.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/cadastro" className="btn btn-primary btn-lg">Começar grátis <ArrowRight size={17} /></Link>
              <Link href="#demonstracao" className="btn btn-secondary btn-lg">Ver demonstração</Link>
            </div>
            <p className="mt-5 text-sm text-faint">3 pesquisas gratuitas · sem cartão de crédito</p>
          </div>
          <div className="animate-fade-up pb-10 [animation-delay:120ms]"><HeroPreview /></div>
        </div>
      </section>

      {/* Três perguntas */}
      <section className="border-y border-line bg-surface/60">
        <div className="container-page grid divide-line md:grid-cols-3 md:divide-x">
          {[["O que vale a pena vender agora?", "Ofertas reais e sinais de demanda, com a origem de cada dado."],
            ["Onde encontrar um fornecedor confiável?", "Comparação pelo custo total e verificação documental de CNPJ."],
            ["Quanto posso realmente lucrar?", "Todas as despesas na conta, com cenários e preço mínimo."]].map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.06} className="py-8 md:px-8 md:first:pl-0 md:last:pr-0">
              <h2 className="text-lg font-semibold tracking-tight">{q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <SectionHead eyebrow="Funcionalidades" title="Tudo o que você precisa para decidir o que vender" text="Ferramentas conectadas entre si: da primeira pesquisa à simulação de lucro, sem trocar de aba." />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.06}>
                <article className="card card-hover h-full p-7">
                  <div className="flex size-11 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand-hi"><f.icon size={20} /></div>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Carrossel */}
      <section className="pb-24 md:pb-32" aria-labelledby="telas-titulo">
        <div className="container-page mb-10 flex flex-wrap items-end justify-between gap-4">
          <Reveal>
            <div className="eyebrow">Por dentro da plataforma</div>
            <h2 id="telas-titulo" className="mt-3 text-3xl font-semibold md:text-4xl">Uma jornada única, do produto ao lucro</h2>
          </Reveal>
          <DemoTag />
        </div>
        <Carousel label="Demonstrações das funcionalidades">
          {SCREENS.map((s) => (
            <figure key={s.title} className="card w-[320px] shrink-0 p-5 sm:w-[400px]">
              <figcaption className="mb-4 flex items-center gap-2 text-sm font-medium"><Layers size={15} className="text-brand" /> {s.title}</figcaption>
              {s.node}
            </figure>
          ))}
        </Carousel>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-24 border-t border-line py-24 md:py-32">
        <div className="container-page">
          <SectionHead eyebrow="Como funciona" title="Pesquisar, analisar, comparar e decidir" />
          <ol className="mt-14 grid gap-5 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.07}>
                <li className="relative h-full rounded-2xl border border-line p-6">
                  <span className="font-mono text-sm text-brand">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Demonstração real */}
      <section id="demonstracao" className="scroll-mt-24 border-t border-line bg-surface/50 py-24 md:py-32">
        <div className="container-page">
          <SectionHead eyebrow="Experimente agora" title="A calculadora de lucro, funcionando de verdade"
            text="Sem cadastro: informe seus números e veja margem, ponto de equilíbrio, preço mínimo e cenários. Na plataforma você salva e compara simulações." />
          <Reveal className="mt-12"><ProfitCalculator compact initial={{ quantity: 50 }} /></Reveal>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-page">
          <SectionHead eyebrow="Planos" title="Comece grátis. Assine quando fizer sentido." text="Limites claros em todos os planos. Cancele quando quiser; o acesso vale até o fim do período pago." />
          <Reveal className="mt-14"><Pricing /></Reveal>
          <p className="mt-6 text-center text-sm text-faint">Pagamento processado pela HeroPay (Pix, cartão ou boleto). O Worthwise não armazena dados de cartão.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="scroll-mt-24 border-t border-line py-24 md:py-32">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <div className="eyebrow">Perguntas frequentes</div>
            <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Transparência sobre dados, limites e planos</h2>
            <p className="mt-4 text-muted">Prefere os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e veja o estado das <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
          </Reveal>
          <Reveal delay={0.08}><Faq /></Reveal>
        </div>
      </section>

      {/* CTA final */}
      <section className="pb-24 md:pb-32">
        <div className="container-page">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-graphite px-6 py-16 text-center md:py-20">
              <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_80%_at_50%_120%,rgba(255,121,0,0.22),transparent_70%)]" />
              <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold leading-[1.1] md:text-5xl">Sua próxima decisão de compra merece dados melhores.</h2>
              <p className="relative mx-auto mt-4 max-w-xl text-muted">Crie sua conta e faça três pesquisas completas por nossa conta.</p>
              <Link href="/cadastro" className="btn btn-primary btn-lg relative mt-8">Começar grátis <ArrowRight size={17} /></Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
