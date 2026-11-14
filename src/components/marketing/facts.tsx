"use client";
import { cn } from "@/lib/utils";

/** Faixa de cartões coloridos com fatos do produto (não são métricas de clientes). */
const FACTS = [
  { big: "R$ 0", small: "para começar, sem cartão", tone: "tile-sunset" },
  { big: "3", small: "pesquisas completas grátis", tone: "tile-berry" },
  { big: "100%", small: "dos preços com fonte e data", tone: "tile-ocean" },
  { big: "0", small: "scraping ou número inventado", tone: "tile-ember" },
  { big: "CNPJ", small: "conferido na Receita Federal", tone: "tile-mint" },
  { big: "LGPD", small: "seus dados, suas regras", tone: "tile-night" },
];

export function FactsMarquee() {
  return (
    <div className="group relative overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
      <ul className="flex w-max gap-4 animate-marquee [animation-duration:60s] group-hover:[animation-play-state:paused]">
        {[...FACTS, ...FACTS].map((f, i) => (
          <li key={i} aria-hidden={i >= FACTS.length} className={cn("tile flex h-[150px] w-[260px] shrink-0 flex-col justify-end !rounded-[26px] p-6 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-1.5 sm:h-[170px] sm:w-[290px]", f.tone)}>
            <div className="text-[42px] font-bold leading-none tracking-[-0.05em] sm:text-[48px]">{f.big}</div>
            <div className="tile-muted mt-2 text-[15px] font-medium">{f.small}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
