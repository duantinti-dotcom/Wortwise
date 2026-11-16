/**
 * Intervalos do filtro global do painel (URL: ?r=30d | ?from=AAAA-MM-DD&to=AAAA-MM-DD, &g=day|week|month, &cmp=0).
 * Os dias são os de Brasília (America/Sao_Paulo, UTC−3 sem horário de verão).
 */
export type Bucket = "day" | "week" | "month";
export const PRESETS = [
  { key: "24h", label: "24 horas", hours: 24 },
  { key: "7d", label: "7 dias", hours: 24 * 7 },
  { key: "30d", label: "30 dias", hours: 24 * 30 },
  { key: "90d", label: "90 dias", hours: 24 * 90 },
  { key: "365d", label: "365 dias", hours: 24 * 365 },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

export interface Range {
  key: PresetKey | "custom";
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: Bucket;
  compare: boolean;
  days: number;
}

const SP_OFFSET_H = 3; // Brasília = UTC−3
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Meia-noite de Brasília do dia informado (AAAA-MM-DD), como instante UTC. */
export function spMidnight(day: string): Date {
  return new Date(`${day}T0${SP_OFFSET_H}:00:00.000Z`);
}

/** Dia de Brasília (AAAA-MM-DD) de um instante. */
export function spDay(d: Date): string {
  return new Date(d.getTime() - SP_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

function autoBucket(days: number): Bucket {
  if (days <= 92) return "day";
  if (days <= 400) return "week";
  return "month";
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseRange(params: Params, now = new Date()): Range {
  const r = one(params.r);
  const fromS = one(params.from);
  const toS = one(params.to);
  const g = one(params.g);
  const compare = one(params.cmp) !== "0";
  let key: Range["key"] = "30d";
  let from: Date;
  let to: Date;
  let label: string;

  if (fromS && toS && ISO_DAY.test(fromS) && ISO_DAY.test(toS) && fromS <= toS) {
    from = spMidnight(fromS);
    to = new Date(spMidnight(toS).getTime() + DAY_MS);
    if (to.getTime() - from.getTime() > 731 * DAY_MS) from = new Date(to.getTime() - 731 * DAY_MS);
    if (to > now) to = now;
    if (from >= to) from = new Date(to.getTime() - DAY_MS);
    key = "custom";
    label = `${fmtDay(fromS)} – ${fmtDay(toS)}`;
  } else {
    const preset = PRESETS.find((p) => p.key === r) ?? PRESETS[2];
    key = preset.key;
    to = now;
    from = new Date(now.getTime() - preset.hours * 3_600_000);
    label = `Últimos ${preset.label}`;
  }
  const len = to.getTime() - from.getTime();
  const days = Math.max(1, Math.round(len / DAY_MS));
  const bucket: Bucket = g === "day" || g === "week" || g === "month" ? g : autoBucket(days);
  return { key, label, from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, bucket, compare, days };
}

function fmtDay(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y!.slice(2)}`;
}

/** Monta a query string mantendo os parâmetros atuais. */
export function rangeQuery(params: Params, patch: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = one(v);
    if (s != null && ["r", "from", "to", "g", "cmp"].includes(k)) q.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const BUCKET_LABEL: Record<Bucket, string> = { day: "Dia", week: "Semana", month: "Mês" };
