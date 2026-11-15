import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HowTo } from "./how-to";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center md:py-16">
      <span className="flex size-12 items-center justify-center rounded-xl bg-tint/[0.06] text-brand-hi"><Icon size={22} /></span>
      <h3 className="mt-6 text-[20px] font-semibold tracking-tight">{title}</h3>
      {children ? <div className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, action, eyebrow, help }: { title: string; description?: string; action?: ReactNode; eyebrow?: string; help?: { id: string; steps: string[] } }) {
  return (
    <>
      <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", help ? "mb-6" : "mb-10")}>
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 text-[13px] font-medium text-brand-hi">{eyebrow}</div> : null}
          <h1 className="display text-[30px] md:text-[38px]">{title}</h1>
          {description ? <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {help ? <HowTo id={help.id} steps={help.steps} /> : null}
    </>
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
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neg/30 bg-neg/[0.07] px-4 py-3.5 text-sm text-danger">
      <span>{children}</span>
      {onRetry ? <button onClick={onRetry} className="btn btn-secondary btn-sm">Tentar novamente</button> : null}
    </div>
  );
}
