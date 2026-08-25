import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { FileEventStore } from "../../src/events/store.js"

describe("FileEventStore", () => {
  it("appends ordered JSONL events and reads them after recreation", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-events-"))
    const firstStore = new FileEventStore(root)

    const first = await firstStore.append("task-1", "task.created", { goal: "fix bug" })
    const second = await firstStore.append("task-1", "step.started", { step: 1 })

    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)

    const recreatedStore = new FileEventStore(root)
    const events = await recreatedStore.readAll("task-1")

    expect(events).toEqual([first, second])
  })

  it("rejects malformed JSONL instead of silently losing history", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-events-invalid-"))
    const { mkdir, writeFile } = await import("node:fs/promises")
    const path = join(root, ".loom", "runs", "task-1")
    await mkdir(path, { recursive: true })
    await writeFile(join(path, "events.jsonl"), "not-json\n")

    await expect(new FileEventStore(root).readAll("task-1")).rejects.toThrow()
  })
})
