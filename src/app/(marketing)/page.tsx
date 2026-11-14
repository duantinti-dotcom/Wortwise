import { ArrowRight, BadgeCheck, Bell, Calculator, Check, Database, Gauge, LineChart, MessagesSquare, Scale, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Faq } from "@/components/marketing/faq";
import { QuestionMarquee } from "@/components/marketing/marquee";
import { Pricing } from "@/components/marketing/pricing";
import { DemoTag, HeroPreview, VisualAssistant, VisualCalc, VisualChart, VisualCompare, VisualSearch, VisualWatch } from "@/components/marketing/visuals";
import { ProfitCalculator } from "@/components/profit-calculator";
import { ScoreRing } from "@/components/score-ring";
import { Reveal } from "@/components/ui/reveal";
import { Spot } from "@/components/ui/spot";
import { publicEnv } from "@/lib/env";
import { FAQ_ITEMS } from "@/lib/faq";
import { cn } from "@/lib/utils";

const QUESTIONS_A = ["O que vale a pena vender essa semana?", "Encontre produtos até R$ 50 com boa margem", "Qual fornecedor tem o menor custo total?", "Por quanto eu deveria vender?", "Vale a pena vender isso no Mercado Livre?"];
const QUESTIONS_B = ["Quanto sobra se eu vender 100 unidades?", "Compare este produto entre canais", "Quais são os riscos desse produto?", "O preço caiu nas últimas semanas?", "Qual o preço mínimo para não ter prejuízo?"];

const STEPS = [
  { icon: Search, title: "Pesquise", text: "Digite o que você pensa em vender. O Worthwise consulta as fontes autorizadas e mostra o que cada uma retornou." },
  { icon: LineChart, title: "Analise", text: "Preço, concorrência, sinais de demanda e riscos — com a origem e a data de cada dado." },
  { icon: Scale, title: "Compare", text: "Fornecedores e canais lado a lado pelo custo total e pela margem, não pelo preço anunciado." },
  { icon: Gauge, title: "Decida", text: "Score com grau de confiança, cenários de lucro e alertas para acompanhar a oportunidade." },
];

function Head({ eyebrow, title, text, center = true }: { eyebrow: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <div className="eyebrow text-brand-hi">{eyebrow}</div>
      <h2 className="text-grad mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[52px]">{title}</h2>
      {text ? <p className="mt-5 text-[17px] leading-relaxed text-muted">{text}</p> : null}
    </Reveal>
  );
}

