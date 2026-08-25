import { defineConfig } from "@playwright/test"

/** Playwright 只执行 e2e，不能把 Vitest 的 jsdom 文件误当作浏览器用例。 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
})
