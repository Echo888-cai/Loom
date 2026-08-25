import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { ModelProvider } from "../../src/model/types.js"
import { LoomRuntime } from "../../src/runtime.js"
import { FileEventStore } from "../../src/events/store.js"

class FakeProvider implements ModelProvider {
  async complete() { return { content: "candidate", toolCalls: [] } }
}

describe("LoomRuntime", () => {
  it("composes a run and can replay its event log", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-runtime-"))
    const runtime = new LoomRuntime({ provider: new FakeProvider(), env: { DEEPSEEK_API_KEY: "test-key" } })

    const result = await runtime.run("inspect repository", root)
    const events = await runtime.replay(result.taskId, root)

    expect(result).toMatchObject({ status: "candidate_done", modelCalls: 1 })
    expect(events.map((event) => event.type)).toEqual(["task.created", "model.requested", "model.responded", "task.candidate_done"])
  })

  it("resumes an unfinished task without appending a second task.created", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-runtime-"))
    const store = new FileEventStore(root)
    await store.append("task-resume", "task.created", { goal: "continue work", workspaceRoot: root })
    await store.append("task-resume", "model.requested", { call: 1 })
    const runtime = new LoomRuntime({ provider: new FakeProvider(), env: { DEEPSEEK_API_KEY: "test-key" } })

    const result = await runtime.resume("task-resume", root)
    const events = await runtime.replay("task-resume", root)

    expect(result.status).toBe("candidate_done")
    expect(events.filter((event) => event.type === "task.created")).toHaveLength(1)
  })
})
