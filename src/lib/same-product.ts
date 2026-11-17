/**
 * "É o mesmo produto?" — compara dois anúncios pelo nome, de forma rígida:
 *  - números com unidade (6 pares, 710 ml, 1 L, 5000 mAh, 128 GB, 10 peças…) e códigos de modelo (X55, P20i)
 *    do anúncio original precisam estar no outro, iguais;
 *  - quantidades diferentes (kit 3 × kit 6) reprovam;
 *  - pelo menos 70% das palavras importantes do original precisam aparecer no outro.
 */
const STOP = new Set(["com", "para", "sem", "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os", "um", "uma", "original", "novo", "nova", "promocao", "oferta",
  "frete", "gratis", "pronta", "entrega", "envio", "imediato", "lancamento", "top", "premium", "qualidade", "alta", "super", "mega", "cor", "cores", "tamanho", "unissex", "masculino", "feminino",
  "ate", "por", "pra", "the", "and", "for", "with"]);

const UNIT: Record<string, string> = {
  ml: "ml", l: "l", lt: "l", litro: "l", litros: "l", g: "g", gr: "g", kg: "kg", w: "w", mah: "mah", gb: "gb", tb: "tb", cm: "cm", mm: "mm", m: "m",
  pol: "pol", polegada: "pol", polegadas: "pol", pecas: "un", peca: "un", pcs: "un", pc: "un", pares: "par", par: "par", unidades: "un", unidade: "un", un: "un", und: "un", x: "un",
};

export function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/[^a-z0-9.\s"]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Números com unidade, quantidades de kit e códigos de modelo. */
export function specs(title: string): Set<string> {
  const t = norm(title);
  const out = new Set<string>();
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(ml|litros?|lt|l|gr|g|kg|w|mah|gb|tb|cm|mm|m|polegadas?|pol|"|pecas?|pcs?|pares|par|unidades?|und|un)\b/g)) {
    out.add(`${Number(m[1])}${UNIT[m[2]!] ?? (m[2] === '"' ? "pol" : m[2])}`);
  }
  for (const m of t.matchAll(/\bkit\s*(?:com\s*)?(\d+)\b/g)) out.add(`${Number(m[1])}un`);
  for (const m of t.matchAll(/\b(\d+)\s*x\b/g)) out.add(`${Number(m[1])}un`);
  // Códigos de modelo: letras e números juntos (x55, p20i, a15, ps5).
  for (const w of t.split(" ")) if (/[a-z]/.test(w) && /\d/.test(w) && w.length >= 2 && w.length <= 12 && !/^\d+(ml|l|g|kg|w|mah|gb|tb|cm|mm|m|un|x)$/.test(w)) out.add(`m:${w}`);
  // Quantidades por par/peça: normaliza "par" e "un" juntos para comparar kits.
  return out;
}

export function words(title: string): string[] {
  return [...new Set(norm(title).split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w)))].slice(0, 10);
}

const qty = (s: Set<string>) => [...s].filter((x) => /^\d+(?:\.\d+)?(un|par)$/.test(x)).map((x) => Number(x.replace(/[a-z]+$/, "")));

export function sameProduct(original: string, candidate: string): boolean {
  const a = specs(original), b = specs(candidate);
  // Todos os números/modelos do original precisam aparecer no outro.
  for (const s of a) if (!b.has(s)) return false;
  // Quantidade: se os dois dizem quantas unidades, tem de ser a mesma.
  const qa = qty(a), qb = qty(b);
  if (qa.length && qb.length && !qb.every((n) => qa.includes(n))) return false;
  if (!qa.length && qb.some((n) => n > 1)) return false; // original é unidade, o outro é kit
  const wa = words(original);
  if (!wa.length) return false;
  const tb = ` ${norm(candidate)} `;
  const hit = wa.filter((w) => tb.includes(` ${w} `) || tb.includes(` ${w}s `) || (w.endsWith("s") && tb.includes(` ${w.slice(0, -1)} `))).length;
  return hit / wa.length >= 0.7;
}

/** Vendedor/anúncio de confiança: nota 4,0+ com 20+ avaliações, ou 100+ vendidos informados pela loja. */
export function trusted(p: { rating: number | null; reviewsCount: number | null; soldQuantity?: number | null }): boolean {
  if (p.rating != null && p.rating < 4) return false;
  if (p.rating != null && (p.reviewsCount ?? 0) >= 20) return true;
  return (p.soldQuantity ?? 0) >= 100;
}
