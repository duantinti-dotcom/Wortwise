import type { Metadata } from "next";
import { PageShell } from "@/components/marketing/page-shell";
import { isSupabaseConfigured } from "@/lib/env";
import { supabaseAnon } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Fontes de dados",
  description: "Estado atual das integrações do Worthwise com Mercado Livre, Amazon, Shopee e TikTok Shop, e o que cada fonte permite consultar.",
  alternates: { canonical: "/fontes-de-dados" },
};
export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  connected: ["Em operação", "badge-pos"], not_configured: ["Em implantação", "badge-brand"], pending_approval: ["Aguardando credenciamento", ""], error: ["Instabilidade", "badge-neg"], planned: ["Planejado", ""],
};
const DETAILS: Record<string, { gives: string; lacks: string }> = {
  mercadolivre: { gives: "Busca de anúncios e fichas de catálogo, preço, vendedor, frete, atributos, ofertas concorrentes, avaliações, ranking de mais vendidos por categoria e tarifas oficiais de venda.", lacks: "Unidades vendidas e faturamento de anúncios de terceiros; histórico de preços anterior ao início do nosso acompanhamento." },
  shopee: { gives: "Após o credenciamento: dados das lojas que autorizarem o aplicativo e ofertas do programa de afiliados.", lacks: "Não há API pública de busca de catálogo para terceiros sem aprovação." },
  amazon: { gives: "Após aprovação como Associado: busca de produtos, preços e ofertas pela Product Advertising API.", lacks: "Volume de vendas; o acesso depende de manter vendas qualificadas no programa." },
  tiktokshop: { gives: "Após aprovação do aplicativo: dados das lojas que concederem autorização.", lacks: "Busca pública de catálogo e dados de vendedores que não autorizaram o aplicativo." },
  brasilapi: { gives: "Situação cadastral, razão social, atividade e município de um CNPJ (dados públicos da Receita Federal).", lacks: "Não avalia reputação, qualidade ou capacidade de entrega." },
  assistant: { gives: "Respostas em linguagem natural fundamentadas nas ferramentas da plataforma.", lacks: "Não possui dados próprios de preços ou vendas." },
};

export default async function Page() {
  let rows: { id: string; name: string; kind: string; status: string; status_detail: string | null; last_ok_at: string | null }[] = [];
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabaseAnon().from("data_sources").select("id, name, kind, status, status_detail, last_ok_at").order("kind").order("name");
      rows = (data ?? []) as typeof rows;
    } catch { /* lista vazia */ }
  }
  return (
    <PageShell narrow eyebrow="Transparência" title="Fontes de dados" lead="O Worthwise só consulta APIs oficiais e bases públicas. Esta página mostra, sem maquiagem, o que está funcionando agora.">
      {rows.length ? (
        <ul className="space-y-4">
          {rows.map((s) => {
            const [label, cls] = STATUS[s.status] ?? [s.status, ""];
            const d = DETAILS[s.id];
            return (
              <li key={s.id} className="card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{s.name}</h2><span className={cn("badge", cls)}>{label}</span></div>
                {s.status_detail ? <p className="mt-2 text-sm leading-relaxed text-muted">{s.status_detail}</p> : null}
                {d ? <dl className="mt-4 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-medium text-faint">O que a fonte permite</dt><dd className="mt-1 leading-relaxed text-muted">{d.gives}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">O que não é possível obter</dt><dd className="mt-1 leading-relaxed text-muted">{d.lacks}</dd></div></dl> : null}
                {s.last_ok_at ? <p className="mt-3 text-xs text-faint">Última resposta bem-sucedida: {formatDate(s.last_ok_at, true)}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="card p-6 text-muted">O estado das fontes está temporariamente indisponível.</p>}
      <p className="mt-8 text-sm leading-relaxed text-faint">Quando uma fonte não está em operação, a pesquisa informa isso claramente e nenhum crédito é consumido. Nunca substituímos uma fonte indisponível por dados fictícios.</p>
    </PageShell>
  );
}
