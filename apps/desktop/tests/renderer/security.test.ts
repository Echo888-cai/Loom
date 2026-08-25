import { readFile } from "node:fs/promises"
import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"

describe("renderer document security", () => {
  it("restricts scripts to Loom's own renderer", async () => {
    const html = await readFile(new URL("../../src/renderer/index.html", import.meta.url), "utf8")
    const document = new JSDOM(html).window.document
    const policy = document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute("content")

    expect(policy, "renderer must declare a Content Security Policy").toBeTruthy()
    if (!policy) return
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).not.toContain("unsafe-eval")
  })
})
