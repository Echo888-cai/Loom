import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { EventRecord, EventStore } from "../../src/events/types.js"
import type { ModelProvider, ModelRequest } from "../../src/model/types.js"
import { LoomRuntime } from "../../src/runtime.js"

class RecordingProvider implements ModelProvider {
  readonly requests: ModelRequest[] = []

  async complete(request: ModelRequest) {
    this.requests.push(request)
    return { content: "candidate", toolCalls: [] }
  }
}

describe("LoomRuntime desktop session boundary", () => {
  it("uses the desktop-provided task ID, event store, and cancellation signal", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-runtime-session-"))
    const store = createMemoryStore()
    const provider = new RecordingProvider()
    const controller = new AbortController()
    const runtime = new LoomRuntime({ provider, env: { DEEPSEEK_API_KEY: "test-key" } })

    const result = await runtime.run("inspect repository", root, {
      taskId: "desktop-task-1",
      eventStore: store,
      signal: controller.signal,
    })

    expect(result).toMatchObject({ taskId: "desktop-task-1", status: "candidate_done" })
    expect(provider.requests[0]?.signal).toBe(controller.signal)
    expect((await store.readAll("desktop-task-1")).map((event) => event.type)).toEqual([
      "task.created",
      "model.requested",
      "model.responded",
      "task.candidate_done",
    ])
  })

  it("records cancellation in the injected event store before calling the provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-runtime-session-"))
    const store = createMemoryStore()
    const provider = new RecordingProvider()
    const controller = new AbortController()
    controller.abort()
    const runtime = new LoomRuntime({ provider, env: { DEEPSEEK_API_KEY: "test-key" } })

    const result = await runtime.run("inspect repository", root, {
      taskId: "desktop-task-cancelled",
      eventStore: store,
      signal: controller.signal,
    })

    expect(result.status).toBe("cancelled")
    expect(provider.requests).toEqual([])
    expect((await store.readAll("desktop-task-cancelled")).map((event) => event.type)).toEqual([
      "task.created",
      "task.cancelled",
    ])
  })

  it("can replay an event log supplied by the desktop session", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-runtime-session-"))
    const store = createMemoryStore()
    await store.append("desktop-task-replay", "task.created", { goal: "resume" })
    const runtime = new LoomRuntime({ env: { DEEPSEEK_API_KEY: "test-key" } })

    const events = await runtime.replay("desktop-task-replay", root, { eventStore: store })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ taskId: "desktop-task-replay", type: "task.created" })
  })
})

function createMemoryStore(): EventStore {
  const events: EventRecord[] = []
  return {
    async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
      const event = { seq: events.length + 1, timestamp: "2026-08-25T00:00:00.000Z", taskId, type, data }
      events.push(event)
      return event
    },
    async readAll(taskId: string): Promise<EventRecord[]> {
      return events.filter((event) => event.taskId === taskId)
    },
  }
}
