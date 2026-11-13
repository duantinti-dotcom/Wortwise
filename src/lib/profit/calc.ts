/**
 * Calculadora de lucro do Worthwise. Funções puras, usadas na interface, no assistente e nos testes.
 * Percentuais são informados em pontos percentuais (12 = 12%).
 */
export interface ProfitInputs {
  costPrice: number; // preço de aquisição por unidade
  salePrice: number; // preço de venda por unidade
  quantity: number; // unidades compradas
  purchaseFreight: number; // frete de compra (total do lote)
  saleShipping: number; // frete de venda pago pelo vendedor, por unidade vendida
  taxPct: number; // impostos sobre a venda
  marketplaceFeePct: number; // comissão do marketplace
  marketplaceFixedFee: number; // tarifa fixa por unidade vendida
  paymentFeePct: number; // taxa de pagamento
  adsPct: number; // publicidade, % do preço de venda
  packaging: number; // embalagem por unidade vendida
  returnsPct: number; // % das vendas devolvidas (venda desfeita; frete e embalagem perdidos)
  lossPct: number; // % das unidades compradas perdidas/avariadas
  otherCosts: number; // outros custos (total)
}

export interface ProfitResult {
  unitsLost: number;
  unitsReturned: number;
  unitsSold: number;
  grossRevenue: number;
  productCost: number;
  sellingCosts: number;
  returnsCost: number;
  totalCost: number;
  profit: number;
  profitPerUnit: number; // por unidade comprada
  marginPct: number | null; // lucro / receita
  roiPct: number | null; // lucro / custo total
  landedUnitCost: number; // custo de aquisição + frete de compra rateado
  variableCostPerSale: number;
  contributionPerUnit: number;
  contributionMarginPct: number | null;
  breakEvenUnits: number | null; // vendas necessárias para pagar os custos fixos do lote
  minPrice: number | null; // preço em que o lucro é zero
  breakdown: { label: string; value: number }[];
}

export const DEFAULT_INPUTS: ProfitInputs = {
  costPrice: 0, salePrice: 0, quantity: 1, purchaseFreight: 0, saleShipping: 0, taxPct: 0,
  marketplaceFeePct: 0, marketplaceFixedFee: 0, paymentFeePct: 0, adsPct: 0, packaging: 0,
  returnsPct: 0, lossPct: 0, otherCosts: 0,
};

const clampPct = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
const nonNeg = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function sanitize(i: ProfitInputs): ProfitInputs {
  return {
    costPrice: nonNeg(i.costPrice), salePrice: nonNeg(i.salePrice), quantity: Math.max(1, Math.floor(nonNeg(i.quantity)) || 1),
    purchaseFreight: nonNeg(i.purchaseFreight), saleShipping: nonNeg(i.saleShipping), taxPct: clampPct(i.taxPct),
    marketplaceFeePct: clampPct(i.marketplaceFeePct), marketplaceFixedFee: nonNeg(i.marketplaceFixedFee),
    paymentFeePct: clampPct(i.paymentFeePct), adsPct: clampPct(i.adsPct), packaging: nonNeg(i.packaging),
    returnsPct: clampPct(i.returnsPct), lossPct: clampPct(i.lossPct), otherCosts: nonNeg(i.otherCosts),
  };
}

function volumes(i: ProfitInputs) {
  const unitsLost = i.quantity * (i.lossPct / 100);
  const sellable = i.quantity - unitsLost;
  const unitsReturned = sellable * (i.returnsPct / 100);
  return { unitsLost, unitsReturned, unitsSold: sellable - unitsReturned };
}

const ratePct = (i: ProfitInputs) => (i.marketplaceFeePct + i.paymentFeePct + i.taxPct + i.adsPct) / 100;
const perSaleFixed = (i: ProfitInputs) => i.marketplaceFixedFee + i.saleShipping + i.packaging;

