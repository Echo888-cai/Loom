import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createReadFileTool } from "../../src/tools/read-file.js"
import type { ToolContext } from "../../src/tools/types.js"

async function context(root: string): Promise<ToolContext> {
  const rawDir = join(root, "raw")
  await mkdir(rawDir, { recursive: true })
  return { workspaceRoot: root, taskId: "task-read", signal: new AbortController().signal, maxOutputChars: 20, rawDir }
}

describe("read_file", () => {
  it("reads a selected line range", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-read-"))
    await writeFile(join(root, "file.txt"), "one\ntwo\nthree\n")

    const result = await createReadFileTool().execute(await context(root), { path: "file.txt", startLine: 2, endLine: 2 })

    expect(result.ok).toBe(true)
    expect(result.content).toContain("2|two")
    expect(result.content).not.toContain("1|one")
  })

  it("returns a bounded preview and raw reference for large output", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-read-"))
    await writeFile(join(root, "large.txt"), "1234567890abcdefghijKLMNOPQRST")

    const result = await createReadFileTool().execute(await context(root), { path: "large.txt" })

    expect(result.ok).toBe(true)
    expect(result.metadata?.truncated).toBe(true)
    expect(result.rawRef).toBeDefined()
    await expect(readFile(result.rawRef as string, "utf8")).resolves.toContain("KLMNOPQRST")
  })

  it("returns a structured error for a missing file", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-read-"))

    const result = await createReadFileTool().execute(await context(root), { path: "missing.txt" })

    expect(result.ok).toBe(false)
    expect(result.content).toContain("not found")
  })
})
