"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LockedCard, ProductCard } from "@/components/app/product-bits";
import { useUpgrade } from "@/components/app/upgrade";
import type { RankedProduct } from "@/lib/connectors/types";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Grade de produtos em alta, com entrada em cascata e espaços bloqueados para o plano grátis. */
export function TrendingGrid({ products, locked, histories }: { products: RankedProduct[]; locked: number; histories?: Record<string, { date: string; price: number }[]> }) {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const { openUpgrade } = useUpgrade();
  const reduce = useReducedMotion();
  useEffect(() => {
    supabaseBrowser().from("favorites").select("source, external_id").then(({ data }: { data: { source: string; external_id: string }[] | null }) => {
      setFavs(new Set((data ?? []).map((f) => `${f.source}:${f.external_id}`)));
    });
  }, []);
  const cells = [
    ...products.map((p) => ({ key: `${p.source}:${p.externalId}`, node: <ProductCard p={p} rank={p.rank} history={histories?.[`${p.source}:${p.externalId}`] ?? []} favorite={favs.has(`${p.source}:${p.externalId}`)} /> })),
    ...Array.from({ length: locked }, (_, i) => ({ key: `locked-${i}`, node: <LockedCard onUnlock={() => openUpgrade("Veja o ranking completo de mais vendidos")} /> })),
  ];
  return (
    <div className="grid grid-cols-2 gap-4 md:gap-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {cells.map((c, i) => (
        <motion.div key={c.key} className="flex [&>*]:flex-1"
          initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 110, damping: 18, delay: Math.min(i, 12) * 0.04 }}>
          {c.node}
        </motion.div>
      ))}
    </div>
  );
}
