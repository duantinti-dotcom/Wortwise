import { ArrowUpRight, Flame, Search, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AiIdeas } from "@/components/app/ai-ideas";
import { StoreGuide } from "@/components/app/store-guide";
import { CategoryChips, StoreNav, StoreSwitch, StoreTabs } from "@/components/app/store-tabs";
import { inStore, sourceName } from "@/components/source-mark";
import { CuratedGrid } from "@/components/app/curated-grid";
import { loadCurated } from "@/lib/curated";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getUsage, isAdmin } from "@/lib/auth";
import { isStore, loadOverall, loadStoreTrending, STORES, trendingConfigured, type StoreId } from "@/lib/trending";
import { loadHistories } from "@/lib/product";
import { Trophy } from "lucide-react";
import { supabaseAnon } from "@/lib/supabase/server";
import { TrendingGrid } from "./grid";

export const metadata: Metadata = { title: "Mais vendidos" };

async function freeVisible(): Promise<number> {
  const { data } = await supabaseAnon().from("app_settings").select("value").eq("key", "trial_policy").maybeSingle();
  const n = (data?.value as { free_visible_results?: number } | null)?.free_visible_results;
  return typeof n === "number" && n > 0 ? n : 6;
}


const SOURCE_NOTE: Record<StoreId, { official: string; gecko: string; link: string }> = {
  mercadolivre: { official: "Fonte: API oficial do Mercado Livre (ranking “Mais vendidos” da categoria).",
    gecko: "Fonte: página oficial “Mais vendidos” do Mercado Livre, na ordem do próprio Mercado Livre.", link: "https://www.mercadolivre.com.br/mais-vendidos" },
  shopee: { official: "Fonte: API oficial de Afiliados da Shopee, com os produtos ordenados por quantidade vendida pela própria Shopee.",
    gecko: "Fonte: busca da Shopee na ordenação “Mais vendidos” da própria Shopee.", link: "https://shopee.com.br" },
  amazon: { official: "Fonte: Amazon.", gecko: "Fonte: Amazon.", link: "https://www.amazon.com.br/gp/bestsellers" },
  tiktokshop: { official: "Fonte: TikTok Shop.",
    gecko: "Fonte: busca do TikTok Shop na categoria, ordenada pela quantidade vendida que o próprio TikTok Shop informa.", link: "https://www.tiktok.com/shop" },
};
const noteFor = (store: StoreId, products: { provider?: string | null }[]) => (products.some((p) => p.provider === "geckoapi") ? SOURCE_NOTE[store].gecko : SOURCE_NOTE[store].official);

