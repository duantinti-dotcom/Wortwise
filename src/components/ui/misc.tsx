import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HowTo } from "./how-to";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="@container lg relative overflow-hidden rounded-2xl">
    <div className="grid items-center gap-10 px-6 py-12 @2xl:grid-cols-[1fr_1fr] @2xl:px-12 @2xl:py-14">
      <div aria-hidden className="absolute -left-24 -top-24 size-72 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative">
        <div className="relative w-fit">
          <div aria-hidden className="absolute -inset-3 rounded-[22px] border border-tint/[0.06]" />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-brand/40 bg-gradient-to-b from-brand/25 to-brand/5 text-brand-hi shadow-[0_0_34px_-8px_rgba(59,130,246,0.7)]"><Icon size={24} /></div>
        </div>
        <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{title}</h3>
        {children ? <div className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{children}</div> : null}
        {action ? <div className="mt-7">{action}</div> : null}
      </div>
      {/* Silhueta do que vai aparecer aqui (decorativa) */}
      <div aria-hidden className="relative hidden pr-6 @2xl:block">
        <div className="space-y-3 [mask-image:linear-gradient(180deg,#000_40%,transparent)]">
          {[0.9, 0.7, 0.55].map((o, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-tint/[0.08] bg-tint/[0.035] p-4" style={{ opacity: o, transform: `translateX(${i * 12}px)` }}>
              <span className="size-10 shrink-0 rounded-xl bg-gradient-to-br from-brand/30 to-tint/5" />
              <span className="flex-1 space-y-2"><span className="skeleton block h-2.5 w-3/5 !rounded-full" /><span className="skeleton block h-2 w-2/5 !rounded-full opacity-70" /></span>
              <span className="skeleton block h-3 w-14 !rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}

export function PageHeader({ title, description, action, eyebrow, help }: { title: string; description?: string; action?: ReactNode; eyebrow?: string; help?: { id: string; steps: string[] } }) {
  return (
    <>
      <div className={cn("flex flex-wrap items-end justify-between gap-5", help ? "mb-5" : "mb-8")}>
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-hi">{eyebrow}</div> : null}
          <h1 className="display text-[34px] md:text-[44px]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p> : null}
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
