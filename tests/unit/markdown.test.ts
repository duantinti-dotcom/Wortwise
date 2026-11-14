import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("markdown do blog", () => {
  it("renderiza títulos, listas, ênfase e links", () => {
    const html = renderMarkdown("## Título\n\nTexto **forte** e [link](https://exemplo.com).\n\n- a\n- b\n\n1. um\n2. dois");
    expect(html).toContain("<h2>Título</h2>");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain('<a href="https://exemplo.com" target="_blank" rel="noopener noreferrer">link</a>');
    expect(html).toContain("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(html).toContain("<ol>\n<li>um</li>");
  });
  it("escapa HTML e bloqueia esquemas perigosos (XSS)", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
  });
});
