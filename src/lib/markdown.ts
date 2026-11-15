/**
 * Renderizador mínimo e seguro de Markdown para o blog (títulos, parágrafos, listas, negrito, itálico, links).
 * Todo o texto é escapado antes; apenas links http(s) e internos são permitidos.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw: string): string {
  return esc(raw)
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, (_m, text: string, href: string) => {
      const external = href.startsWith("http");
      return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
    if (list) { out.push(`</${list}>`); list = null; }
  };
  let table: string[][] | null = null;
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const [head, ...body] = rows;
    if (head) out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    table = null;
  };
  for (const line of md.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) { flush(); (table ??= []).push(t.slice(1, -1).split("|").map((c) => c.trim())); continue; }
    flushTable();
    const h = /^(#{2,3})\s+(.*)$/.exec(t);
    const ul = /^[-*]\s+(.*)$/.exec(t);
    const ol = /^\d+\.\s+(.*)$/.exec(t);
    if (!t) flush();
    else if (h) { flush(); out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`); }
    else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
      if (list !== kind) { if (list) out.push(`</${list}>`); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul ?? ol)![1]!)}</li>`);
    } else { if (list) { out.push(`</${list}>`); list = null; } para.push(t); }
  }
  flush();
  flushTable();
  return out.join("\n");
}

export function readingMinutes(md: string): number {
  return Math.max(1, Math.round(md.split(/\s+/).length / 200));
}
