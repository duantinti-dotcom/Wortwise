"use client";
import { AlertTriangle, ArrowLeft, Bell, FileText, HelpCircle, Star, Truck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FavoriteButton, ProductImage, SourceLink, WatchDialog, type ProductRef } from "@/components/app/product-bits";
import { ProfitCalculator } from "@/components/profit-calculator";
import { ScoreBreakdown, ScoreRing } from "@/components/score-ring";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorNote, Skeleton, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { FeeQuote, ProductDetail } from "@/lib/connectors/types";
import { api, dbMessage, useLoad } from "@/lib/hooks";
import { calculateProfit, DEFAULT_INPUTS, type ProfitInputs } from "@/lib/profit/calc";
import { computeScore } from "@/lib/score/score";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatDate, formatMoney, formatNumber, formatPercent, relativeTime, SOURCE_LABELS } from "@/lib/utils";

const PriceHistoryChart = dynamic(() => import("@/components/charts").then((m) => m.PriceHistoryChart), { ssr: false, loading: () => <Skeleton className="h-[260px] w-full" /> });
const CompareBars = dynamic(() => import("@/components/charts").then((m) => m.CompareBars), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });

interface Analysis { product: ProductDetail; history: { date: string; price: number; metric: string; offersCount: number | null }[]; bestsellerRank: number | null; fees: FeeQuote[] }
const RANGES = [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [365, "365 dias"]] as const;

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{hint ? <span className="text-xs text-faint">{hint}</span> : null}</div>
      {children}
    </section>
  );
}

