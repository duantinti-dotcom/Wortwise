import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// Carrega .env.local (credenciais do usuário de teste e segredos locais) sem dependências extras.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
const PORT = Number(process.env.E2E_PORT ?? 3100);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "pt-BR", proxy, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: { command: `npx next start -p ${PORT}`,
    // Em ambientes atrás de proxy corporativo, o Node só usa HTTPS_PROXY com esta variável.
    env: { ...(process.env as Record<string, string>), NODE_USE_ENV_PROXY: "1" }, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
