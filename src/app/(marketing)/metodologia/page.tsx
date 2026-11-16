import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";

export const metadata: Metadata = {
  title: "Metodologia",
  description: "Como o Worthwise coleta dados, calcula o Worthwise Score, estima demanda e classifica fornecedores — e quais são os limites de cada informação.",
  alternates: { canonical: "/metodologia" },
};

export default function Page() {
  return (
    <PageShell narrow eyebrow="Transparência" title="Metodologia" lead="O que cada número do Worthwise significa, de onde vem e o que ele não diz.">
      <article className="prose-ww">
        <h2>Princípios</h2>
        <ul>
          <li><strong>Só dados com origem.</strong> Preços, avaliações, vendidos e posições vêm das páginas públicas das próprias lojas (diretamente ou pela GeckoAPI) e de bases públicas. Cada item guarda a fonte, o identificador externo e a data da coleta.</li>
          <li><strong>Ausência não vira zero.</strong> Quando a fonte não informa um campo, mostramos “Não disponível”.</li>
          <li><strong>Estimativa é chamada de estimativa.</strong> Indicadores indiretos nunca são apresentados como vendas confirmadas.</li>
          <li><strong>Uso moderado.</strong> Cada ranking é lido no máximo a cada 3 dias e guardado; quem acessa o Worthwise vê a cópia guardada, sem sobrecarregar as lojas.</li>
        </ul>
        <h2>Pesquisa e comparação de produtos</h2>
        <p>Os títulos são normalizados (acentos, ruído promocional, palavras de ligação) e têm suas variantes extraídas — capacidade, quantidade do kit e cor. Dois anúncios só são tratados como comparáveis quando compartilham o mesmo código GTIN ou quando têm títulos muito semelhantes <strong>e</strong> a mesma capacidade e quantidade. Assim, um aparelho de 128 GB não é comparado a um de 256 GB.</p>
        <h2>Histórico de preços</h2>
        <p>O histórico é formado exclusivamente por observações que o Worthwise coletou e armazenou: a cada pesquisa, abertura de produto ou verificação de monitoramento. Um novo ponto é gravado quando o preço muda ou após seis horas. Produtos recém-acompanhados têm poucos pontos; não interpolamos nem simulamos o passado.</p>
        <h2>Demanda e vendas</h2>
        <p>Os marketplaces, em regra, não divulgam unidades vendidas de anúncios de terceiros. Por isso o Worthwise exibe apenas sinais observáveis, sempre rotulados: posição no ranking oficial de mais vendidos da categoria (quando a fonte fornece) e volume de avaliações, este último como “indicador indireto de interesse”.</p>
        <h2>Worthwise Score</h2>
        <p>Nota de 0 a 100 que resume seis fatores, cada um com peso fixo:</p>
        <ul>
          <li>Margem estimada da sua simulação — 30%</li>
          <li>Evidências de demanda — 22%</li>
          <li>Competitividade do preço frente à mediana de ofertas comparáveis — 16%</li>
          <li>Concorrência observável — 14%</li>
          <li>Fornecedor verificado — 10%</li>
          <li>Estabilidade do preço em pelo menos cinco observações — 8%</li>
        </ul>
        <p>Fatores sem dado são excluídos da média e reduzem o <strong>grau de confiança</strong> (alto, moderado ou baixo), que é apresentado separadamente. Sem ao menos três fatores, incluindo margem ou preço, o resultado é “Dados insuficientes para avaliação”. O Score compara oportunidades; não prevê vendas nem garante lucro.</p>
        <h2>Fornecedores</h2>
        <p>As classificações correspondem a procedimentos reais:</p>
        <ul>
          <li><strong>Verificação documental realizada</strong>: o CNPJ foi consultado na base pública da Receita Federal e está com situação ativa.</li>
          <li><strong>Reputação disponível na fonte</strong>: há avaliações verificáveis na origem.</li>
          <li><strong>Informações insuficientes</strong>: a consulta não confirmou um cadastro ativo.</li>
          <li><strong>Fornecedor ainda não verificado</strong>: nenhum procedimento foi feito.</li>
        </ul>
        <p>Verificação documental não atesta qualidade do produto, prazo ou atendimento. Preço baixo nunca é usado como sinal de confiabilidade.</p>
        <h2>Custo total e lucro</h2>
        <p>O custo final por unidade soma preço de compra, frete, impostos e outras despesas, dividido pela quantidade. Cada parcela indica se foi informada ou estimada; cotações incompletas aparecem como parciais. A <Link href="/calculadora-de-lucro">calculadora de lucro</Link> detalha as fórmulas usadas. Os cenários conservador e otimista aplicam hipóteses fixas e visíveis sobre os seus números.</p>
        <h2>Assistente</h2>
        <p>O assistente não responde de memória sobre preços ou produtos: ele aciona as mesmas ferramentas da plataforma e só pode citar o que elas retornam. Conteúdo de terceiros é tratado como dado, não como instrução.</p>
      </article>
    </PageShell>
  );
}
