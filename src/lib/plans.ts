/** Planos padrão (espelho da migração de seed). O banco é a fonte de verdade; isto é o fallback estático. */
export interface PlanInfo {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  features: string[];
  sort_order: number;
}

export const DEFAULT_PLANS: PlanInfo[] = [
  { id: "inicial", name: "Primeiro mês", description: "Experimente tudo do Essencial por 30 dias.", price_cents: 990, sort_order: 0,
    features: ["Tudo do plano Essencial por 30 dias", "Pagamento único: não renova sozinho", "Uma vez por pessoa", "Depois, continue no Essencial por R$ 19,90/mês"] },
  { id: "pro", name: "Essencial", description: "Para quem vende e quer decidir com dados.", price_cents: 1990, sort_order: 1,
    features: ["Mais vendidos do Mercado Livre, Shopee, Amazon e TikTok Shop", "150 pesquisas de produtos por mês", "Wise, a assistente de vendas: 150 mensagens por mês",
      "Calculadora de lucro e preço recomendado", "Histórico de preço dos produtos", "Comparador de fornecedores", "15 produtos monitorados e 10 coleções"] },
  { id: "business", name: "Profissional", description: "Para quem vende todo dia e em várias lojas.", price_cents: 3990, sort_order: 2,
    features: ["Tudo do Essencial", "500 pesquisas de produtos por mês", "500 mensagens com a Wise por mês", "60 produtos monitorados",
      "50 coleções e 300 simulações salvas", "Relatórios completos e 100 exportações por mês"] },
];

export const RESOURCE_LABELS: Record<string, string> = {
  search: "Pesquisas de produtos", ai_message: "Mensagens no assistente", watch: "Produtos monitorados",
  collection: "Coleções", simulation_saved: "Simulações salvas", export: "Exportações",
};

export const PERIOD_LABELS: Record<string, string> = { total: "no total", month: "neste mês", count: "ativos" };
