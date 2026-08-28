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

  it("keeps an assistant tool call together with its tool result", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "read_file", argumentsJson: "{}" }] },
      { role: "tool", toolCallId: "call-1", content: "file content" },
      { role: "assistant", content: "old conclusion that is no longer useful" },
    ]

    const result = new BudgetedContextCompiler({ maxTokens: 9 }).compile({ goal: "goal", messages })

    expect(result).toContainEqual(messages[2])
    expect(result).toContainEqual(messages[3])
  })

  it("counts reasoning and tool arguments as context cost", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "goal" },
      { role: "assistant", content: "short", reasoningContent: "a long internal explanation that uses budget" },
      { role: "assistant", content: "new" },
    ]

    const result = new BudgetedContextCompiler({ maxTokens: 8 }).compile({ goal: "goal", messages })

    expect(result).not.toContainEqual(messages[2])
    expect(result).toContainEqual(messages[3])
  })
})
