import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { parseRange, spDay, spMidnight } from "@/lib/control/range";
import { cac, computeCosts, creditForecast, ltv } from "@/lib/control/finance";
import { toCsv } from "@/lib/control/csv";
import { actorHash, SCANNER_PATH, visitorHash } from "@/lib/control/identity";
import { parseGeckoCredits } from "@/lib/control/sources";
import { delta } from "@/lib/control/format";

const NOW = new Date("2026-11-16T15:00:00Z");

describe("filtro de período", () => {
  it("presets e padrão de 30 dias com período anterior do mesmo tamanho", () => {
    const r = parseRange({}, NOW);
    expect(r.key).toBe("30d");
    expect(r.to.getTime() - r.from.getTime()).toBe(30 * 86_400_000);
    expect(r.prevTo.getTime()).toBe(r.from.getTime());
    expect(parseRange({ r: "24h" }, NOW).bucket).toBe("day");
    expect(parseRange({ r: "365d" }, NOW).bucket).toBe("week");
  });
  it("intervalo personalizado em dias de Brasília, nunca no futuro", () => {
    const r = parseRange({ from: "2026-11-01", to: "2026-11-30" }, NOW);
    expect(r.key).toBe("custom");
    expect(r.from.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(r.to.getTime()).toBe(NOW.getTime());
    expect(parseRange({ from: "2026-12-01", to: "2026-11-01" }, NOW).key).toBe("30d");
    expect(spDay(spMidnight("2026-11-05"))).toBe("2026-11-05");
  });
});

describe("financeiro", () => {
  it("sem preço não calcula o item e marca como incompleto", () => {
    const r = computeCosts({}, { days: 30, feesCents: 500, feesEstimated: false, geckoCalls: 10, aiTokens: { m: { in: 1e6, out: 0 } }, expensesCents: 0 });
    expect(r.complete).toBe(false);
    expect(r.lines.find((l) => l.key === "gecko")!.cents).toBeNull();
    expect(r.lines.find((l) => l.key === "ai")!.cents).toBeNull();
  });
  it("com preços calcula IA, GeckoAPI e custo fixo proporcional", () => {
    const r = computeCosts({ usd_brl: 5, gecko: { brl_per_credit: 0.1 }, ai_prices_usd_per_mtok: { m: { in: 1, out: 2 } }, fixed_monthly: [{ name: "W", amount: 5, currency: "USD" }] },
      { days: 15, feesCents: 0, feesEstimated: false, geckoCalls: 100, aiTokens: { m: { in: 1e6, out: 1e6 } }, expensesCents: 1000 });
    expect(r.lines.find((l) => l.key === "ai")!.cents).toBe(1500);
    expect(r.lines.find((l) => l.key === "gecko")!.cents).toBe(1000);
    expect(r.lines.find((l) => l.key === "fixed:W")!.cents).toBe(1250);
    expect(r.complete).toBe(true);
  });
  it("CAC e LTV só com dados suficientes", () => {
    const base = { adsCents: 10000, newCustomers: 2, historyDays: 30, paid90dCents: 0, paying90d: 0, canceled90d: 0 };
    expect(cac(base).value).toBeNull();
    expect(cac({ ...base, newCustomers: 10 }).value).toBe(1000);
    expect(ltv(base).value).toBeNull();
    expect(ltv({ ...base, historyDays: 120, paid90dCents: 3 * 20 * 1990, paying90d: 20, canceled90d: 3 }).value).toBe(39800);
  });
  it("previsão de esgotamento pelo ritmo de 7 dias", () => {
    expect(creditForecast(100, 70).daysLeft).toBe(10);
    expect(creditForecast(100, 0, 0).daysLeft).toBeNull();
    expect(creditForecast(null, 7).daysLeft).toBeNull();
  });
  it("variação sem base anterior é nula", () => {
    expect(delta(10, 0)).toBeNull();
    expect(delta(15, 10)).toBe(50);
  });
});

describe("utilitários", () => {
  it("CSV com ; e proteção contra fórmulas", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: "x;y", c: -5 }]);
    expect(csv.startsWith("﻿a;b;c")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"x;y"');
    expect(csv).toContain(";-5");
  });
  it("hashes não revelam o IP e o de visitante muda por dia", async () => {
    const a = await actorHash("s", "1.2.3.4");
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(await visitorHash("s", "2026-11-01", "1.2.3.4", "ua")).not.toBe(await visitorHash("s", "2026-11-02", "1.2.3.4", "ua"));
  });
  it("detecta caminhos de varredura sem afetar rotas reais", () => {
    for (const p of ["/wp-login.php", "/.env", "/.git/config", "/phpmyadmin/", "/xmlrpc.php"]) expect(SCANNER_PATH.test(p)).toBe(true);
    for (const p of ["/", "/app", "/admin", "/precos", "/api/search", "/blog/x"]) expect(SCANNER_PATH.test(p)).toBe(false);
  });
  it("lê o formato oficial de /v1/me/credits", () => {
    expect(parseGeckoCredits({ userId: "u", currentCredits: 123, planId: "developer", creditsConsumed: { last24Hours: 7, last7Days: 21, last30Days: 55 } }))
      .toMatchObject({ currentCredits: 123, last24Hours: 7, last7Days: 21, last30Days: 55, planId: "developer" });
    expect(parseGeckoCredits({ message: "Unauthorized" })).toBeNull();
  });
});
