import { describe, expect, it } from "vitest"
import type { ModelMessage } from "../../src/model/types.js"
import { BudgetedContextCompiler, FullHistoryCompiler } from "../../src/context/compiler.js"

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

describe("BudgetedContextCompiler", () => {
  it("always keeps the system prompt and current goal", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: "old result" },
      { role: "tool", toolCallId: "call-1", content: "x".repeat(100) },
    ]

    const result = new BudgetedContextCompiler({ maxTokens: 12 }).compile({ goal: "goal", messages })

    expect(result.slice(0, 2)).toEqual(messages.slice(0, 2))
  })

  it("keeps the newest messages first when the budget is exceeded", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: "old" },
      { role: "tool", toolCallId: "call-1", content: "new" },
    ]

    const result = new BudgetedContextCompiler({ maxTokens: 4 }).compile({ goal: "goal", messages })

    expect(result).toEqual([
      messages[0],
      messages[1],
      messages[3],
    ])
  })
})
