import { describe, expect, it } from "vitest"
import { StreamingEventStore } from "../../src/events/streaming-store.js"
import type { EventRecord, EventStore } from "../../src/events/types.js"

describe("StreamingEventStore", () => {
  it("publishes an event only after the inner store persists it", async () => {
    const order: string[] = []
    const inner: EventStore = {
      append: async (taskId, type, data) => {
        order.push("persist")
        return { seq: 1, timestamp: "2026-08-25T00:00:00.000Z", taskId, type, data }
      },
      readAll: async () => [],
    }
    const store = new StreamingEventStore(inner)
    store.subscribe((event) => order.push(`publish:${event.seq}`))

    await store.append("task-1", "task.created", { goal: "Fix auth" })

    expect(order).toEqual(["persist", "publish:1"])
  })

  it("does not publish an event that the durable store rejected", async () => {
    const delivered: EventRecord[] = []
    const store = new StreamingEventStore({
      append: async () => { throw new Error("disk full") },
      readAll: async () => [],
    })
    store.subscribe((event) => delivered.push(event))

    await expect(store.append("task-1", "task.created", {})).rejects.toThrow("disk full")
    expect(delivered).toEqual([])
  })

  it("isolates subscriber failures and stops delivery after unsubscribe", async () => {
    const reported: string[] = []
    const delivered: number[] = []
    const inner = createMemoryStore()
    const store = new StreamingEventStore(inner, (error) => reported.push(error.message))
    store.subscribe(() => { throw new Error("renderer disconnected") })
    const unsubscribe = store.subscribe((event) => delivered.push(event.seq))

    await store.append("task-1", "one", {})
    unsubscribe()
    await store.append("task-1", "two", {})

    expect(delivered).toEqual([1])
    expect(reported).toEqual(["renderer disconnected", "renderer disconnected"])
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
