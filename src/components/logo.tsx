import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo Worthwise: um "W" de fita dobrada (ciano → azul → índigo). As quatro hastes têm
 * degradês próprios e se sobrepõem como uma fita, o que dá profundidade sem perder a leitura do W.
 */
/* W de fita: quatro faixas com cantos do topo arredondados e base redonda (gerado geometricamente).
   Caixa do desenho: x 0,3–63,7 · y 16–50,5 → centro exato em (32, 33,25). */
const STRANDS = {
  "a": "M2.51 16.00L12.49 16.00Q14.69 16.00 15.63 17.99L26.63 41.22A6.50 6.50 0 0 1 14.87 46.78L1.25 17.99Q0.31 16.00 2.51 16.00Z",
  "b": "M27.19 16.00L36.81 16.00Q39.01 16.00 38.18 18.04L26.78 46.42A6.50 6.50 0 0 1 14.72 41.58L24.17 18.04Q24.99 16.00 27.19 16.00Z",
  "c": "M27.19 16.00L36.81 16.00Q39.01 16.00 39.83 18.04L49.28 41.58A6.50 6.50 0 0 1 37.22 46.42L25.82 18.04Q24.99 16.00 27.19 16.00Z",
  "d": "M51.51 16.00L61.49 16.00Q63.69 16.00 62.75 17.99L49.13 46.78A6.50 6.50 0 0 1 37.37 41.22L48.37 17.99Q49.31 16.00 51.51 16.00Z"
} as const;

export function WMark({ id, className }: { id: string; className?: string }) {
  return (
    <g className={className}>
      <defs>
        <linearGradient id={`${id}-a`} x1="4" y1="16" x2="22" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#22D3EE" /><stop offset=".55" stopColor="#38BDF8" /><stop offset="1" stopColor="#3B82F6" /></linearGradient>
        <linearGradient id={`${id}-b`} x1="32" y1="16" x2="20" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#1D4ED8" /><stop offset=".6" stopColor="#3B82F6" /><stop offset="1" stopColor="#67E8F9" /></linearGradient>
        <linearGradient id={`${id}-c`} x1="32" y1="16" x2="44" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#38BDF8" /><stop offset=".55" stopColor="#3B82F6" /><stop offset="1" stopColor="#60A5FA" /></linearGradient>
        <linearGradient id={`${id}-d`} x1="60" y1="16" x2="42" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#1D4ED8" /><stop offset=".5" stopColor="#2563EB" /><stop offset="1" stopColor="#3B82F6" /></linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="16" x2="0" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      {(["a", "b", "d", "c"] as const).map((k) => <path key={k} d={STRANDS[k]} fill={`url(#${id}-${k})`} />)}
      {(["a", "b", "d", "c"] as const).map((k) => <path key={`s${k}`} d={STRANDS[k]} fill={`url(#${id}-s)`} />)}
    </g>
  );
}

/** Só o símbolo (sem fundo): usado ao lado do nome. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={Math.round(size * 1.714)} height={size} viewBox="-1 14 66 38.5" fill="none" className={cn("block shrink-0", className)} aria-hidden="true">
      <WMark id={id} />
    </svg>
  );
}

/** Ícone de app: o W sobre um "squircle" de vidro azul-noite. */
export function AppIcon({ size = 64, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const sq = "M32 1C56 1 63 8 63 32S56 63 32 63 1 56 1 32 8 1 32 1Z";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#152442" /><stop offset="1" stopColor="#070B14" /></linearGradient>
        <radialGradient id={`${id}-gl`} cx=".3" cy="-.1" r=".9"><stop stopColor="#60A5FA" stopOpacity=".45" /><stop offset=".6" stopColor="#60A5FA" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".6" /><stop offset=".45" stopColor="#fff" stopOpacity=".05" /><stop offset="1" stopColor="#22D3EE" stopOpacity=".5" /></linearGradient>
      </defs>
      <path d={sq} fill={`url(#${id}-bg)`} /><path d={sq} fill={`url(#${id}-gl)`} />
      <path d={sq} stroke={`url(#${id}-rim)`} strokeWidth="1.2" />
      <g transform="translate(10.88 10.06) scale(.66)"><WMark id={`${id}-w`} /></g>
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 align-middle", className)}>
      <LogoMark size={Math.round(size * 0.68)} className="drop-shadow-[0_3px_10px_rgba(59,130,246,0.45)]" />
      <span className="text-[17px] font-semibold leading-none tracking-[-0.035em] text-fg">Worthwise</span>
    </span>
  );
}
