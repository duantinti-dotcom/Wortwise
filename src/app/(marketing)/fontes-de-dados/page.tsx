import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { SourceMark } from "@/components/source-mark";

export const metadata: Metadata = {
  title: "Fontes de dados",
  description: "De onde vêm os dados do Worthwise: mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop, consulta de CNPJ e a assistente Wise.",
  alternates: { canonical: "/fontes-de-dados" },
};

const SOURCES: { id: string | null; name: string; gives: string }[] = [
  { id: "mercadolivre", name: "Mercado Livre", gives: "Ranking de mais vendidos por categoria, na ordem do próprio Mercado Livre, com preço, quantidade vendida informada pela loja, foto e link do anúncio." },
  { id: "shopee", name: "Shopee", gives: "Produtos na ordem “Mais vendidos” da própria Shopee, por tópico, com preço, nota, número de avaliações, foto e link." },
  { id: "amazon", name: "Amazon", gives: "Lista de mais vendidos da Amazon Brasil por categoria e busca de produtos, com preço, nota, avaliações, foto e link." },
  { id: "tiktokshop", name: "TikTok Shop", gives: "Produtos do TikTok Shop Brasil por tópico, com a quantidade vendida informada pelo TikTok Shop, preço, nota, foto e link." },
  { id: null, name: "Consulta de CNPJ", gives: "Situação cadastral, razão social, atividade e município de um CNPJ, a partir dos dados públicos da Receita Federal." },
  { id: null, name: "Wise, assistente com IA", gives: "Respostas em português baseadas nos dados acima e nas ferramentas do Worthwise. Ela não inventa preços nem vendas." },
];

export default function Page() {
  return (
    <PageShell narrow eyebrow="Transparência" title="Fontes de dados" lead="Os números do Worthwise vêm das páginas públicas das próprias lojas e de bases públicas. Veja o que cada fonte mostra.">
      <ul className="space-y-4">
        {SOURCES.map((s) => (
          <li key={s.name} className="card flex gap-4 p-6">
            {s.id ? <SourceMark source={s.id} size={28} /> : <span className="size-7 shrink-0 rounded-[8px] bg-tint/10" />}
            <div><h2 className="text-lg font-semibold">{s.name}</h2><p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.gives}</p></div>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm leading-relaxed text-faint">
        Os rankings são atualizados automaticamente a cada 3 dias. Quando a loja não informa um dado (por exemplo, a quantidade vendida), o campo fica vazio: nunca preenchemos com números inventados.
        Veja também a <Link href="/metodologia" className="text-brand-hi underline underline-offset-4">metodologia</Link>.
      </p>
    </PageShell>
  );
}
