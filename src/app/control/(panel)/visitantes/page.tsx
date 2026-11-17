import type { Metadata } from "next";
import { TimeChart } from "@/components/control/charts";
import { DataTable } from "@/components/control/table";
import { Grid, Kpi, Notice, Panel, RankBars, Status } from "@/components/control/ui";
import { controlRpc, requireControl } from "@/lib/control/auth";
import { dateTime, int, planLabel, relative } from "@/lib/control/format";
import { parseRange } from "@/lib/control/range";
import { LoadError, RangeMeta, safe, type SP } from "../shared";

export const metadata: Metadata = { title: "Visitantes e cadastros" };

interface Visitors {
  visits: { at: string; vhash: string; path: string | null; country: string | null; device: string | null; referrer: string | null }[];
  visits_total: number; visitors_total: number; tracking_since: string | null;
  by_hour: { hour: number; visits: number }[];
  top_pages: { path: string | null; n: number }[];
  top_referrers: { referrer: string; n: number }[];
  devices: { device: string; n: number }[];
  signups: { id: string; email: string; name: string | null; at: string; provider: string; confirmed: boolean; last_sign_in: string | null; plan: string }[];
  signups_total: number;
  generated_at: string;
}

const DEVICE: Record<string, string> = { mobile: "Celular", desktop: "Computador", tablet: "Tablet", outro: "Outro" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireControl("overview");
  const params = await searchParams;
  const range = parseRange(params);
  const res = await safe(controlRpc<Visitors>("control_visitors", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }));
  if (!res.ok) return <LoadError e={res.error} />;
  const v = res.data;

  return (
    <>
      <div className="mb-7">
        <span className="c-eyebrow">tráfego e aquisição</span>
        <h1 className="c-h1 text-[30px]">Visitantes e cadastros</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2"><RangeMeta range={range} generatedAt={v.generated_at} /></div>
      </div>

      {v.tracking_since && new Date(v.tracking_since) > range.from && (
        <Notice tone="neutral" className="mb-4">Visitas com horário registradas desde {dateTime(v.tracking_since)}. Antes disso só existe o total diário (Visão executiva).</Notice>
      )}

      <Grid cols={4}>
        <Kpi label="Cadastros no período" value={int(v.signups.length)} sub={`${int(v.signups_total)} contas no total`} />
        <Kpi label="Visitas no período" value={int(v.visits_total)} sub="páginas vistas com horário" />
        <Kpi label="Visitantes (por dia)" value={int(v.visitors_total)} sub="código anônimo diário" hint="O mesmo visitante em dias diferentes conta mais de uma vez." />
        <Kpi label="Último cadastro" value={v.signups[0] ? relative(v.signups[0].at) : "—"} sub={v.signups[0]?.email ?? "nenhum no período"} goodWhen="none" />
      </Grid>

      <Panel className="mt-4" title="Cadastros" description="Contas criadas no período, com e-mail e horário (Brasília). Use a busca ou exporte em CSV.">
        <DataTable csvName="cadastros" pageSize={25} initialSort={{ key: "at", dir: "desc" }}
          filters={[{ key: "provider", label: "Login", options: [{ value: "google", label: "Google" }, { value: "email", label: "E-mail" }] }]}
          columns={[{ key: "at", label: "Data e hora" }, { key: "email", label: "E-mail" }, { key: "name", label: "Nome", hideBelow: "md" },
            { key: "provider", label: "Login", hideBelow: "sm" }, { key: "plan", label: "Plano" }, { key: "confirmed", label: "Confirmado", hideBelow: "lg" }, { key: "last", label: "Último acesso", hideBelow: "lg" }]}
          empty="Nenhum cadastro no período."
          rows={v.signups.map((s) => ({ id: s.id, values: { at: s.at, email: s.email, name: s.name, provider: s.provider, plan: planLabel(s.plan), confirmed: s.confirmed ? "sim" : "não", last: s.last_sign_in },
            cells: {
              at: <span className="c-num whitespace-nowrap">{dateTime(s.at)}</span>,
              email: <span className="c-fg">{s.email}</span>,
              provider: s.provider === "google" ? "Google" : "E-mail",
              confirmed: s.confirmed ? <Status tone="good">Sim</Status> : <Status tone="warn">Não</Status>,
              last: s.last_sign_in ? <span className="whitespace-nowrap">{relative(s.last_sign_in)}</span> : undefined,
            } }))} />
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Visitas por horário" description="Hora do dia (Brasília), somando o período.">
          <TimeChart title="Visitas por hora" x="hour" mode="hour" height={220} data={v.by_hour} series={[{ key: "visits", label: "Visitas", color: 1, kind: "bar" }]} />
        </Panel>
        <Panel title="Aparelhos">
          <RankBars rows={v.devices.map((d) => ({ label: DEVICE[d.device] ?? d.device, value: d.n }))} empty="Sem visitas registradas." />
          <div className="c-label mb-2 mt-6">De onde vieram</div>
          <RankBars rows={v.top_referrers.map((r) => ({ label: r.referrer, value: r.n }))} color="#3d8bff" empty="—" />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Páginas mais vistas">
          <RankBars rows={v.top_pages.map((p) => ({ label: <span className="c-mono">{p.path ?? "—"}</span>, value: p.n }))} empty="Sem visitas registradas." />
        </Panel>
        <Panel className="xl:col-span-2" title="Cada visita" description="Horário, página, país, aparelho e origem. O código identifica o mesmo visitante só dentro do mesmo dia (sem IP, sem cookie).">
          <DataTable csvName="visitas" pageSize={25} initialSort={{ key: "at", dir: "desc" }} empty="Nenhuma visita registrada no período."
            filters={[{ key: "device", label: "Aparelho", options: Object.entries(DEVICE).map(([value, label]) => ({ value, label })) }]}
            columns={[{ key: "at", label: "Horário" }, { key: "path", label: "Página" }, { key: "country", label: "País", hideBelow: "sm" },
              { key: "device", label: "Aparelho", hideBelow: "sm" }, { key: "referrer", label: "Origem", hideBelow: "md" }, { key: "vhash", label: "Visitante", hideBelow: "lg" }]}
            rows={v.visits.map((x, i) => ({ id: String(i), values: { at: x.at, path: x.path, country: x.country, device: x.device, referrer: x.referrer ?? "Direto", vhash: x.vhash },
              cells: { at: <span className="c-num whitespace-nowrap">{dateTime(x.at)}</span>, path: x.path ? <span className="c-mono">{x.path}</span> : undefined,
                device: x.device ? DEVICE[x.device] ?? x.device : undefined, vhash: <span className="c-mono c-faint">{x.vhash.slice(0, 8)}</span> } }))} />
        </Panel>
      </div>
    </>
  );
}
