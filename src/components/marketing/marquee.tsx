"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Faixa contínua de perguntas. Pausa no hover/foco e respeita prefers-reduced-motion (via CSS global). */
export function QuestionMarquee({ items, reverse }: { items: string[]; reverse?: boolean }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <ul className={cn("flex w-max gap-3 animate-marquee", reverse && "[animation-direction:reverse]")} style={{ animationPlayState: paused ? "paused" : "running" }}>
        {[...items, ...items].map((q, i) => (
          <li key={i} aria-hidden={i >= items.length} className="chip shrink-0 !h-11 !px-5">
            <Sparkles size={14} className="text-brand" />{q}
          </li>
        ))}
      </ul>
    </div>
  );
}
