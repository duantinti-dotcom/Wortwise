import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/db/**/*.test.ts"], testTimeout: 60000, hookTimeout: 120000, fileParallelism: false },
});