export function ProductView({ source, id }: { source: string; id: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const r = await api<Analysis>(`/api/product/${source}/${id}`);
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  }, [source, id]);
  const [fav, setFav] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [range, setRange] = useState<number>(30);
  const [sim, setSim] = useState<ProfitInputs | null>(null);
  const [supplierVerified, setSupplierVerified] = useState<boolean | null>(null);
  const [savingSim, setSavingSim] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.from("favorites").select("source").eq("source", source).eq("external_id", id).maybeSingle().then(({ data: f }: { data: unknown }) => setFav(Boolean(f)));
    supabase.from("supplier_quotes").select("supplier_id, suppliers(verification_status)").eq("product_source", source).eq("product_external_id", id).limit(5)
      .then(({ data: q }: { data: { suppliers: { verification_status: string } | null }[] | null }) => {
        if (q?.length) setSupplierVerified(q.some((x) => x.suppliers?.verification_status === "doc_verified"));
      });
  }, [source, id]);

  const p = data?.product;
  const offerPrices = useMemo(() => (p?.offers ?? []).map((o) => o.price).filter((v): v is number => v != null).sort((a, b) => a - b), [p]);
  const [now] = useState(() => Date.now());
  const history = useMemo(() => {
    const since = now - range * 86400000;
    return (data?.history ?? []).filter((h) => new Date(h.date).getTime() >= since);
  }, [data, range, now]);
  const simResult = useMemo(() => (sim && sim.costPrice > 0 && sim.salePrice > 0 ? calculateProfit(sim) : null), [sim]);
  const score = useMemo(() => computeScore({
    marginPct: simResult?.marginPct ?? null, price: p?.price ?? null, comparablePrices: offerPrices,
    offersCount: p?.offersTotal ?? (p?.offers.length || null), bestsellerRank: data?.bestsellerRank ?? null, reviewsCount: p?.reviewsCount ?? null,
    rating: p?.rating ?? null, priceHistory: (data?.history ?? []).map((h) => h.price), supplierVerified,
  }), [simResult, p, offerPrices, data, supplierVerified]);

  if (loading) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]"><Skeleton className="aspect-square !rounded-2xl" />
          <div className="space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-12 w-48" /><Skeleton className="h-32 w-full !rounded-2xl" /></div></div>
      </div>
    );
  }
  if (error || !p || !data) {
    return (
      <div className="space-y-4"><Link href="/app/descobrir" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft size={15} /> Voltar</Link>
        <ErrorNote onRetry={reload}>{error ?? "Produto indisponível."}</ErrorNote></div>
    );
  }

  const ref: ProductRef = { source: p.source, externalId: p.externalId, title: p.title, imageUrl: p.imageUrl, price: p.price, currency: p.currency, permalink: p.permalink };
  const hPrices = history.map((h) => h.price);
  const first = hPrices[0];
  const last = hPrices.at(-1);
  const variation = first && last ? ((last - first) / first) * 100 : null;
  const fee = data.fees.find((f) => f.listingType === "gold_special") ?? data.fees[0];
  const initialSim: Partial<ProfitInputs> = { salePrice: p.price ?? 0, quantity: 10, marketplaceFeePct: fee?.percentageFee ?? 0, marketplaceFixedFee: fee?.fixedFee ?? 0 };

  const risks: { text: string; level: "warn" | "info" }[] = [];
  if (p.price == null) risks.push({ level: "warn", text: "A fonte não informou preço para este produto no momento da coleta." });
  if (p.offersTotal != null && p.offersTotal > 30) risks.push({ level: "warn", text: `Concorrência alta: ${p.offersTotal} ofertas na mesma ficha. Diferenciar por preço tende a comprimir a margem.` });
  if (p.reviewsCount == null) risks.push({ level: "info", text: "Sem avaliações disponíveis na fonte: não há indicador de interesse dos compradores." });
  else if (p.reviewsCount < 20) risks.push({ level: "info", text: `Poucas avaliações (${p.reviewsCount}): evidência fraca de demanda.` });
  if (data.history.length < 5) risks.push({ level: "info", text: `Histórico curto (${data.history.length} observação${data.history.length === 1 ? "" : "ões"}): ainda não é possível avaliar a estabilidade do preço.` });
  if (offerPrices.length >= 3 && p.price != null && p.price > offerPrices[Math.floor(offerPrices.length / 2)]! * 1.1) risks.push({ level: "warn", text: "O preço exibido está mais de 10% acima da mediana das ofertas concorrentes." });
  if (simResult && simResult.marginPct != null && simResult.marginPct < 10) risks.push({ level: "warn", text: `Margem simulada baixa (${formatPercent(simResult.marginPct)}): pouco espaço para absorver devoluções, anúncios ou queda de preço.` });
  risks.push({ level: "info", text: "O marketplace não divulga unidades vendidas de anúncios de terceiros. Nenhum número de vendas é exibido ou estimado como real." });

  async function saveSimulation(inputs: ProfitInputs) {
    setSavingSim(true);
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("simulations").insert({ user_id: auth.user?.id, name: p!.title.slice(0, 110), product_source: source, product_external_id: id, inputs, results: calculateProfit(inputs) });
    setSavingSim(false);
    toast(e ? dbMessage(e) : "Simulação salva", e ? "error" : "success");
  }

  async function saveReport() {
    const supabase = supabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("reports").insert({
      user_id: auth.user?.id, title: p!.title.slice(0, 160), kind: "product_analysis",
      content: { source, externalId: id, permalink: p!.permalink, price: p!.price, currency: p!.currency, rating: p!.rating, reviewsCount: p!.reviewsCount,
        offersTotal: p!.offersTotal, bestsellerRank: data!.bestsellerRank, collectedAt: p!.collectedAt, score: { status: score.status, score: score.score, confidence: score.confidence, factors: score.factors },
        simulation: sim && simResult ? { inputs: sim, result: simResult } : null, risks: risks.map((r) => r.text), historyPoints: data!.history.length },
    });
    toast(e ? dbMessage(e) : "Relatório salvo em Relatórios", e ? "error" : "success");
  }

  return (
    <div className="space-y-12">
      <div>
        <Link href="/app/descobrir" className="btn btn-ghost btn-sm -ml-2 mb-4"><ArrowLeft size={15} /> Voltar para a pesquisa</Link>
        <section id="visao-geral" className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="card relative overflow-hidden"><ProductImage src={p.images[0] ?? p.imageUrl} alt={p.title} className="aspect-square w-full" />
            <FavoriteButton key={String(fav)} product={ref} initial={fav} onChange={setFav} className="absolute right-3 top-3" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="badge badge-brand">{SOURCE_LABELS[p.source] ?? p.source}</span>
              <span className="badge">{p.kind === "catalog_product" ? "Ficha de catálogo" : "Anúncio"}</span>
              <span className="badge">ID {p.externalId.slice(2)}</span></div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">{p.title}</h1>
            <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
              <span className={cn("tabular text-4xl font-semibold tracking-tight", p.price == null && "text-xl text-faint")}>{formatMoney(p.price, p.currency ?? "BRL")}</span>
              {p.originalPrice && p.price && p.originalPrice > p.price ? <span className="tabular pb-1 text-sm text-faint line-through">{formatMoney(p.originalPrice, p.currency ?? "BRL")}</span> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1.5"><Star size={14} className={p.rating != null ? "fill-brand text-brand" : "text-faint"} />{p.rating != null ? `${p.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · ${formatNumber(p.reviewsCount)} avaliações` : "Avaliação não disponível"}</span>
              <span className={cn("flex items-center gap-1.5", p.freeShipping && "text-pos")}><Truck size={14} />{p.freeShipping == null ? "Frete não informado" : p.freeShipping ? "Frete grátis" : "Frete pago"}</span>
              <span>{p.available == null ? "Disponibilidade não informada" : p.available ? "Disponível" : "Sem oferta ativa"}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => setWatchOpen(true)}><Bell size={15} /> Monitorar preço</button>
              <button className="btn btn-secondary" onClick={saveReport}><FileText size={15} /> Salvar relatório</button>
              <SourceLink href={p.permalink} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-3">
              {[["Marca", p.brand], ["Modelo", p.model], ["GTIN/EAN", p.gtin], ["Vendedor", p.sellerName ?? (p.sellerId ? `ID ${p.sellerId}` : null)], ["Condição", p.condition === "new" ? "Novo" : p.condition === "used" ? "Usado" : p.condition],
                ["Coletado", formatDate(p.collectedAt, true)]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-faint">{k}</dt><dd className={cn("mt-0.5 truncate", !v && "text-faint")}>{v ?? "Não disponível"}</dd></div>
              ))}
            </dl>
            {p.features.length ? <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-muted">{p.features.slice(0, 5).map((f) => <li key={f}>{f}</li>)}</ul> : null}
          </div>
        </section>
      </div>

      <Section id="conclusao" title="Conclusão" hint="Avaliação explicável — não é promessa de resultado">
        <div className="card grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <ScoreRing value={score.score} size={104} />
          <div>
            <div className="text-base font-semibold">{score.status === "ok" ? `Worthwise Score ${score.score}/100` : "Dados insuficientes para avaliação"}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {score.status === "ok" ? <>Grau de confiança: <span className="font-medium text-fg">{score.confidence}</span> — {Math.round(score.coverage * 100)}% dos fatores têm dados.</>
                : "O Score só aparece quando há evidências suficientes. Faça uma simulação de lucro abaixo para incluir a margem na avaliação."}
            </p>
          </div>
          <Dialog><DialogTrigger className="btn btn-secondary"><HelpCircle size={15} /> Como foi calculado</DialogTrigger>
            <DialogContent wide title="Como o Score foi calculado" description={score.message}><ScoreBreakdown result={score} /></DialogContent></Dialog>
        </div>
      </Section>

      <Section id="mercado" title="Mercado" hint={`Fonte: ${SOURCE_LABELS[p.source]} · ${relativeTime(p.collectedAt)}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ofertas concorrentes" value={formatNumber(p.offersTotal ?? (p.offers.length || null))} hint="na mesma ficha de catálogo" />
          <Stat label="Menor preço observado" value={formatMoney(offerPrices[0] ?? null)} />
          <Stat label="Maior preço observado" value={formatMoney(offerPrices.at(-1) ?? null)} />
          <Stat label="Mais vendidos da categoria" value={data.bestsellerRank != null ? `${data.bestsellerRank}º lugar` : "Não listado"} hint="ranking oficial da fonte" />
        </div>
        <div className="card mt-4 p-5">
          <div className="mb-1 text-sm font-medium">Indicadores de demanda</div>
          <p className="text-sm leading-relaxed text-muted">
            <span className="badge mr-2 !h-5 !text-[11px]">Indicador indireto de interesse</span>
            {p.reviewsCount != null ? `${formatNumber(p.reviewsCount)} avaliações registradas na fonte.` : "A fonte não informou avaliações."}{" "}
            {data.bestsellerRank != null ? `O produto aparece em ${data.bestsellerRank}º no ranking de mais vendidos da categoria.` : ""} Volume de vendas: não disponível.
          </p>
        </div>
        {p.offers.length ? (
          <div className="card mt-4 overflow-hidden">
            <div className="border-b border-line px-5 py-3.5 text-sm font-medium">Ofertas comparáveis ({p.offers.length}{p.offersTotal && p.offersTotal > p.offers.length ? ` de ${p.offersTotal}` : ""})</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs text-faint"><th className="px-5 py-2.5 font-normal">Vendedor</th><th className="px-3 py-2.5 font-normal">Preço</th><th className="px-3 py-2.5 font-normal">Condição</th><th className="px-3 py-2.5 font-normal">Frete</th><th className="px-5 py-2.5 font-normal">Tipo</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {[...p.offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)).slice(0, 12).map((o) => (
                    <tr key={o.externalId}><td className="px-5 py-2.5 text-muted">{o.sellerName ?? (o.sellerId ? `ID ${o.sellerId}` : "Não informado")}{o.officialStore ? <span className="badge badge-brand ml-2 !h-5 !text-[10px]">Loja oficial</span> : null}</td>
                      <td className="tabular px-3 py-2.5 font-medium">{formatMoney(o.price, o.currency ?? "BRL")}</td>
                      <td className="px-3 py-2.5 text-muted">{o.condition === "new" ? "Novo" : o.condition === "used" ? "Usado" : "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{o.freeShipping == null ? "—" : o.freeShipping ? "Grátis" : "Pago"}</td>
                      <td className="px-5 py-2.5 text-muted">{o.listingType === "gold_pro" ? "Premium" : o.listingType === "gold_special" ? "Clássico" : o.listingType ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <p className="mt-4 text-sm text-muted">A fonte não retornou outras ofertas para comparação.</p>}
        {data.fees.length ? (
          <div className="card mt-4 p-5"><div className="mb-3 text-sm font-medium">Tarifas oficiais de venda para este preço <span className="font-normal text-faint">· API do Mercado Livre</span></div>
            <CompareBars data={data.fees.filter((f) => f.saleFeeAmount != null).map((f) => ({ name: f.listingTypeName, value: f.saleFeeAmount! }))} /></div>
        ) : null}
      </Section>

      <Section id="historico" title="Histórico de preços" hint="Somente observações reais armazenadas pelo Worthwise">
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Intervalo">
              {RANGES.map(([d, label]) => <button key={d} role="tab" aria-selected={range === d} onClick={() => setRange(d)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", range === d ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{label}</button>)}
            </div>
            <div className="flex gap-5 text-xs text-muted">
              <span>Menor <b className="tabular ml-1 font-medium text-fg">{hPrices.length ? formatMoney(Math.min(...hPrices)) : "—"}</b></span>
              <span>Maior <b className="tabular ml-1 font-medium text-fg">{hPrices.length ? formatMoney(Math.max(...hPrices)) : "—"}</b></span>
              <span>Variação <b className={cn("tabular ml-1 font-medium", variation == null ? "text-fg" : variation <= 0 ? "text-pos" : "text-neg")}>{variation == null || history.length < 2 ? "—" : `${variation > 0 ? "+" : ""}${formatPercent(variation)}`}</b></span>
            </div>
          </div>
          {history.length >= 2 ? <PriceHistoryChart data={history} />
            : <EmptyState icon={Bell} title={history.length === 1 ? "Primeira observação registrada" : "Sem observações neste intervalo"}>
                O histórico é construído com coletas reais ao longo do tempo — não preenchemos o gráfico com dados artificiais. Monitore o produto para acumular observações.
              </EmptyState>}
          <p className="mt-3 text-xs text-faint">{data.history.length} observação{data.history.length === 1 ? "" : "ões"} no total{data.history[0] ? ` · desde ${formatDate(data.history[0].date)}` : ""}.</p>
        </div>
      </Section>

      <Section id="rentabilidade" title="Rentabilidade" hint="Informe o custo de aquisição para simular">
        <ProfitCalculator initial={initialSim} onSave={saveSimulation} saving={savingSim} key={p.externalId} />
        <SimWatcher onChange={setSim} />
        {fee ? <p className="mt-3 text-xs text-faint">Comissão pré-preenchida com a tarifa oficial “{fee.listingTypeName}” consultada na API do Mercado Livre para este preço. Ajuste se usar outro tipo de anúncio.</p> : null}
      </Section>

      <Section id="fornecedores" title="Fornecedores">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="max-w-xl text-sm leading-relaxed text-muted">Cadastre cotações deste produto e compare fornecedores pelo custo final por unidade (preço + frete + impostos), com o status de verificação de cada um.</p>
          <Link href={`/app/comparar?produto=${encodeURIComponent(p.title.slice(0, 100))}&fonte=${source}&id=${id}`} className="btn btn-secondary">Comparar fornecedores</Link>
        </div>
      </Section>

      <Section id="riscos" title="Riscos e limitações">
        <ul className="space-y-2.5">
          {risks.map((r) => (
            <li key={r.text} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", r.level === "warn" ? "border-brand/30 bg-brand/5 text-soft" : "border-line text-muted")}>
              <AlertTriangle size={16} className={cn("mt-0.5 shrink-0", r.level === "warn" ? "text-brand" : "text-faint")} />{r.text}</li>
          ))}
        </ul>
      </Section>

      <WatchDialog product={ref} open={watchOpen} onOpenChange={setWatchOpen} />
    </div>
  );
}

/** Lê os valores atuais da calculadora (via evento) para alimentar o Score sem acoplar os componentes. */
function SimWatcher({ onChange }: { onChange: (i: ProfitInputs) => void }) {
  useEffect(() => {
    const on = (e: Event) => onChange({ ...DEFAULT_INPUTS, ...(e as CustomEvent<ProfitInputs>).detail });
    window.addEventListener("ww:simulation", on);
    return () => window.removeEventListener("ww:simulation", on);
  }, [onChange]);
  return null;
}
