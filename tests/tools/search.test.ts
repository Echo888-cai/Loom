import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createSearchTool } from "../../src/tools/search.js"
import type { ToolContext } from "../../src/tools/types.js"

async function context(root: string): Promise<ToolContext> {
  const rawDir = join(root, "raw")
  await mkdir(rawDir, { recursive: true })
  return { workspaceRoot: root, taskId: "task-search", signal: new AbortController().signal, maxOutputChars: 200, rawDir }
}

describe("search", () => {
  it("returns matching files, line numbers, and context", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-search-"))
    await writeFile(join(root, "a.ts"), "const token = true\n")
    await writeFile(join(root, "b.ts"), "const other = false\n")

    const result = await createSearchTool().execute(await context(root), { query: "token", globs: ["*.ts"] })

    expect(result.ok).toBe(true)
    expect(result.content).toContain("a.ts:1")
    expect(result.content).toContain("token")
  })

  it("returns an empty successful result when there are no matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-search-"))
    await writeFile(join(root, "a.ts"), "const value = true\n")

    const result = await createSearchTool().execute(await context(root), { query: "missing" })

    expect(result.ok).toBe(true)
    expect(result.content).toBe("No matches found.")
  })
})
