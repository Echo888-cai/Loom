import { describe, expect, it } from "vitest"
import { DefaultToolRegistry } from "../../src/tools/registry.js"

describe("DefaultToolRegistry", () => {
  it("exposes read_file and search schemas", () => {
    const registry = new DefaultToolRegistry()

    expect(registry.schemas().map((schema) => schema.function.name)).toEqual(["read_file", "search", "edit_file"])
  })

  it("rejects an unknown tool name", async () => {
    const registry = new DefaultToolRegistry()
    const context = { workspaceRoot: "/tmp", taskId: "task", signal: new AbortController().signal, maxOutputChars: 100, rawDir: "/tmp" }

    await expect(registry.execute("unknown", context, {})).resolves.toMatchObject({ ok: false })
  })
})
