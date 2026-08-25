import { describe, expect, it } from "vitest"
import type { ModelMessage } from "../../src/model/types.js"
import { FullHistoryCompiler } from "../../src/context/compiler.js"

describe("FullHistoryCompiler", () => {
  it("preserves every message and its original order", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "search", argumentsJson: '{"query":"token"}' }] },
      { role: "tool", toolCallId: "call-1", content: "a.ts:1 token" },
    ]

    expect(new FullHistoryCompiler().compile({ goal: "goal", messages })).toEqual(messages)
  })
})
