import { cn } from "@/lib/utils";

/**
 * Logo de cada loja nas abas e nos cartões (uso apenas para identificar a origem do dado).
 * Arquivos em /public/brands. As marcas pertencem aos seus titulares.
 */
const MARKS: Record<string, { name: string; file: string | null }> = {
  mercadolivre: { name: "Mercado Livre", file: "/brands/mercadolivre.svg" },
  shopee: { name: "Shopee", file: "/brands/shopee.svg" },
  amazon: { name: "Amazon", file: "/brands/amazon.svg" },
  tiktokshop: { name: "TikTok Shop", file: "/brands/tiktok.svg" },
};

/** "no Mercado Livre", "na Shopee", "na Amazon", "no TikTok Shop". */
export function inStore(id: string) {
  const n = MARKS[id]?.name ?? id;
  return `${id === "mercadolivre" || id === "tiktokshop" ? "no" : "na"} ${n}`;
}

export function sourceName(id: string) {
  return MARKS[id]?.name ?? id;
}

export function SourceMark({ source, size = 18, className }: { source: string; size?: number; className?: string }) {
  const m = MARKS[source];
  if (!m?.file) return <span aria-hidden className={cn("inline-block shrink-0 rounded-[6px] bg-tint/10", className)} style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.file} alt="" aria-hidden width={size} height={size} draggable={false}
      className={cn("inline-block shrink-0 select-none", className)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }} />
  );
}
