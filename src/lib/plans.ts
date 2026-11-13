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
  { id: "free", name: "Grátis", description: "Para conhecer a plataforma.", price_cents: 0, sort_order: 0,
    features: ["3 pesquisas de produtos no total", "Calculadora de lucro", "Visualização parcial dos resultados", "5 mensagens no assistente"] },
  { id: "pro", name: "Pro", description: "Para quem vende e precisa decidir com dados.", price_cents: 4990, sort_order: 1,
    features: ["300 pesquisas por mês", "Comparação de fornecedores", "Histórico de preços observado", "Calculadora avançada e cenários",
      "200 mensagens no assistente por mês", "25 produtos monitorados", "Favoritos e 20 coleções", "30 exportações por mês"] },
  { id: "business", name: "Business", description: "Para operação comercial intensiva.", price_cents: 9990, sort_order: 2,
    features: ["1.000 pesquisas por mês", "600 mensagens no assistente por mês", "100 produtos monitorados", "100 coleções",
      "Relatórios completos", "200 exportações por mês"] },
];

export const RESOURCE_LABELS: Record<string, string> = {
  search: "Pesquisas de produtos", ai_message: "Mensagens no assistente", watch: "Produtos monitorados",
  collection: "Coleções", simulation_saved: "Simulações salvas", export: "Exportações",
};

export const PERIOD_LABELS: Record<string, string> = { total: "no total", month: "neste mês", count: "ativos" };
