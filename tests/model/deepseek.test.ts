import { describe, expect, it } from "vitest"
import { DeepSeekProvider, type DeepSeekTransport } from "../../src/model/deepseek.js"
import type { ModelRequest } from "../../src/model/types.js"

function request(): ModelRequest {
  return {
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "read the file" }],
    tools: [],
  }
}

function transportReturning(response: unknown): DeepSeekTransport {
  return async () => response as never
}

describe("DeepSeekProvider", () => {
  it("normalizes content, tool calls, reasoning content, and usage", async () => {
    const provider = new DeepSeekProvider(transportReturning({
      choices: [{
        message: {
          content: "I will inspect the file.",
          reasoning_content: "The task requires reading before editing.",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"src/auth.ts"}' },
          }],
        },
      }],
      usage: { prompt_tokens: 42, completion_tokens: 11 },
    }))

    await expect(provider.complete(request())).resolves.toEqual({
      content: "I will inspect the file.",
      reasoningContent: "The task requires reading before editing.",
      toolCalls: [{ id: "call-1", name: "read_file", argumentsJson: '{"path":"src/auth.ts"}' }],
      usage: { inputTokens: 42, outputTokens: 11 },
    })
  })

  it("rejects malformed tool arguments before the loop can execute them", async () => {
    const provider = new DeepSeekProvider(transportReturning({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "read_file", arguments: "not-json" },
          }],
        },
      }],
    }))

    await expect(provider.complete(request())).rejects.toThrow("tool call arguments")
  })

  it("rejects an empty provider response", async () => {
    const provider = new DeepSeekProvider(transportReturning({ choices: [] }))

    await expect(provider.complete(request())).rejects.toThrow("choices")
  })

  it("preserves transport errors", async () => {
    const provider = new DeepSeekProvider(async () => {
      throw new Error("rate limited")
    })

    await expect(provider.complete(request())).rejects.toThrow("rate limited")
  })

  it("does not call the transport after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const provider = new DeepSeekProvider(async () => {
      called = true
      return { choices: [] }
    })

    await expect(provider.complete({ ...request(), signal: controller.signal })).rejects.toThrow()
    expect(called).toBe(false)
  })
})