export function calculateProfit(raw: ProfitInputs): ProfitResult {
  const i = sanitize(raw);
  const { unitsLost, unitsReturned, unitsSold } = volumes(i);
  const rate = ratePct(i);
  const fixedPerSale = perSaleFixed(i);

  const grossRevenue = unitsSold * i.salePrice;
  const productCost = i.quantity * i.costPrice + i.purchaseFreight;
  const sellingCosts = unitsSold * (i.salePrice * rate + fixedPerSale);
  const returnsCost = unitsReturned * (i.saleShipping + i.packaging);
  const totalCost = productCost + sellingCosts + returnsCost + i.otherCosts;
  const profit = grossRevenue - totalCost;

  const landedUnitCost = i.costPrice + i.purchaseFreight / i.quantity;
  const variableCostPerSale = i.salePrice * rate + fixedPerSale;
  const contributionPerUnit = i.salePrice - variableCostPerSale - landedUnitCost;
  const fixedBatch = i.otherCosts;

  const denom = unitsSold * (1 - rate);
  const fixedTotal = unitsSold * fixedPerSale + returnsCost + productCost + i.otherCosts;

  return {
    unitsLost: round2(unitsLost), unitsReturned: round2(unitsReturned), unitsSold: round2(unitsSold),
    grossRevenue: round2(grossRevenue), productCost: round2(productCost), sellingCosts: round2(sellingCosts),
    returnsCost: round2(returnsCost), totalCost: round2(totalCost), profit: round2(profit),
    profitPerUnit: round2(profit / i.quantity),
    marginPct: grossRevenue > 0 ? round2((profit / grossRevenue) * 100) : null,
    roiPct: totalCost > 0 ? round2((profit / totalCost) * 100) : null,
    landedUnitCost: round2(landedUnitCost), variableCostPerSale: round2(variableCostPerSale),
    contributionPerUnit: round2(contributionPerUnit),
    contributionMarginPct: i.salePrice > 0 ? round2((contributionPerUnit / i.salePrice) * 100) : null,
    breakEvenUnits: contributionPerUnit > 0 ? Math.ceil(fixedBatch / contributionPerUnit) : null,
    minPrice: denom > 0 ? round2(fixedTotal / denom) : null,
    breakdown: [
      { label: "Produto", value: round2(i.quantity * i.costPrice) },
      { label: "Frete de compra", value: round2(i.purchaseFreight) },
      { label: "Comissão do marketplace", value: round2(unitsSold * (i.salePrice * i.marketplaceFeePct / 100 + i.marketplaceFixedFee)) },
      { label: "Taxa de pagamento", value: round2(unitsSold * i.salePrice * i.paymentFeePct / 100) },
      { label: "Impostos", value: round2(unitsSold * i.salePrice * i.taxPct / 100) },
      { label: "Publicidade", value: round2(unitsSold * i.salePrice * i.adsPct / 100) },
      { label: "Frete de venda", value: round2(unitsSold * i.saleShipping) },
      { label: "Embalagem", value: round2(unitsSold * i.packaging) },
      { label: "Devoluções", value: round2(returnsCost) },
      { label: "Outros custos", value: round2(i.otherCosts) },
    ],
  };
}

/** Preço de venda necessário para atingir a margem desejada (lucro / receita). */
export function priceForTargetMargin(raw: ProfitInputs, targetMarginPct: number): number | null {
  const i = sanitize(raw);
  const { unitsReturned, unitsSold } = volumes(i);
  const denom = unitsSold * (1 - ratePct(i) - targetMarginPct / 100);
  if (denom <= 0) return null;
  const fixedTotal = unitsSold * perSaleFixed(i) + unitsReturned * (i.saleShipping + i.packaging)
    + i.quantity * i.costPrice + i.purchaseFreight + i.otherCosts;
  return round2(fixedTotal / denom);
}

export interface Scenario {
  id: "conservative" | "base" | "optimistic";
  name: string;
  assumptions: string[];
  inputs: ProfitInputs;
  result: ProfitResult;
}

