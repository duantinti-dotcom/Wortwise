import type { ReactNode } from "react";

export function PageShell({ eyebrow, title, lead, children, narrow }: { eyebrow?: string; title: string; lead?: string; children: ReactNode; narrow?: boolean }) {
  return (
    <div className="pb-24 pt-32 md:pt-40">
      <div className={narrow ? "container-page !max-w-3xl" : "container-page"}>
        <header className={narrow ? "" : "mx-auto max-w-2xl text-center"}>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-[-0.035em] md:text-5xl">{title}</h1>
          {lead ? <p className="mt-5 text-lg leading-relaxed text-muted">{lead}</p> : null}
        </header>
        <div className="mt-12">{children}</div>
      </div>
    </div>
  );
}
