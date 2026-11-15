import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo Worthwise: um "W" de fita dobrada (ciano → azul → índigo). As quatro hastes têm
 * degradês próprios e se sobrepõem como uma fita, o que dá profundidade sem perder a leitura do W.
 */
export function WMark({ id, className }: { id: string; className?: string }) {
  const sw = 11.5;
  return (
    <g className={className}>
      <defs>
        <clipPath id={`${id}-clip`}><rect x="-10" y="14" width="84" height="60" /></clipPath>
        <linearGradient id={`${id}-a`} x1="6" y1="6" x2="21" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#22D3EE" /><stop offset="1" stopColor="#3B82F6" /></linearGradient>
        <linearGradient id={`${id}-b`} x1="21" y1="50" x2="32" y2="22" gradientUnits="userSpaceOnUse"><stop stopColor="#7DD3FC" /><stop offset="1" stopColor="#2563EB" /></linearGradient>
        <linearGradient id={`${id}-c`} x1="32" y1="22" x2="43" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#1D4ED8" /><stop offset="1" stopColor="#60A5FA" /></linearGradient>
        <linearGradient id={`${id}-d`} x1="43" y1="50" x2="58" y2="6" gradientUnits="userSpaceOnUse"><stop stopColor="#3B82F6" /><stop offset="1" stopColor="#4F46E5" /></linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`} strokeWidth={sw} strokeLinecap="round" fill="none">
        <path d="M43 48 55.8 6" stroke={`url(#${id}-d)`} />
        <path d="M32 24 43 48" stroke={`url(#${id}-c)`} />
        <path d="M6.2 6 21 48" stroke={`url(#${id}-a)`} />
        <path d="M21 48 32 24" stroke={`url(#${id}-b)`} />
      </g>
    </g>
  );
}

/** Só o símbolo (sem fundo): usado ao lado do nome. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={Math.round(size * 1.38)} height={size} viewBox="0 11 64 46.5" fill="none" className={className} aria-hidden="true">
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
      <g transform="translate(9.6 12.4) scale(.7)"><WMark id={`${id}-w`} /></g>
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} className="drop-shadow-[0_4px_14px_rgba(59,130,246,0.45)]" />
      <span className="text-[17px] font-semibold tracking-[-0.035em] text-fg">Worthwise</span>
    </span>
  );
}
