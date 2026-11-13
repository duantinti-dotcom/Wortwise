/**
 * Worthwise Score — indicador de oportunidade (0–100) separado do grau de confiança dos dados.
 * Só é calculado quando há evidências suficientes; fatores ausentes não viram zero: são excluídos
 * e reduzem a confiança. Não é promessa de resultado.
 */
export interface ScoreInputs {
  marginPct?: number | null; // margem da simulação do usuário
  price?: number | null; // preço do produto analisado
  comparablePrices?: number[]; // preços de ofertas comparáveis observadas
  offersCount?: number | null; // concorrentes observados na mesma ficha/busca
  bestsellerRank?: number | null; // posição em ranking de mais vendidos da fonte
  reviewsCount?: number | null; // indicador indireto de interesse
  rating?: number | null;
  priceHistory?: number[]; // observações reais armazenadas
  supplierVerified?: boolean | null;
}

export interface ScoreFactor {
  id: string;
  label: string;
  weight: number;
  score: number | null; // 0–100, ou null quando não há dado
  detail: string;
  nature: "user" | "observed" | "indirect";
}

export type Confidence = "alto" | "moderado" | "baixo";

export interface ScoreResult {
  status: "ok" | "insufficient";
  score: number | null;
  confidence: Confidence | null;
  coverage: number; // parcela do peso total coberta por dados (0–1)
  factors: ScoreFactor[];
  message: string;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const lerp = (v: number, a: number, b: number) => clamp(((v - a) / (b - a)) * 100);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function computeScore(input: ScoreInputs): ScoreResult {
  const factors: ScoreFactor[] = [];

  // 1. Margem estimada (30%) — 0% = 0 pts; 30% ou mais = 100 pts.
  factors.push({
    id: "margin", label: "Margem estimada", weight: 0.3, nature: "user",
    score: input.marginPct == null ? null : lerp(input.marginPct, 0, 30),
    detail: input.marginPct == null ? "Faça uma simulação de lucro para incluir a margem."
      : `Margem de ${input.marginPct.toFixed(1)}% na sua simulação (30% ou mais pontua o máximo).`,
  });

  // 2. Evidências de demanda (22%) — ranking de mais vendidos (dado da fonte) e avaliações (indireto).
  let demand: number | null = null;
  const demandBits: string[] = [];
  if (input.bestsellerRank != null && input.bestsellerRank > 0) {
    demand = clamp(100 - (input.bestsellerRank - 1) * 3);
    demandBits.push(`posição ${input.bestsellerRank} entre os mais vendidos da categoria`);
  }
  if (input.reviewsCount != null && input.reviewsCount >= 0) {
    const r = clamp((Math.log10(input.reviewsCount + 1) / 4) * 100);
    demand = demand == null ? r : demand * 0.6 + r * 0.4;
    demandBits.push(`${input.reviewsCount.toLocaleString("pt-BR")} avaliações (indicador indireto de interesse)`);
  }
  factors.push({
    id: "demand", label: "Evidências de demanda", weight: 0.22, nature: input.bestsellerRank != null ? "observed" : "indirect",
    score: demand, detail: demandBits.length ? demandBits.join("; ") + "." : "A fonte não informou sinais de demanda.",
  });

  // 3. Competitividade do preço (16%) — frente à mediana das ofertas comparáveis.
  let pricePos: number | null = null;
  let priceDetail = "São necessárias ao menos 3 ofertas comparáveis.";
  const comps = (input.comparablePrices ?? []).filter((p) => p > 0);
  if (input.price && comps.length >= 3) {
    const med = median(comps);
    const diff = ((med - input.price) / med) * 100;
    pricePos = lerp(diff, -20, 20);
    priceDetail = `Preço ${Math.abs(diff).toFixed(1)}% ${diff >= 0 ? "abaixo" : "acima"} da mediana de ${comps.length} ofertas comparáveis.`;
  }
  factors.push({ id: "price", label: "Competitividade do preço", weight: 0.16, score: pricePos, detail: priceDetail, nature: "observed" });

  // 4. Concorrência observável (14%).
  let comp: number | null = null;
  if (input.offersCount != null && input.offersCount > 0) {
    const n = input.offersCount;
    comp = n <= 3 ? 85 : n <= 10 ? 65 : n <= 30 ? 45 : 25;
  }
  factors.push({
    id: "competition", label: "Concorrência observável", weight: 0.14, score: comp, nature: "observed",
    detail: comp == null ? "Número de ofertas concorrentes não disponível." : `${input.offersCount} ofertas concorrentes observadas.`,
  });

  // 5. Estabilidade do preço (8%) — coeficiente de variação de ao menos 5 observações reais.
  let stab: number | null = null;
  let stabDetail = "Histórico insuficiente (mínimo de 5 observações).";
  const hist = (input.priceHistory ?? []).filter((p) => p > 0);
  if (hist.length >= 5) {
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const cv = (Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length) / mean) * 100;
    stab = clamp(100 - cv * 4);
    stabDetail = `Variação de ${cv.toFixed(1)}% em ${hist.length} observações armazenadas.`;
  }
  factors.push({ id: "stability", label: "Estabilidade do preço", weight: 0.08, score: stab, detail: stabDetail, nature: "observed" });

  // 6. Fornecedor (10%).
  factors.push({
    id: "supplier", label: "Fornecedor", weight: 0.1, nature: "observed",
    score: input.supplierVerified == null ? null : input.supplierVerified ? 80 : 40,
    detail: input.supplierVerified == null ? "Nenhum fornecedor associado à análise."
      : input.supplierVerified ? "Fornecedor com verificação documental realizada." : "Fornecedor ainda não verificado.",
  });

  const available = factors.filter((f) => f.score != null);
  const coverage = available.reduce((a, f) => a + f.weight, 0);
  const hasCore = available.some((f) => f.id === "margin" || f.id === "price");

  if (available.length < 3 || coverage < 0.45 || !hasCore) {
    return { status: "insufficient", score: null, confidence: null, coverage, factors,
      message: "Dados insuficientes para avaliação" };
  }
  const score = Math.round(available.reduce((a, f) => a + f.score! * f.weight, 0) / coverage);
  const confidence: Confidence = coverage >= 0.8 ? "alto" : coverage >= 0.6 ? "moderado" : "baixo";
  return { status: "ok", score, confidence, coverage, factors, message: `Score ${score}/100 — Grau de confiança: ${confidence}` };
}