export default async function Page({ searchParams }: { searchParams: Promise<{ categoria?: string; loja?: string }> }) {
  const { categoria, loja } = await searchParams;
  if (loja === "geral" || (!loja && !trendingConfigured())) return <Overall />;
  // Sem o Mercado Livre conectado, a tela abre direto na Shopee (que tem conteúdo).
  const store: StoreId = isStore(loja) ? loja : trendingConfigured() ? "mercadolivre" : "shopee";
  const [data, usage, admin, curated] = await Promise.all([loadStoreTrending(store, categoria), getUsage(), isAdmin(), loadCurated(store)]);
  const free = usage.plan === "free";
  const visible = free ? await freeVisible() : data.products.length;
  const shown = data.products.slice(0, visible);
  const locked = Math.max(0, data.products.length - shown.length);
  const name = sourceName(store);
  const qs = (s: string, c?: string) => `/app/em-alta?loja=${s}${c ? `&categoria=${c}` : ""}`;

  return (
    <StoreNav>
      <PageHeader title="Mais vendidos" description="Os produtos que mais saem em cada loja, por categoria."
/>

      <StoreTabs stores={["geral", ...STORES]} active={store} links={Object.fromEntries(["geral", ...STORES].map((s) => [s, qs(s)]))} />

      <StoreSwitch store={store}>
      {data.state.ok && data.categories.length > 1 ? (
        <CategoryChips active={data.category.id} items={data.categories.map((c) => ({ id: c.id, name: c.name, href: qs(store, c.id) }))} />
      ) : null}

      <div className="mt-8">
        {!data.state.ok && curated.length ? (
          <div className="space-y-16">
            <section>
              <h2 className="mb-5 text-[19px] font-semibold tracking-tight">Top {curated.length} {inStore(store)}</h2>
              <CuratedGrid items={curated} />
            </section>
            {store !== "mercadolivre" ? <AiIdeas store={store} /> : null}
          </div>
        ) : !data.state.ok ? (
          store === "mercadolivre" ? (
            <div className="space-y-16">
              <EmptyState icon={Flame} title="Ranking do Mercado Livre chegando">
                Em breve aqui: os mais vendidos oficiais do Mercado Livre, com foto, preço e link de cada anúncio. Enquanto isso, veja as outras lojas acima.
              </EmptyState>
              <StoreGuide store={store} />
            </div>
          ) : data.state.reason === "error" && store !== "amazon" ? (
            <EmptyState icon={Flame} title="Não foi possível carregar agora" action={<Link href={qs(store, data.category.id)} className="btn btn-secondary">Tentar de novo</Link>}>
              {data.state.message} Nenhum dado foi inventado para preencher o espaço.
            </EmptyState>
          ) : (
            <div className="space-y-16">
              <AiIdeas store={store} />
              <StoreGuide store={store} />
            </div>
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

            {shown.length ? <TrendingGrid products={shown} locked={locked} histories={await loadHistories(shown)} /> : (
              <EmptyState icon={TrendingUp} title="Nenhum produto nesta categoria">Escolha outra categoria acima.</EmptyState>
            )}

            <p className="mt-10 text-[13px] leading-relaxed text-faint">
              {noteFor(store, data.products)} Preços e fotos são os do anúncio no momento da coleta.{" "}
              <a href={SOURCE_NOTE[store].link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-brand-hi hover:underline">Abrir em {name} <ArrowUpRight size={12} /></a>
            </p>
          </>
        )}
      </div>
      </StoreSwitch>
    </StoreNav>
  );
}

/** Aba "Geral": os destaques de todas as lojas com dados oficiais, num ranking só. */
async function Overall() {
  const [data, usage, curated] = await Promise.all([loadOverall(), getUsage(), loadCurated()]);
  const topCurated = curated.slice(0, 10);
  const visible = usage.plan === "free" ? await freeVisible() : data.products.length;
  const shown = data.products.slice(0, visible);
  const locked = Math.max(0, data.products.length - shown.length);
  const qs = (s: string) => `/app/em-alta?loja=${s}`;
  return (
    <StoreNav>
      <PageHeader title="Mais vendidos" description="Os produtos que mais saem em cada loja, por categoria."
/>
      <StoreTabs stores={["geral", ...STORES]} active="geral" links={Object.fromEntries(["geral", ...STORES].map((s) => [s, qs(s)]))} />
      <StoreSwitch store="geral">
        <div className="mt-8">
          {topCurated.length && !shown.length ? (
            <>
              <h2 className="mb-5 flex items-center gap-2 text-[19px] font-semibold tracking-tight"><Trophy size={18} className="text-brand-hi" />Os que mais se destacam em todas as lojas</h2>
              <CuratedGrid items={topCurated} showStore />
            </>
          ) : shown.length ? (
            <>
              <h2 className="mb-5 flex items-center gap-2 text-[19px] font-semibold tracking-tight"><Trophy size={18} className="text-brand-hi" />Os que mais se destacam em todas as lojas</h2>
              <TrendingGrid products={shown} locked={locked} histories={await loadHistories(shown)} />
              <p className="mt-8 text-[13px] text-faint">Junta o top 10 oficial de cada loja conectada: primeiro os 1º colocados, depois os 2º, e assim por diante.</p>
            </>
          ) : (
            <EmptyState icon={Trophy} title="Ranking geral chegando">
              Aqui aparecem os produtos que mais vendem em todas as lojas juntas, com foto, preço e link reais. Ele aparece assim que as lojas responderem.
            </EmptyState>
          )}
        </div>
      </StoreSwitch>
    </StoreNav>
  );
}