/** Cenários com hipóteses explícitas. São simulações, não previsões. */
export function buildScenarios(raw: ProfitInputs): Scenario[] {
  const base = sanitize(raw);
  const conservative: ProfitInputs = {
    ...base, salePrice: round2(base.salePrice * 0.92), returnsPct: clampPct(base.returnsPct + 3),
    adsPct: clampPct(base.adsPct * 1.3), lossPct: clampPct(base.lossPct + 1),
  };
  const optimistic: ProfitInputs = {
    ...base, salePrice: round2(base.salePrice * 1.05), returnsPct: clampPct(base.returnsPct - 1),
    adsPct: clampPct(base.adsPct * 0.8),
  };
  return [
    { id: "conservative", name: "Conservador", inputs: conservative, result: calculateProfit(conservative),
      assumptions: ["Preço de venda 8% menor", "Devoluções +3 p.p.", "Publicidade 30% maior", "Perdas +1 p.p."] },
    { id: "base", name: "Base", inputs: base, result: calculateProfit(base), assumptions: ["Valores informados por você"] },
    { id: "optimistic", name: "Otimista", inputs: optimistic, result: calculateProfit(optimistic),
      assumptions: ["Preço de venda 5% maior", "Devoluções −1 p.p.", "Publicidade 20% menor"] },
  ];
}

/** Curva de lucro em função do preço de venda (para o gráfico de cenários). */
export function profitCurve(raw: ProfitInputs, points = 25): { price: number; profit: number; marginPct: number | null }[] {
  const i = sanitize(raw);
  const center = i.salePrice || calculateProfit({ ...i, salePrice: 1 }).minPrice || 10;
  const min = center * 0.6;
  const max = center * 1.4;
  return Array.from({ length: points }, (_, k) => {
    const price = round2(min + ((max - min) * k) / (points - 1));
    const r = calculateProfit({ ...i, salePrice: price });
    return { price, profit: r.profit, marginPct: r.marginPct };
  });
}

/**
 * Pré-configurações de taxas por canal. NÃO são valores oficiais: são pontos de partida editáveis.
 * As tabelas dos marketplaces mudam por categoria, tipo de anúncio e programa; confirme na fonte oficial.
 */
export interface ChannelPreset {
  id: string;
  name: string;
  marketplaceFeePct: number;
  marketplaceFixedFee: number;
  paymentFeePct: number;
  officialUrl: string;
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  { id: "mercadolivre-classico", name: "Mercado Livre — Clássico", marketplaceFeePct: 12, marketplaceFixedFee: 0, paymentFeePct: 0,
    officialUrl: "" },
  { id: "mercadolivre-premium", name: "Mercado Livre — Premium", marketplaceFeePct: 17, marketplaceFixedFee: 0, paymentFeePct: 0,
    officialUrl: "" },
  { id: "shopee", name: "Shopee", marketplaceFeePct: 20, marketplaceFixedFee: 4, paymentFeePct: 0,
    officialUrl: "" },
  { id: "amazon", name: "Amazon", marketplaceFeePct: 15, marketplaceFixedFee: 0, paymentFeePct: 0,
    officialUrl: "" },
  { id: "tiktokshop", name: "TikTok Shop", marketplaceFeePct: 6, marketplaceFixedFee: 0, paymentFeePct: 0,
    officialUrl: "" },
  { id: "shein", name: "SHEIN", marketplaceFeePct: 16, marketplaceFixedFee: 0, paymentFeePct: 0,
    officialUrl: "" },
  { id: "loja-propria", name: "Loja própria", marketplaceFeePct: 0, marketplaceFixedFee: 0, paymentFeePct: 3.49,
    officialUrl: "" },
];

/** Compara o mesmo produto em vários canais, mantendo os demais custos iguais. */
export function compareChannels(raw: ProfitInputs, presets: ChannelPreset[] = CHANNEL_PRESETS) {
  return presets.map((p) => {
    const inputs = { ...raw, marketplaceFeePct: p.marketplaceFeePct, marketplaceFixedFee: p.marketplaceFixedFee, paymentFeePct: p.paymentFeePct };
    return { preset: p, result: calculateProfit(inputs) };
  });
}

/** Custo final estimado por unidade de uma cotação de fornecedor. */
export function landedCost(q: { unitPrice: number; quantity: number; freight?: number | null; taxes?: number | null; otherCosts?: number | null }) {
  const qty = Math.max(1, q.quantity);
  const total = q.unitPrice * qty + (q.freight ?? 0) + (q.taxes ?? 0) + (q.otherCosts ?? 0);
  return { total: round2(total), perUnit: round2(total / qty), missing: [q.freight == null && "frete", q.taxes == null && "impostos"].filter(Boolean) as string[] };
}
