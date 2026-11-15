import { ArrowUpRight, Flame, Search, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AiIdeas } from "@/components/app/ai-ideas";
import { STORE_MESSAGE, StoreGuide } from "@/components/app/store-guide";
import { StoreSwitch, StoreTabs } from "@/components/app/store-tabs";
import { sourceName } from "@/components/source-mark";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getUsage, isAdmin } from "@/lib/auth";
import { isStore, loadStoreTrending, STORES, type StoreId } from "@/lib/trending";
import { supabaseAnon } from "@/lib/supabase/server";
import { cn, relativeTime } from "@/lib/utils";
import { TrendingGrid } from "./grid";

export const metadata: Metadata = { title: "Mais vendidos" };

async function freeVisible(): Promise<number> {
  const { data } = await supabaseAnon().from("app_settings").select("value").eq("key", "trial_policy").maybeSingle();
  const n = (data?.value as { free_visible_results?: number } | null)?.free_visible_results;
  return typeof n === "number" && n > 0 ? n : 6;
}


const SOURCE_NOTE: Record<StoreId, { text: string; link: string }> = {
  mercadolivre: { text: "Fonte: API oficial do Mercado Livre (ranking “Mais vendidos” da categoria).", link: "https://www.mercadolivre.com.br/mais-vendidos" },
  shopee: { text: "Fonte: API oficial de Afiliados da Shopee, com os produtos ordenados por quantidade vendida pela própria Shopee.", link: "https://shopee.com.br" },
  amazon: { text: "Fonte: Amazon.", link: "https://www.amazon.com.br/gp/bestsellers" },
  tiktokshop: { text: "Fonte: TikTok Shop.", link: "https://shop.tiktok.com" },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ categoria?: string; loja?: string }> }) {
  const { categoria, loja } = await searchParams;
  const store: StoreId = isStore(loja) ? loja : "mercadolivre";
  const [data, usage, admin] = await Promise.all([loadStoreTrending(store, categoria), getUsage(), isAdmin()]);
  const free = usage.plan === "free";
  const visible = free ? await freeVisible() : data.products.length;
  const shown = data.products.slice(0, visible);
  const locked = Math.max(0, data.products.length - shown.length);
  const name = sourceName(store);
  const qs = (s: string, c?: string) => `/app/em-alta?loja=${s}${c ? `&categoria=${c}` : ""}`;

  return (
    <>
      <PageHeader title="Mais vendidos" description="O que mais está vendendo agora em cada loja, com foto, preço e link do anúncio."
        action={data.updatedAt ? <span className="badge"><TrendingUp size={13} />atualizado {relativeTime(data.updatedAt)}</span> : undefined} />

      <StoreTabs stores={STORES} active={store} links={Object.fromEntries(STORES.map((s) => [s, qs(s)]))} />

      <StoreSwitch store={store}>
      {data.state.ok && data.categories.length ? (
        <nav aria-label="Categorias" className="-mx-5 mt-6 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
            {data.categories.map((c) => {
              const on = c.id === data.category.id;
              return (
                <li key={c.id}>
                  <Link href={qs(store, c.id)} scroll={false} aria-current={on ? "page" : undefined}
                    className={cn("chip whitespace-nowrap", on && "!border-transparent !bg-fg !text-[var(--bg)]")}>{c.name}</Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div className="mt-8">
        {!data.state.ok ? (
          data.state.reason === "error" && store !== "amazon" ? (
            <EmptyState icon={Flame} title="Não foi possível carregar agora" action={<Link href={qs(store, data.category.id)} className="btn btn-secondary">Tentar de novo</Link>}>
              {data.state.message} Nenhum dado foi inventado para preencher o espaço.
            </EmptyState>
          ) : (
            <>
              {admin && store !== "amazon" ? <p className="mb-6 text-[14px] text-muted">Você é administrador: <Link href="/admin/integracoes" className="text-brand-hi hover:underline">cadastrar as chaves de {name}</Link>.</p> : null}
              <div className="space-y-14">
                <AiIdeas store={store} />
                <StoreGuide store={store} message={STORE_MESSAGE[store] ?? ""} />
              </div>
            </>
          )
        ) : (
          <>
            {data.trends.length ? (
              <section aria-label="Buscas em alta" className="mb-10">
                <h2 className="text-[16px] font-semibold tracking-tight">Buscas que mais cresceram</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {data.trends.slice(0, 12).map((t) => (
                    <li key={t.keyword}><Link href={`/app/descobrir?q=${encodeURIComponent(t.keyword)}`} className="chip">{t.keyword}<Search size={13} className="text-faint" /></Link></li>
                  ))}
                </ul>
              </section>
            ) : null}

            {shown.length ? <TrendingGrid products={shown} locked={locked} /> : (
              <EmptyState icon={TrendingUp} title="Nenhum produto nesta categoria">Escolha outra categoria acima.</EmptyState>
            )}

            <p className="mt-10 text-[13px] leading-relaxed text-faint">
              {SOURCE_NOTE[store].text} Preços e fotos são os do anúncio no momento da coleta.{" "}
              <a href={SOURCE_NOTE[store].link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-brand-hi hover:underline">Abrir em {name} <ArrowUpRight size={12} /></a>
            </p>
          </>
        )}
      </div>
      </StoreSwitch>
    </>
  );
}
