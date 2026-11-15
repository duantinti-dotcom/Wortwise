import Link from "next/link";
import { SourceMark, sourceName } from "@/components/source-mark";
import { cn } from "@/lib/utils";

/** Abas de loja (Mercado Livre, Shopee, Amazon), cada uma com a sua marquinha. */
export function StoreTabs({ stores, active, href, status }: {
  stores: readonly string[]; active: string; href: (store: string) => string; status?: Record<string, boolean>;
}) {
  return (
    <nav aria-label="Lojas" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2 p-1">
        {stores.map((s) => {
          const on = s === active;
          return (
            <li key={s}>
              <Link href={href(s)} scroll={false} aria-current={on ? "page" : undefined}
                className={cn("chip !h-11 !gap-2.5 !px-4 !text-[15px] font-medium", on ? "!text-fg ring-2 ring-[#3B82F6]/70" : "!text-muted")}>
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
