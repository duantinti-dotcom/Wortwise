/** Formatação do painel (pt-BR, horário de Brasília). Ausência de dado vira "—", nunca zero. */
const TZ = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("pt-BR");
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function cents(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (!isNum(v)) return "—";
  const reais = v / 100;
  return opts.compact && Math.abs(reais) >= 10_000 ? brlCompact.format(reais) : brl.format(reais);
}

export function int(v: number | null | undefined): string {
  return isNum(v) ? intFmt.format(Math.round(v)) : "—";
}

export function short(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return Math.abs(v) >= 10_000 ? compact.format(v) : intFmt.format(Math.round(v * 100) / 100);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function bytes(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = v;
  while (Math.abs(n) >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 1 })} ${u[i]}`;
}

export function ms(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : `${Math.round(v)} ms`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function dayLabel(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: TZ });
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  if (s < 86_400 * 30) return `há ${Math.round(s / 86_400)} d`;
  return dayLabel(iso, true);
}

/** Variação percentual entre períodos. Sem base (0 ou ausente) não há variação a mostrar. */
export function delta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (!isNum(cur) || !isNum(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export const PLAN_LABEL: Record<string, string> = {
  free: "Sem plano", inicial: "Primeiro mês", pro: "Essencial", business: "Profissional", ilimitado: "Interno", sem_plano: "Plano não identificado",
};
export const planLabel = (p: string | null | undefined) => (p ? PLAN_LABEL[p] ?? p : "—");

export const METHOD_LABEL: Record<string, string> = { pix: "Pix", credit_card: "Cartão", bank_slip: "Boleto", desconhecido: "Não informado" };
export const methodLabel = (m: string | null | undefined) => (m ? METHOD_LABEL[m] ?? m : "Não informado");
