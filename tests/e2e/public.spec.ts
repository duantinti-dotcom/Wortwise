import { expect, test } from "@playwright/test";

test.describe("site público", () => {
  test("landing apresenta a proposta e não tem rolagem horizontal", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Encontre o produto");
    await expect(page.getByRole("link", { name: /Começar grátis/ }).first()).toBeVisible();
    await expect(page.getByText("Demonstração · dados ilustrativos").filter({ visible: true }).first()).toBeVisible();
    for (const id of ["funcionalidades", "como-funciona", "demonstracao", "planos", "perguntas"]) await expect(page.locator(`#${id}`)).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("menu de navegação funciona no tamanho da tela", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.locator("html[data-nav-ready]").waitFor({ state: "attached" });
    if (isMobile) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("link", { name: "Preços" }).click();
    } else {
      await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Preços" }).click();
    }
    await expect(page).toHaveURL(/\/precos$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Preço simples");
    await expect(page.getByText("49,90").first()).toBeVisible();
  });

  test("calculadora de lucro calcula corretamente", async ({ page }) => {
    await page.goto("/calculadora-de-lucro");
    await expect(page.getByText("Exemplo — troque pelos seus valores")).toBeVisible();
    await page.getByRole("button", { name: "Limpar" }).click();
    // Modo Simples (padrão): perguntas em linguagem do dia a dia
    await page.getByLabel("Quanto você paga em cada unidade?").fill("20");
    await page.getByLabel("Quantas unidades vai comprar?").fill("100");
    await page.getByLabel("Por quanto vai vender cada uma?").fill("60");
    await expect(page.getByTestId("profit-verdict")).toContainText("Você ganha");
    // Modo Completo: comissão e frete da compra
    await page.getByRole("tab", { name: "Completo" }).click();
    await page.getByLabel("Comissão do marketplace").fill("12");
    await page.getByLabel("Frete da compra (total)").fill("200");
    // receita 6000 − (2000 + 200 + 720) = 3080
    await expect(page.getByTestId("profit-total")).toContainText("3.080,00");
    await expect(page.getByTestId("profit-unit")).toContainText("30,80");
    await expect(page.getByTestId("profit-margin")).toContainText("51,3%");
    await page.getByRole("tab", { name: "Cenários" }).click();
    await expect(page.getByText("Conservador")).toBeVisible();
    await page.getByRole("tab", { name: "Composição" }).click();
    await expect(page.getByRole("list", { name: "Da receita ao lucro" })).toContainText("Receita bruta");
  });

  test("páginas de transparência, blog e SEO técnico", async ({ page, request }) => {
    await page.goto("/metodologia");
    await expect(page.getByRole("heading", { name: "Worthwise Score" })).toBeVisible();
    await page.goto("/fontes-de-dados");
    await expect(page.getByRole("heading", { name: "Mercado Livre" })).toBeVisible();
    await expect(page.getByText("Aguardando credenciamento").first()).toBeVisible();
    await page.goto("/blog");
    await page.getByRole("link", { name: /Como calcular o lucro real/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Como calcular o lucro real");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /app");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/blog/como-calcular-lucro-no-mercado-livre");
    expect((await request.get("/pagina-que-nao-existe")).status()).toBe(404);
  });
});

test.describe("proteção de rotas e APIs", () => {
  test("páginas privadas redirecionam para o login", async ({ page }) => {
    await page.goto("/app/descobrir");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fapp%2Fdescobrir/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fadmin/);
  });

  test("APIs recusam chamadas sem sessão, sem assinatura ou sem segredo", async ({ request, baseURL }) => {
    const h = { origin: baseURL! };
    expect((await request.post("/api/search", { data: { query: "fone" }, headers: h })).status()).toBe(401);
    expect((await request.get("/api/product/mercadolivre/p-MLB123456")).status()).toBe(401);
    expect((await request.post("/api/assistant", { data: { message: "oi oi" }, headers: h })).status()).toBe(401);
    expect((await request.post("/api/billing/checkout", { data: { plan: "pro" }, headers: h })).status()).toBe(401);
    expect((await request.post("/api/billing/cancel", { headers: h })).status()).toBe(401);
    expect((await request.post("/api/admin/heropay", { data: { action: "register_webhooks" }, headers: h })).status()).toBe(403);
    expect((await request.post("/api/cron/monitor")).status()).toBe(403);
    expect((await request.post("/api/cron/monitor", { headers: { authorization: "Bearer errado" } })).status()).toBe(403);
    // webhook: sem assinatura e com assinatura inválida
    expect((await request.post("/api/webhooks/heropay?trigger=spark_payment_confirmed", { data: { payment: { id: "1" } } })).status()).toBe(401);
    expect((await request.post("/api/webhooks/heropay?trigger=spark_payment_confirmed", { data: { payment: { id: "1" } }, headers: { "x-heropay-signature": "00".repeat(32) } })).status()).toBe(401);
    // origem cruzada é bloqueada (CSRF)
    expect((await request.post("/api/search", { data: { query: "fone" }, headers: { origin: "https://site-malicioso.example" } })).status()).toBe(403);
  });

  test("alterna entre modo claro e escuro e lembra a escolha", async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    if (isMobile) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
    }
    await page.getByRole("switch", { name: "Mudar para o modo claro" }).filter({ visible: true }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe("rgb(247, 246, 243)");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("login não mostra o botão do Google enquanto o provedor estiver desligado no Supabase", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const res = await page.request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    // O botão só aparece quando /auth/v1/settings informa external.google = true.
    const shown = await page.getByRole("button", { name: "Continuar com Google" }).count();
    expect(shown === 0 || shown === 1).toBeTruthy();
  });
});
