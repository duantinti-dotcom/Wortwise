import { ArrowUpRight, Flame, Search, Settings2, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/misc";
import { getUsage, isAdmin } from "@/lib/auth";
import { loadTrending } from "@/lib/trending";
import { supabaseAnon } from "@/lib/supabase/server";
import { cn, relativeTime } from "@/lib/utils";
import { TrendingGrid } from "./grid";

export const metadata: Metadata = { title: "Em alta" };

async function freeVisible(): Promise<number> {
  const { data } = await supabaseAnon().from("app_settings").select("value").eq("key", "trial_policy").maybeSingle();
  const n = (data?.value as { free_visible_results?: number } | null)?.free_visible_results;
  return typeof n === "number" && n > 0 ? n : 6;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  const [data, usage, admin] = await Promise.all([loadTrending(categoria), getUsage(), isAdmin()]);
  const free = usage.plan === "free";
  const visible = free ? await freeVisible() : data.products.length;
  const shown = data.products.slice(0, visible);
  const locked = Math.max(0, data.products.length - shown.length);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-hi">
            <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-brand/60" /><span className="relative size-2 rounded-full bg-brand" /></span>
            Ranking oficial do Mercado Livre
          </div>
          <h1 className="display mt-2 text-[36px] md:text-[48px]">Produtos <span className="accent">em alta</span></h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">Os mais vendidos de cada categoria, com foto, preço atual e acesso direto ao anúncio. A posição vem do próprio Mercado Livre; o Worthwise não estima vendas.</p>
        </div>
        {data.updatedAt ? <span className="badge"><TrendingUp size={13} className="text-brand" />atualizado {relativeTime(data.updatedAt)}</span> : null}
      </div>

      {/* Categorias */}
      <nav aria-label="Categorias" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
          {data.categories.map((c) => {
            const on = c.id === data.category.id;
            return (
              <li key={c.id}>
                <Link href={`/app/em-alta?categoria=${c.id}`} scroll={false} aria-current={on ? "page" : undefined}
                  className={cn("chip !h-9 whitespace-nowrap", on && "!border-transparent !bg-fg !text-ink hover:!translate-y-0")}>{c.name}</Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!data.state.ok ? (
        data.state.reason === "not_configured" ? (
          <EmptyState icon={Flame} title="Conecte o Mercado Livre para ver os mais vendidos"
            action={admin ? <Link href="/admin/integracoes" className="btn btn-primary"><Settings2 size={16} /> Configurar integração</Link> : <Link href="/app/calculadora" className="btn btn-secondary">Usar a calculadora enquanto isso</Link>}>
            {admin
              ? "Cadastre o Client ID e o Client Secret do aplicativo criado no DevCenter do Mercado Livre. Assim que estiverem configurados, o ranking aparece aqui com fotos, preços e links."
              : "A integração com o Mercado Livre está sendo configurada. Assim que estiver ativa, o ranking de mais vendidos aparece aqui com fotos, preços e links."}
          </EmptyState>
        ) : (
          <EmptyState icon={Flame} title="Não foi possível carregar o ranking agora" action={<Link href={`/app/em-alta?categoria=${data.category.id}`} className="btn btn-secondary">Tentar novamente</Link>}>
            {data.state.message} Nenhum dado foi inventado para preencher o espaço.
          </EmptyState>
        )
      ) : (
        <>
          {data.trends.length ? (
            <section aria-label="Buscas em alta" className="lg mb-6 rounded-2xl p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Flame size={16} className="text-brand" />Buscas que mais cresceram em {data.category.name}</div>
              <ul className="flex flex-wrap gap-2">
                {data.trends.slice(0, 16).map((t, i) => (
                  <li key={t.keyword} className="flex">
                    <Link href={`/app/descobrir?q=${encodeURIComponent(t.keyword)}`} className="chip !h-9 !pr-3">
                      <span className="tabular text-[11px] font-bold text-faint">{i + 1}</span>{t.keyword}<Search size={13} className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {shown.length ? <TrendingGrid products={shown} locked={locked} /> : (
            <EmptyState icon={TrendingUp} title="O Mercado Livre não informou mais vendidos para esta categoria">Escolha outra categoria acima.</EmptyState>
          )}

          <p className="mt-6 flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-faint">
            Fonte: API oficial do Mercado Livre (ranking “Mais vendidos” da categoria {data.category.name}). Preços e fotos são os da ficha ou do anúncio no momento da coleta.
            <a href="https://www.mercadolivre.com.br/mais-vendidos" target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-brand-hi hover:underline">Ver no Mercado Livre <ArrowUpRight size={12} /></a>
          </p>
        </>
      )}
    </>
  );
}
