import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card relative flex flex-col items-center overflow-hidden !rounded-3xl px-6 py-16 text-center">
      <div aria-hidden className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(255,121,0,0.10),transparent)]" />
      <div className="relative">
        <div aria-hidden className="absolute -inset-3 rounded-[22px] border border-white/[0.05]" />
        <div aria-hidden className="absolute -inset-6 rounded-[28px] border border-white/[0.03]" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-brand/30 bg-gradient-to-b from-brand/20 to-brand/5 text-brand-hi shadow-[0_0_30px_-8px_rgba(255,121,0,0.6)]"><Icon size={24} /></div>
      </div>
      <h3 className="relative mt-8 text-lg font-semibold tracking-tight">{title}</h3>
      {children ? <div className="relative mt-2 max-w-md text-[14.5px] leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="relative mt-7">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, action, eyebrow }: { title: string; description?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-hi">{eyebrow}</div> : null}
        <h1 className="display text-[34px] md:text-[44px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "pos" | "neg" | "brand"; icon?: LucideIcon }) {
  return (
    <div className="card !rounded-2xl p-5">
      <div className="flex items-center justify-between text-xs text-muted">{label}{Icon ? <Icon size={15} className="text-faint" /> : null}</div>
      <div className={cn("tabular mt-2 text-2xl font-semibold tracking-tight", tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "brand" && "text-brand-hi")}>{value}</div>
      {hint ? <div className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neg/30 bg-neg/[0.07] px-4 py-3.5 text-sm text-[#ffb3b1]">
      <span>{children}</span>
      {onRetry ? <button onClick={onRetry} className="btn btn-secondary btn-sm">Tentar novamente</button> : null}
    </div>
  );
}
