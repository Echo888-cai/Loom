import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createEditFileTool } from "../../src/tools/edit-file.js"
import type { EventRecord, EventStore } from "../../src/events/types.js"
import type { ToolContext } from "../../src/tools/types.js"

class MemoryEventStore implements EventStore {
  readonly events: EventRecord[] = []
  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const event = { seq: this.events.length + 1, timestamp: new Date(0).toISOString(), taskId, type, data } as EventRecord<T>
    this.events.push(event)
    return event
  }
  async readAll(): Promise<EventRecord[]> { return this.events }
}

async function context(root: string, eventStore?: EventStore): Promise<ToolContext> {
  const rawDir = join(root, "raw")
  await mkdir(rawDir, { recursive: true })
  return { workspaceRoot: root, taskId: "task-edit", signal: new AbortController().signal, maxOutputChars: 200, rawDir, ...(eventStore ? { eventStore } : {}) }
}

describe("edit_file", () => {
  it("replaces exactly one match, preserves the final newline, and returns a diff", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-edit-"))
    await writeFile(join(root, "file.ts"), "const value = 1\n")
    const events = new MemoryEventStore()

    const result = await createEditFileTool().execute(await context(root, events), { path: "file.ts", oldText: "const value = 1", newText: "const value = 2" })

    expect(result.ok).toBe(true)
    expect(await readFile(join(root, "file.ts"), "utf8")).toBe("const value = 2\n")
    expect(result.metadata).toMatchObject({ changed: true, matchCount: 1 })
    expect(result.metadata?.diff).toContain("-const value = 1")
    expect(result.metadata?.diff).toContain("+const value = 2")
    expect(events.events.map((event) => event.type)).toEqual(["file.changed"])
  })

  it("refuses zero matches without changing the file", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-edit-"))
    const original = "const value = 1\n"
    await writeFile(join(root, "file.ts"), original)

    const result = await createEditFileTool().execute(await context(root), { path: "file.ts", oldText: "missing", newText: "changed" })

    expect(result.ok).toBe(false)
    expect(result.content).toContain("exactly once")
    expect(await readFile(join(root, "file.ts"), "utf8")).toBe(original)
  })

  it("refuses multiple matches without changing the file", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-edit-"))
    const original = "value\nvalue\n"
    await writeFile(join(root, "file.txt"), original)

    const result = await createEditFileTool().execute(await context(root), { path: "file.txt", oldText: "value", newText: "changed" })

    expect(result.ok).toBe(false)
    expect(result.content).toContain("matched 2")
    expect(await readFile(join(root, "file.txt"), "utf8")).toBe(original)
  })

  it("refuses protected paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-edit-"))
    await mkdir(join(root, ".git"))
    await writeFile(join(root, ".git", "config"), "safe")

    const result = await createEditFileTool().execute(await context(root), { path: ".git/config", oldText: "safe", newText: "unsafe" })

    expect(result.ok).toBe(false)
    expect(await readFile(join(root, ".git", "config"), "utf8")).toBe("safe")
  })
})
