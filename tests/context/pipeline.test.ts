import { describe, expect, it } from "vitest"
import { ContextPipeline } from "../../src/context/pipeline.js"
import type { EventRecord } from "../../src/events/types.js"

describe("Context pipeline", () => {
  it("turns execution events into budgeted model messages", () => {
    const events: EventRecord[] = [
      { seq: 1, timestamp: "1", taskId: "t", type: "tool.completed", data: { name: "read_file", path: "src/auth.ts", content: "current auth code" } },
    ]

    const result = new ContextPipeline({ maxTokens: 100 }).compile(events)

    expect(result).toEqual([{ role: "user", content: "[code]\nsrc/auth.ts\ncurrent auth code" }])
  })
})