function Bento({ className, icon: Icon, title, text, children }: { className?: string; icon: typeof Search; title: string; text: string; children?: React.ReactNode }) {
  return (
    <Spot className={cn("card card-hover flex flex-col overflow-hidden !rounded-3xl p-6 md:p-7", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl border border-brand/30 bg-gradient-to-b from-brand/25 to-brand/5 text-brand-hi shadow-[0_0_24px_-6px_rgba(255,121,0,0.6)]"><Icon size={17} /></span>
        <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-muted">{text}</p>
      {children ? <div className="relative mt-6 flex-1">{children}</div> : null}
    </Spot>
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* ───────── Hero ───────── */}
      <section id="produto" className="relative overflow-hidden pt-36 md:pt-44">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_30%,transparent_75%)]" />
          <div className="aurora left-[8%] top-10 h-80 w-80 bg-brand/20" />
          <div className="aurora right-[6%] top-40 h-96 w-96 bg-[#ff3d00]/10" />
          <div className="absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,121,0,0.16),transparent_70%)]" />
        </div>
        <div className="container-page text-center">
          <Link href="/fontes-de-dados" className="animate-fade-up group mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3.5 text-[13px] text-muted backdrop-blur transition-colors hover:border-white/20 hover:text-fg">
            <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-brand-hi">Novo</span>
            <span className="sm:hidden">Sem números inventados</span><span className="hidden sm:inline">Dados com fonte. Sem números inventados.</span>
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <h1 className="animate-fade-up mx-auto mt-8 max-w-5xl text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] [animation-delay:60ms] sm:text-[68px] lg:text-[88px]">
            <span className="text-grad">Descubra produtos que </span><span className="text-brand-grad">realmente</span><span className="text-grad"> valem a pena.</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted [animation-delay:120ms] md:text-xl">
            Encontre oportunidades de venda, compare fornecedores, acompanhe preços e descubra quanto você pode lucrar — tudo em um só lugar.
          </p>
          <div className="animate-fade-up mt-10 flex flex-wrap justify-center gap-3 [animation-delay:180ms]">
            <Link href="/cadastro" className="btn btn-primary btn-lg !h-[52px] !px-7 !text-base">Começar grátis <ArrowRight size={18} /></Link>
            <Link href="#demonstracao" className="btn btn-secondary btn-lg !h-[52px] !px-7 !text-base">Ver demonstração</Link>
          </div>
          <ul className="animate-fade-up mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted [animation-delay:240ms]">
            {["3 pesquisas grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-brand" />{t}</li>)}
          </ul>
        </div>
        <div className="container-page !max-w-[1240px] mt-16 md:mt-20"><HeroPreview /></div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
      </section>

      {/* ───────── Faixa de princípios ───────── */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.015] py-10">
        <div className="container-page grid grid-cols-2 gap-x-4 gap-y-8 text-center lg:grid-cols-4">
          {[[Database, "APIs oficiais", "Sem scraping, sem contornar limites"], [ShieldCheck, "Fonte e data", "Em cada preço, oferta e avaliação"], [BadgeCheck, "CNPJ verificado", "Na base pública da Receita Federal"], [Calculator, "Lucro real", "Todas as despesas na conta"]].map(([I, t, d]) => {
            const Icon = I as typeof Search;
            return (
              <Reveal key={t as string} className="flex flex-col items-center">
                <Icon size={20} className="text-brand" />
                <div className="mt-3 font-semibold tracking-tight">{t as string}</div>
                <div className="mt-1 text-[13px] leading-snug text-muted sm:text-sm">{d as string}</div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ───────── Bento de funcionalidades ───────── */}
      <section id="funcionalidades" className="relative scroll-mt-24 py-24 md:py-28">
        <div className="container-page">
          <Head eyebrow="Funcionalidades" title={<>Tudo para decidir o que vender.<br className="hidden md:block" /> Em um só lugar.</>}
            text="Ferramentas conectadas entre si: da primeira pesquisa à simulação de lucro, sem trocar de aba nem de planilha." />
          <div className="mt-16 grid gap-5 lg:grid-cols-6">
            <Reveal className="lg:col-span-3"><Bento className="h-full" icon={Search} title="Descoberta inteligente" text="Pesquise por produto ou palavra-chave e veja ofertas reais com preço, vendedor, avaliação, fonte e momento da coleta."><VisualSearch /></Bento></Reveal>
            <Reveal className="lg:col-span-3" delay={0.06}><Bento className="h-full" icon={Scale} title="Worthwise Compare" text="Fornecedores lado a lado pelo custo final por unidade — preço, frete e impostos rateados — com o status de verificação de cada um."><VisualCompare /></Bento></Reveal>
            <Reveal className="lg:col-span-2"><Bento className="h-full" icon={LineChart} title="Análise de mercado" text="Evolução de preço observada, ofertas comparáveis e concorrência."><VisualChart id="bento" /></Bento></Reveal>
            <Reveal className="lg:col-span-2" delay={0.06}><Bento className="h-full" icon={Calculator} title="Calculadora de lucro" text="Comissão, frete, impostos, anúncios e devoluções na mesma conta."><VisualCalc /></Bento></Reveal>
            <Reveal className="lg:col-span-2" delay={0.12}><Bento className="h-full" icon={Bell} title="Worthwise Watch" text="Alertas quando o preço cai abaixo do seu alvo."><VisualWatch /></Bento></Reveal>
            <Reveal className="lg:col-span-4"><Bento className="h-full" icon={MessagesSquare} title="Assistente Worthwise" text="Pergunte em português. Ele consulta os dados da plataforma, faz as contas e cita as fontes — nunca inventa preços ou vendas."><VisualAssistant /></Bento></Reveal>
            <Reveal className="lg:col-span-2" delay={0.06}>
              <Bento className="h-full" icon={Gauge} title="Worthwise Score" text="Nota de 0 a 100 com grau de confiança separado. Clique e veja como foi calculada.">
                <div className="flex h-full flex-col items-center justify-center gap-4 py-2">
                  <ScoreRing value={82} size={120} />
                  <span className="badge">Grau de confiança: moderado</span>
                </div>
              </Bento>
            </Reveal>
          </div>
          <div className="mt-6 flex justify-center"><DemoTag /></div>
        </div>
      </section>

      {/* ───────── Perguntas (marquee) ───────── */}
      <section aria-label="Perguntas que o assistente responde" className="relative -mt-8 pb-24 md:pb-28">
        <Reveal className="container-page mb-10 text-center"><p className="text-sm text-muted">Pergunte como você perguntaria a um analista comercial</p></Reveal>
        <div className="space-y-3"><QuestionMarquee items={QUESTIONS_A} /><QuestionMarquee items={QUESTIONS_B} reverse /></div>
      </section>

      {/* ───────── Como funciona ───────── */}
      <section id="como-funciona" className="relative scroll-mt-24 border-t border-white/[0.06] py-24 md:py-28">
        <div className="container-page relative">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <Head center={false} eyebrow="Como funciona" title="Da dúvida à decisão em quatro passos" />
            <Reveal><Link href="/cadastro" className="btn btn-secondary">Começar agora <ArrowRight size={15} /></Link></Reveal>
          </div>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.07} className="h-full">
                <Spot as="li" className="card card-hover relative flex h-full flex-col overflow-hidden !rounded-3xl p-6">
                  <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 select-none font-semibold leading-none tracking-[-0.06em] text-white/[0.04] [font-size:120px]">{i + 1}</span>
                  <span className="relative flex size-11 items-center justify-center rounded-xl border border-brand/30 bg-gradient-to-b from-brand/25 to-brand/5 text-brand-hi"><s.icon size={20} /></span>
                  <span className="relative mt-8 font-mono text-xs text-brand-hi">Passo {i + 1}</span>
                  <h3 className="relative mt-1.5 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="relative mt-2 text-[14.5px] leading-relaxed text-muted">{s.text}</p>
                </Spot>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Demonstração real ───────── */}
      <section id="demonstracao" className="relative scroll-mt-24 py-24 md:py-28">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_0%,rgba(255,121,0,0.07),transparent)]" />
        <div className="container-page">
          <Head eyebrow="Experimente agora" title="A calculadora de lucro, funcionando de verdade"
            text="Sem cadastro: informe seus números e veja margem, ponto de equilíbrio, preço mínimo e cenários. Na plataforma você salva e compara simulações." />
          <Reveal className="mt-14"><ProfitCalculator compact /></Reveal>
        </div>
      </section>

      {/* ───────── Planos ───────── */}
      <section id="planos" className="relative scroll-mt-24 border-t border-white/[0.06] py-24 md:py-28">
        <div className="container-page">
          <Head eyebrow="Planos" title="Comece grátis. Assine quando fizer sentido." text="Limites claros em todos os planos. Cancele quando quiser; o acesso vale até o fim do período pago." />
          <Reveal className="mt-16"><Pricing /></Reveal>
          <p className="mt-8 text-center text-sm text-faint">Pagamento processado pela HeroPay (Pix, cartão ou boleto). O Worthwise não armazena dados de cartão.</p>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="perguntas" className="scroll-mt-24 border-t border-white/[0.06] py-24 md:py-28">
        <div className="container-page grid gap-14 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <div className="eyebrow text-brand-hi">Perguntas frequentes</div>
            <h2 className="text-grad mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[44px]">Transparência sobre dados, limites e planos</h2>
            <p className="mt-5 text-muted">Prefere os detalhes? Leia a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link> e veja o estado das <Link href="/fontes-de-dados" className="text-brand-hi underline underline-offset-4">fontes de dados</Link>.</p>
          </Reveal>
          <Reveal delay={0.08}><Faq /></Reveal>
        </div>
      </section>

      {/* ───────── CTA final ───────── */}
      <section className="pb-28 md:pb-36">
        <div className="container-page">
          <Reveal>
            <div className="edge-brand edge-grad relative overflow-hidden rounded-[32px] border bg-[#0d0d0d] px-6 py-20 text-center md:py-28">
              <div aria-hidden className="grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_100%,#000,transparent)]" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(50%_70%_at_50%_110%,rgba(255,121,0,0.32),transparent_70%)]" />
              <Sparkles size={26} className="relative mx-auto text-brand" />
              <h2 className="text-grad relative mx-auto mt-6 max-w-3xl text-[36px] font-semibold leading-[1.04] tracking-[-0.04em] md:text-6xl">Sua próxima compra merece dados melhores.</h2>
              <p className="relative mx-auto mt-5 max-w-xl text-lg text-muted">Crie sua conta e faça três pesquisas completas por nossa conta.</p>
              <div className="relative mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/cadastro" className="btn btn-primary btn-lg !h-[52px] !px-7 !text-base">Começar grátis <ArrowRight size={18} /></Link>
                <Link href="/precos" className="btn btn-secondary btn-lg !h-[52px] !px-7 !text-base">Ver planos</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
