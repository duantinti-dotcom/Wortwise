import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { ProfitCalculator } from "@/components/profit-calculator";

export const metadata: Metadata = {
  title: "Calculadora de lucro para marketplace",
  description: "Calcule o lucro real de um produto no Mercado Livre, Shopee, Amazon ou loja própria: comissão, frete, impostos, publicidade, devoluções, margem e preço mínimo.",
  alternates: { canonical: "/calculadora-de-lucro" },
};

export default function Page() {
  return (
    <PageShell eyebrow="Ferramenta gratuita" title="Calculadora de lucro para quem vende online" lead="Descubra quanto sobra depois de todas as despesas — e qual é o menor preço em que a venda ainda vale a pena.">
      <ProfitCalculator initial={{ quantity: 50 }} />
      <section className="prose-ww mx-auto mt-20 max-w-3xl">
        <h2>Como a conta é feita</h2>
        <p>A receita considera apenas as unidades efetivamente vendidas: do lote comprado saem as perdas e, das vendas, as devoluções. Sobre cada venda incidem comissão do marketplace, taxa de pagamento, impostos e publicidade (percentuais do preço), além de tarifa fixa, frete e embalagem. O lucro é a receita menos todos os custos, inclusive o frete de compra e as despesas fixas do lote.</p>
        <h3>Indicadores</h3>
        <ul>
          <li><strong>Margem</strong>: lucro dividido pela receita bruta.</li>
          <li><strong>Margem de contribuição</strong>: quanto cada venda deixa depois dos custos variáveis e do custo do produto.</li>
          <li><strong>Ponto de equilíbrio</strong>: vendas necessárias para pagar os custos fixos do lote.</li>
          <li><strong>Preço mínimo</strong>: preço em que o lucro é zero.</li>
        </ul>
        <p>As taxas sugeridas por canal são pontos de partida editáveis, não tarifas oficiais: elas variam por categoria, tipo de anúncio e programa de frete. Confira sempre a tabela do marketplace. Na plataforma, o Worthwise consulta as tarifas oficiais do Mercado Livre para o preço e a categoria do produto analisado.</p>
        <p><Link href="/cadastro">Crie uma conta gratuita</Link> para salvar simulações, comparar cenários e analisar produtos reais.</p>
      </section>
    </PageShell>
  );
}
