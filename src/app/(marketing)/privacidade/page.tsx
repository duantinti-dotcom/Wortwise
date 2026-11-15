import type { Metadata } from "next";
import { PageShell } from "@/components/marketing/page-shell";
import { contactEmail } from "@/lib/env";

export const metadata: Metadata = { title: "Política de privacidade", description: "Quais dados o Worthwise trata, para quê, por quanto tempo e como você exerce seus direitos pela LGPD.", alternates: { canonical: "/privacidade" } };

export default function Page() {
  const contact = contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <>o canal de atendimento indicado em Planos e configurações</>;
  return (
    <PageShell narrow eyebrow="Legal" title="Política de privacidade" lead="Descrevemos aqui o tratamento de dados que o Worthwise efetivamente realiza. Última atualização: 13 de novembro de 2026.">
      <article className="prose-ww">
        <h2>1. Dados que tratamos</h2>
        <ul>
          <li><strong>Cadastro</strong>: e-mail, nome e, se você entrar com Google, a foto do perfil fornecida pelo Google. Senhas são armazenadas apenas em formato irreversível pelo provedor de autenticação (Supabase).</li>
          <li><strong>Preferências</strong> (opcionais): estágio de venda, canais, categorias e faixa de investimento.</li>
          <li><strong>Uso da plataforma</strong>: pesquisas realizadas, favoritos, coleções, cotações, simulações, monitoramentos, conversas com o assistente e relatórios que você salvar.</li>
          <li><strong>Assinatura</strong>: plano, situação, datas e histórico de pagamentos (valor, meio e situação). <strong>Não recebemos nem armazenamos número de cartão ou CVV</strong>: o pagamento ocorre no checkout da HeroPay.</li>
          <li><strong>Prevenção a abuso</strong>: um identificador derivado (hash) do endereço IP usado no cadastro e um cookie aleatório do navegador (ww_did), também guardado só como hash.</li>
          <li><strong>Registros técnicos</strong>: logs de chamadas a APIs externas, sem conteúdo pessoal.</li>
        </ul>
        <h2>2. Para que usamos e com qual base legal</h2>
        <ul>
          <li>Prestar o serviço contratado e aplicar os limites do seu plano — execução de contrato.</li>
          <li>Processar assinaturas e cumprir obrigações fiscais — execução de contrato e obrigação legal.</li>
          <li>Garantir um teste grátis por pessoa — legítimo interesse, com tratamento mínimo: o IP e o cookie do navegador são convertidos em hash. Se o mesmo aparelho, ou a mesma rede nos últimos 30 dias, já tiver uma conta grátis, a nova conta é criada normalmente, só que sem as cotas grátis. Ninguém é impedido de se cadastrar ou de assinar, e não usamos fingerprinting oculto.</li>
          <li>Personalizar o painel com as preferências que você informar — consentimento, revogável a qualquer momento.</li>
        </ul>
        <h2>3. Retenção</h2>
        <ul>
          <li>Identificadores derivados do IP e do cookie do navegador: até 90 dias.</li>
          <li>Logs técnicos: até 30 dias.</li>
          <li>Dados da conta e do uso: enquanto a conta existir. Ao excluir a conta, são apagados de forma permanente.</li>
          <li>Registros de pagamento: pelo prazo exigido pela legislação fiscal.</li>
        </ul>
        <h2>4. Com quem compartilhamos</h2>
        <p>Usamos operadores para funcionar: Supabase (banco de dados e autenticação), Cloudflare (hospedagem, segurança e, quando habilitado, o modelo de IA do assistente), HeroPay (pagamentos) e Google (apenas se você escolher entrar com Google). As perguntas enviadas ao assistente são processadas pelo provedor de IA configurado. Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>
        <h2>5. Seus direitos</h2>
        <p>Você pode confirmar a existência de tratamento, acessar, corrigir, portar e eliminar seus dados, além de revogar consentimentos. A exclusão da conta está disponível em Planos e configurações. Para as demais solicitações, use {contact}. Você também pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).</p>
        <h2>6. Cookies</h2>
        <p>Usamos somente cookies essenciais para manter sua sessão. Quando a verificação de segurança (Cloudflare Turnstile) está ativa, ela pode usar armazenamento próprio para distinguir pessoas de robôs. Não usamos cookies de publicidade.</p>
        <h2>7. Segurança</h2>
        <p>Os dados trafegam por conexão cifrada, o acesso é isolado por usuário no banco de dados (Row Level Security) e as chaves de serviços ficam apenas no servidor. Nenhum sistema é infalível: em caso de incidente relevante, comunicaremos os titulares afetados e a ANPD.</p>
        <h2>8. Alterações</h2>
        <p>Mudanças relevantes nesta política serão comunicadas na plataforma antes de entrarem em vigor.</p>
      </article>
    </PageShell>
  );
}
