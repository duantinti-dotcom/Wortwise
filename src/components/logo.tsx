import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo Worthwise: um "W" geométrico cujo último traço sobe além da linha — leitura de valor
 * crescente. Original da marca; não deriva de ícones de terceiros.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="4" y1="0" x2="28" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA14A" /><stop offset="0.55" stopColor="#FF7900" /><stop offset="1" stopColor="#E85F00" /></linearGradient>
        <linearGradient id={`${id}-hl`} x1="16" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke={`url(#${id}-hl)`} />
      <path d="M6.4 10.6 10.7 22l4.5-9.1L19.7 22l6-15" stroke="#140800" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.7" cy="7" r="1.85" fill="#140800" />
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} className="drop-shadow-[0_4px_14px_rgba(255,121,0,0.35)]" />
      <span className="text-[17px] font-semibold tracking-[-0.035em] text-fg">Worthwise</span>
    </span>
  );
}
