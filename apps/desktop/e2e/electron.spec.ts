import { _electron as electron, expect, test } from "@playwright/test"
import { resolve } from "node:path"

test("opens the Loom workbench without exposing Node to the renderer", async () => {
  const app = await electron.launch({ args: [resolve(import.meta.dirname, "../out/main/index.js")] })
  try {
    const window = await app.firstWindow()
    await expect(window.getByRole("main", { name: "Code workspace" })).toBeVisible()
    await expect(window.getByRole("complementary", { name: "Agent Console" })).toBeVisible()
    await expect(window.evaluate(() => typeof window.process)).resolves.toBe("undefined")
  } finally {
    await app.close()
  }
})
