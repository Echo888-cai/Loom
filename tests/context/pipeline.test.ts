import { describe, expect, it } from "vitest"
import { ContextPipeline } from "../../src/context/pipeline.js"
import type { EventRecord } from "../../src/events/types.js"
import type { ModelMessage } from "../../src/model/types.js"

describe("Context pipeline", () => {
  it("turns execution events into budgeted model messages", () => {
    const events: EventRecord[] = [
      { seq: 1, timestamp: "1", taskId: "t", type: "tool.completed", data: { name: "read_file", path: "src/auth.ts", content: "current auth code" } },
    ]

    const result = new ContextPipeline({ maxTokens: 100 }).compile(events)

    expect(result).toEqual([{ role: "user", content: "[code]\nsrc/auth.ts\ncurrent auth code" }])
  })

  it("filters model messages without breaking assistant tool calls", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "read_file", argumentsJson: "{}" }] },
      { role: "tool", toolCallId: "call-1", content: "file" },
    ]

    const result = new ContextPipeline({ maxTokens: 100 }).compileMessages(messages)

    expect(result[2]).toEqual(messages[2])
    expect(result[3]).toEqual(messages[3])
  })
})
