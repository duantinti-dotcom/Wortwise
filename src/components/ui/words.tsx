import type { ReactNode } from "react";

/** Título que surge palavra por palavra (desfoque → nítido). Visível ao fim da animação; desligado com movimento reduzido. */
export function Words({ parts, step = 70, start = 0 }: { parts: (string | { text: string; className: string })[]; step?: number; start?: number }) {
  let i = 0;
  const out: ReactNode[] = [];
  for (const p of parts) {
    const text = typeof p === "string" ? p : p.text;
    const cls = typeof p === "string" ? "" : p.className;
    for (const w of text.split(" ").filter(Boolean)) {
      out.push(<span key={i} className={`word ${cls}`} style={{ animationDelay: `${start + i * step}ms` }}>{w}</span>, " ");
      i++;
    }
  }
  return <>{out}</>;
}
