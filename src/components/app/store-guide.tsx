import { ArrowUpRight, Calculator, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { SourceMark, sourceName } from "@/components/source-mark";

/**
 * Conteúdo útil de cada loja mesmo antes de os dados dela estarem conectados:
 * dicas práticas (orientação geral, sem números inventados), calculadora já ajustada
 * para a loja e atalho para perguntar à assistente.
 */
const GUIDES: Record<string, { preset: string; seller: string; tips: [string, string][]; questions: string[] }> = {
  mercadolivre: {
    preset: "mercadolivre-classico",
    seller: "https://vendedores.mercadolivre.com.br",
    tips: [
      ["Escolha o tipo de anúncio", "Clássico tem comissão menor; Premium cobra mais, mas permite parcelar sem juros e costuma aparecer melhor."],
      ["Frete conta muito", "Acima de certo valor o frete grátis é obrigatório e uma parte sai do seu bolso. Coloque isso na conta antes de definir o preço."],
      ["Reputação é tudo", "Envie no prazo e responda rápido. A cor da sua reputação influencia quanto você aparece nas buscas."],
      ["Título que vende", "Use o nome que o comprador digita: produto, marca, modelo e o principal detalhe. Sem palavras como \"promoção\"."],
    ],
    questions: ["Clássico ou Premium no Mercado Livre: qual vale mais a pena para mim?", "Como funciona o frete grátis do Mercado Livre e quanto ele pesa no lucro?"],
  },
  shopee: {
    preset: "shopee",
    seller: "https://seller.shopee.com.br",
    tips: [
      ["Preço competitivo", "Na Shopee o comprador compara muito preço. Produtos baratos e de giro rápido costumam funcionar melhor."],
      ["Comissão + tarifa por item", "Além da porcentagem, existe uma tarifa fixa por item vendido. Em produtos muito baratos, ela pesa bastante."],
      ["Fotos e vídeo", "Fotos com fundo limpo e um vídeo curto aumentam bastante a chance de venda."],
      ["Use as campanhas", "Datas como 9.9, 10.10 e 11.11 trazem muito movimento. Prepare estoque e cupons antes."],
    ],
    questions: ["Como eu começo a vender na Shopee?", "Quais produtos costumam vender bem na Shopee para iniciantes?"],
  },
  amazon: {
    preset: "amazon",
    seller: "https://venda.amazon.com.br",
    tips: [
      ["Plano individual ou profissional", "Quem vende pouco paga por item; quem vende bastante compensa a mensalidade do plano profissional."],
      ["Ganhe a oferta em destaque", "Vários vendedores podem vender o mesmo produto. Preço, prazo e reputação decidem quem aparece no botão de compra."],
      ["Logística da Amazon", "Usar o estoque da Amazon (FBA) ajuda no selo Prime, mas tem custos de armazenagem: coloque na conta."],
      ["Código de barras", "Muitos produtos exigem EAN válido para cadastro. Confira antes de comprar o estoque."],
    ],
    questions: ["Vale a pena vender na Amazon sendo iniciante?", "Como funciona o FBA da Amazon no Brasil?"],
  },
  tiktokshop: {
    preset: "tiktokshop",
    seller: "https://seller-br.tiktok.com",
    tips: [
      ["Venda com vídeo", "No TikTok Shop o produto vende pelo vídeo e pela live. Mostre o produto funcionando nos primeiros segundos."],
      ["Afiliados vendem por você", "Criadores podem divulgar seu produto em troca de comissão. Defina uma comissão que ainda deixe lucro."],
      ["Produtos visuais", "Itens que impressionam em vídeo (beleza, casa, gadgets) tendem a performar melhor."],
      ["Ritmo de postagem", "Postar com frequência e testar vários vídeos do mesmo produto é o que costuma dar resultado."],
    ],
    questions: ["Como começar a vender no TikTok Shop?", "Como calcular a comissão de afiliados no TikTok Shop sem perder lucro?"],
  },
};

export const STORE_MESSAGE: Record<string, string> = {
  mercadolivre: "Falta cadastrar as chaves do aplicativo do Mercado Livre.",
  shopee: "Falta cadastrar as chaves de afiliado da Shopee.",
  amazon: "A API oficial da Amazon não informa a lista de mais vendidos, e o acesso depende de uma conta de Associado aprovada.",
  tiktokshop: "O TikTok Shop só libera dados de produtos para parceiros aprovados por ele. O pedido de acesso ainda precisa ser feito.",
};

export function StoreGuide({ store, message }: { store: string; message: string }) {
  const g = GUIDES[store];
  const name = sourceName(store);
  if (!g) return null;
  return (
    <div className="space-y-8">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <SourceMark source={store} size={28} className="mt-0.5" />
          <div>
            <p className="text-[15.5px] font-semibold">Os produtos de {name} aparecem aqui assim que a conexão estiver ativa</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{message} Enquanto isso, use o que já funciona abaixo.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/app/calculadora?canal=${g.preset}`} className="card card-hover flex items-start gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-tint/[0.06] text-brand-hi"><Calculator size={19} /></span>
          <span><span className="block text-[16px] font-semibold">Calcular lucro em {name}</span><span className="mt-1 block text-[14px] leading-relaxed text-muted">A calculadora já abre com as taxas de referência de {name}. Você pode ajustar.</span></span>
        </Link>
        <a href={g.seller} target="_blank" rel="noopener noreferrer nofollow" className="card card-hover flex items-start gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-tint/[0.06] text-brand-hi"><ArrowUpRight size={19} /></span>
          <span><span className="block text-[16px] font-semibold">Abrir a área de vendedor</span><span className="mt-1 block text-[14px] leading-relaxed text-muted">Página oficial de {name} para criar sua conta de vendedor e ver as regras.</span></span>
        </a>
      </div>

      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">Dicas para vender em {name}</h2>
        <p className="mt-1.5 text-[13.5px] text-faint">Orientação geral. Regras e taxas mudam: confira sempre na página oficial.</p>
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {g.tips.map(([t, d]) => (
            <li key={t} className="card p-5"><p className="text-[15px] font-semibold">{t}</p><p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</p></li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><MessagesSquare size={17} className="text-brand-hi" />Pergunte para a Wise</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {g.questions.map((q) => <Link key={q} href={`/app/assistente?q=${encodeURIComponent(q)}`} className="chip !h-auto py-2 text-left">{q}</Link>)}
        </div>
      </section>
    </div>
  );
}
