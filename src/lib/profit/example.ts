import { calculateProfit, DEFAULT_INPUTS, type ProfitInputs } from "./calc";

/** Cenário ilustrativo usado nas demonstrações (identificado como exemplo na interface). */
export const EXAMPLE: ProfitInputs = {
  ...DEFAULT_INPUTS, costPrice: 32, salePrice: 79.9, quantity: 100, purchaseFreight: 250, saleShipping: 6, taxPct: 6,
  marketplaceFeePct: 12, adsPct: 5, packaging: 1.5, returnsPct: 3,
};
export { calculateProfit };
