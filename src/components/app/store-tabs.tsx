import Link from "next/link";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn } from "@/lib/utils";

/** Abas de loja (Mercado Livre, Shopee, Amazon), cada uma com a sua marquinha. */
export function StoreTabs({ stores, active, href, status }: {
  stores: readonly string[]; active: string; href: (store: string) => string; status?: Record<string, boolean>;
}) {
  return (
    <nav aria-label="Lojas" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2 border-b border-tint/[0.08] lg:w-full">
        {stores.map((s) => {
          const on = s === active;
          return (
            <li key={s}>
              <Link href={href(s)} scroll={false} aria-current={on ? "page" : undefined}
                className={cn("-mb-px flex h-12 items-center gap-2.5 border-b-2 px-3 text-[15px] font-medium transition-colors",
                  on ? "border-[#3B82F6] text-fg" : "border-transparent text-muted hover:text-fg")}>
                <SourceMark source={s} size={20} />
                {sourceName(s)}
                {status && status[s] === false ? <span className="rounded-full bg-tint/[0.07] px-2 py-0.5 text-[11.5px] font-normal text-faint">em breve</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
