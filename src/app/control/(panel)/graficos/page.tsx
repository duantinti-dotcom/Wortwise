import type { Metadata } from "next";
import { StockWorkbench, type MetricDef } from "@/components/control/stock-chart";
import { Panel } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { parseRange, spDay } from "@/lib/control/range";
import { LoadError, RangeMeta, safe, type SP } from "../shared";

export const metadata: Metadata = { title: "Gráficos" };

const METRICS: MetricDef[] = [
  { key: "revenue", label: "Receita paga", group: "Dinheiro", unit: "cents" },
  { key: "net", label: "Receita líquida", group: "Dinheiro", unit: "cents" },
  { key: "visitors", label: "Visitantes", group: "Tráfego", unit: "int" },
  { key: "pageviews", label: "Páginas vistas", group: "Tráfego", unit: "int" },
  { key: "signups", label: "Cadastros", group: "Tráfego", unit: "int" },
  { key: "gecko", label: "Consultas GeckoAPI", group: "Operação", unit: "int", goodWhen: "down" },
  { key: "ai", label: "Respostas da IA", group: "Operação", unit: "int" },
  { key: "security", label: "Eventos de segurança", group: "Segurança", unit: "int", goodWhen: "down" },
];

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("overview");
  const params = await searchParams;
  const range = parseRange(params);
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString() };
  const [ov, gk, ai, sec, vis] = await Promise.all([
    safe(controlRpc<{ series: { day: string; revenue: number; net: number; signups: number; visitors: number | null }[] }>("control_overview", args)),
    safe(controlRpc<{ claimed: { day: string; calls: number }[] }>("control_gecko", args)),
    safe(controlRpc<{ by_day: { day: string; responses: number }[] }>("control_ai", args)),
    safe(controlRpc<{ by_day: { day: string; suspicious: number | null; blocked: number | null; incident: number | null }[] }>("control_security", args)),
    safe(controlRpc<{ visits: { at: string }[] }>("control_visitors", args)),
  ]);
  if (!ov.ok) return <LoadError e={ov.error} />;

  const rows = ov.data.series.map((d) => ({ day: d.day, revenue: d.revenue, net: d.net, visitors: d.visitors ?? 0, signups: d.signups, pageviews: 0, gecko: 0, ai: 0, security: 0 }));
  const at = new Map(rows.map((r) => [r.day, r]));
  if (gk.ok) for (const c of gk.data.claimed) { const r = at.get(c.day); if (r) r.gecko = c.calls; }
  if (ai.ok) for (const c of ai.data.by_day) { const r = at.get(c.day); if (r) r.ai += c.responses; }
  if (sec.ok) for (const c of sec.data.by_day) { const r = at.get(c.day); if (r) r.security = (c.suspicious ?? 0) + (c.blocked ?? 0) + (c.incident ?? 0); }
  if (vis.ok) for (const v of vis.data.visits) { const r = at.get(spDay(new Date(v.at))); if (r) r.pageviews++; }

  return (
    <>
      <div className="mb-7">
        <span className="c-eyebrow">terminal de métricas</span>
        <h1 className="c-h1 text-[30px]">Gráficos</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} /></div>
      </div>
      <Panel>
        <StockWorkbench data={rows} metrics={METRICS} />
      </Panel>
    </>
  );
}
