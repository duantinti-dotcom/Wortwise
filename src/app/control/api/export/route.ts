import { NextResponse } from "next/server";
import { getControlSession } from "@/lib/control/auth";
import { toCsv } from "@/lib/control/csv";
import { parseRange, spDay } from "@/lib/control/range";
import { supabaseServer } from "@/lib/supabase/server";

const DATASETS = ["payments", "expenses", "security_events", "metrics", "incidents"] as const;

/** Exportação CSV (somente donos com MFA). Cada exportação fica registrada na auditoria. */
export async function GET(req: Request) {
  const s = await getControlSession();
  if (s.state !== "ok") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") as (typeof DATASETS)[number];
  if (!DATASETS.includes(dataset)) return NextResponse.json({ error: "invalid_dataset" }, { status: 400 });
  const range = parseRange(Object.fromEntries(url.searchParams.entries()));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("control_export", { p_dataset: dataset, p_from: range.from.toISOString(), p_to: range.to.toISOString() });
  if (error) return NextResponse.json({ error: /forbidden|mfa/.test(error.message) ? "forbidden" : "unavailable" }, { status: /forbidden|mfa/.test(error.message) ? 403 : 502 });
  const rows = (data as Record<string, unknown>[]) ?? [];
  await supabase.rpc("control_audit", { p_action: "export.csv", p_target: dataset, p_details: { from: range.from, to: range.to, rows: rows.length } });
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="worthwise-${dataset}-${spDay(range.from)}-a-${spDay(range.to)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
