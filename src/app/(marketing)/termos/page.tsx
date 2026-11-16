import type { Metadata } from "next";
import { PageShell } from "@/components/marketing/page-shell";
import { contactEmail } from "@/lib/env";

export const metadata: Metadata = { title: "Termos de uso", description: "Condições de uso do Worthwise: conta, planos, cobrança, cancelamento, limites dos dados e responsabilidades.", alternates: { canonical: "/termos" } };

export default function Page() {
  return (
    <PageShell narrow eyebrow="Legal" title="Termos de uso" lead="Ao criar uma conta você concorda com as condições abaixo. Última atualização: 13 de novembro de 2026.">
      <article className="prose-ww">
        <h2>1. O serviço</h2>
        <p>O Worthwise é uma plataforma de inteligência comercial que reúne dados de fontes autorizadas, ferramentas de cálculo e um assistente para apoiar decisões de compra e venda. O Worthwise não vende produtos, não intermedeia negociações com fornecedores e não é afiliado aos marketplaces citados.</p>
        <h2>2. Natureza das informações</h2>
        <p>Dados de marketplaces refletem o momento da coleta e podem mudar. Indicadores de demanda, o Worthwise Score, cenários e simulações são apoio à decisão: <strong>não constituem garantia de vendas, de lucro ou de qualidade de fornecedores</strong>. Decisões comerciais, tributárias e de importação são de responsabilidade do usuário; consulte um contador quando necessário.</p>
        <h2>3. Conta</h2>
        <p>Você deve fornecer informações verdadeiras, manter suas credenciais em sigilo e usar uma conta por pessoa. Contas criadas para usar o primeiro mês promocional mais de uma vez podem ser suspensas.</p>
        <h2>4. Primeiro mês promocional</h2>
        <p>O primeiro mês custa R$ 9,90, em pagamento único, e dá acesso ao plano Essencial por 30 dias, sem renovação automática. Ele vale uma vez por pessoa, aparelho e conexão de internet. Uma pesquisa só é descontada da cota quando entrega resultados.</p>
        <h2>5. Planos, cobrança e cancelamento</h2>
        <ul>
          <li>Os planos pagos são mensais, com renovação automática, cobrados pela HeroPay nos meios por ela oferecidos.</li>
          <li>O plano é liberado após a confirmação do pagamento pelo provedor.</li>
          <li>Você pode cancelar a qualquer momento em Planos e configurações. O cancelamento interrompe as renovações e o acesso permanece até o fim do período já pago.</li>
          <li>A troca de plano é feita cancelando o plano atual e assinando o novo; não há cobrança proporcional automática.</li>
          <li>Em compras feitas pela internet, você pode exercer o direito de arrependimento em até 7 dias, nos termos do Código de Defesa do Consumidor.</li>
          <li>Estornos e contestações de pagamento encerram imediatamente os benefícios do plano.</li>
          <li>Preços e limites podem ser alterados para ciclos futuros, com aviso prévio.</li>
        </ul>
        <h2>6. Uso aceitável</h2>
        <p>Não é permitido revender ou redistribuir em massa os dados obtidos, automatizar consultas para contornar limites, tentar acessar dados de outros usuários ou usar a plataforma para fins ilícitos.</p>
        <h2>7. Disponibilidade</h2>
        <p>O serviço depende de fontes externas que podem ficar indisponíveis ou alterar suas regras. Quando isso ocorrer, a plataforma informará o estado real da fonte e não consumirá créditos por pesquisas não entregues.</p>
        <h2>8. Limitação de responsabilidade</h2>
        <p>Na extensão permitida pela lei, o Worthwise não responde por lucros cessantes ou prejuízos decorrentes de decisões comerciais tomadas com base nas informações da plataforma.</p>
        <h2>9. Contato e foro</h2>
        <p>{contactEmail ? <>Fale conosco em <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. </> : null}Estes termos são regidos pelas leis brasileiras, assegurado ao consumidor o foro do seu domicílio.</p>
      </article>
    </PageShell>
  );
}
