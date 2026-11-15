import { cn } from "@/lib/utils";

/**
 * Marquinha pequena que identifica cada loja nas abas e nos cartões.
 * Não usa o logotipo oficial: só a cor da loja com a inicial, para reconhecer de relance.
 */
const MARKS: Record<string, { bg: string; fg: string; text: string; name: string }> = {
  mercadolivre: { bg: "#FFE600", fg: "#2D3277", text: "ML", name: "Mercado Livre" },
  shopee: { bg: "#EE4D2D", fg: "#FFFFFF", text: "S", name: "Shopee" },
  amazon: { bg: "#232F3E", fg: "#FF9900", text: "a", name: "Amazon" },
  tiktokshop: { bg: "#111111", fg: "#FFFFFF", text: "T", name: "TikTok Shop" },
};

export function sourceName(id: string) {
  return MARKS[id]?.name ?? id;
}

export function SourceMark({ source, size = 18, className }: { source: string; size?: number; className?: string }) {
  const m = MARKS[source] ?? { bg: "#71717A", fg: "#fff", text: "?", name: source };
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] font-bold leading-none ring-1 ring-black/10", className)}
      style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: Math.round(size * (m.text.length > 1 ? 0.46 : 0.6)) }}>
      {m.text}
    </span>
  );
}
