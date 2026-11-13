import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-brand-hi"><Icon size={22} /></div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children ? <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "pos" | "neg" | "brand" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("tabular mt-1.5 text-xl font-semibold tracking-tight", tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "brand" && "text-brand-hi")}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neg/30 bg-neg/8 px-4 py-3 text-sm text-[#ffb3b1]">
      <span>{children}</span>
      {onRetry ? <button onClick={onRetry} className="btn btn-secondary btn-sm">Tentar novamente</button> : null}
    </div>
  );
}
