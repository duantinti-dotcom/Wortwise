import { cn } from "@/lib/utils";

/**
 * Símbolo Worthwise: um "W" geométrico cujo último traço sobe além da linha — a leitura de valor
 * crescente. Original da marca; não deriva de ícones de terceiros.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FF7900" />
      <path d="M6.2 10.5 10.6 22l4.6-9.2L19.8 22l6-15" stroke="#0B0B0B" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.8" cy="7" r="1.9" fill="#0B0B0B" />
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-[-0.03em] text-fg">Worthwise</span>
    </span>
  );
}
