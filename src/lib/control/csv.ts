/** CSV compatível com Excel em pt-BR: separador ";", BOM UTF-8 e proteção contra injeção de fórmulas. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const cell = (v: unknown): string => {
    if (v == null) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Células iniciadas por = + - @ viram texto (evita execução de fórmulas ao abrir a planilha).
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))];
  return "﻿" + lines.join("\r\n");
}
