import { createHmac } from "node:crypto";
import { devices, expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const WEBHOOK_SECRET = process.env.HEROPAY_WEBHOOK_SECRET ?? "";

test.describe.configure({ mode: "serial" });
test.skip(!EMAIL || !PASSWORD, "Defina E2E_EMAIL e E2E_PASSWORD (usuário de teste confirmado) em .env.local");

async function login(page: Page) {
  await page.goto("/entrar");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("E-mail").fill(EMAIL!);
  await page.getByLabel("Senha").fill(PASSWORD!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => { await login(page); });

test("login com senha incorreta mostra erro claro", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/entrar");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("E-mail").fill(EMAIL!);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("E-mail ou senha incorretos");
  await ctx.close();
});

test("dashboard personalizado, sem dados fictícios, com as três pesquisas gratuitas", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/(Bom dia|Boa tarde|Boa noite), Teste/);
  await expect(page.getByText("Plano Grátis").first()).toBeVisible();
  await expect(page.getByText(/3 pesquisas disponíveis no total/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Aplicação" }).getByRole("link")).toHaveCount(12);
});

test("pesquisa sem fonte conectada informa o estado real e não consome crédito", async ({ page }) => {
  await page.goto("/app/descobrir");
  await page.getByLabel("Termo de pesquisa").fill("fone bluetooth");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("Nenhum crédito foi consumido");
  await expect(page.getByText(/Mercado Livre · não configurado/).first()).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText(/3 pesquisas disponíveis no total/)).toBeVisible();
});

test("usuário comum não acessa a administração", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  const res = await page.request.post("/api/admin/heropay", { data: { action: "register_webhooks" }, headers: { origin: new URL(page.url()).origin } });
  expect(res.status()).toBe(403);
});

test("simulação de lucro é salva e respeita a cota do plano", async ({ page }) => {
  await page.goto("/app/calculadora");
  await page.getByLabel("Preço de aquisição (un.)").fill("18");
  await page.getByLabel("Preço de venda (un.)").fill("49,90");
  await page.getByLabel("Quantidade").fill("100");
  const name = `Teste E2E ${Date.now()}`;
  page.once("dialog", (d) => d.accept(name));
  await page.getByRole("button", { name: "Salvar simulação" }).click();
  await expect(page.getByText("Simulação salva")).toBeVisible();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Excluir ${name}` }).click();
  await expect(page.getByText("Simulação excluída")).toBeVisible();
});

test("fornecedor: cadastro, verificação real de CNPJ e comparação pelo custo total", async ({ page }) => {
  await page.goto("/app/fornecedores");
  const name = `Fornecedor E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Adicionar fornecedor" }).first().click();
  await page.getByLabel("Nome comercial *").fill(name);
  await page.getByLabel("CNPJ").fill("00.000.000/0001-91"); // Banco do Brasil — CNPJ público, usado só para validar a consulta
  await page.getByRole("button", { name: "Salvar fornecedor" }).click();
  const card = page.locator("article", { hasText: name });
  await expect(card.getByText("Fornecedor ainda não verificado")).toBeVisible();
  await card.getByRole("button", { name: "Verificar CNPJ" }).click();
  await expect(card.getByText("Verificação documental realizada")).toBeVisible({ timeout: 30_000 });

  await page.goto("/app/comparar");
  const comparison = `Comparação E2E ${Date.now()}`;
  const add = async (supplier: string, price: string, freight: string | null) => {
    await page.getByRole("button", { name: /Adicionar (a primeira )?cotação/ }).first().click();
    await page.getByLabel("Nome da comparação").fill(comparison);
    await page.getByLabel("Nome do fornecedor").fill(supplier);
    await page.getByLabel("Preço unitário (R$) *").fill(price);
    await page.getByLabel("Quantidade *").fill("100");
    if (freight) { await page.getByLabel("Frete total (R$)").fill(freight); await page.getByLabel("Impostos totais (R$)").fill("0"); }
    await page.getByRole("button", { name: "Salvar cotação" }).click();
    await expect(page.locator("tr", { hasText: supplier })).toBeVisible();
  };
  await add("Barato com frete caro", "10", "600"); // 16,00/un
  await add("Mais caro, frete baixo", "12", "100"); // 13,00/un
  await add("Sem frete informado", "9", null); // parcial
  const best = page.locator("tr", { hasText: "Mais caro, frete baixo" });
  await expect(best).toContainText("13,00");
  await expect(best).toContainText("menor custo total");
  await expect(page.locator("tr", { hasText: "Barato com frete caro" })).toContainText("16,00");
  await expect(page.locator("tr", { hasText: "Sem frete informado" })).toContainText("parcial");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Excluir cotação" }).first().click();
  await page.goto("/app/fornecedores");
  page.once("dialog", (d) => d.accept());
  await page.locator("article", { hasText: name }).getByRole("button", { name: `Excluir ${name}` }).click();
  await expect(page.getByText("Fornecedor excluído")).toBeVisible();
});

