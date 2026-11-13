/** Normalização de títulos e detecção de variantes, para não comparar produtos diferentes como iguais. */
const NOISE = [
  "frete gratis", "envio imediato", "pronta entrega", "original", "lancamento", "promocao", "oferta",
  "novo", "nova", "lacrado", "garantia", "nota fiscal", "nf", "envio rapido", "full", "top", "barato",
  "melhor preco", "original lacrado", "pronto envio", "brinde", "atacado", "varejo",
];
const STOP = new Set(["de", "da", "do", "das", "dos", "para", "com", "sem", "e", "a", "o", "em", "p", "c", "por", "the", "and", "+"]);
const COLORS = ["preto", "branco", "azul", "vermelho", "verde", "rosa", "amarelo", "cinza", "prata", "dourado",
  "roxo", "lilas", "laranja", "bege", "marrom", "grafite", "black", "white", "blue", "red", "pink", "gold", "silver"];

export interface TitleInfo {
  normalized: string;
  tokens: string[];
  variants: { capacity: string[]; pack: number | null; color: string | null };
  signature: string;
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function analyzeTitle(title: string): TitleInfo {
  let t = strip(title).replace(/[|/\\()[\]{}!?*,;:"'’´`~^]+/g, " ").replace(/\s+/g, " ").trim();
  for (const n of NOISE) t = t.replace(new RegExp(`(^| )${n}( |$)`, "g"), " ");

  // Medidas: 128gb, 500 ml, 20000mah, 1,5l, 110v, 32"
  const capacity: string[] = [];
  t = t.replace(/(\d+(?:[.,]\d+)?)\s?(gb|tb|mb|ml|l|kg|g|mg|w|v|mah|ah|cm|mm|m|pol|polegadas|hz|"|”)(?= |$)/g, (_m, n: string, u: string) => {
    const unit = u === '"' || u === "”" || u === "polegadas" ? "pol" : u;
    capacity.push(`${n.replace(",", ".")}${unit}`);
    return " ";
  });

  // Kits e quantidades: kit 3, 10 unidades, c/ 6, 2 pecas, 3x
  let pack: number | null = null;
  t = t.replace(/(?:kit(?: com| c)?\s?(\d+)|(\d+)\s?(?:unidades|unidade|un|und|pecas|peca|pcs|pares|par)|(?:^| )(\d+)\s?x(?= |$))/g,
    (_m, a?: string, b?: string, c?: string) => {
      const n = Number(a ?? b ?? c);
      if (n > 0 && n < 10000) pack = n;
      return " ";
    });

  let color: string | null = null;
  const tokens = t.split(" ").filter((w) => {
    if (!w || STOP.has(w)) return false;
    if (COLORS.includes(w)) {
      color ??= w;
      return false;
    }
    return w.length > 1 || /\d/.test(w);
  });
  const unique = [...new Set(tokens)];
  const variantKey = [capacity.slice().sort().join("+"), pack ?? "", color ?? ""].join("|");
  return {
    normalized: unique.join(" "),
    tokens: unique,
    variants: { capacity: capacity.slice().sort(), pack, color },
    signature: `${unique.slice().sort().join(" ")}#${variantKey}`,
  };
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface Comparable { title: string; gtin?: string | null; brand?: string | null; model?: string | null }

/**
 * Dois anúncios são "comparáveis" quando têm o mesmo GTIN, ou quando os títulos são muito parecidos
 * E as variantes que mudam o preço (capacidade e quantidade do kit) coincidem.
 */
export function isComparable(a: Comparable, b: Comparable): boolean {
  if (a.gtin && b.gtin) return a.gtin === b.gtin;
  if (a.brand && b.brand && strip(a.brand) !== strip(b.brand)) return false;
  if (a.model && b.model && strip(a.model) !== strip(b.model)) return false;
  const ia = analyzeTitle(a.title);
  const ib = analyzeTitle(b.title);
  if (ia.variants.capacity.join() !== ib.variants.capacity.join()) return false;
  if ((ia.variants.pack ?? 1) !== (ib.variants.pack ?? 1)) return false;
  return jaccard(ia.tokens, ib.tokens) >= 0.6;
}

/** Agrupa anúncios comparáveis. Cada grupo recebe o índice do primeiro item como chave. */
export function groupComparable<T extends Comparable>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const g = groups.find((grp) => isComparable(grp[0]!, item));
    if (g) g.push(item);
    else groups.push([item]);
  }
  return groups;
}

export function normalizeQuery(q: string): string {
  return strip(q).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