test("coleções: plano grátis permite uma e oferece upgrade na segunda", async ({ page }) => {
  await page.goto("/app/favoritos");
  const create = async (n: string) => {
    await page.getByRole("button", { name: "Nova coleção" }).click();
    await page.getByLabel("Nome").fill(n);
    await page.getByRole("button", { name: "Criar coleção" }).click();
  };
  const first = `Produtos para testar ${Date.now()}`;
  await create(first);
  await expect(page.getByText("Coleção criada")).toBeVisible();
  await create("Segunda coleção");
  await expect(page.getByRole("dialog")).toContainText("limite de coleções");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: new RegExp(first) }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir coleção" }).click();
  await expect(page.getByText("Coleção excluída")).toBeVisible();
});

test("assinatura: plano só muda por webhook assinado; duplicata é ignorada; estorno revoga", async ({ page }) => {
  test.skip(!WEBHOOK_SECRET, "HEROPAY_WEBHOOK_SECRET ausente");
  await page.goto("/app/configuracoes");
  await expect(page.getByText("Plano Grátis").first()).toBeVisible();
  // checkout ainda sem link configurado: nada é ativado
  const origin = new URL(page.url()).origin;
  const checkout = await page.request.post("/api/billing/checkout", { data: { plan: "pro" }, headers: { origin } });
  expect([200, 503]).toContain(checkout.status());

  const id = `e2e-${Date.now()}`;
  const send = (trigger: string, payload: object, secret = WEBHOOK_SECRET) => {
    const body = JSON.stringify(payload);
    return page.request.post(`/api/webhooks/heropay?trigger=${trigger}`, {
      data: body, headers: { "content-type": "application/json", "x-heropay-signature": createHmac("sha256", secret).update(body).digest("hex") } });
  };
  const payload = { buyer: { email: EMAIL }, payment: { id, value: "49.90", method: "pix", status: "paid", net_value_cents: "4990", date: new Date().toISOString() },
    cart: { src: "" }, subscription: { id: `sub-${id}`, status: "active", next_invoice_at: "" } };

  expect((await send("spark_payment_confirmed", payload, "segredo-errado")).status()).toBe(401);
  const underpaid = await send("spark_payment_confirmed", { ...payload, payment: { ...payload.payment, id: `${id}-low`, value: "1.00" } });
  expect(["amount_mismatch", "unknown_plan"]).toContain((await underpaid.json()).outcome);
  await page.reload();
  await expect(page.getByText("Plano Grátis").first()).toBeVisible();

  const ok = await send("spark_payment_confirmed", payload);
  expect(ok.status()).toBe(200);
  expect((await ok.json()).outcome).toBe("activated");
  expect((await (await send("spark_payment_confirmed", payload)).json()).outcome).toBe("duplicate");
  await page.reload();
  await expect(page.getByText("Plano Pro").first()).toBeVisible();
  await expect(page.getByText(/0 \/ 300/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Pago" }).first()).toBeVisible();

  expect((await (await send("refunded", payload)).json()).outcome).toBe("revoked");
  await page.reload();
  await expect(page.getByText("Plano Grátis").first()).toBeVisible();
});

test("cron autenticado executa o monitoramento e a retenção", async ({ page }) => {
  const secret = process.env.CRON_SECRET;
  test.skip(!secret, "CRON_SECRET ausente");
  const monitor = await page.request.post("/api/cron/monitor", { headers: { authorization: `Bearer ${secret}` } });
  expect(monitor.status()).toBe(200);
  expect(await monitor.json()).toMatchObject({ task: "monitor" });
  const purge = await page.request.post("/api/cron/purge", { headers: { authorization: `Bearer ${secret}` } });
  expect(purge.status()).toBe(200);
});

test("no celular, nenhuma tela do app fica mais larga que a tela", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await login(page);
  for (const path of ["", "/descobrir", "/oportunidades", "/mercado", "/fornecedores", "/comparar", "/calculadora", "/monitoramento", "/assistente", "/favoritos", "/relatorios", "/configuracoes"]) {
    await page.goto(`/app${path}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(extra, `largura extra em /app${path}`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await ctx.close();
});

test("logout encerra a sessão", async ({ page }) => {
  await page.getByRole("button", { name: "Menu do perfil" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar/);
});
